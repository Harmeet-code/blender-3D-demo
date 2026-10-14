import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useAfterPhysicsStep,
  useRapier,
  type RapierRigidBody,
  type RapierCollider,
} from '@react-three/rapier';
import { MathUtils, Vector3, type Mesh } from 'three';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { avatarRuntime, type MovementResolver } from '@/features/viewer/model/avatar-runtime.ts';
import { frameRuntime } from '../model/frame-runtime.ts';
import { manualLocomotion } from '@/features/viewer/model/manual-locomotion.ts';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { isFloorPointClear } from '@/features/building/model/floor-point-clear.ts';

const AUTOPILOT_SPEED = 3;
let lastManualPortalAt = -Infinity;

/** Kinematic route follower; floor elevation remains owned by the spatial model. */
export function AvatarController() {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<Mesh>(null);
  const { world, rapier } = useRapier();
  const { camera, gl } = useThree();
  const layout = useActiveLayout();
  const walkMode = useWorldStore((s) => s.walkMode);
  const direction = useRef(new Vector3());
  const candidate = useRef<[number, number]>([0, 0]);
  const poseSeconds = useRef(0);
  const speed = useRef(0);
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const commandVersion = useRef(-1);
  const mountedFloor = useRef(avatarRuntime.floorId);
  const settledSteps = useRef(0);
  const initialPosition = useRef<[number, number, number]>([...avatarRuntime.position]);
  const previousPosition = useRef({
    x: initialPosition.current[0],
    y: initialPosition.current[1],
    z: initialPosition.current[2],
  });
  const currentPosition = useRef({ ...previousPosition.current });
  useEffect(() => {
    const canvas = gl.domElement;
    const oldTabIndex = canvas.tabIndex;
    canvas.tabIndex = 0;
    const stop = () => {
      const wasMoving = avatarRuntime.manualMoving;
      manualLocomotion.reset();
      avatarRuntime.manualMoving = false;
      if (wasMoving && !useWorldStore.getState().autopilot) {
        useWorldStore.getState().publishRuntimePose('idle');
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (walkMode && event.code === 'Escape') {
        event.preventDefault();
        useWorldStore.getState().setWalkMode(false);
        return;
      }
      if (
        !walkMode ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !manualLocomotion.accepts(event.code)
      ) {
        return;
      }
      event.preventDefault();
      if (event.repeat && !manualLocomotion.keys.has(event.code)) {
        return;
      }
      if (
        !event.repeat &&
        (useWorldStore.getState().autopilot || useWorldStore.getState().routeStatus === 'computing')
      ) {
        useWorldStore.getState().cancelAutopilot();
      }
      manualLocomotion.press(event.code);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (manualLocomotion.accepts(event.code)) {
        manualLocomotion.release(event.code);
      }
    };
    const focus = () => {
      if (walkMode) {
        canvas.focus({ preventScroll: true });
      }
    };
    const visible = () => {
      if (document.hidden) {
        stop();
      }
    };
    canvas.addEventListener('keydown', keyDown);
    canvas.addEventListener('keyup', keyUp);
    canvas.addEventListener('pointerdown', focus);
    canvas.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visible);
    if (walkMode) {
      canvas.focus({ preventScroll: true });
    }
    return () => {
      stop();
      canvas.tabIndex = oldTabIndex;
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('pointerdown', focus);
      canvas.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [gl, walkMode]);
  useEffect(() => {
    const character = world.createCharacterController(0.01);
    controller.current = character;
    return () => {
      controller.current = null;
      world.removeCharacterController(character);
    };
  }, [world]);
  const resolveMovement: MovementResolver = (desired, _current, output) => {
    if (!collider.current || !controller.current) {
      output[0] = output[1] = output[2] = 0;
      return;
    }
    controller.current.computeColliderMovement(
      collider.current,
      { x: desired[0], y: desired[1], z: desired[2] },
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const corrected = controller.current.computedMovement();
    output[0] = corrected.x;
    output[1] = corrected.y;
    output[2] = corrected.z;
  };

  useBeforePhysicsStep(() => {
    if (!body.current || avatarRuntime.floorId !== mountedFloor.current) {
      return;
    }
    body.current.wakeUp();
    Object.assign(previousPosition.current, body.current.translation());
    if (commandVersion.current !== avatarRuntime.commandVersion) {
      const [x, y, z] = avatarRuntime.position;
      body.current.setTranslation({ x, y, z }, true);
      Object.assign(previousPosition.current, { x, y, z });
      commandVersion.current = avatarRuntime.commandVersion;
      speed.current = 0;
      settledSteps.current = 0;
    }
    if (settledSteps.current < 2) {
      return;
    }
    const { autopilot, advanceAutopilot } = useWorldStore.getState();
    if (autopilot) {
      speed.current = Math.min(AUTOPILOT_SPEED, speed.current + 12 / 60);
      advanceAutopilot(avatarRuntime.position, speed.current / 60, resolveMovement);
      // A portal transfer remounts this body on the destination floor.
      if (commandVersion.current !== avatarRuntime.commandVersion) {
        return;
      }
      const [x, y, z] = avatarRuntime.position;
      body.current.setNextKinematicTranslation({ x, y, z });
    } else if (walkMode && manualLocomotion.active) {
      camera.getWorldDirection(direction.current);
      const length = Math.hypot(direction.current.x, direction.current.z) || 1;
      manualLocomotion.advance(direction.current.x / length, direction.current.z / length, 1 / 60);
      const { desired, resolved, position } = avatarRuntime;
      desired[0] = manualLocomotion.vx / 60;
      desired[1] = 0;
      desired[2] = manualLocomotion.vz / 60;
      resolveMovement(desired, position, resolved);
      candidate.current[0] = position[0] + resolved[0];
      candidate.current[1] = position[2] + resolved[2];
      const clear = isFloorPointClear(layout, mountedFloor.current, candidate.current);
      if (clear) {
        position[0] += resolved[0];
        position[2] += resolved[2];
      }
      const moving = Math.hypot(resolved[0], resolved[2]) > 0.00001 && clear;
      avatarRuntime.manualMoving = moving;
      if (moving) {
        avatarRuntime.rotationY = Math.atan2(manualLocomotion.vx, manualLocomotion.vz);
      }
      // Paired portal entries are discrete floor transfers, never a sweep through a slab.
      // Multi-stop lifts retain explicit floor choice via the route planner/floor picker.
      if (moving && performance.now() - lastManualPortalAt > 1600) {
        for (const portal of layout.portals) {
          if (portal.connects.length !== 2) {
            continue;
          }
          const entry = portal.entries?.find((p) => p.floorId === mountedFloor.current);
          const target = portal.entries?.find(
            (p) => p.floorId !== mountedFloor.current && portal.connects.includes(p.floorId),
          );
          if (!entry || !target) {
            continue;
          }
          const prior = previousPosition.current;
          if (
            Math.hypot(prior.x - entry.position[0], prior.z - entry.position[1]) <= 0.8 ||
            Math.hypot(position[0] - entry.position[0], position[2] - entry.position[1]) > 0.8
          ) {
            continue;
          }
          const destinationFloor = layout.floors.find((f) => f.id === target.floorId);
          if (!destinationFloor || !isFloorPointClear(layout, target.floorId, target.position)) {
            continue;
          }
          lastManualPortalAt = performance.now();
          manualLocomotion.reset();
          avatarRuntime.manualMoving = false;
          useWorldStore.setState((state) => ({
            currentFloorId: target.floorId,
            localAvatar: {
              ...state.localAvatar,
              floorId: target.floorId,
              position: [
                target.position[0],
                destinationFloor.heightOffset + 1.2,
                target.position[1],
              ],
              rotationY: target.yawRadians,
              animationState: 'idle',
            },
          }));
          return;
        }
      }
      body.current.setNextKinematicTranslation({ x: position[0], y: position[1], z: position[2] });
      poseSeconds.current += 1 / 60;
      if (poseSeconds.current >= 0.1 || !manualLocomotion.active) {
        poseSeconds.current = 0;
        useWorldStore.getState().publishRuntimePose(moving ? 'walk' : 'idle');
      }
    }
  });
  useAfterPhysicsStep(() => {
    settledSteps.current++;
    if (body.current) {
      Object.assign(currentPosition.current, body.current.translation());
    }
  });
  useFrame((_, delta) => {
    if (visual.current) {
      const difference =
        MathUtils.euclideanModulo(
          avatarRuntime.rotationY - visual.current.rotation.y + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      visual.current.rotation.y += difference * (1 - Math.exp(-12 * Math.min(delta, 0.05)));
      if (Math.abs(difference) > 0.001) {
        frameRuntime.wake('avatar-turn', 100);
      }
      const a = frameRuntime.alpha,
        p = previousPosition.current,
        c = currentPosition.current;
      visual.current.position.set(
        (p.x - c.x) * (1 - a),
        -0.4 + (p.y - c.y) * (1 - a),
        (p.z - c.z) * (1 - a),
      );
    }
    if (
      !useWorldStore.getState().autopilot &&
      !manualLocomotion.active &&
      settledSteps.current >= 2
    ) {
      body.current?.sleep();
    }
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={initialPosition.current}
      enabledRotations={[false, false, false]}
    >
      <CuboidCollider ref={collider} args={[0.4, 0.9, 0.4]} position={[0, -0.3, 0]} />
      <mesh ref={visual} castShadow position-y={-0.4}>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
        <meshStandardMaterial color="#7dd3fc" />
      </mesh>
    </RigidBody>
  );
}
