import { pointInPolygon, polygonEdges, segmentDistance } from '@/utils/geometry/polygon.ts';
import { createRoleNavigationZones, type RouteNavigationPolicySource } from './permissions/route-navigation-policy.ts';
import type { LocalActionOptions } from './interaction/local-actions.ts';
import { Profiler, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { WalkOverlay } from './ui/WalkOverlay.tsx';
import { Physics, useAfterPhysicsStep, useRapier } from '@react-three/rapier';
import { Box3, MathUtils, Vector3, type Group } from 'three';
import { AvatarObject } from '../../components/AvatarObject.tsx';
import { ProceduralObject } from '../../components/ProceduralObject.tsx';
import { createObject } from '../../model/inventory.ts';
import type { PlanDocument } from '../../model/types.ts';
import { usePlaybackStore, type PlaybackSession } from '../store/playback-store.ts';
import { AvatarRig } from './avatar-rig.ts';
import { CameraRig } from './CameraRig.tsx';
import { useManualInput } from './locomotion/manual-input.ts';
import { CONTROLLER_OFFSET_M, KinematicCapsule, type KinematicCapsuleHandle, type CapsuleMoveResult, type PhysicsMoveStep } from './foundation/kinematic-capsule.tsx';
import { CollisionWorld, useCapsuleClearance } from './collision/collision-world.tsx';
import { type CollisionMap, type RoleAreaPolicy } from './collision/capsule-clearance.ts';
import { CHARACTER_CONFIG } from './character-config.ts';
import type { Role } from './contracts.ts';
import { steerRoute } from './steering/route-steering.ts';
import { ProximityInteractionRuntime } from './interaction/proximity.ts';
import { createWalkInteractionTargets } from './interaction/target-adapter.ts';
import type { InteractionState } from './contracts.ts';
import { InteractionPrompt } from './ui/InteractionPrompt.tsx';
import { proximityDoors, setCollisionDoorOpen } from '../game/door-state.ts';
import { WalkLocalActions } from './interaction/local-actions.ts';
import { type Follower } from './follower.ts';
import { authoredConnectorLegs, connectorRecordForLeg } from './connectors/connector-runtime.ts';
import { createConnectorSession } from './connectors/connector-session.ts';
import { UnsupportedShapeList } from '../../components/dev/motion-lab/UnsupportedShapeList.tsx';
import { ResumeController } from './runtime/resume-controller.tsx';
import type { WalkableZone } from '../model/zone-schema.ts';

const autoStopRequests = new WeakMap<Follower, () => void>();

/** Request a bounded stop for the currently mounted runtime, if it owns one. */
export function requestAutoWalkStop(runtime: Follower): boolean {
  const request = autoStopRequests.get(runtime);
  if (!request) {return false;}
  request();
  return true;
}

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

interface RuntimeProps {
  session: PlaybackSession;
  policyStatus: 'resolved' | 'unavailable';
  localActionInputs?: Pick<LocalActionOptions, 'items' | 'destinations'>;
  staffDoorIds?: readonly string[];
  document: PlanDocument;
  floorId: string;
  onFloor: (id: string) => boolean | void;
  originY: number;
  role: Role;
}

function SpawnValidatedRuntime(props: RuntimeProps) {
  const { session, originY } = props;
  const clearance = useCapsuleClearance();
  const { world, rapier } = useRapier();
  const invalidate = useThree((state) => state.invalidate);
  const attempted = useRef(false);
  useEffect(() => invalidate(), [invalidate, session.generation]);
  useAfterPhysicsStep(() => {
    if (attempted.current || session.kind !== 'free' || session.spawnStatus !== 'pending') {return;}
    attempted.current = true;
    const feet: [number, number, number] = [
      session.runtime.position[0],
      session.runtime.position[1] + originY,
      session.runtime.position[2],
    ];
    const endpoint = clearance.validateEndpoint(feet, CHARACTER_CONFIG);
    if (!endpoint.clear) {
      usePlaybackStore.getState().rejectFreeWalk(
        session.generation,
        `Free walk cannot start at the selected point because it is obstructed, outside the supported floor and walkable-zone union, or lacks capsule clearance. Choose a clear point and try again. ${endpoint.reason ?? ''}`.trim(),
      );
      return;
    }
    const ray = new rapier.Ray(
      { x: feet[0], y: feet[1] + CHARACTER_CONFIG.maxStepM + 0.02, z: feet[2] },
      { x: 0, y: -1, z: 0 },
    );
    const supportDistance = CHARACTER_CONFIG.maxStepM + 0.24;
    const support = world.castRay(
      ray,
      supportDistance,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    if (!support) {
      usePlaybackStore.getState().rejectFreeWalk(
        session.generation,
        'Free walk cannot start at the selected point because it has no physical supporting surface. Choose a point on the floor or a supported walkable zone and try again.',
      );
      return;
    }
    usePlaybackStore.getState().confirmFreeWalk(session.generation);
  });

  return session.kind === 'free' && session.spawnStatus === 'pending' ? null : <Runtime {...props} />;
}

function Runtime({
  session,
  document,
  floorId,
  onFloor,
  originY,
  role,
  policyStatus,
  localActionInputs,
  staffDoorIds,
}: RuntimeProps) {
  const { runtime } = session;
  const { world, rapier } = useRapier();
  const soleBounds = useMemo(() => new Box3(), []);
  const root = useRef<Group>(null),
    body = useRef<Group>(null),
    capsule = useRef<KinematicCapsuleHandle>(null),
    callbacks = useRef(onFloor);
  callbacks.current = onFloor;
  const rig = useMemo(() => new AvatarRig(), []),
    lastSnapshot = useRef(0);
  const autoStopRequested = useRef(false),
    autoTimeScale = useRef<{ generation: number; scale: number } | null>(null),
    yawFrameAccumulated = useRef(0),
    lastRenderedYaw = useRef(runtime.yaw);
  const status = usePlaybackStore((state) => state.status),
    mode = usePlaybackStore((state) => state.mode);
  const activeFloor = usePlaybackStore((state) => state.snapshot.floorId);
  const invalidate = useThree((state) => state.invalidate);
  const [interactionState, setInteractionState] = useState<InteractionState>({ status: 'idle' });
  const [, setAutoStopping] = useState(false);
  const [inspectedTargetId, setInspectedTargetId] = useState<string | null>(null);
  const localActions = useMemo(() => new WalkLocalActions({ ...localActionInputs, role, allowedRoles: policyStatus === 'resolved' ? ['staff', 'visitor'] : [] }), [session.generation, role, policyStatus, localActionInputs]);
  const autoPausedForUse = useRef(false);
  const pendingDoorClose = useRef(new Map<string, { position: readonly [number, number, number] }>());
  const interactionTargets = useMemo(
    () => createWalkInteractionTargets(document, floorId, originY, role, policyStatus, staffDoorIds),
    [document, floorId, originY, role, policyStatus, staffDoorIds],
  );
  const interactionRuntime = useMemo(
    () => new ProximityInteractionRuntime({
      role,
      targets: interactionTargets,
      localActions,
      onInspect: (target) => setInspectedTargetId(target.id),
      onDoorEffect: (target, open) => {
        if (open) {pendingDoorClose.current.delete(target.targetId); proximityDoors.add(target.targetId); setCollisionDoorOpen(target.targetId, false);}
        else {
          // Teardown/focus loss is only a close request. Retain the open doorway
          // while the full capsule can overlap its conservative object footprint.
          const object = document.floors.flatMap((floor) => floor.objects).find((item) => item.id === target.targetId);
          const safeRadius = object ? Math.hypot(object.dimensions[0] * object.scale[0], object.dimensions[2] * object.scale[2]) / 2 + CHARACTER_CONFIG.radiusM + 0.1 : Infinity;
          if (Math.hypot(runtime.position[0] - target.position[0], runtime.position[2] - target.position[2]) > safeRadius) {
            pendingDoorClose.current.delete(target.targetId); proximityDoors.delete(target.targetId); setCollisionDoorOpen(target.targetId, false);
          } else { pendingDoorClose.current.set(target.targetId, target); }
        }
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
    [role, interactionTargets, invalidate, localActions],
  );
  useEffect(() => () => interactionRuntime.clear(), [interactionRuntime]);
  const inspectedTarget = interactionTargets.find((target) => target.id === inspectedTargetId);
  const clearance = useCapsuleClearance();
  const connectorLegs = useMemo(() => [...runtime.path.legs, ...authoredConnectorLegs(document)], [runtime.path, document]);
  const connectorRecords = useMemo(
    () => connectorLegs.flatMap((leg) => {
      const record = connectorRecordForLeg(leg, document);
      return record ? [record] : [];
    }),
    [connectorLegs, document],
  );
  const connectorPoint = (point: readonly [number, number, number]): [number, number, number] => [point[0], point[1] + originY, point[2]];
  const connectorPlans = useMemo(() => new Map(connectorLegs.flatMap((leg, index) => {
    if (leg.kind === 'walk') {return [];}
    const record = connectorRecords.find((item) => item.id === leg.connector?.id && item.portalId === leg.connector?.portalId);
    const { toFloorId } = leg;
    if (!record || !toFloorId) {return [];}
    const resolution = createConnectorSession({
      record,
      portalId: record.portalId,
      fromFloorId: leg.floorId,
      toFloorId,
      role,
      accessibleOnly: session.constraints.accessibleOnly,
      validatePathBinding: (path, portalId) => {
        const portal = document.baseline.portals.find((item) => item.id === portalId);
        const instance = document.floors.flatMap((floor) => floor.objects).find((object) => object.id === path.authoredInstanceId);
        return !!portal && portal.type === (leg.kind === 'ramp' ? 'stairs' : leg.kind) && portal.connects.includes(leg.floorId) && portal.connects.includes(toFloorId) &&
          !!instance && instance.id === record.id && instance.portalId === portal.id && instance.recipe === leg.kind;
      },
      validateSweep: (from, to) => clearance.validateConnectorSweep(record.id, connectorPoint(from), connectorPoint(to), CHARACTER_CONFIG),
      validateEndpoint: (connectorFloorId, feet) => clearance.validateConnectorEndpoint(record.id, connectorFloorId, connectorPoint(feet), CHARACTER_CONFIG),
      getElevatorDoorOpen: () => clearance.getElevatorDoorOpen(record.id),
      getElevatorCabinY: () => clearance.getElevatorCabinY(record.id),
      validateElevatorRide: (_from, _to) => {
        if (leg.kind !== 'elevator' || !leg.connector || leg.points.length !== 4) {return { clear: false, continuous: false, reason: 'Elevator cabin path is incomplete.' };}
        return { clear: clearance.elevatorReady(record.id), continuous: clearance.elevatorReady(record.id), reason: 'Elevator collision geometry or slab aperture is unavailable.' };
      },
    }, policyStatus);
    return [[index, resolution] as const];
  })), [connectorLegs, connectorRecords, document, role, session.constraints.accessibleOnly, clearance, originY, policyStatus]);
  const camera = useThree((state) => state.camera);
  const get = useThree((state) => state.get),
    setFrameloop = useThree((state) => state.setFrameloop);
  const releaseCanvasPointerLock = useCallback(() => {
    const canvas = get().gl.domElement;
    if (window.document.pointerLockElement === canvas) {window.document.exitPointerLock();}
  }, [get]);
  const freeConnector = useRef(false);
  const queuedManualTakeover = useRef(false);
  const [, setConnectorActive] = useState(false);
  const setFreeConnector = (value: boolean) => { freeConnector.current = value; setConnectorActive(value); };
  const freeLegIndex = useRef<number | null>(null);
  const pending = useRef(false),
    pendingMove = useRef<null | (
      | { kind: 'route'; intent: ReturnType<typeof steerRoute>; from: [number, number, number] }
      | { kind: 'manual'; from: [number, number, number]; displacement: [number, number, number]; yaw: number; speed: number }
      | { kind: 'connector'; connectorId: string; from: [number, number, number]; displacement: [number, number, number]; next: Follower }
    )>(null),
    velocity = useRef(0),
    forward = useMemo(() => new Vector3(), []),
    right = useMemo(() => new Vector3(), []),
    manualDirection = useMemo(() => new Vector3(), []);
  const input = useManualInput(
    true,
    true,
    () => {
      const state = usePlaybackStore.getState();
      state.setMode(state.mode === 'first' ? 'chase' : 'first');
    },
    () => {
      autoPausedForUse.current = false;
      const state = usePlaybackStore.getState();
      if (state.recovering) {state.toggle(); return;}
      if (state.status === 'playing' || freeConnector.current) {
        autoStopRequested.current = true;
        setAutoStopping(true);
        invalidate();
      }
    },
    () => {
      const state = usePlaybackStore.getState();
      if (state.status !== 'playing' && !state.recovering && !state.awaiting && !freeConnector.current) {return;}
      autoPausedForUse.current = false;
      autoStopRequested.current = false;
      setAutoStopping(false);
      const connectorTakeover = freeConnector.current || !!runtime.connector;
      const supportedFloorPose = clearance.validateEndpoint(
        [runtime.position[0], runtime.position[1] + originY, runtime.position[2]],
        CHARACTER_CONFIG,
      ).clear;
      if (connectorTakeover && supportedFloorPose) {
        connectorPlans.get(freeLegIndex.current ?? runtime.leg)?.stop();
        setFreeConnector(false);
        freeLegIndex.current = null;
        queuedManualTakeover.current = false;
        runtime.connector = null;
      } else if (connectorTakeover) {
        freeLegIndex.current ??= runtime.leg;
        queuedManualTakeover.current = true;
        setFreeConnector(true);
      }
      state.takeManualControl(
        connectorTakeover && !supportedFloorPose
          ? 'Auto-walk paused. Manual control will begin at the next supported connector landing.'
          : 'Manual control active. Resume will calculate a new route from here.',
      );
      invalidate();
    },
  );
  useEffect(() => {
    const requestStop = () => {
      const state = usePlaybackStore.getState();
      if (state.recovering) {state.toggle(); return;}
      if (state.status !== 'playing' && !freeConnector.current) {return;}
      autoStopRequested.current = true;
      setAutoStopping(true);
      invalidate();
    };
    autoStopRequests.set(runtime, requestStop);
    return () => {
      autoStopRequests.delete(runtime);
      autoStopRequested.current = false;
    };
  }, [runtime, invalidate]);
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
  const recoverRoute = (map: CollisionMap = clearance.map, blockerId?: string) => {
    const state = usePlaybackStore.getState();
    if (autoStopRequested.current) {runtime.speed = 0; autoStopRequested.current = false; setAutoStopping(false); if (state.status === 'playing') {state.toggle();} return;}
    if (state.recover) {state.recover(map, blockerId);}
    else {state.fail('Walking stopped safely. Please plan a new route to continue.');}
  };
  useLayoutEffect(() => {
    if (body.current) {
      rig.bind(body.current);
    }
    // Route planning already smooths and validates auto paths with the 0.4 m
    // navigation disk. Playback must preserve that approved geometry verbatim.
    invalidate();
  }, [rig, invalidate]);
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
    if (result.accepted === false && queued?.kind === 'connector') {
      setFreeConnector(false);
      connectorPlans.get(freeLegIndex.current ?? runtime.leg)?.stop();
      usePlaybackStore.getState().fail('Physical passenger movement left the validated connector corridor.');
    }
    const travelled = Math.hypot(dx, dy, dz);
    runtime.position = [runtime.position[0] + dx, runtime.position[1] + dy, runtime.position[2] + dz];
    if (queued?.kind !== 'connector') {runtime.gaitDistance += Math.hypot(dx, dz);}
    if (queued?.kind === 'route') {
      if (usePlaybackStore.getState().status !== 'playing') {
        // WASD can pause playback after Rapier accepted an auto command but before
        // this completion callback. Keep the physical pose without advancing the route.
        runtime.speed = 0;
        runtime.arrived = false;
        runtime.phase = 'Ready';
        usePlaybackStore.getState().publish(runtime);
        invalidate();
        return;
      }
      const { intent, from } = queued;
      const displacementError = Math.hypot(
        dx - intent.displacement[0],
        dy - intent.displacement[1],
        dz - intent.displacement[2],
      );
      if (result.accepted === false || displacementError > 0.025) {
        recoverRoute();
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
        runtime.arrived = intent.arrived && runtime.leg === runtime.path.legs.length - 1;
        if (intent.arrived && !runtime.arrived) {runtime.leg++; runtime.s = 0; runtime.speed = 0; runtime.elapsed = 0; runtime.seekVersion++;}
        if (intent.stopped) {
          autoStopRequested.current = false;
          setAutoStopping(false);
          usePlaybackStore.getState().toggle();
        }
      }
    } else if (queued?.kind === 'connector') {
      const error = Math.hypot(
        dx - queued.displacement[0],
        dy - queued.displacement[1],
        dz - queued.displacement[2],
      );
      if (error > 0.025 || result.accepted === false) {
        if (queued.next.phase !== 'approach') {clearance.rollbackElevatorPose(queued.connectorId);}
        setFreeConnector(false);
        // The capsule controller has already committed the Rapier-resolved displacement.
        // Keep the follower origin at that accepted pose while stopping the route.
        connectorPlans.get(freeLegIndex.current ?? runtime.leg)?.stop();
        usePlaybackStore.getState().fail(`Connector traversal stopped because capsule physics rejected the validated movement: requested ${queued.displacement.map(v => v.toFixed(4)).join(',')} m; resolved ${result.displacement.map(v => v.toFixed(4)).join(',')} m; accepted=${result.accepted}.`);
      } else {
        if (queued.next.phase === 'complete' && freeConnector.current) {
          const releaseManualTakeover = queuedManualTakeover.current;
          setFreeConnector(false);
          freeLegIndex.current = null;
          queuedManualTakeover.current = false;
          if (releaseManualTakeover) {
            usePlaybackStore.getState().takeManualControl();
          }
        }
        commitFollowerFrame(runtime, queued.next);
        runtime.position = [queued.from[0] + dx, queued.from[1] + dy, queued.from[2] + dz];
        connectorPlans.get(freeLegIndex.current ?? runtime.leg)?.acceptResolvedFeet(runtime.position);
        runtime.distance = queued.next.distance;
        runtime.progress = queued.next.progress;
        runtime.ribbon.progress = queued.next.ribbon.progress;
      }
    } else if (queued?.kind === 'manual') {
      const planned = Math.hypot(...queued.displacement);
      if (result.accepted === false || Math.abs(planned - travelled) > 0.025) {
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
  const manualPhysicsStep = (dt: number) => {
      const held = runtime.connector || interactionState.status === 'confirmation-required' || interactionState.status === 'committing' ? { forward: 0, strafe: 0, sprint: false } : input.current;
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) {forward.set(-Math.sin(runtime.yaw), 0, -Math.cos(runtime.yaw));}
      forward.normalize();
      right.set(-forward.z, 0, forward.x);
      const moveX = forward.x * held.forward + right.x * held.strafe;
      const moveZ = forward.z * held.forward + right.z * held.strafe;
      const moveLength = Math.hypot(moveX, moveZ);
      if (moveLength > 1e-6) {manualDirection.set(moveX / moveLength, 0, moveZ / moveLength);}
      const speedScale = usePlaybackStore.getState().speed;
      const maxSpeed = (held.sprint ? CHARACTER_CONFIG.sprintSpeedMps : CHARACTER_CONFIG.walkSpeedMps) * speedScale;
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
        const yawFrameLimit = CHARACTER_CONFIG.maxYawDeltaDegPerFrame * Math.PI / 180;
        yaw += MathUtils.clamp(yawDelta, -Math.min(Math.PI * dt, yawFrameLimit), Math.min(Math.PI * dt, yawFrameLimit));
        const from: [number, number, number] = [...runtime.position];
        const to: [number, number, number] = [from[0] + dx, from[1], from[2] + dz];
        if (clearance.validateSweep(
          [from[0], from[1] + originY, from[2]],
          [to[0], to[1] + originY, to[2]],
          CHARACTER_CONFIG,
        ).clear) {
          pending.current = true;
          pendingMove.current = { kind: 'manual', from, displacement: [dx, 0, dz], yaw, speed: velocity.current };
          return { displacement: [dx, 0, dz] as [number, number, number], movementSource: 'manual' as const, commandedSpeedMps: velocity.current, playbackRate: speedScale };
        } else {
          velocity.current = 0;
          runtime.speed = 0;
        }
      } else {
        runtime.speed = velocity.current;
      }
    return null;
  };
  const autoPhysicsStep = useCallback<PhysicsMoveStep>((physicsDeltaSeconds) => {
    const playback = usePlaybackStore.getState();
    let leg = connectorLegs[freeLegIndex.current ?? runtime.leg];
    if (playback.recovering) {
      if (autoStopRequested.current) {autoStopRequested.current = false; setAutoStopping(false); playback.toggle();}
      return null;
    }
    if (window.document.hidden) {return null;}
    if (playback.status !== 'playing' && !freeConnector.current) {return manualPhysicsStep(physicsDeltaSeconds);}
    // Consume stationary portal joins without submitting a zero-distance steering
    // transaction. No passenger pose changes; the next connector owns its entry.
    while (!freeConnector.current && leg?.kind === 'walk' && leg.length <= 1e-6) {
      if (runtime.leg === runtime.path.legs.length - 1) {
        runtime.arrived = true; runtime.speed = 0; runtime.phase = 'Arrived';
        playback.publish(runtime);
        return null;
      }
      runtime.leg++; runtime.s = 0; runtime.speed = 0; runtime.elapsed = 0; runtime.seekVersion++;
      leg = connectorLegs[runtime.leg];
    }
    if (runtime.arrived || !leg) {return null;}
    if (leg.kind !== 'walk') {
      if (autoStopRequested.current) {
        connectorPlans.get(freeLegIndex.current ?? runtime.leg)?.stop();
        setFreeConnector(false);
        autoStopRequested.current = false;
        setAutoStopping(false);
        runtime.speed = 0;
        playback.fail('Connector traversal cancelled at the last accepted capsule pose. Start a new route to retry.');
        return null;
      }
      const connector = connectorPlans.get(freeLegIndex.current ?? runtime.leg);
      // Bind the actual capsule to the authored entry before starting any cabin clock.
      const authoredEntry = leg.points[0]!;
      const entry: [number, number, number] = [authoredEntry[0], authoredEntry[1] + CONTROLLER_OFFSET_M, authoredEntry[2]];
      const entryGap = Math.hypot(...entry.map((v, i) => v - runtime.position[i]!));
      if (connector && connector.getFrame().progress === 0 && connector.getFrame().distanceM === 0 && entryGap > 0.005) {
        const from: [number, number, number] = [...runtime.position];
        const amount = Math.min(entryGap, 0.8 * physicsDeltaSeconds);
        const displacement = entry.map((v, i) => (v - from[i]!) * amount / entryGap) as [number, number, number];
        const next = cloneFollowerFrame(runtime);
        next.position = from.map((v, i) => v + displacement[i]!) as [number, number, number];
        next.speed = amount / physicsDeltaSeconds;
        next.phase = 'approach';
        next.gaitDistance += Math.hypot(displacement[0], displacement[2]);
        pendingMove.current = { kind: 'connector', connectorId: leg.connector!.id, from, displacement, next };
        pending.current = true;
        return { displacement, movementSource: 'connector', commandedSpeedMps: next.speed, playbackRate: 1 };
      }
      const frame = connector?.advance(physicsDeltaSeconds);
      if (!frame || frame.stage === 'blocked') {
        setFreeConnector(false);
        playback.fail(`Connector route is blocked: ${frame?.reason ?? 'No linked physical connector.'}`);
        return null;
      }
      if (frame.cabinY !== undefined && !clearance.setElevatorPose(frame.connectorId, frame.cabinY, frame.doorOpen ?? 0)) {
        setFreeConnector(false); connector?.stop(); playback.fail('Elevator door interlock rejected cabin movement.'); return null;
      }
      const from: [number, number, number] = [...runtime.position];
      const next = cloneFollowerFrame(runtime);
      if (frame.cabinY !== undefined && leg.connector) {
        next.connector = { portalId: leg.connector.portalId!, cabinY: frame.cabinY - leg.baseY, open: frame.doorOpen ?? 0 };
      }
      next.position = [...frame.feet];
      next.phase = frame.stage;
      next.floorId = frame.floorId;
      next.yaw = frame.yawRadians + Math.PI;
      next.s = freeConnector.current ? runtime.s : leg.length * frame.progress;
      next.distance = freeConnector.current ? runtime.distance : leg.offset + next.s;
      next.progress = runtime.path.length ? next.distance / runtime.path.length : 1;
      next.ribbon.progress = next.progress;
      // Match the support envelope of the raised cuboid floor and rounded capsule.
      // Rapier still resolves the request and both capsule sweep gates remain authoritative.
      const supportedBoarding = leg.kind === 'elevator' && (frame.stage === 'board' || frame.stage === 'exit');
      let [, targetY] = frame.feet;
      if (leg.kind === 'ramp' || leg.kind === 'escalator') {
        const radius = CHARACTER_CONFIG.radiusM;
        const skinRadius = radius + CONTROLLER_OFFSET_M;
        targetY += CONTROLLER_OFFSET_M;
        for (let index = 1; index < leg.points.length; index++) {
          const a = leg.points[index - 1]!, b = leg.points[index]!;
          const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
          if (length <= 1e-8) {continue;}
          const ux = (b[0] - a[0]) / length, uz = (b[2] - a[2]) / length;
          const slope = (b[1] - a[1]) / length;
          const along = (frame.feet[0] - a[0]) * ux + (frame.feet[2] - a[2]) * uz;
          const support = MathUtils.clamp(along + skinRadius * slope / Math.sqrt(1 + slope ** 2), 0, length);
          const distance = Math.hypot(frame.feet[0] - a[0] - ux * support, frame.feet[2] - a[2] - uz * support);
          if (distance <= skinRadius) {
            targetY = Math.max(targetY, a[1] + slope * support + Math.sqrt(Math.max(0, skinRadius ** 2 - distance ** 2)) - radius);
          }
        }
      }
      if (leg.kind === 'stairs') {
        // The rounded capsule rides tread edges before its centre reaches them.
        // Request that support envelope in either direction, not the visual slope
        // that cuts into the discrete treads. Rapier resolves the same capsule.
        const point: [number, number] = [frame.feet[0], frame.feet[2]];
        const radius = CHARACTER_CONFIG.radiusM;
        const skinRadius = radius + CONTROLLER_OFFSET_M;
        const record = connectorRecords.find((item) => item.id === frame.connectorId);
        targetY = Math.min(...leg.points.map((sample) => sample[1])) + CONTROLLER_OFFSET_M;
        for (const surface of [...leg.treads, ...(record?.path?.landings ?? [])]) {
          const edgeDistance = pointInPolygon(point, surface.polygon) ? 0 : Math.min(...polygonEdges(surface.polygon).map(([a, b]) => segmentDistance(point, a, b)));
          if (edgeDistance <= skinRadius) {
            targetY = Math.max(targetY, surface.y + Math.sqrt(Math.max(0, skinRadius ** 2 - edgeDistance ** 2)) - radius);
          }
        }
        // Outside the authored surface the portal approach is ordinary floor.
        targetY = Math.max(targetY, frame.feet[1] + CONTROLLER_OFFSET_M);
      }
      if (supportedBoarding && leg.connector && frame.cabinY !== undefined) {
        const object = leg.connector;
        const dx = frame.feet[0] - object.position[0], dz = frame.feet[2] - object.position[1];
        const localX = Math.cos(object.yawRadians) * dx - Math.sin(object.yawRadians) * dz;
        const localZ = Math.sin(object.yawRadians) * dx + Math.cos(object.yawRadians) * dz;
        // Same half-extents and floor top as ElevatorPhysics's cabin floor.
        const outside = Math.hypot(Math.max(0, Math.abs(localX) - (object.dimensions[0] - 0.35) / 2), Math.max(0, Math.abs(localZ) - (object.dimensions[2] - 0.35) / 2));
        const radius = CHARACTER_CONFIG.radiusM;
        const skinRadius = radius + CONTROLLER_OFFSET_M;
        const landingY = (frame.stage === 'board' ? leg.points[0]![1] : leg.points.at(-1)![1]);
        targetY = Math.max(landingY + CONTROLLER_OFFSET_M, frame.cabinY + 0.06 + Math.sqrt(Math.max(0, skinRadius ** 2 - outside ** 2)) - radius);
      }
      const displacement: [number, number, number] = [frame.feet[0] - from[0], targetY - from[1], frame.feet[2] - from[2]];
      next.speed = frame.walking ? Math.hypot(...displacement) / physicsDeltaSeconds : 0;
      if (frame.walking) {next.gaitDistance += Math.hypot(displacement[0], displacement[2]);}
      if (frame.stage === 'complete' && freeConnector.current) {
        next.connector = null;
        next.arrived = false;
        next.speed = 0;
      } else if (frame.stage === 'complete') {
        setFreeConnector(false);
        next.connector = null;
        if (runtime.leg === runtime.path.legs.length - 1) {next.arrived = true; next.speed = 0;}
        else {next.leg++; next.s = 0; next.elapsed = 0; next.seekVersion++;}
      }
      pendingMove.current = { kind: 'connector', connectorId: frame.connectorId, from, displacement, next };
      pending.current = true;
      return { displacement, movementSource: 'connector', commandedSpeedMps: next.speed, playbackRate: 1, elevatorPassenger: frame.stage === 'ride' };
    }
    const previousScale = autoTimeScale.current;
    if (previousScale?.generation === session.generation && previousScale.scale !== playback.speed) {
      // Keep physical velocity continuous when playback rate changes, then let the
      // route controller approach the new speed under its real-time acceleration cap.
      runtime.speed *= previousScale.scale / playback.speed;
    } else if (previousScale?.generation !== session.generation) {
      // A paused manual interval stores physical speed, while the auto controller
      // stores playback-time speed. Normalize on each fresh auto segment.
      runtime.speed /= playback.speed;
    }
    autoTimeScale.current = { generation: session.generation, scale: playback.speed };
    const from: [number, number, number] = [...runtime.position];
    const intent = steerRoute({
      leg,
      state: { distanceM: runtime.s, speedMps: runtime.speed, yawRadians: runtime.yaw },
      dtSeconds: physicsDeltaSeconds,
      timeScale: playback.speed,
      stop: autoStopRequested.current,
      speedLimitMps: CHARACTER_CONFIG.walkSpeedMps,
      validateDisplacement: (position, displacement) => clearance.validateSweep(
        [position[0], position[1] + originY, position[2]],
        [position[0] + displacement[0], position[1] + displacement[1] + originY, position[2] + displacement[2]],
        CHARACTER_CONFIG,
      ).clear,
    });
    if (intent.blocked) {
      recoverRoute();
      return null;
    }
    const yawError = Math.atan2(
      Math.sin(intent.targetYawRadians - runtime.yaw),
      Math.cos(intent.targetYawRadians - runtime.yaw),
    );
    const yawFrameRemaining = Math.max(
      0,
      CHARACTER_CONFIG.maxYawDeltaDegPerFrame * Math.PI / 180 - yawFrameAccumulated.current,
    );
    const yawStepLimit = Math.min(
      CHARACTER_CONFIG.maxYawRateDegPerSec * Math.PI / 180 * physicsDeltaSeconds,
      yawFrameRemaining,
    );
    const yawStep = MathUtils.clamp(yawError, -yawStepLimit, yawStepLimit);
    intent.targetYawRadians = runtime.yaw + yawStep;
    yawFrameAccumulated.current += Math.abs(yawStep);
    if (intent.displacement.every((value) => Math.abs(value) <= 1e-7)) {
      runtime.speed = intent.speedMps;
      runtime.yaw = intent.targetYawRadians;
      runtime.look = [...intent.gazeTarget];
      runtime.arrived = intent.arrived && runtime.leg === runtime.path.legs.length - 1;
        if (intent.arrived && !runtime.arrived) {runtime.leg++; runtime.s = 0; runtime.speed = 0; runtime.elapsed = 0; runtime.seekVersion++;}
      if (intent.stopped) {
        autoStopRequested.current = false;
        setAutoStopping(false);
        usePlaybackStore.getState().toggle();
      }
      if (intent.arrived) {playback.publish(runtime);}
      return {
        displacement: [0, 0, 0],
        movementSource: 'auto-walk',
        commandedSpeedMps: intent.speedMps * playback.speed,
        playbackRate: playback.speed,
      };
    }
    pendingMove.current = { kind: 'route', intent, from };
    pending.current = true;
    return {
      displacement: intent.displacement,
      movementSource: 'auto-walk',
      commandedSpeedMps: intent.speedMps * playback.speed,
      playbackRate: playback.speed,
    };
  }, [runtime, session.generation, clearance, originY, connectorPlans, connectorLegs, connectorRecords, interactionState, camera]);
  useFrame((_, rawDelta) => {
    yawFrameAccumulated.current = 0;
    capsule.current?.requestPhysicsStep(autoPhysicsStep);
    const state = usePlaybackStore.getState();
    const dt = window.document.hidden ? 0 : Math.min(rawDelta, 0.1);
    if (freeConnector.current) {invalidate();}
    if (pending.current) {
      invalidate();
      return;
    }
    if ((state.status === 'playing' || freeConnector.current) && !runtime.arrived) {
      const leg = runtime.path.legs[runtime.leg];
      if (!leg) {
        state.fail('The route has no remaining walk leg.');
      }

    } else if (state.status !== 'playing' && !freeConnector.current) {
      autoTimeScale.current = null;
      // The authored elevator cabin path owns passenger movement; paused auto-walk cannot steer out into the shaft.
      const held = runtime.connector || interactionState.status === 'confirmation-required' || interactionState.status === 'committing' ? { forward: 0, strafe: 0, sprint: false } : input.current;
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) {forward.set(-Math.sin(runtime.yaw), 0, -Math.cos(runtime.yaw));}
      forward.normalize();
      right.set(-forward.z, 0, forward.x);
      const moveX = forward.x * held.forward + right.x * held.strafe;
      const moveZ = forward.z * held.forward + right.z * held.strafe;
      const moveLength = Math.hypot(moveX, moveZ);
      if (moveLength > 1e-6) {manualDirection.set(moveX / moveLength, 0, moveZ / moveLength);}
      // In free mode, walking into a route-linked landing engages the same
      // physical connector session. Floor/portal/role binding remains mandatory.
      const candidate = moveLength > 0.01 ? connectorLegs.findIndex((leg, index) => {
        if (leg.kind === 'walk' || leg.floorId !== runtime.floorId || !connectorPlans.has(index)) {return false;}
        const entry = leg.points[0]!;
        const toward = leg.points[1]!;
        return Math.hypot(entry[0]-runtime.position[0],entry[1]-runtime.position[1],entry[2]-runtime.position[2]) < 0.35 &&
          moveX*(toward[0]-entry[0]) + moveZ*(toward[2]-entry[2]) > 0;
      }) : -1;
      if (held.forward || held.strafe || velocity.current > 0.001) {invalidate();}
      if (candidate >= 0) {
        connectorPlans.get(candidate)?.restart();
        freeLegIndex.current = candidate; runtime.arrived = false; setFreeConnector(true);
        velocity.current = 0; invalidate(); return;
      }
    } else if (runtime.arrived && runtime.arrivalTime < 1.1) {
      runtime.arrivalTime += dt;
      invalidate();
    }
    if (root.current) {
      const renderYawDelta = Math.atan2(
        Math.sin(runtime.yaw - lastRenderedYaw.current),
        Math.cos(runtime.yaw - lastRenderedYaw.current),
      );
      const renderYawLimit = CHARACTER_CONFIG.maxYawDeltaDegPerFrame * Math.PI / 180;
      runtime.yaw = lastRenderedYaw.current + MathUtils.clamp(renderYawDelta, -renderYawLimit, renderYawLimit);
      root.current.rotation.y = runtime.yaw;
      lastRenderedYaw.current = runtime.yaw;
    }
    // Demand mode only needs another frame while the nearby target's dwell is advancing.
    // Once info is published, stationary focus does not require a permanent render loop.
    if (interactionRuntime.state.status === 'nearby') {invalidate();}

    lastSnapshot.current += dt;
    if (lastSnapshot.current >= 0.1 || (runtime.arrived && state.status === 'playing')) {
      lastSnapshot.current = 0;
      state.publish(runtime);
    }
  }, -3);
  // Run IK after Rapier has applied its rendered/interpolated body transform.
  useFrame((_, dt) => {
    for (const [id, target] of pendingDoorClose.current) {
      const object = document.floors.flatMap((f) => f.objects).find((o) => o.id === id);
      const radius = object ? Math.hypot(object.dimensions[0] * object.scale[0], object.dimensions[2] * object.scale[2]) / 2 + CHARACTER_CONFIG.radiusM + 0.1 : Infinity;
      if (Math.hypot(runtime.position[0] - target.position[0], runtime.position[2] - target.position[2]) > radius) {
        pendingDoorClose.current.delete(id); proximityDoors.delete(id); setCollisionDoorOpen(id, false);
      }
    }
    interactionRuntime.update({ position: [runtime.position[0], runtime.position[1] + originY, runtime.position[2]], yawRadians: runtime.yaw }, window.document.hidden ? 0 : Math.min(dt, 0.1));
    if (interactionRuntime.state.status === 'nearby') {invalidate();}
    if (body.current && usePlaybackStore.getState().mode !== 'first') {
      rig.update(runtime, originY);
      if (import.meta.env.DEV) {
        // Observe rendered shoe geometry and independent physical support, never gait phase.
        body.current.updateWorldMatrix(true, true);
        const feet = [-1, 1].map((side) => {
          const ankle = body.current?.getObjectByName(`WalkAnkle${side}`);
          if (!ankle) {return { side, contact: null };}
          soleBounds.setFromObject(ankle);
          const x = (soleBounds.min.x + soleBounds.max.x) / 2;
          const z = (soleBounds.min.z + soleBounds.max.z) / 2;
          const hit = world.castRay(new rapier.Ray({ x, y: soleBounds.min.y + 0.2, z }, { x: 0, y: -1, z: 0 }), 0.5, true, undefined, undefined, undefined, undefined, (collider) => collider.handle !== capsule.current?.getColliderHandle());
          const supportY = hit ? soleBounds.min.y + 0.2 - hit.timeOfImpact : null;
          const gapM = supportY === null ? null : soleBounds.min.y - supportY;
          return { side, sole: [x, soleBounds.min.y, z], supportY, gapM, contact: gapM === null ? null : Math.abs(gapM) <= 0.02 };
        });
        window.dispatchEvent(new CustomEvent('walk-render-contact', { detail: { wallTimeMs: performance.now(), physicsTimeSeconds: capsule.current?.getLastMove().physicsTimeSeconds ?? null, feet } }));
      }
    }
  }, -0.1);
  // Upper floors render landing proxies. Retain the lower shaft during its traversal.
  const leg = connectorLegs.find(
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
          const result = queued?.kind === 'connector'
            ? clearance.validateConnectorSweep(queued.connectorId, from, to, CHARACTER_CONFIG)
            : clearance.validateSweep(from, to, CHARACTER_CONFIG);
          if (!result.clear) {window.dispatchEvent(new CustomEvent('walk-physics-blocker', {detail: {stage: 'clearance', from, to, result, blocker: [...clearance.map.obstacles, ...clearance.map.blockedAreas].find(item => item.id === result.blockerId)}}));}
          return result.clear;
        }}
        onResolvedMove={onResolvedMove}
      >
        <group ref={root} name="WalkthroughAvatar" raycast={() => {}}>
          <group ref={body} visible={mode !== 'first'}>
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
      <WalkOverlay>
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-[min(90vw,42rem)] flex-wrap justify-end gap-2">
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
        </div>
      </WalkOverlay>
      <CameraRig avatarRoot={root} runtime={runtime} document={document} floorId={floorId} originY={originY} />
    </>
  );
}
export function WalkthroughLayer(props: {
  document: PlanDocument;
  floorId: string;
  onFloor: (id: string) => boolean | void;
  originY?: number;
  role?: Role;
  roleAreas?: readonly RoleAreaPolicy[];
  runtimePolicy?: RouteNavigationPolicySource;
  localActionInputs?: Pick<LocalActionOptions, 'items' | 'destinations'>;
  navigationZones?: readonly WalkableZone[];
}) {
  const session = usePlaybackStore((state) => state.session);
  const needsZonePin = !!session && session.navigationZones === undefined && props.navigationZones !== undefined;
  useLayoutEffect(() => {
    if (session && needsZonePin && props.navigationZones) {
      usePlaybackStore.getState().pinNavigationZones(session.generation, props.navigationZones);
    }
  }, [session, needsZonePin, props.navigationZones]);
  const navigationZones = session?.navigationZones;
  const sessionDocument = session?.document;
  const connectorRecords = useMemo(
    () => !sessionDocument ? [] : [...(session?.runtime.path.legs ?? []), ...authoredConnectorLegs(sessionDocument)].flatMap((leg) => {
      const record = connectorRecordForLeg(leg, sessionDocument);
      return record ? [record] : [];
    }).filter((record, index, records) => records.findIndex((other) => other.id === record.id) === index),
    [session?.runtime.path, sessionDocument],
  );
  const floor = sessionDocument?.floors.find((item) => item.source.id === props.floorId);
  const originY = props.originY ?? 0;
  const policy = props.runtimePolicy;
  const policyResolved = policy ? policy.status === 'resolved' : props.roleAreas !== undefined;
  const runtimeAreas = useMemo<readonly RoleAreaPolicy[]>(() => {
    if (!floor) {return [];}
    if (!policyResolved) {return [{ id: 'policy-unavailable', polygon: floor.boundary, allowedRoles: [] }];}
    if (!policy) {return props.roleAreas ?? [];}
    if (!sessionDocument) {return [];}
    const zones = navigationZones ?? sessionDocument.floors.flatMap((f) => f.zones.filter((z) => z.type === 'walkable').map((z) => ({
      id: z.id, floorId: f.source.id, name: z.label || 'Walkable zone', type: 'general' as const,
      polygon: z.polygon as [number, number][], holes: [], revision: 0,
    })));
    const resolved = createRoleNavigationZones(sessionDocument, [...zones], 'visitor', policy);
    if (resolved.error) {return [{ id: 'invalid-policy', polygon: floor.boundary, allowedRoles: [] }];}
    return [
      ...(props.roleAreas ?? []),
      ...resolved.zones.filter((z) => z.type === 'restricted').map((z) => ({ id: z.id, floorId: z.floorId, polygon: z.polygon, allowedRoles: ['staff'] as const })),

    ];
  }, [floor, policy, policyResolved, props.roleAreas, sessionDocument, navigationZones]);

  const collisionFloor = useMemo(
    () => floor && originY !== 0
      ? { ...floor, source: { ...floor.source, heightOffset: floor.source.heightOffset + originY } }
      : floor,
    [floor, originY],
  );
  if (!session) {
    return null;
  }
  if (needsZonePin) {return null;}
  if (!floor || !collisionFloor) {return null;}
  const runtime = (
    <Physics timeStep={1 / 60} updateLoop="follow" updatePriority={-1}>
      <CollisionWorld
        floor={collisionFloor}
        role={props.role ?? 'visitor'}
        roleAreas={runtimeAreas}
        connectors={connectorRecords}
        connectorFloors={session.document.floors}
        walkableZones={navigationZones}
        originY={originY}
      >
        <SpawnValidatedRuntime
          key={session.generation}
          document={session.document}
          floorId={props.floorId}
          onFloor={props.onFloor}
          originY={originY}
          role={props.role ?? 'visitor'}
          session={session}
          policyStatus={policyResolved && !runtimeAreas.some((area) => area.id === 'invalid-policy') ? 'resolved' : 'unavailable'}
          staffDoorIds={policy?.staffOnlyDoorObjectIds}
          localActionInputs={props.localActionInputs}
        />
      </CollisionWorld>
    </Physics>
  );
  return (
    <>
      <ResumeController document={props.document} zones={navigationZones} nextZones={props.navigationZones} />
      {import.meta.env.DEV ? (
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
      )}
    </>
  );
}
