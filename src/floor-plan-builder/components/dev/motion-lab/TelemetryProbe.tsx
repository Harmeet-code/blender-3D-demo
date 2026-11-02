import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import { Vector3, type Object3D } from 'three';
import type { PlanDocument } from '../../../model/types.ts';
import { buildCollisionMap, CAPSULE_CLEARANCE_EPSILON_M, validateCapsuleEndpoint, validateCapsuleSweep, type CollisionMap, type RoleAreaPolicy } from '../../../wayfinding/walkthrough/collision/capsule-clearance.ts';
import { CHARACTER_CONFIG } from '../../../wayfinding/walkthrough/character-config.ts';
import { sampleFootPlants, sampleGait, createFootPlantState } from '../../../wayfinding/walkthrough/rendering/gait.ts';
import { telemetryFrameSchema, type Role, type TelemetryFrame } from '../../../wayfinding/walkthrough/contracts.ts';
import { usePlaybackStore } from '../../../wayfinding/store/playback-store.ts';
import type { Vec3 } from '../../../wayfinding/walkthrough/path.ts';
import { getCollisionOpenDoorIds, subscribeCollisionDoorState } from '../../../wayfinding/game/door-state.ts';
import { pointInPolygon } from '@/utils/geometry/polygon.ts';
import { subscribeResolvedCapsuleMotion } from '../../../wayfinding/walkthrough/foundation/kinematic-capsule.tsx';

const MOTION_LAB_DT = 1 / 30;

export type MotionLabLiveMetrics = {
  stanceP99Mps: number | null;
  stanceSamples: number;
  autoAccelerationMaxMps2: number | null;
  autoAccelerationSamples: number;
  manualAccelerationMaxMps2: number | null;
  manualAccelerationSamples: number;
  clearanceMarginM: number | null;
  clearanceSamples: number;
  windowSeconds: number;
  currentMode: MotionLabTelemetry['movementMode'];
  currentAccelerationMps2: number | null;
};

const emptyLiveMetrics: MotionLabLiveMetrics = {
  stanceP99Mps: null,
  stanceSamples: 0,
  autoAccelerationMaxMps2: null,
  autoAccelerationSamples: 0,
  manualAccelerationMaxMps2: null,
  manualAccelerationSamples: 0,
  clearanceMarginM: null,
  clearanceSamples: 0,
  windowSeconds: 0,
  currentMode: 'paused',
  currentAccelerationMps2: null,
};
let liveMetricsSnapshot = emptyLiveMetrics;
const liveMetricsListeners = new Set<() => void>();
const subscribeLiveMetrics = (listener: () => void) => {
  liveMetricsListeners.add(listener);
  return () => { liveMetricsListeners.delete(listener); };
};
const getLiveMetricsSnapshot = () => liveMetricsSnapshot;
function publishLiveMetrics(next: MotionLabLiveMetrics) {
  const previous = liveMetricsSnapshot;
  if (Object.keys(next).every((key) => next[key as keyof MotionLabLiveMetrics] === previous[key as keyof MotionLabLiveMetrics])) {
    return;
  }
  liveMetricsSnapshot = next;
  liveMetricsListeners.forEach((listener) => listener());
}

