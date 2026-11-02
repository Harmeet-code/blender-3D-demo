import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
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
}

export interface KinematicCapsuleHandle {
  /** Queue an intended displacement. Callers in manual and auto-walk share this one gate. */
  requestMove(displacement: Vector3Tuple): void;
  getFeetPosition(): Vector3Tuple | null;
  getLastMove(): CapsuleMoveResult;
}

export interface KinematicCapsuleProps extends Omit<ThreeElements['group'], 'position'> {
  /** Feet-origin world position; the Rapier body's origin remains at the capsule center. */
  feetPosition?: Vector3Tuple;
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
export const KinematicCapsule = forwardRef<KinematicCapsuleHandle, KinematicCapsuleProps>(function KinematicCapsule(
  {
    feetPosition = [0, 0, 0],
    maxClimbSlopeRadians = DEFAULT_MAX_CLIMB_SLOPE_RADIANS,
    minSlideSlopeRadians = DEFAULT_MIN_SLIDE_SLOPE_RADIANS,
    groundSnapDistanceM = DEFAULT_GROUND_SNAP_M,
    onResolvedMove,
    children,
    ...groupProps
  },
  forwardedRef,
) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const { world } = useRapier();
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const pendingMove = useRef<Vector3Tuple | null>(null);
  const lastMove = useRef<CapsuleMoveResult>(ZERO_MOVE);
  const callback = useRef(onResolvedMove);
  callback.current = onResolvedMove;

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
    const desired = pendingMove.current;
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const activeController = controller.current;
    if (!desired || !body || !collider || !activeController) return;

    pendingMove.current = null;
    activeController.computeColliderMovement(collider, { x: desired[0], y: desired[1], z: desired[2] });
    const resolved = activeController.computedMovement();
    const result: CapsuleMoveResult = {
      displacement: [resolved.x, resolved.y, resolved.z],
      grounded: activeController.computedGrounded(),
      collisionCount: activeController.numComputedCollisions(),
    };
    const current = body.translation();
    body.setNextKinematicTranslation({
      x: current.x + resolved.x,
      y: current.y + resolved.y,
      z: current.z + resolved.z,
    });
    lastMove.current = result;
    callback.current?.(result);
  });

  useImperativeHandle(forwardedRef, () => ({
    requestMove(displacement) {
      pendingMove.current = [displacement[0], displacement[1], displacement[2]];
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
