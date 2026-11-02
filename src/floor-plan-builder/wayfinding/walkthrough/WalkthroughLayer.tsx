import { Profiler, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { MathUtils, Vector3, type Group } from 'three';
import { AvatarObject } from '../../components/AvatarObject.tsx';
import { ProceduralObject } from '../../components/ProceduralObject.tsx';
import { createObject } from '../../model/inventory.ts';
import type { PlanDocument } from '../../model/types.ts';
import { usePlaybackStore, type PlaybackSession } from '../store/playback-store.ts';
import { AvatarRig } from './avatar-rig.ts';
import { CameraRig } from './CameraRig.tsx';
import { useManualInput } from './locomotion/manual-input.ts';
import { KinematicCapsule, type KinematicCapsuleHandle, type CapsuleMoveResult } from './foundation/kinematic-capsule.tsx';
import { CollisionWorld, useCapsuleClearance } from './collision/collision-world.tsx';
import { CHARACTER_CONFIG } from './character-config.ts';
import type { Role } from './contracts.ts';
import { smoothRouteCorners, steerRoute } from './steering/route-steering.ts';
import { ProximityInteractionRuntime } from './interaction/proximity.ts';
import { createWalkInteractionTargets } from './interaction/target-adapter.ts';
import type { InteractionState } from './contracts.ts';
import { InteractionPrompt } from './ui/InteractionPrompt.tsx';
import { proximityDoors, setCollisionDoorOpen } from '../game/door-state.ts';
import type { WalkUseHandlerPolicy } from './foundation/role-policy.ts';
import { circulationDesign } from '../../model/circulation.ts';
import { advanceFollower, type Follower } from './follower.ts';
import { connectorRecordForLeg, resolveConnectorTraversal } from './connectors/connector-runtime.ts';
import { UnsupportedShapeList } from '../../components/dev/motion-lab/UnsupportedShapeList.tsx';

function cloneFollowerFrame(value: Follower): Follower {
  return {
    ...value,
    position: [...value.position], tangent: [...value.tangent], look: [...value.look], scratch: [...value.scratch],
    ribbon: { ...value.ribbon }, connector: value.connector ? { ...value.connector } : null,
  };
}

function commitFollowerFrame(target: Follower, next: Follower) {
  target.leg = next.leg;
  target.s = next.s;
  target.distance = next.distance;
  target.progress = next.progress;
  target.ribbon = { ...next.ribbon };
  target.speed = next.speed;
  target.yaw = next.yaw;
  target.yawVelocity = next.yawVelocity;
  target.position = [...next.position];
  target.tangent = [...next.tangent];
  target.look = [...next.look];
  target.scratch = [...next.scratch];
  target.elapsed = next.elapsed;
  target.gaitDistance = next.gaitDistance;
  target.phase = next.phase;
  target.arrived = next.arrived;
  target.arrivalTime = next.arrivalTime;
  target.floorId = next.floorId;
  target.seekVersion = next.seekVersion;
  target.lastSeek = next.lastSeek;
  target.connector = next.connector ? { ...next.connector } : null;
}

function Runtime({
  session,
  document,
  floorId,
  onFloor,
  originY,
  role,
}: {
  session: PlaybackSession;
  document: PlanDocument;
  floorId: string;
  onFloor: (id: string) => boolean | void;
  originY: number;
  role: Role;
}) {
  const { runtime } = session;
  const root = useRef<Group>(null),
    body = useRef<Group>(null),
    capsule = useRef<KinematicCapsuleHandle>(null),
    callbacks = useRef(onFloor);
  callbacks.current = onFloor;
  const rig = useMemo(() => new AvatarRig(), []),
    lastSnapshot = useRef(0);
  const status = usePlaybackStore((state) => state.status),
    mode = usePlaybackStore((state) => state.mode),
    message = usePlaybackStore((state) => state.message);
  const activeFloor = usePlaybackStore((state) => state.snapshot.floorId);
  const invalidate = useThree((state) => state.invalidate);
  const [interactionState, setInteractionState] = useState<InteractionState>({ status: 'idle' });
  const [inspectedTargetId, setInspectedTargetId] = useState<string | null>(null);
  const [joinedQueueIds, setJoinedQueueIds] = useState<ReadonlySet<string>>(() => new Set());
  const [calledElevatorIds, setCalledElevatorIds] = useState<ReadonlySet<string>>(() => new Set());
  const autoPausedForUse = useRef(false);
  const interactionTargets = useMemo(
    () => createWalkInteractionTargets(document, floorId, originY, role),
    [document, floorId, originY, role],
  );
  const interactionRuntime = useMemo(
    () => new ProximityInteractionRuntime({
      role,
      targets: interactionTargets,
      handlers: [{
        capability: 'join-local-queue',
        handlerId: 'walkthrough.local-queue.v1',
        commits: true,
        execute: ({ target }) => {
          setJoinedQueueIds((current) => new Set(current).add(target.targetId));
        },
      }, {
        capability: 'call-elevator',
        handlerId: 'walkthrough.elevator-call.v1',
        commits: true,
        execute: ({ target }) => {
          const elevator = document.floors.flatMap((floor) => floor.objects).find((object) => object.id === target.targetId);
          if (!elevator || elevator.recipe !== 'elevator' || !elevator.portalId.trim()) {
            throw new Error('This elevator is not linked to a portal in the current document.');
          }
          if (runtime.connector) {
            throw new Error('The walkthrough is already traversing a connector; finish that transition before calling an elevator.');
          }
          const design = circulationDesign(elevator);
          runtime.connector = {
            portalId: elevator.portalId,
            cabinY: design.cabinLevel === 'upper' ? elevator.dimensions[1] : 0,
            open: 0,
          };
          setCalledElevatorIds((current) => new Set(current).add(elevator.id));
          invalidate();
        },
      }] satisfies WalkUseHandlerPolicy[],
      onInspect: (target) => setInspectedTargetId(target.id),
      onDoorEffect: (target, open) => {
        if (open) {proximityDoors.add(target.targetId); setCollisionDoorOpen(target.targetId, false);}
        else {proximityDoors.delete(target.targetId); setCollisionDoorOpen(target.targetId, false);}
        invalidate();
      },
      onState: (nextState) => {
        setInteractionState(nextState);
        const playback = usePlaybackStore.getState();
        if (nextState.status === 'confirmation-required' && playback.status === 'playing') {
          autoPausedForUse.current = true;
          playback.toggle();
        } else if (autoPausedForUse.current && nextState.status !== 'committing') {
          autoPausedForUse.current = false;
          if (playback.status === 'paused') {playback.toggle();}
        }
      },
    }),
    [role, interactionTargets, invalidate],
  );
  useEffect(() => () => interactionRuntime.clear(), [interactionRuntime]);
  const inspectedTarget = interactionTargets.find((target) => target.id === inspectedTargetId);
  const clearance = useCapsuleClearance();
  const connectorRecords = useMemo(
    () => runtime.path.legs.flatMap((leg) => {
      const record = connectorRecordForLeg(leg, document);
      return record ? [record] : [];
    }),
    [runtime.path, document],
  );
  const connectorPoint = (point: readonly [number, number, number]): [number, number, number] => [point[0], point[1] + originY, point[2]];
  const connectorPlans = useMemo(() => new Map(runtime.path.legs.flatMap((leg, index) => {
    if (leg.kind === 'walk') {return [];}
    const record = connectorRecords.find((item) => item.id === leg.connector?.id && item.portalId === leg.connector?.portalId);
    const toFloorId = leg.toFloorId;
    if (!record || !toFloorId) {return [];}
    const resolution = resolveConnectorTraversal({
      record,
      portalId: record.portalId,
      fromFloorId: leg.floorId,
      toFloorId,
      role,
      accessibleOnly: session.route.option === 'accessible',
      validatePathBinding: (path, portalId) => {
        const portal = document.baseline.portals.find((item) => item.id === portalId);
        const instance = document.floors.flatMap((floor) => floor.objects).find((object) => object.id === path.authoredInstanceId);
        return !!portal && portal.type === leg.kind && portal.connects.includes(leg.floorId) && portal.connects.includes(toFloorId) &&
          !!instance && instance.id === record.id && instance.portalId === portal.id && instance.recipe === leg.kind;
      },
      validateSweep: (from, to) => clearance.validateConnectorSweep(record.id, connectorPoint(from), connectorPoint(to), CHARACTER_CONFIG),
      validateEndpoint: (floorId, feet) => clearance.validateConnectorEndpoint(record.id, floorId, connectorPoint(feet), CHARACTER_CONFIG),
      validateElevatorRide: (_from, _to) => {
        if (leg.kind !== 'elevator' || !leg.connector || leg.points.length !== 4) {return { clear: false, continuous: false, reason: 'Elevator cabin path is incomplete.' };}
        // The scene has no authored shaft aperture, cabin/door colliders, or moving cabin
        // context. Dimension checks and a clearance-map sweep cannot prove an elevator ride safe.
        return { clear: false, continuous: false, reason: 'Elevator traversal is unavailable until shaft, slab apertures, cabin, and door collision geometry are integrated.' };
      },
    });
    return [[index, resolution] as const];
  })), [runtime.path, connectorRecords, document, role, session.route.option, clearance, originY]);
  const camera = useThree((state) => state.camera);
  const get = useThree((state) => state.get),
    setFrameloop = useThree((state) => state.setFrameloop);
  const releaseCanvasPointerLock = useCallback(() => {
    const canvas = get().gl.domElement;
    if (window.document.pointerLockElement === canvas) {window.document.exitPointerLock();}
  }, [get]);
  const pending = useRef(false),
    pendingMove = useRef<null | (
      | { kind: 'route'; intent: ReturnType<typeof steerRoute>; from: [number, number, number] }
      | { kind: 'manual'; from: [number, number, number]; displacement: [number, number, number]; yaw: number; speed: number }
      | { kind: 'connector'; connectorId: string; from: [number, number, number]; displacement: [number, number, number]; next: Follower }
    )>(null),
    smoothedPath = useRef(false),
    velocity = useRef(0),
    forward = useMemo(() => new Vector3(), []),
    right = useMemo(() => new Vector3(), []),
    manualDirection = useMemo(() => new Vector3(), []);
  const input = useManualInput(
    true,
    status !== 'playing',
    () => {
      const state = usePlaybackStore.getState();
      state.setMode(state.mode === 'first' ? 'chase' : 'first');
    },
    () => {
      autoPausedForUse.current = false;
      const state = usePlaybackStore.getState();
      if (state.status === 'playing') {state.toggle();}
    },
  );
  useEffect(() => {
    const clearMotion = () => {
      velocity.current = 0;
      manualDirection.set(0, 0, 0);
      invalidate();
    };
    const visibility = () => { if (window.document.hidden) {clearMotion();} };
    window.addEventListener('blur', clearMotion);
    window.document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', clearMotion);
      window.document.removeEventListener('visibilitychange', visibility);
      clearMotion();
    };
  }, [invalidate, manualDirection]);
  useEffect(() => {
    if (status === 'playing') {
      releaseCanvasPointerLock();
      velocity.current = 0;
      manualDirection.set(0, 0, 0);
    }
  }, [status, manualDirection, releaseCanvasPointerLock]);
  const avatar = useMemo(() => {
    const authored = session.document.floors
      .flatMap((floor) => floor.objects)
      .find((object) => object.recipe === 'avatar');
    return {
      ...(authored ?? createObject('avatar', [0, 0])),
      dimensions: [CHARACTER_CONFIG.widthM, CHARACTER_CONFIG.heightM, CHARACTER_CONFIG.widthM] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      avatarAnimated: false,
      avatarPin: false,
      avatarPose: 'idle' as const,
    };
  }, [session.document]);
  useLayoutEffect(() => {
    if (body.current) {
      rig.bind(body.current);
    }
    if (!smoothedPath.current) {
      for (const leg of runtime.path.legs) {
      if (leg.kind !== 'walk') {continue;}
      const smoothed = smoothRouteCorners(leg.points, {
        validateSegment: (from, to) =>
          clearance.validateSweep(
            [from[0], from[1] + originY, from[2]],
            [to[0], to[1] + originY, to[2]],
            CHARACTER_CONFIG,
          ).clear,
      });
      if (!smoothed) {
        usePlaybackStore.getState().fail('The route cannot be validated for the full avatar capsule.');
        break;
      }
      leg.points = smoothed.points;
      leg.lengths = smoothed.lengths;
      leg.length = smoothed.length;
    }}
    let offset = 0;
    for (const leg of runtime.path.legs) {
      leg.offset = offset;
      offset += leg.length;
    }
    runtime.path.length = offset;
    smoothedPath.current = true;
    invalidate();
  }, [runtime, rig, invalidate, originY, clearance]);
  useEffect(() => usePlaybackStore.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => {
    const previous = get().frameloop;
    const update = () => {
      setFrameloop(status === 'playing' && !window.document.hidden ? 'always' : 'demand');
      invalidate();
    };
    update();
    window.document.addEventListener('visibilitychange', update);
    return () => {
      window.document.removeEventListener('visibilitychange', update);
      setFrameloop(previous);
    };
  }, [status, get, setFrameloop, invalidate]);
  useEffect(() => {
    if (
      activeFloor &&
      activeFloor !== floorId &&
      document.floors.some((floor) => floor.source.id === activeFloor)
    ) {
      if (callbacks.current(activeFloor) === false) {
        usePlaybackStore
          .getState()
          .fail('Apply or discard your draft edits before switching floors, then resume.');
      }
    }
  }, [activeFloor, floorId, document, status]);
  const originalFloor = useRef(session.initialFloor);
  useEffect(
    () => () => {
      callbacks.current(originalFloor.current);
    },
    [],
  );
  const onResolvedMove = (result: CapsuleMoveResult) => {
    const queued = pendingMove.current;
    pendingMove.current = null;
    pending.current = false;
    const [dx, dy, dz] = result.displacement;
    const travelled = Math.hypot(dx, dy, dz);
    runtime.position = [runtime.position[0] + dx, runtime.position[1] + dy, runtime.position[2] + dz];
    if (queued?.kind !== 'connector') {runtime.gaitDistance += Math.hypot(dx, dz);}
    if (queued?.kind === 'route') {
      const { intent, from } = queued;
      const displacementError = Math.hypot(
        dx - intent.displacement[0],
        dy - intent.displacement[1],
        dz - intent.displacement[2],
      );
      if (displacementError > 0.025) {
        runtime.speed = 0;
        usePlaybackStore.getState().fail('Capsule physics disagreed with the route clearance preview; auto-walk stopped.');
      } else {
        const leg = runtime.path.legs[runtime.leg]!;
        runtime.position = [from[0] + dx, from[1] + dy, from[2] + dz];
        runtime.s = intent.distanceM;
        runtime.speed = intent.speedMps;
        runtime.yaw = intent.targetYawRadians;
        runtime.look = [...intent.gazeTarget];
        runtime.distance = Math.min(runtime.path.length, runtime.distance + travelled);
        runtime.progress = runtime.path.length > 0 ? runtime.distance / runtime.path.length : 1;
        runtime.ribbon.progress = runtime.progress;
        runtime.floorId = leg.floorId;
        runtime.phase = intent.arrived ? 'Arrived' : 'Walking';
        runtime.arrived = intent.arrived;
      }
    } else if (queued?.kind === 'connector') {
      const error = Math.hypot(
        dx - queued.displacement[0],
        dy - queued.displacement[1],
        dz - queued.displacement[2],
      );
      if (error > 0.025) {
        // The capsule controller has already committed the Rapier-resolved displacement.
        // Keep the follower origin at that accepted pose while stopping the route.
        usePlaybackStore.getState().fail('Connector traversal stopped because capsule physics rejected the validated movement.');
      } else {
        commitFollowerFrame(runtime, queued.next);
        runtime.position = [queued.from[0] + dx, queued.from[1] + dy, queued.from[2] + dz];
        runtime.distance = queued.next.distance;
        runtime.progress = queued.next.progress;
        runtime.ribbon.progress = queued.next.ribbon.progress;
      }
    } else if (queued?.kind === 'manual') {
      const planned = Math.hypot(...queued.displacement);
      if (Math.abs(planned - travelled) > 0.025) {
        velocity.current = 0;
        runtime.speed = 0;
        usePlaybackStore.getState().fail('Manual movement stopped because capsule physics rejected the validated sweep.');
      } else {
        runtime.yaw = queued.yaw;
        runtime.speed = queued.speed;
      }
      runtime.look = [runtime.position[0] - Math.sin(runtime.yaw), runtime.position[1] + 1.2, runtime.position[2] - Math.cos(runtime.yaw)];
      runtime.phase = travelled > 0.001 ? 'Walking' : 'Ready';
      runtime.arrived = false;
    }
    invalidate();
  };
  useFrame((_, rawDelta) => {
    const state = usePlaybackStore.getState();
    const dt = window.document.hidden ? 0 : Math.min(rawDelta, 0.1);
    if (pending.current) {
      invalidate();
      return;
    }
    if (state.status === 'playing' && !runtime.arrived) {
      const leg = runtime.path.legs[runtime.leg];
      if (!leg) {
        state.fail('The route has no remaining walk leg.');
      } else if (leg.kind !== 'walk') {
        const resolution = connectorPlans.get(runtime.leg);
        if (!resolution || 'stage' in resolution) {
          state.fail(`Connector route is blocked: ${  resolution && 'reason' in resolution ? resolution.reason : 'no authored connector geometry is linked to this portal.'}`);
        } else {
          const from: [number, number, number] = [...runtime.position];
          const next = cloneFollowerFrame(runtime);
          advanceFollower(next, dt * state.speed);
          const displacement: [number, number, number] = [
            next.position[0] - from[0], next.position[1] - from[1], next.position[2] - from[2],
          ];
          if (displacement.some((value) => Math.abs(value) > 1e-7)) {
            pending.current = true;
            pendingMove.current = { kind: 'connector', connectorId: resolution.connectorId, from, displacement, next };
            capsule.current?.requestMove(displacement);
          } else {
            commitFollowerFrame(runtime, next);
            invalidate();
            state.publish(runtime);
          }
        }
      } else {
        const from: [number, number, number] = [...runtime.position];
        const intent = steerRoute({
          leg,
          state: { distanceM: runtime.s, speedMps: runtime.speed, yawRadians: runtime.yaw },
          dtSeconds: dt * state.speed,
          speedLimitMps: CHARACTER_CONFIG.walkSpeedMps,
          validateDisplacement: (position, displacement) => {
            const result = clearance.validateSweep(
              [position[0], position[1] + originY, position[2]],
              [position[0] + displacement[0], position[1] + displacement[1] + originY, position[2] + displacement[2]],
              CHARACTER_CONFIG,
            );
            return result.clear;
          },
        });
        if (intent.blocked) {
          state.fail('Auto-walk stopped because the avatar capsule sweep is blocked or unsupported.');
        } else if (intent.displacement.some((value) => Math.abs(value) > 1e-7)) {
          pending.current = true;
          pendingMove.current = { kind: 'route', intent, from };
          capsule.current?.requestMove(intent.displacement);
        } else {
          runtime.speed = intent.speedMps;
          runtime.yaw = intent.targetYawRadians;
          runtime.look = [...intent.gazeTarget];
          runtime.arrived = intent.arrived;
          if (intent.arrived) {state.publish(runtime);}
        }
      }
    } else if (state.status !== 'playing') {
      // The authored elevator cabin path owns passenger movement; paused auto-walk cannot steer out into the shaft.
      const held = runtime.connector ? { forward: 0, strafe: 0, sprint: false } : input.current;
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) {forward.set(-Math.sin(runtime.yaw), 0, -Math.cos(runtime.yaw));}
      forward.normalize();
      right.set(-forward.z, 0, forward.x);
      const moveX = forward.x * held.forward + right.x * held.strafe;
      const moveZ = forward.z * held.forward + right.z * held.strafe;
      const moveLength = Math.hypot(moveX, moveZ);
      if (moveLength > 1e-6) {manualDirection.set(moveX / moveLength, 0, moveZ / moveLength);}
      const maxSpeed = held.sprint ? CHARACTER_CONFIG.sprintSpeedMps : CHARACTER_CONFIG.walkSpeedMps;
      const desiredSpeed = moveLength > 1e-6 ? maxSpeed : 0;
      const rate = desiredSpeed > velocity.current ? CHARACTER_CONFIG.accelerationMps2 : CHARACTER_CONFIG.brakingMps2;
      velocity.current += MathUtils.clamp(desiredSpeed - velocity.current, -rate * dt, rate * dt);
      const distance = velocity.current * dt;
      let {yaw} = runtime;
      let dx = 0;
      let dz = 0;
      if (manualDirection.lengthSq() > 1e-8 && distance > 1e-7) {
        dx = manualDirection.x * distance;
        dz = manualDirection.z * distance;
        const targetYaw = Math.atan2(-manualDirection.x, -manualDirection.z);
        const yawDelta = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
        yaw += MathUtils.clamp(yawDelta, -Math.PI * dt, Math.PI * dt);
        const from: [number, number, number] = [...runtime.position];
        const to: [number, number, number] = [from[0] + dx, from[1], from[2] + dz];
        if (clearance.validateSweep(
          [from[0], from[1] + originY, from[2]],
          [to[0], to[1] + originY, to[2]],
          CHARACTER_CONFIG,
        ).clear) {
          pending.current = true;
          pendingMove.current = { kind: 'manual', from, displacement: [dx, 0, dz], yaw, speed: velocity.current };
          capsule.current?.requestMove([dx, 0, dz]);
        } else {
          velocity.current = 0;
          runtime.speed = 0;
        }
      } else {
        runtime.speed = velocity.current;
      }
      if (held.forward || held.strafe) {invalidate();}
      if (velocity.current > 0.001) {invalidate();}
    } else if (runtime.arrived && runtime.arrivalTime < 1.1) {
      runtime.arrivalTime += dt;
      invalidate();
    }
    if (root.current) {
      root.current.rotation.y = runtime.yaw;
    }
    if (body.current) {
      body.current.visible = state.mode !== 'first';
      if (state.mode !== 'first') {rig.update(runtime, originY);}
    }

    interactionRuntime.update({ position: runtime.position, yawRadians: runtime.yaw }, dt);
    // Demand mode only needs another frame while the nearby target's dwell is advancing.
    // Once info is published, stationary focus does not require a permanent render loop.
    if (interactionRuntime.state.status === 'nearby') {invalidate();}

    lastSnapshot.current += dt;
    if (lastSnapshot.current >= 0.1 || (runtime.arrived && state.status === 'playing')) {
      lastSnapshot.current = 0;
      state.publish(runtime);
    }
  }, -3);
  // Upper floors render landing proxies. Retain the lower shaft during its traversal.
  const leg = runtime.path.legs.find(
    (candidate) =>
      (candidate.floorId === activeFloor && candidate.kind === 'elevator') ||
      (candidate.toFloorId === activeFloor && candidate.kind === 'elevator'),
  );
  const lower = leg?.connector;
  const lowerFloor = lower
    ? session.document.floors.find((floor) =>
        floor.objects.some((object) => object.id === lower.id),
      )
    : undefined;
  return (
    <>
      <KinematicCapsule
        ref={capsule}
        feetPosition={[runtime.position[0], runtime.position[1] + originY, runtime.position[2]]}
        validateSweep={(from, to) => {
          const queued = pendingMove.current;
          return queued?.kind === 'connector'
            ? clearance.validateConnectorSweep(queued.connectorId, from, to, CHARACTER_CONFIG).clear
            : clearance.validateSweep(from, to, CHARACTER_CONFIG).clear;
        }}
        onResolvedMove={onResolvedMove}
      >
        <group ref={root} name="WalkthroughAvatar" raycast={() => {}}>
          <group ref={body}>
            <AvatarObject object={avatar} color={avatar.avatarClothing} forceDetail />
          </group>
          {mode === 'overview' && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} raycast={() => {}}>
              <ringGeometry args={[0.32, 0.38, 24]} />
              <meshBasicMaterial
                color="#06B6D4"
                toneMapped={false}
                transparent
                opacity={0.85}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      </KinematicCapsule>
      {lower && lowerFloor && lowerFloor.source.id !== floorId && (
        <group position={[0, lowerFloor.source.heightOffset + originY, 0]}>
          <ProceduralObject object={lower} color={lower.color} />
        </group>
      )}
      <Html fullscreen>
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-[min(90vw,42rem)] flex-wrap justify-end gap-2">
          {message && (
            <div role="status" className="pointer-events-auto basis-full rounded bg-slate-950/90 px-3 py-2 text-sm text-white shadow">
              {message}
            </div>
          )}
          {import.meta.env.DEV && <UnsupportedShapeList issues={clearance.map.unsupported} />}
          {runtime.connector && (
            <div role="status" aria-live="polite" className="pointer-events-auto basis-full rounded bg-slate-950/90 px-3 py-2 text-sm text-white shadow">
              Elevator: {runtime.phase}
            </div>
          )}
          <InteractionPrompt
            runtime={interactionRuntime}
            target={interactionRuntime.target}
            state={interactionState}
            statusMessage={interactionRuntime.target && joinedQueueIds.has(interactionRuntime.target.targetId)
              ? "Joined this walkthrough's local kiosk queue. No external reservation was created."
              : interactionRuntime.target && calledElevatorIds.has(interactionRuntime.target.targetId)
                ? 'Elevator call recorded for this walkthrough session; no physical cabin or door state changed.'
              : undefined}
          />
          {interactionRuntime.target?.id === inspectedTargetId && inspectedTarget && (
            <div className="pointer-events-auto basis-full rounded-lg border border-white/15 bg-slate-950/95 p-3 text-sm text-white shadow-lg">
              <h2 className="font-semibold">Details</h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {inspectedTarget.details.map((detail) => (
                  <div key={detail.label} className="contents">
                    <dt className="text-slate-400">{detail.label}</dt>
                    <dd className="break-all">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <button
            type="button"
            className="pointer-events-auto rounded bg-slate-950/90 px-3 py-2 text-sm text-white shadow"
            aria-label={`Switch to ${mode === 'first' ? 'third' : 'first'} person view`}
            onClick={(event) => {
              event.stopPropagation();
              const current = usePlaybackStore.getState().mode;
              usePlaybackStore.getState().setMode(current === 'first' ? 'chase' : 'first');
            }}
          >
            {mode === 'first' ? 'Third person' : 'First person'}
          </button>
          <button
            type="button"
            className="pointer-events-auto rounded bg-slate-950/90 px-3 py-2 text-sm text-white shadow"
            aria-label={status === 'playing' ? 'Stop auto-walk' : status === 'arrived' ? 'Route complete' : 'Resume auto-walk'}
            disabled={status === 'arrived'}
            onClick={(event) => {
              event.stopPropagation();
              releaseCanvasPointerLock();
              autoPausedForUse.current = false;
              usePlaybackStore.getState().toggle();
            }}
          >
            {status === 'playing' ? 'Stop' : status === 'arrived' ? 'Route complete' : 'Resume'}
          </button>
          <button
            type="button"
            className="pointer-events-auto rounded bg-slate-950/90 px-3 py-2 text-sm text-white shadow"
            aria-label="Exit walkthrough"
            onClick={(event) => {
              event.stopPropagation();
              usePlaybackStore.getState().exit();
            }}
          >
            Exit
          </button>
        </div>
      </Html>
      <CameraRig runtime={runtime} document={document} floorId={floorId} originY={originY} />
    </>
  );
}
export function WalkthroughLayer(props: {
  document: PlanDocument;
  floorId: string;
  onFloor: (id: string) => boolean | void;
  originY?: number;
  role?: Role;
  roleAreas?: readonly import('./collision/capsule-clearance.ts').RoleAreaPolicy[];
}) {
  const session = usePlaybackStore((state) => state.session);
  const connectorRecords = useMemo(
    () => session?.runtime.path.legs.flatMap((leg) => {
      const record = connectorRecordForLeg(leg, session.document);
      return record ? [record] : [];
    }) ?? [],
    [session?.runtime.path, session?.document],
  );
  const floor = props.document.floors.find((item) => item.source.id === props.floorId);
  const originY = props.originY ?? 0;
  const collisionFloor = useMemo(
    () => floor && originY !== 0
      ? { ...floor, source: { ...floor.source, heightOffset: floor.source.heightOffset + originY } }
      : floor,
    [floor, originY],
  );
  if (!session) {
    return null;
  }
  if (!floor || !collisionFloor) {return null;}
  const runtime = (
    <Physics timeStep={1 / 60} updateLoop="independent">
      <CollisionWorld
        floor={collisionFloor}
        role={props.role ?? 'visitor'}
        roleAreas={props.roleAreas}
        connectors={connectorRecords}
        connectorFloors={session.document.floors}
        originY={originY}
      >
        <Runtime
          key={session.generation}
          document={props.document}
          floorId={props.floorId}
          onFloor={props.onFloor}
          originY={originY}
          role={props.role ?? 'visitor'}
          session={session}
        />
      </CollisionWorld>
    </Physics>
  );
  return import.meta.env.DEV ? (
    <Profiler
      id="WalkthroughRuntime"
      onRender={() => {
        session.runtime.renderCommits++;
      }}
    >
      {runtime}
    </Profiler>
  ) : (
    runtime
  );
}