/** DOM overlay kept outside Canvas; telemetry probes publish snapshots from the R3F frame loop. */
export function MotionLabTelemetryPanel({ active }: { active: boolean }) {
  const liveMetrics = useSyncExternalStore(subscribeLiveMetrics, getLiveMetricsSnapshot, getLiveMetricsSnapshot);
  const stanceP99 = liveMetrics.stanceP99Mps;
  const stanceStatus = stanceP99 === null ? 'UNMEASURED' : stanceP99 < 0.05 ? 'PASS' : 'FAIL';
  const autoAccelerationStatus = liveMetrics.autoAccelerationMaxMps2 === null ? 'UNMEASURED' : liveMetrics.autoAccelerationMaxMps2 <= 2 ? 'PASS' : 'FAIL';
  const clearanceStatus = liveMetrics.clearanceMarginM === null ? 'UNMEASURED' : liveMetrics.clearanceMarginM >= 0 ? 'PASS' : 'FAIL';
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[min(92vw,38rem)] rounded-md bg-slate-950/90 px-3 py-2 font-mono text-xs text-cyan-100 shadow" aria-live="polite">
      <div>
        Rendered stance-foot speed P99: {active && stanceP99 !== null
          ? `${stanceP99.toFixed(4)} m/s · n=${liveMetrics.stanceSamples} · window=${liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s · < 0.05 m/s · ${stanceStatus}`
          : `UNMEASURED · n=${active ? liveMetrics.stanceSamples : 0} · window=${liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s`}
      </div>
      <div>
        Resolved-root acceleration (physics-step samples): {active && liveMetrics.autoAccelerationMaxMps2 !== null
          ? `auto max ${liveMetrics.autoAccelerationMaxMps2.toFixed(3)} m/s² · n=${liveMetrics.autoAccelerationSamples} · window=${liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s · ≤ 2.000 m/s² · ${autoAccelerationStatus}`
          : `auto max UNMEASURED · n=${liveMetrics.autoAccelerationSamples} · window=${liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s · ≤ 2.000 m/s² · ${autoAccelerationStatus}`}
      </div>
      <div>Manual max acceleration: {liveMetrics.manualAccelerationMaxMps2 === null ? 'UNMEASURED' : `${liveMetrics.manualAccelerationMaxMps2.toFixed(3)} m/s²`} · n={liveMetrics.manualAccelerationSamples} · window {liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s</div>
      <div>
        Sampled capsule-surface margin (centerline-to-edge minus 0.2999 m): {active && liveMetrics.clearanceMarginM !== null
          ? `${liveMetrics.clearanceMarginM.toFixed(4)} m · n=${liveMetrics.clearanceSamples} · window=${liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s · ≥ 0 m · ${clearanceStatus}`
          : `UNMEASURED · n=${liveMetrics.clearanceSamples} · window=${liveMetrics.windowSeconds.toFixed(1)} s / 5.0 s · ≥ 0 m · ${clearanceStatus}`}
      </div>
      <div>Current resolved-root acceleration: mode={liveMetrics.currentMode} · {liveMetrics.currentAccelerationMps2 === null ? 'UNMEASURED' : `${liveMetrics.currentAccelerationMps2.toFixed(3)} m/s²`} · gaze lead: UNMEASURED</div>
      <div className="mt-1 opacity-75">Auto/manual acceleration uses resolved capsule positions sampled after fixed Rapier steps; the current acceleration line remains a render-sampled observation. Shoe-bottom positions come from visible rendered avatar geometry; stance is a gait-phase estimate, not Rapier foot contact. Stance speed uses intervals with both endpoints in stance. Capsule margin derives from centerline-to-edge samples at 0.05 m spacing; it is a collision-map estimate, not direct physical contact or a guarantee over unsampled positions. Values use the trailing 5-second window.</div>
    </div>
  );
}

export type MotionLabTelemetry = {
  frame: TelemetryFrame;
  accelerationMps2: Vec3;
  jerkMps3: Vec3;
  movementMode?: 'manual' | 'auto-walk' | 'paused';
  accelerationSampleValid?: boolean;
  gazeDirection: Vec3;
  /** Configured gaze target does not provide observed look-ahead time. */
  gazeLeadSeconds?: null;
  feet: {
    left: Vec3;
    right: Vec3;
    stance: [boolean, boolean];
    renderedLeft?: Vec3 | null;
    renderedRight?: Vec3 | null;
    renderedStanceGroundSpeedMps?: number | null;
    renderedSpeedBasis?: 'rendered-shoe-bottom' | 'avatar-hidden-or-unavailable' | 'no-stance-sample' | 'connector-foot-data-unavailable';
    basis: 'shared-gait-phase-estimate' | 'idle-foot-origin' | 'connector-foot-data-unavailable';
  };
  clearance: { clear: boolean | null; blockerId?: string; source?: string; reason?: string; numericMarginM: number | null };
  floorInteraction: { floorId: string; elevationM: number; changedFromFloorId?: string; connectorId?: string; connectorPhase: string | null };
  contactBasis: 'gait-phase-estimate-not-physics-contact';
  playbackGeneration?: number;
  derivativeResetReason?: 'playback-generation' | 'floor-transition' | 'invalid-delta' | null;
};

