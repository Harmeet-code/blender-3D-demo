import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { CapsuleCollider, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import type { ThreeElements } from '@react-three/fiber';
import type { Vector3Tuple } from '@react-three/rapier';
import { CHARACTER_CONFIG, CAPSULE_HALF_SEGMENT_M, CAPSULE_TOTAL_HEIGHT_M } from '../character-config.ts';

const HALF_HEIGHT_M = CAPSULE_TOTAL_HEIGHT_M / 2;
export const CONTROLLER_OFFSET_M = 0.01;
const DEFAULT_MAX_CLIMB_SLOPE_RADIANS = (50 * Math.PI) / 180;
const DEFAULT_MIN_SLIDE_SLOPE_RADIANS = (55 * Math.PI) / 180;
const DEFAULT_GROUND_SNAP_M = 0.2;
const MIN_STEP_WIDTH_M = CHARACTER_CONFIG.radiusM * 2;

export interface CapsuleMoveResult {
  /** Center displacement Rapier resolved after sweep, slide, autostep and ground snap. */
  displacement: Vector3Tuple;
  grounded: boolean;
  accepted?: boolean;
  collisionCount: number;
  physicsTimeSeconds?: number;
  physicsDeltaSeconds?: number;
}

export interface ResolvedCapsuleSample {
  wallTimeMs: number;
  accelerationMps2: number | null;
  emergencyStop: boolean;
  feetPosition: Vector3Tuple;
  displacement: Vector3Tuple;
  physicsTimeSeconds: number;
  physicsDeltaSeconds: number;
  accepted: boolean;
  movementSource: 'auto-walk' | 'manual' | 'connector' | 'idle';
  grounded: boolean;
  collisionCount: number;
  commandedSpeedMps: number | null;
  playbackRate: number | null;
}

export type PhysicsMoveStep = (physicsDeltaSeconds: number) => {
  displacement: Vector3Tuple;
  movementSource: 'auto-walk' | 'manual' | 'connector' | 'idle';
  commandedSpeedMps: number;
  playbackRate: number;
  elevatorPassenger?: boolean;
} | null;

const resolvedMotionListeners = new Set<(sample: ResolvedCapsuleSample) => void>();

/** Subscribe to fixed-step resolved capsule samples. Always unsubscribe on cleanup. */
export function subscribeResolvedCapsuleMotion(listener: (sample: ResolvedCapsuleSample) => void) {
  resolvedMotionListeners.add(listener);
  return () => {resolvedMotionListeners.delete(listener);};
}

export interface KinematicCapsuleHandle {
  /** Queue an intended displacement. Callers in manual and auto-walk share this one gate. */
  requestMove(displacement: Vector3Tuple, movementSource?: 'manual' | 'connector'): void;
  /** Install a persistent producer that advances once for every actual Rapier physics step. */
  requestPhysicsStep(step: PhysicsMoveStep | null): void;
  getFeetPosition(): Vector3Tuple | null;
  getColliderHandle(): number | undefined;
  getLastMove(): CapsuleMoveResult;
}

export interface KinematicCapsuleProps extends Omit<ThreeElements['group'], 'position'> {
  /** Feet-origin world position; the Rapier body's origin remains at the capsule center. */
  feetPosition?: Vector3Tuple;
  /** Required final authority for every requested and Rapier-resolved capsule sweep. */
  validateSweep: (fromFeet: Vector3Tuple, toFeet: Vector3Tuple) => boolean;
  maxClimbSlopeRadians?: number;
  minSlideSlopeRadians?: number;
  groundSnapDistanceM?: number;
  onResolvedMove?: (result: CapsuleMoveResult) => void;
}

const ZERO_MOVE: CapsuleMoveResult = { displacement: [0, 0, 0], grounded: false, collisionCount: 0 };

/**
 * Builder-local shared Rapier controller for both manual and route-following motion.
 * Mount beneath the existing Rapier Physics provider. Position and size are derived from
 * CHARACTER_CONFIG; the controller, not a second visual collider, resolves each request.
 */
export const KinematicCapsule = forwardRef<KinematicCapsuleHandle, KinematicCapsuleProps>((
  {
    feetPosition = [0, 0, 0],
    validateSweep,
    maxClimbSlopeRadians = DEFAULT_MAX_CLIMB_SLOPE_RADIANS,
    minSlideSlopeRadians = DEFAULT_MIN_SLIDE_SLOPE_RADIANS,
    groundSnapDistanceM = DEFAULT_GROUND_SNAP_M,
    onResolvedMove,
    children,
    ...groupProps
  },
  forwardedRef,
) => {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const { world, rapier } = useRapier();
  const dynamicRide = useRef(false);
  const dynamicDesired = useRef<Vector3Tuple>([0, 0, 0]);
  const dynamicOrigin = useRef<Vector3Tuple | null>(null);
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const pendingMove = useRef<Vector3Tuple | null>(null);
  const pendingMoveSource = useRef<'manual' | 'connector'>('manual');
  const physicsStep = useRef<PhysicsMoveStep | null>(null);
  const physicsReady = useRef(false);
  const physicsTimeSeconds = useRef(0);
  const physicsDeltaSeconds = useRef(0);
  const lastStepAccepted = useRef(true);
  const previousPhysicsPosition = useRef<Vector3Tuple | null>(null);
  const previousMovementSource = useRef<ResolvedCapsuleSample['movementSource']>('idle');
  const commandedSpeedMps = useRef<number | null>(null);
  const playbackRate = useRef<number | null>(null);
  const previousVelocity = useRef<Vector3Tuple>([0, 0, 0]);
  const lastMove = useRef<CapsuleMoveResult>(ZERO_MOVE);
  const callback = useRef(onResolvedMove);
  const sweepValidator = useRef(validateSweep);
  callback.current = onResolvedMove;
  sweepValidator.current = validateSweep;

  // The position prop is spawn state, never a reactive movement channel. Updating
  // it from UI snapshots teleports Rapier between fixed steps and doubles motion.
  const centerPosition = useRef<Vector3Tuple>([
    feetPosition[0], feetPosition[1] + HALF_HEIGHT_M + CONTROLLER_OFFSET_M, feetPosition[2],
  ]).current;

  useEffect(() => {
    const nextController = world.createCharacterController(CONTROLLER_OFFSET_M);
    nextController.setSlideEnabled(true);
    nextController.setMaxSlopeClimbAngle(maxClimbSlopeRadians);
    nextController.setMinSlopeSlideAngle(minSlideSlopeRadians);
    nextController.enableAutostep(CHARACTER_CONFIG.maxStepM, MIN_STEP_WIDTH_M, false);
    nextController.enableSnapToGround(groundSnapDistanceM);
    controller.current = nextController;
    return () => {
      controller.current = null;
      world.removeCharacterController(nextController);
    };
  }, [world, maxClimbSlopeRadians, minSlideSlopeRadians, groundSnapDistanceM]);

  useBeforePhysicsStep(() => {
    const physicsDelta = world.timestep;
    if (!Number.isFinite(physicsDelta) || physicsDelta <= 0) {return;}
    physicsDeltaSeconds.current = physicsDelta;
    physicsTimeSeconds.current += physicsDelta;
    let elevatorPassenger = false;
    let desired = pendingMove.current;
    let movementSource: ResolvedCapsuleSample['movementSource'] = desired
      ? pendingMoveSource.current
      : 'idle';
    let commandedSpeed: number | null = null;
    let commandPlaybackRate: number | null = null;
    pendingMove.current = null;
    if (!desired && physicsStep.current && physicsReady.current) {
      try {
        const stepIntent = physicsStep.current(physicsDelta);
        if (stepIntent) {
          const { displacement: nextDisplacement, movementSource: nextMovementSource } = stepIntent;
          elevatorPassenger = stepIntent.elevatorPassenger === true;
          desired = nextDisplacement;
          movementSource = nextMovementSource;
          commandedSpeed = stepIntent.commandedSpeedMps;
          commandPlaybackRate = stepIntent.playbackRate;
        }
      } catch {
        desired = null;
      }
    }
    previousMovementSource.current = movementSource;
    commandedSpeedMps.current = commandedSpeed;
    playbackRate.current = commandPlaybackRate;
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const activeController = controller.current;
    if (!body) {return;}
    const current = body.translation();
    const fromFeet: Vector3Tuple = [current.x, current.y - HALF_HEIGHT_M, current.z];
    // Seed displacement from the pre-step pose, including the first movement.
    previousPhysicsPosition.current ??= [...fromFeet];
    if (dynamicRide.current && !elevatorPassenger) {
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setLinvel({x:0,y:0,z:0},true);
      dynamicRide.current = false;
    }
    if (!desired || !collider || !activeController) {
      body.setNextKinematicTranslation(current);
      lastStepAccepted.current = true;
      return;
    }
    const intendedFeet: Vector3Tuple = [
      fromFeet[0] + desired[0],
      fromFeet[1] + desired[1],
      fromFeet[2] + desired[2],
    ];
    let intendedAllowed = false;
    try {
      intendedAllowed = sweepValidator.current(fromFeet, intendedFeet);
    } catch {
      // A faulty policy callback must stop movement, never silently open the gate.
    }
    if (intendedAllowed && movementSource !== 'connector') {
      // Apertures are real voids: ordinary horizontal walking must not hover
      // across them. Sample support along the complete intended segment.
      const samples = Math.max(1, Math.ceil(Math.hypot(...desired) / (CHARACTER_CONFIG.radiusM/2)));
      for (let i=0;i<=samples;i++) {
        const t=i/samples;
        const ray = new rapier.Ray({x:fromFeet[0]+desired[0]*t,y:fromFeet[1]+desired[1]*t+CHARACTER_CONFIG.maxStepM+0.02,z:fromFeet[2]+desired[2]*t},{x:0,y:-1,z:0});
        const supportDistance = CHARACTER_CONFIG.maxStepM + groundSnapDistanceM + 0.04;
        let supported = !!world.castRay(ray, supportDistance, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider, body);
        // The world broad phase can miss a large slab even when its exact shape
        // intersects this ray. Confirm against physical shapes before rejecting;
        // no analytic floor assumption is allowed, so apertures remain voids.
        if (!supported) {
          world.forEachCollider((candidate) => {
            if (supported || candidate.isSensor() || candidate.handle === collider.handle || candidate.parent()?.handle === body.handle) {return;}
            const toi = candidate.castRay(ray, supportDistance, true);
            if (Number.isFinite(toi) && toi >= 0 && toi <= supportDistance) {
              supported = true;
              window.dispatchEvent(new CustomEvent('walk-support-confirmed', { detail: { fromFeet, rayOrigin: ray.origin, collider: candidate.handle, toi } }));
            }
          });
        }
        if (!supported) {
          window.dispatchEvent(new CustomEvent('walk-physics-blocker', {detail: {stage: 'support', fromFeet, intendedFeet, rayOrigin: ray.origin}}));
          intendedAllowed = false;
          break;
        }
      }
    }
    if (!intendedAllowed) {
      window.dispatchEvent(new CustomEvent('walk-physics-blocker', { detail: { stage: 'intended-or-support', fromFeet, intendedFeet, desired, acceptedDisplacement: [0,0,0], collider: collider?.handle } }));
      if (dynamicRide.current) {
        body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        body.setLinvel({x:0,y:0,z:0},true);
        dynamicRide.current = false;
      }
      body.setNextKinematicTranslation(current);
      const rejected: CapsuleMoveResult = { displacement: [0, 0, 0], grounded: false, accepted: false, collisionCount: 0 };
      const rejectedResult = { ...rejected, physicsTimeSeconds: physicsTimeSeconds.current, physicsDeltaSeconds: physicsDelta };
      lastMove.current = rejectedResult;
      lastStepAccepted.current = false;
      callback.current?.(rejectedResult);
      return;
    }

    if (elevatorPassenger) {
      // A descending character sweep hits the old support pose. During the ride
      // the SAME capsule becomes a CCD dynamic passenger; Rapier resolves cabin,
      // shaft and door contacts together instead of excluding the support collider.
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.enableCcd(true);
      body.setLinvel({x:desired[0]/physicsDelta,y:desired[1]/physicsDelta,z:desired[2]/physicsDelta},true);
      dynamicRide.current = true;
      dynamicDesired.current = [...desired];
      dynamicOrigin.current = fromFeet;
      return;
    }
    // Route legs already carry a validated floor elevation. Ground snap would
    // repeatedly pull a horizontal kinematic target toward the contact skin.
    if (movementSource === 'auto-walk') {activeController.disableSnapToGround();}
    else {activeController.enableSnapToGround(groundSnapDistanceM);}
    activeController.computeColliderMovement(collider, { x: desired[0], y: desired[1], z: desired[2] });
    const resolved = activeController.computedMovement();
    const resolvedFeet: Vector3Tuple = [fromFeet[0] + resolved.x, fromFeet[1] + resolved.y, fromFeet[2] + resolved.z];
    let resolvedAllowed = false;
    try {
      resolvedAllowed = sweepValidator.current(fromFeet, resolvedFeet);
    } catch {
      // Fail closed if validation cannot establish clearance for Rapier's actual result.
    }
    if (!resolvedAllowed || Math.hypot(resolved.x-desired[0], resolved.y-desired[1], resolved.z-desired[2]) > 0.025) {
      const collisions = Array.from({length: activeController.numComputedCollisions()}, (_, i) => {
        const hit = activeController.computedCollision(i);
        return hit ? { handle: hit.collider?.handle, position: hit.collider?.translation(), normal: hit.normal1, witness: hit.witness1 } : null;
      });
      window.dispatchEvent(new CustomEvent('walk-physics-blocker', { detail: { stage: 'resolved', fromFeet, intendedFeet, resolvedFeet, desired, resolved, acceptedDisplacement: resolvedAllowed ? [resolved.x,resolved.y,resolved.z] : [0,0,0], resolvedAllowed, collisions } }));
    }
    const result: CapsuleMoveResult = resolvedAllowed ? {
      accepted: true,
      displacement: [resolved.x, resolved.y, resolved.z],
      grounded: activeController.computedGrounded(),
      collisionCount: activeController.numComputedCollisions(),
      physicsTimeSeconds: physicsTimeSeconds.current,
      physicsDeltaSeconds: physicsDelta,
    } : {
      accepted: false,
      displacement: [0, 0, 0],
      grounded: false,
      collisionCount: activeController.numComputedCollisions(),
      physicsTimeSeconds: physicsTimeSeconds.current,
      physicsDeltaSeconds: physicsDelta,
    };
    body.setNextKinematicTranslation(resolvedAllowed ? {
      x: current.x + resolved.x,
      y: current.y + resolved.y,
      z: current.z + resolved.z,
    } : current);
    lastMove.current = result;
    lastStepAccepted.current = resolvedAllowed;
    callback.current?.(result);
  });

  useAfterPhysicsStep(() => {
    // Initial colliders enter Rapier query structures on the first world step.
    // Do not advance route intent before ground-support rays can see them.
    physicsReady.current = true;
    const body = bodyRef.current;
    if (!body || physicsDeltaSeconds.current <= 0) {return;}
    const current = body.translation();
    let resolvedFeetPosition: Vector3Tuple = [current.x, current.y - HALF_HEIGHT_M, current.z];
    if (dynamicRide.current && dynamicOrigin.current) {
      const from = dynamicOrigin.current;
      dynamicOrigin.current = null;
      let allowed = false;
      try {allowed = sweepValidator.current(from, resolvedFeetPosition);} catch { /* Stop at the actual physical pose. */ }
      const error = Math.hypot(...resolvedFeetPosition.map((v, i) => v - from[i]! - dynamicDesired.current[i]!));
      allowed = allowed && error <= 0.025;
      const collider = colliderRef.current;
      let collisionCount = 0;
      if (collider) {world.contactPairsWith(collider, () => {collisionCount++;});}
      const support = collider ? world.castRay(new rapier.Ray({x:current.x,y:resolvedFeetPosition[1]+0.02,z:current.z},{x:0,y:-1,z:0}),0.05,true,undefined,undefined,collider,body) : null;
      const grounded = support !== null;
      if (!allowed) {
        // Restore the last jointly accepted passenger/cabin step, before publishing.
        body.setTranslation({x:from[0],y:from[1]+HALF_HEIGHT_M,z:from[2]},true);
        resolvedFeetPosition = [...from];
      }
      lastStepAccepted.current = allowed;
      const result: CapsuleMoveResult = {
        displacement: [resolvedFeetPosition[0]-from[0],resolvedFeetPosition[1]-from[1],resolvedFeetPosition[2]-from[2]],
        grounded, accepted: allowed, collisionCount, physicsTimeSeconds: physicsTimeSeconds.current, physicsDeltaSeconds: physicsDeltaSeconds.current,
      };
      lastMove.current = result;
      callback.current?.(result);
      if (!allowed) {
        body.setBodyType(rapier.RigidBodyType.KinematicPositionBased,true);
        body.setLinvel({x:0,y:0,z:0},true);
        dynamicRide.current = false;
      }
    }
    const previous = previousPhysicsPosition.current ?? resolvedFeetPosition;
    const sample: ResolvedCapsuleSample = {
      grounded: lastMove.current.grounded,
      collisionCount: lastMove.current.collisionCount,
      wallTimeMs: performance.now(),
      accelerationMps2: null,
      emergencyStop: !lastStepAccepted.current,
      feetPosition: resolvedFeetPosition,
      displacement: [resolvedFeetPosition[0] - previous[0], resolvedFeetPosition[1] - previous[1], resolvedFeetPosition[2] - previous[2]],
      physicsTimeSeconds: physicsTimeSeconds.current,
      physicsDeltaSeconds: physicsDeltaSeconds.current,
      accepted: lastStepAccepted.current,
      movementSource: previousMovementSource.current,
      commandedSpeedMps: commandedSpeedMps.current,
      playbackRate: playbackRate.current,
    };
    const velocity = sample.displacement.map((v) => v / sample.physicsDeltaSeconds) as Vector3Tuple;
    sample.accelerationMps2 = Math.hypot(...velocity.map((v, i) => (v - previousVelocity.current[i]!) / sample.physicsDeltaSeconds));
    previousVelocity.current = velocity;
    if (import.meta.env.DEV) {window.dispatchEvent(new CustomEvent('walk-physics-sample', { detail: sample }));}
    previousPhysicsPosition.current = [...resolvedFeetPosition];
    for (const listener of resolvedMotionListeners) {
      try {listener(sample);} catch { /* Diagnostics must not interrupt the physics loop. */ }
    }
  });

  useImperativeHandle(forwardedRef, () => ({
    requestMove(displacement, movementSource = 'manual') {
      pendingMove.current = [displacement[0], displacement[1], displacement[2]];
      pendingMoveSource.current = movementSource;
    },
    requestPhysicsStep(step) {
      physicsStep.current = step;
    },
    getFeetPosition() {
      const position = bodyRef.current?.translation();
      return position ? [position.x, position.y - HALF_HEIGHT_M, position.z] : null;
    },
    getColliderHandle() {return colliderRef.current?.handle;},
    getLastMove() {
      return lastMove.current;
    },
  }), []);

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={centerPosition}
      enabledRotations={[false, false, false]}
      canSleep={false}
    >
      <CapsuleCollider
        ref={colliderRef}
        args={[CAPSULE_HALF_SEGMENT_M, CHARACTER_CONFIG.radiusM]}
        friction={0}
        restitution={0}
      />
      <group position={[0, -HALF_HEIGHT_M, 0]} {...groupProps}>
        {children}
      </group>
    </RigidBody>
  );
});

export const KINEMATIC_CAPSULE_DIMENSIONS = {
  radiusM: CHARACTER_CONFIG.radiusM,
  totalHeightM: CAPSULE_TOTAL_HEIGHT_M,
  halfSegmentM: CAPSULE_HALF_SEGMENT_M,
} as const;
