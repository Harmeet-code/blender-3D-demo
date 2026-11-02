import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { CapsuleCollider, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import type { ThreeElements } from '@react-three/fiber';
import type { Vector3Tuple } from '@react-three/rapier';
import { CHARACTER_CONFIG, CAPSULE_HALF_SEGMENT_M, CAPSULE_TOTAL_HEIGHT_M } from '../character-config.ts';

const HALF_HEIGHT_M = CAPSULE_TOTAL_HEIGHT_M / 2;
const CONTROLLER_OFFSET_M = 0.01;
const DEFAULT_MAX_CLIMB_SLOPE_RADIANS = (50 * Math.PI) / 180;
const DEFAULT_MIN_SLIDE_SLOPE_RADIANS = (55 * Math.PI) / 180;
const DEFAULT_GROUND_SNAP_M = 0.2;
const MIN_STEP_WIDTH_M = CHARACTER_CONFIG.radiusM * 2;

export interface CapsuleMoveResult {
  /** Center displacement Rapier resolved after sweep, slide, autostep and ground snap. */
  displacement: Vector3Tuple;
  grounded: boolean;
  collisionCount: number;
  physicsTimeSeconds?: number;
  physicsDeltaSeconds?: number;
}

export interface ResolvedCapsuleSample {
  feetPosition: Vector3Tuple;
  displacement: Vector3Tuple;
  physicsTimeSeconds: number;
  physicsDeltaSeconds: number;
  accepted: boolean;
}

export type PhysicsMoveStep = (physicsDeltaSeconds: number) => Vector3Tuple | null;

const resolvedMotionListeners = new Set<(sample: ResolvedCapsuleSample) => void>();

/** Subscribe to fixed-step resolved capsule samples. Always unsubscribe on cleanup. */
export function subscribeResolvedCapsuleMotion(listener: (sample: ResolvedCapsuleSample) => void) {
  resolvedMotionListeners.add(listener);
  return () => {resolvedMotionListeners.delete(listener);};
}

export interface KinematicCapsuleHandle {
  /** Queue an intended displacement. Callers in manual and auto-walk share this one gate. */
  requestMove(displacement: Vector3Tuple): void;
  /** Install a persistent producer that advances once for every actual Rapier physics step. */
  requestPhysicsStep(step: PhysicsMoveStep | null): void;
  getFeetPosition(): Vector3Tuple | null;
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
  const { world } = useRapier();
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const pendingMove = useRef<Vector3Tuple | null>(null);
  const physicsStep = useRef<PhysicsMoveStep | null>(null);
  const physicsTimeSeconds = useRef(0);
  const physicsDeltaSeconds = useRef(0);
  const lastStepAccepted = useRef(true);
  const previousPhysicsPosition = useRef<Vector3Tuple | null>(null);
  const lastMove = useRef<CapsuleMoveResult>(ZERO_MOVE);
  const callback = useRef(onResolvedMove);
  const sweepValidator = useRef(validateSweep);
  callback.current = onResolvedMove;
  sweepValidator.current = validateSweep;

  const centerPosition = useMemo<Vector3Tuple>(
    () => [feetPosition[0], feetPosition[1] + HALF_HEIGHT_M, feetPosition[2]],
    [feetPosition],
  );

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
    let desired = pendingMove.current;
    pendingMove.current = null;
    if (!desired && physicsStep.current) {
      try {
        desired = physicsStep.current(physicsDelta);
      } catch {
        desired = null;
      }
    }
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const activeController = controller.current;
    if (!body) {return;}
    const current = body.translation();
    const fromFeet: Vector3Tuple = [current.x, current.y - HALF_HEIGHT_M, current.z];
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
    if (!intendedAllowed) {
      body.setNextKinematicTranslation(current);
      const rejected: CapsuleMoveResult = { displacement: [0, 0, 0], grounded: false, collisionCount: 0 };
      const rejectedResult = { ...rejected, physicsTimeSeconds: physicsTimeSeconds.current, physicsDeltaSeconds: physicsDelta };
      lastMove.current = rejectedResult;
      lastStepAccepted.current = false;
      callback.current?.(rejectedResult);
      return;
    }

    activeController.computeColliderMovement(collider, { x: desired[0], y: desired[1], z: desired[2] });
    const resolved = activeController.computedMovement();
    const resolvedFeet: Vector3Tuple = [fromFeet[0] + resolved.x, fromFeet[1] + resolved.y, fromFeet[2] + resolved.z];
    let resolvedAllowed = false;
    try {
      resolvedAllowed = sweepValidator.current(fromFeet, resolvedFeet);
    } catch {
      // Fail closed if validation cannot establish clearance for Rapier's actual result.
    }
    const result: CapsuleMoveResult = resolvedAllowed ? {
      displacement: [resolved.x, resolved.y, resolved.z],
      grounded: activeController.computedGrounded(),
      collisionCount: activeController.numComputedCollisions(),
      physicsTimeSeconds: physicsTimeSeconds.current,
      physicsDeltaSeconds: physicsDelta,
    } : {
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
    const body = bodyRef.current;
    if (!body || physicsDeltaSeconds.current <= 0) {return;}
    const current = body.translation();
    const resolvedFeetPosition: Vector3Tuple = [current.x, current.y - HALF_HEIGHT_M, current.z];
    const previous = previousPhysicsPosition.current ?? resolvedFeetPosition;
    const sample: ResolvedCapsuleSample = {
      feetPosition: resolvedFeetPosition,
      displacement: [resolvedFeetPosition[0] - previous[0], resolvedFeetPosition[1] - previous[1], resolvedFeetPosition[2] - previous[2]],
      physicsTimeSeconds: physicsTimeSeconds.current,
      physicsDeltaSeconds: physicsDeltaSeconds.current,
      accepted: lastStepAccepted.current,
    };
    previousPhysicsPosition.current = [...resolvedFeetPosition];
    for (const listener of resolvedMotionListeners) {
      try {listener(sample);} catch { /* Diagnostics must not interrupt the physics loop. */ }
    }
  });

  useImperativeHandle(forwardedRef, () => ({
    requestMove(displacement) {
      pendingMove.current = [displacement[0], displacement[1], displacement[2]];
    },
    requestPhysicsStep(step) {
      physicsStep.current = step;
    },
    getFeetPosition() {
      const position = bodyRef.current?.translation();
      return position ? [position.x, position.y - HALF_HEIGHT_M, position.z] : null;
    },
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