export type RecordedInput = { tick: number; forward: -1 | 0 | 1; strafe: -1 | 0 | 1; sprint: boolean };
export type MotionLabInputState = { forward: -1 | 0 | 1; strafe: -1 | 0 | 1; sprint: boolean };

function inputCodes(sample: MotionLabInputState) {
  return new Set([
    ...(sample.forward > 0 ? ['KeyW'] : []),
    ...(sample.forward < 0 ? ['KeyS'] : []),
    ...(sample.strafe > 0 ? ['KeyD'] : []),
    ...(sample.strafe < 0 ? ['KeyA'] : []),
    ...(sample.sprint ? ['ShiftLeft'] : []),
  ]);
}

function dispatchCode(type: 'keydown' | 'keyup', code: string) {
  const key = code === 'ShiftLeft' ? 'Shift' : code.slice(-1).toLowerCase();
  window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
}

function pointSegmentDistance(point: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}

function polygonEdgeDistance(point: readonly [number, number], polygon: readonly (readonly [number, number])[]) {
  let minimum = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    minimum = Math.min(minimum, pointSegmentDistance(point, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  }
  return minimum;
}

/** Geometric center-to-edge distance from the live document collision snapshot. */
function centerClearanceM(map: CollisionMap, role: Role, feet: Vec3): number | null {
  if (map.unsupported.length || map.boundary.length < 3 || !feet.every(Number.isFinite)) {return null;}
  const point: [number, number] = [feet[0], feet[2]];
  if (!pointInPolygon(point, map.boundary)) {return null;}
  let minimum = polygonEdgeDistance(point, map.boundary);
  const [, lowY] = feet;
  const highY = lowY + CHARACTER_CONFIG.heightM;
  for (const item of [...map.obstacles, ...map.blockedAreas]) {
    if (item.maxY <= lowY || item.minY >= highY) {continue;}
    minimum = Math.min(minimum, pointInPolygon(point, item.polygon) ? 0 : polygonEdgeDistance(point, item.polygon));
  }
  for (const area of map.roleAreas) {
    if (!area.allowedRoles || area.allowedRoles.includes(role)) {continue;}
    minimum = Math.min(minimum, pointInPolygon(point, area.polygon) ? 0 : polygonEdgeDistance(point, area.polygon));
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function sweepCenterClearanceM(map: CollisionMap, role: Role, from: Vec3, to: Vec3): number | null {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const sampleCount = Math.max(1, Math.ceil(distance / 0.05));
  let minimum = Infinity;
  for (let index = 0; index <= sampleCount; index++) {
    const t = index / sampleCount;
    const sample: Vec3 = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
    const value = centerClearanceM(map, role, sample);
    if (value === null) {return null;}
    minimum = Math.min(minimum, value);
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function worldVisibleTo(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) {return false;}
    if (current === root) {return true;}
    current = current.parent;
  }
  return false;
}

function renderedShoeBottom(root: Object3D, side: -1 | 1): Vec3 | null {
  const ankle = root.getObjectByName(`WalkAnkle${side}`);
  if (!ankle || !worldVisibleTo(ankle, root)) {return null;}
  ankle.updateWorldMatrix(true, false);
  const point = new Vector3(0, -0.03, -0.04).applyMatrix4(ankle.matrixWorld);
  return [point.x, point.y, point.z];
}

function percentile99(values: readonly number[]): number | null {
  if (values.length === 0) {return null;}
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.99) - 1] ?? null;
}

/** Records and replays fixed 30 Hz held-input samples into the shared manual-input hook. */
export function MotionLabInputProbe({
  captureMode,
  heldInput,
  tape,
  replayEpoch,
  onSampleCount,
  onReplayComplete,
}: {
  captureMode: MutableRefObject<'idle' | 'record' | 'replay'>;
  heldInput: MutableRefObject<MotionLabInputState>;
  tape: MutableRefObject<RecordedInput[]>;
  replayEpoch: MutableRefObject<number>;
  onSampleCount: (count: number) => void;
  onReplayComplete: () => void;
}) {
  const accumulator = useRef(0);
  const replayIndex = useRef(0);
  const lastEpoch = useRef(replayEpoch.current);
  const replayHeld = useRef(new Set<string>());
  const publishElapsed = useRef(0);
  const releaseReplayKeys = () => {
    for (const code of replayHeld.current) { dispatchCode('keyup', code); }
    replayHeld.current.clear();
  };
  useEffect(() => {
    const clear = () => {
      accumulator.current = 0;
      releaseReplayKeys();
    };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      releaseReplayKeys();
      captureMode.current = 'idle';
    };
  }, []);
  useFrame((_, delta) => {
    if (lastEpoch.current !== replayEpoch.current) {
      lastEpoch.current = replayEpoch.current;
      replayIndex.current = 0;
      accumulator.current = 0;
      releaseReplayKeys();
    }
    accumulator.current += Math.min(Math.max(delta, 0), 0.25);
    let steps = 0;
    while (accumulator.current >= MOTION_LAB_DT && steps < 8) {
      if (captureMode.current === 'record') {
        tape.current.push({ tick: tape.current.length, ...heldInput.current });
      } else if (captureMode.current === 'replay') {
        const sample = tape.current[replayIndex.current++];
        if (!sample) {
          releaseReplayKeys();
          captureMode.current = 'idle';
          onReplayComplete();
        } else {
          const wanted = inputCodes(sample);
          for (const code of replayHeld.current) { if (!wanted.has(code)) { dispatchCode('keyup', code); } }
          for (const code of wanted) { if (!replayHeld.current.has(code)) { dispatchCode('keydown', code); } }
          replayHeld.current = wanted;
        }
      }
      accumulator.current -= MOTION_LAB_DT;
      steps++;
    }
    publishElapsed.current += delta;
    if (publishElapsed.current >= 0.2) {
      publishElapsed.current = 0;
      onSampleCount(tape.current.length);
    }
  });
  return null;
}

export function MotionLabTelemetryProbe({
  document,
  role,
  roleAreas = [],
  frames,
  onFrame,
}: {
  document: PlanDocument;
  role: Role;
  roleAreas?: readonly RoleAreaPolicy[];
  frames: MutableRefObject<MotionLabTelemetry[]>;
  onFrame: (frame: MotionLabTelemetry) => void;
}) {
  const scene = useThree((state) => state.scene);
  const activeSession = usePlaybackStore((state) => state.session);
  const collisionOpenDoorIds = useSyncExternalStore(
    subscribeCollisionDoorState,
    getCollisionOpenDoorIds,
    getCollisionOpenDoorIds,
  );
  const maps = useMemo(() => new Map(document.floors.map((floor) => {
    const doorStateFloor = {
      ...floor,
      objects: floor.objects.map((object) => object.recipe === 'entrance' && object.entranceGate === 'arch-sliding-doors'
        ? { ...object, entranceOpen: collisionOpenDoorIds.has(object.id) }
        : object),
    };
    return [floor.source.id, buildCollisionMap(doorStateFloor, roleAreas)] as const;
  })), [document, roleAreas, collisionOpenDoorIds]);
  const tick = useRef(0);
  const last = useRef<{ position: Vec3; floorId: string; velocity: Vec3; acceleration: Vec3; traveledMeters: number; generation: number; movementMode: MotionLabTelemetry['movementMode'] } | null>(null);
  const footPlant = useRef(createFootPlantState());
  const previousRenderedFeet = useRef<{ left: Vec3 | null; right: Vec3 | null; stance: [boolean, boolean]; floorId: string; generation: number } | null>(null);
  const manualKeys = useRef(new Set<string>());
  const metricClock = useRef(0);
  const physicsMetricClock = useRef(0);
  const previousPhysicsSample = useRef<{ generation: number; floorId: string; mode: MotionLabTelemetry['movementMode']; velocity: Vec3; accepted: boolean } | null>(null);
  const stanceSpeedSamples = useRef<{ value: number; time: number }[]>([]);
  const autoAccelerationSamples = useRef<{ value: number; time: number }[]>([]);
  const manualAccelerationSamples = useRef<{ value: number; time: number }[]>([]);
  const clearanceSamples = useRef<{ value: number; time: number }[]>([]);
  const lastPublish = useRef(0);
  useEffect(() => subscribeResolvedCapsuleMotion((sample) => {
    const session = usePlaybackStore.getState().session;
    if (!session) {
      previousPhysicsSample.current = null;
      physicsMetricClock.current = 0;
      return;
    }
    const { runtime, generation } = session;
    const previous = previousPhysicsSample.current;
    physicsMetricClock.current = previous?.generation === generation
      ? physicsMetricClock.current + sample.physicsDeltaSeconds
      : sample.physicsDeltaSeconds;
    const hasManualDirection = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      .some((key) => manualKeys.current.has(key));
    const mode: MotionLabTelemetry['movementMode'] = hasManualDirection
      ? 'manual'
      : usePlaybackStore.getState().status === 'playing' ? 'auto-walk' : 'paused';
    const velocity: Vec3 = [
      sample.displacement[0] / sample.physicsDeltaSeconds,
      sample.displacement[1] / sample.physicsDeltaSeconds,
      sample.displacement[2] / sample.physicsDeltaSeconds,
    ];
    const continuous = previous !== null && previous.generation === generation && previous.floorId === runtime.floorId &&
      previous.mode === mode && previous.accepted && sample.accepted;
    if (continuous && mode === 'auto-walk') {
      const acceleration = Math.hypot(
        velocity[0] - previous.velocity[0],
        velocity[1] - previous.velocity[1],
        velocity[2] - previous.velocity[2],
      ) / sample.physicsDeltaSeconds;
      if (Number.isFinite(acceleration)) {autoAccelerationSamples.current.push({ value: acceleration, time: physicsMetricClock.current });}
    } else if (continuous && mode === 'manual') {
      const acceleration = Math.hypot(
        velocity[0] - previous.velocity[0],
        velocity[1] - previous.velocity[1],
        velocity[2] - previous.velocity[2],
      ) / sample.physicsDeltaSeconds;
      if (Number.isFinite(acceleration)) {manualAccelerationSamples.current.push({ value: acceleration, time: physicsMetricClock.current });}
    }
    previousPhysicsSample.current = {
      generation,
      floorId: runtime.floorId,
      mode,
      velocity,
      accepted: sample.accepted,
    };
  }), []);
  useEffect(() => {
    if (activeSession) {return;}
    stanceSpeedSamples.current = [];
    autoAccelerationSamples.current = [];
    manualAccelerationSamples.current = [];
    clearanceSamples.current = [];
    metricClock.current = 0;
    physicsMetricClock.current = 0;
    previousPhysicsSample.current = null;
    publishLiveMetrics(emptyLiveMetrics);
  }, [activeSession]);

  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (
      target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)
    );
    const down = (event: KeyboardEvent) => {
      if (editable(event.target)) {return;}
      if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) {manualKeys.current.add(event.code);}
    };
    const up = (event: KeyboardEvent) => {manualKeys.current.delete(event.code);};
    const clear = () => {manualKeys.current.clear();};
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      window.document.removeEventListener('visibilitychange', clear);
      clear();
    };
  }, []);

  useFrame((_, rawDelta) => {
    const { session, status, message } = usePlaybackStore.getState();
    if (!session) {
      last.current = null;
      previousRenderedFeet.current = null;
      return;
    }
    const { runtime } = session;
    const hasManualDirection = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((key) => manualKeys.current.has(key));
    const movementMode: MotionLabTelemetry['movementMode'] = status !== 'playing' ? 'paused' : hasManualDirection ? 'manual' : 'auto-walk';
    const position: Vec3 = [...runtime.position];
    const { floorId } = runtime;
    const floor = document.floors.find((item) => item.source.id === floorId);
    const leg = runtime.path.legs[runtime.leg];
    const generationChanged = last.current?.generation !== session.generation;
    if (generationChanged) {
      last.current = { position, floorId, velocity: [0, 0, 0], acceleration: [0, 0, 0], traveledMeters: 0, generation: session.generation, movementMode };
      footPlant.current = createFootPlantState();
      previousRenderedFeet.current = null;
      metricClock.current = 0;
      physicsMetricClock.current = 0;
      previousPhysicsSample.current = null;
      stanceSpeedSamples.current = [];
      autoAccelerationSamples.current = [];
      manualAccelerationSamples.current = [];
      clearanceSamples.current = [];
      tick.current = 0;
      lastPublish.current = 0;
    }
    const previous = last.current!;
    const dtSeconds = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 0;
    const sameFloor = previous.floorId === floorId;
    const floorChanged = !sameFloor;
    const resetDerivatives = generationChanged || floorChanged || dtSeconds <= 0;
    const velocity: Vec3 = !generationChanged && sameFloor && dtSeconds > 0
      ? [(position[0] - previous.position[0]) / dtSeconds, (position[1] - previous.position[1]) / dtSeconds, (position[2] - previous.position[2]) / dtSeconds]
      : [0, 0, 0];
    const displacementMeters = generationChanged ? 0 : Math.hypot(position[0] - previous.position[0], position[1] - previous.position[1], position[2] - previous.position[2]);
    const traveledMeters = previous.traveledMeters + displacementMeters;
    const acceleration: Vec3 = !resetDerivatives && dtSeconds > 0
      ? [(velocity[0] - previous.velocity[0]) / dtSeconds, (velocity[1] - previous.velocity[1]) / dtSeconds, (velocity[2] - previous.velocity[2]) / dtSeconds]
      : [0, 0, 0];
    const jerk: Vec3 = !resetDerivatives && dtSeconds > 0
      ? [(acceleration[0] - previous.acceleration[0]) / dtSeconds, (acceleration[1] - previous.acceleration[1]) / dtSeconds, (acceleration[2] - previous.acceleration[2]) / dtSeconds]
      : [0, 0, 0];
    const locomotion: TelemetryFrame['locomotion'] = status === 'paused' && message
      ? 'blocked'
      : leg && leg.kind !== 'walk'
        ? 'connector'
        : runtime.speed > CHARACTER_CONFIG.walkSpeedMps + 0.01
          ? 'run'
          : runtime.speed > 0.02
            ? 'walk'
            : 'idle';
    const parsedFrame = telemetryFrameSchema.safeParse({
      tick: tick.current++,
      dtSeconds,
      floorId,
      position,
      velocity,
      yawRadians: runtime.yaw,
      traveledMeters,
      gaitDistanceMeters: runtime.gaitDistance,
      locomotion,
      ...(leg?.connector?.id ? { connectorId: leg.connector.id } : {}),
    });
    if (!parsedFrame.success) { return; }
    const frame = parsedFrame.data;
    const gazeVector: Vec3 = [runtime.look[0] - position[0], runtime.look[1] - position[1], runtime.look[2] - position[2]];
    const gazeLength = Math.hypot(...gazeVector);
    const gazeDirection: Vec3 = gazeLength > 1e-8 ? [gazeVector[0] / gazeLength, gazeVector[1] / gazeLength, gazeVector[2] / gazeLength] : [0, 0, -1];
    const gaitLocomotion = locomotion === 'connector' ? (leg?.kind === 'stairs' || leg?.kind === 'ramp' || leg?.kind === 'escalator' ? 'walk' : 'idle') : locomotion;
    const gait = sampleGait({ gaitDistanceM: runtime.gaitDistance, locomotion: gaitLocomotion, speedMps: runtime.speed, inclineRadians: Math.atan2(runtime.tangent[1], Math.hypot(runtime.tangent[0], runtime.tangent[2])) });
    const walking = gaitLocomotion === 'walk' || gaitLocomotion === 'run';
    const simpleWalkFeet = walking && leg?.kind === 'walk';
    const feet = simpleWalkFeet
      ? sampleFootPlants(footPlant.current, { rootPosition: position, groundY: floor?.source.heightOffset ?? position[1], yawRadians: runtime.yaw, phaseRadians: gait.phaseRadians, dtSeconds })
      : ([[...position], [...position]] as [Vec3, Vec3]);
    if (!simpleWalkFeet) { footPlant.current.stance = [false, false]; }
    const avatarRoot = scene.getObjectByName('WalkthroughAvatar');
    if (avatarRoot) {avatarRoot.updateWorldMatrix(true, true);}
    const renderedLeft = avatarRoot ? renderedShoeBottom(avatarRoot, -1) : null;
    const renderedRight = avatarRoot ? renderedShoeBottom(avatarRoot, 1) : null;
    const previousFeet = previousRenderedFeet.current;
    const renderedSpeedSamples: number[] = [];
    if (simpleWalkFeet && previousFeet && previousFeet.floorId === floorId && previousFeet.generation === session.generation && dtSeconds > 0) {
      if (footPlant.current.stance[0] && previousFeet.stance[0] && renderedLeft && previousFeet.left) {
        renderedSpeedSamples.push(Math.hypot(renderedLeft[0] - previousFeet.left[0], renderedLeft[2] - previousFeet.left[2]) / dtSeconds);
      }
      if (footPlant.current.stance[1] && previousFeet.stance[1] && renderedRight && previousFeet.right) {
        renderedSpeedSamples.push(Math.hypot(renderedRight[0] - previousFeet.right[0], renderedRight[2] - previousFeet.right[2]) / dtSeconds);
      }
    }
    previousRenderedFeet.current = { left: renderedLeft, right: renderedRight, stance: [...footPlant.current.stance], floorId, generation: session.generation };
    const renderedStanceGroundSpeedMps = renderedSpeedSamples.length ? Math.max(...renderedSpeedSamples) : null;
    if (dtSeconds > 0) {metricClock.current += dtSeconds;}
    const sampleTime = metricClock.current;
    if (renderedStanceGroundSpeedMps !== null && Number.isFinite(renderedStanceGroundSpeedMps)) {
      stanceSpeedSamples.current.push({ value: renderedStanceGroundSpeedMps, time: sampleTime });
    }
    const accelerationMagnitude = Math.hypot(...acceleration);
    const accelerationSampleValid = !resetDerivatives && previous.movementMode === movementMode && Number.isFinite(accelerationMagnitude);
    const previousPosition: Vec3 = previous.position;
    const connectorTraversal = leg && leg.kind !== 'walk';
    const clearance: { clear: boolean | null; blockerId?: string; source?: string; reason?: string } = connectorTraversal
      ? { clear: null, reason: 'Connector-specific clearance is evaluated by the mounted WalkthroughLayer; floor-map clearance is unavailable here.' }
      : sameFloor && maps.has(floorId)
        ? validateCapsuleSweep(maps.get(floorId)!, role, previousPosition, position, CHARACTER_CONFIG)
        : floor && maps.has(floorId)
          ? validateCapsuleEndpoint(maps.get(floorId)!, role, position, CHARACTER_CONFIG)
          : { clear: false, reason: `Collision map for floor ${floorId} is unavailable.`, source: 'unknown-geometry' as const };
    const measuredClearanceM = connectorTraversal || !sameFloor || !maps.has(floorId)
      ? null
      : sweepCenterClearanceM(maps.get(floorId)!, role, previousPosition, position);
    const numericMarginM = measuredClearanceM === null
      ? null
      : measuredClearanceM - (CHARACTER_CONFIG.radiusM - CAPSULE_CLEARANCE_EPSILON_M);
    if (numericMarginM !== null && Number.isFinite(numericMarginM)) {clearanceSamples.current.push({ value: numericMarginM, time: sampleTime });}
    const windowStart = physicsMetricClock.current - 5;
    stanceSpeedSamples.current = stanceSpeedSamples.current.filter((sample) => sample.time >= windowStart);
    autoAccelerationSamples.current = autoAccelerationSamples.current.filter((sample) => sample.time >= windowStart);
    manualAccelerationSamples.current = manualAccelerationSamples.current.filter((sample) => sample.time >= windowStart);
    clearanceSamples.current = clearanceSamples.current.filter((sample) => sample.time >= windowStart);
    const record: MotionLabTelemetry = {
      frame,
      accelerationMps2: acceleration,
      jerkMps3: jerk,
      movementMode,
      accelerationSampleValid,
      gazeDirection,
      gazeLeadSeconds: null,
      feet: {
        left: feet[0], right: feet[1], stance: [...footPlant.current.stance],
        renderedLeft, renderedRight, renderedStanceGroundSpeedMps,
        renderedSpeedBasis: connectorTraversal
          ? 'connector-foot-data-unavailable'
          : !renderedLeft || !renderedRight
            ? 'avatar-hidden-or-unavailable'
            : renderedSpeedSamples.length === 0
              ? 'no-stance-sample'
              : 'rendered-shoe-bottom',
        basis: leg && leg.kind !== 'walk' ? 'connector-foot-data-unavailable' : walking ? 'shared-gait-phase-estimate' : 'idle-foot-origin',
      },
      clearance: { clear: clearance.clear, blockerId: clearance.blockerId, source: clearance.source, reason: clearance.reason, numericMarginM },
      floorInteraction: { floorId, elevationM: floor?.source.heightOffset ?? position[1], ...(sameFloor ? {} : { changedFromFloorId: previous.floorId }), ...(leg?.connector?.id ? { connectorId: leg.connector.id } : {}), connectorPhase: runtime.phase.includes('Elevator') || runtime.phase.includes('Stairs') || runtime.phase.includes('Ramp') || runtime.phase.includes('Escalator') ? runtime.phase : null },
      contactBasis: 'gait-phase-estimate-not-physics-contact',
      playbackGeneration: session.generation,
      derivativeResetReason: generationChanged ? 'playback-generation' : floorChanged ? 'floor-transition' : dtSeconds <= 0 ? 'invalid-delta' : null,
    };
    frames.current.push(record);
    if (frames.current.length > 30000) { frames.current.shift(); }
    previous.position = position;
    previous.floorId = floorId;
    previous.velocity = velocity;
    previous.acceleration = acceleration;
    previous.traveledMeters = traveledMeters;
    previous.generation = session.generation;
    previous.movementMode = movementMode;
    lastPublish.current += rawDelta;
    if (lastPublish.current >= 0.1) {
      lastPublish.current = 0;
      publishLiveMetrics({
        stanceP99Mps: percentile99(stanceSpeedSamples.current.map((sample) => sample.value)),
        stanceSamples: stanceSpeedSamples.current.length,
        autoAccelerationMaxMps2: autoAccelerationSamples.current.length ? Math.max(...autoAccelerationSamples.current.map((sample) => sample.value)) : null,
        autoAccelerationSamples: autoAccelerationSamples.current.length,
        manualAccelerationMaxMps2: manualAccelerationSamples.current.length ? Math.max(...manualAccelerationSamples.current.map((sample) => sample.value)) : null,
        manualAccelerationSamples: manualAccelerationSamples.current.length,
        clearanceMarginM: numericMarginM,
        clearanceSamples: clearanceSamples.current.length,
        windowSeconds: Math.min(5, physicsMetricClock.current),
        currentMode: movementMode,
        currentAccelerationMps2: accelerationSampleValid ? accelerationMagnitude : null,
      });
      onFrame(record);
    }
  });
  return null;
}
