import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Group, PerspectiveCamera } from 'three';

type ViewMode = 'third' | 'first';
type Vec3 = [number, number, number];
type InputSample = { tick: number; forward: -1 | 0 | 1; strafe: -1 | 0 | 1; sprint: boolean };
type Obstacle = { minX: number; maxX: number; minZ: number; maxZ: number };
type RouteFixture = { id: string; label: string; points: Vec3[]; obstacles: Obstacle[]; expected: 'clear' | 'blocked' };
type TelemetryFrame = {
  tick: number;
  dtSeconds: number;
  floorId: string;
  position: Vec3;
  velocity: Vec3;
  yawRadians: number;
  traveledMeters: number;
  gaitDistanceMeters: number;
  locomotion: 'idle' | 'walk' | 'run' | 'connector' | 'blocked';
  accelerationMps2: Vec3 | null;
  jerkMps3: Vec3 | null;
  gaze: { yawRadians: number; pitchRadians: number } | null;
  clearance: { minimumM: number | null; method: 'swept-horizontal-circle-vs-aabb'; capsuleHeightM: null; verticalClearanceM: null };
  support: { kind: 'flat-demo-floor' | 'unknown'; elevationM: number | null };
  footContact: 'not-modeled';
  interaction: 'not-modeled';
};
type FixtureResult = { fixtureId: string; result: 'clear' | 'blocked'; frames: TelemetryFrame[]; routeMeters: number; traveledMeters: number; durationSeconds: number; minClearanceM: number | null; blockedTick: number | null };

const SIM_DT = 1 / 30;
const CAPSULE_RADIUS_M = 0.3;
const WALK_SPEED_MPS = 1.8;
const SPRINT_SPEED_MPS = 3.2;
const LIVE_OBSTACLES: Obstacle[] = [
  { minX: -1.9, maxX: -0.1, minZ: 0.8, maxZ: 2.0 },
  { minX: 2.4, maxX: 3.8, minZ: -2.2, maxZ: -0.8 },
];
const FIXTURES: RouteFixture[] = [
  { id: 'straight-clear', label: 'Straight clear corridor', points: [[0, 0, 0], [6, 0, 0]], obstacles: [], expected: 'clear' },
  { id: 'wall-blocked', label: 'Wall blocks direct route', points: [[0, 0, 0], [6, 0, 0]], obstacles: [{ minX: 2.7, maxX: 3.3, minZ: -1, maxZ: 1 }], expected: 'blocked' },
  { id: 'orthogonal-detour', label: 'Clear authored detour', points: [[0, 0, 0], [0, 0, 2], [6, 0, 2], [6, 0, 0]], obstacles: [{ minX: 2.7, maxX: 3.3, minZ: -1, maxZ: 1 }], expected: 'clear' },
  { id: 'narrow-gap', label: 'Gap narrower than body diameter', points: [[0, 0, 0], [6, 0, 0]], obstacles: [{ minX: 2, maxX: 4, minZ: -1, maxZ: -0.24 }, { minX: 2, maxX: 4, minZ: 0.24, maxZ: 1 }], expected: 'blocked' },
];

const ROUTE_STOPS = [
  { id: 'west-entry', label: 'West entry', position: [-3, 0, 0] as Vec3 },
  { id: 'north-entry', label: 'North entry', position: [0, 0, -4] as Vec3 },
  { id: 'east-exit', label: 'East exit', position: [6, 0, 0] as Vec3 },
  { id: 'south-exit', label: 'South exit', position: [0, 0, 4] as Vec3 },
];

const distance3 = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const routeLength = (points: Vec3[]) => points.slice(1).reduce((sum, point, index) => sum + distance3(points[index], point), 0);

function pointSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function segmentIntersectsRect(ax: number, az: number, bx: number, bz: number, rect: Obstacle) {
  let tMin = 0;
  let tMax = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const ratio = q / p;
    if (p < 0) tMin = Math.max(tMin, ratio);
    else tMax = Math.min(tMax, ratio);
    return tMin <= tMax;
  };
  const dx = bx - ax;
  const dz = bz - az;
  return clip(-dx, ax - rect.minX) && clip(dx, rect.maxX - ax) && clip(-dz, az - rect.minZ) && clip(dz, rect.maxZ - az);
}

function distanceSegmentRect(ax: number, az: number, bx: number, bz: number, rect: Obstacle) {
  if (segmentIntersectsRect(ax, az, bx, bz, rect)) return 0;
  const pointRect = (x: number, z: number) => Math.hypot(Math.max(rect.minX - x, 0, x - rect.maxX), Math.max(rect.minZ - z, 0, z - rect.maxZ));
  const corners: [number, number][] = [[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ]];
  let best = Math.min(pointRect(ax, az), pointRect(bx, bz));
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    best = Math.min(best, pointSegmentDistance(a[0], a[1], ax, az, bx, bz), pointSegmentDistance(ax, az, a[0], a[1], b[0], b[1]), pointSegmentDistance(bx, bz, a[0], a[1], b[0], b[1]));
  }
  return best;
}

function resolveSweptStep(from: Vec3, to: Vec3, obstacles: Obstacle[]) {
  if (!obstacles.length) return { blocked: false, clearanceM: null as number | null };
  const clearanceM = Math.min(...obstacles.map((obstacle) => distanceSegmentRect(from[0], from[2], to[0], to[2], obstacle) - CAPSULE_RADIUS_M));
  return { blocked: clearanceM <= 0, clearanceM };
}

function interpolateRoute(points: Vec3[], cumulative: number[], meters: number): Vec3 {
  const nextIndex = Math.max(1, cumulative.findIndex((distance) => distance >= meters));
  const boundedIndex = Math.min(nextIndex, points.length - 1);
  const from = points[boundedIndex - 1];
  const to = points[boundedIndex];
  const span = cumulative[boundedIndex] - cumulative[boundedIndex - 1];
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, (meters - cumulative[boundedIndex - 1]) / span));
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

function simulateRoute(fixture: RouteFixture): FixtureResult {
  const cumulative = [0];
  for (let index = 1; index < fixture.points.length; index++) cumulative.push(cumulative[index - 1] + distance3(fixture.points[index - 1], fixture.points[index]));
  const routeMeters = cumulative[cumulative.length - 1] ?? 0;
  const frames: TelemetryFrame[] = [];
  let traveledMeters = 0;
  let tick = 0;
  let previous: Vec3 = fixture.points[0] ?? [0, 0, 0];
  let elapsed = 0;
  let blocked = false;
  let blockedTick: number | null = null;
  let minClearanceM: number | null = null;
  let previousVelocity: Vec3 = [0, 0, 0];
  let previousAcceleration: Vec3 = [0, 0, 0];
  const tickCount = Math.ceil(routeMeters / (WALK_SPEED_MPS * SIM_DT));
  for (; tick < tickCount; tick++) {
    const targetDistance = Math.min(routeMeters, (tick + 1) * WALK_SPEED_MPS * SIM_DT);
    const position = interpolateRoute(fixture.points, cumulative, targetDistance);
    const sweep = resolveSweptStep(previous, position, fixture.obstacles);
    if (sweep.blocked) {
      blocked = true;
      blockedTick = tick;
      frames.push({ tick, dtSeconds: SIM_DT, floorId: 'motion-lab-floor-1', position: [...previous], velocity: [0, 0, 0], yawRadians: 0, traveledMeters, gaitDistanceMeters: traveledMeters, locomotion: 'blocked', accelerationMps2: null, jerkMps3: null, gaze: null, clearance: { minimumM: 0, method: 'swept-horizontal-circle-vs-aabb', capsuleHeightM: null, verticalClearanceM: null }, support: { kind: 'flat-demo-floor', elevationM: 0 }, footContact: 'not-modeled', interaction: 'not-modeled' });
      elapsed += SIM_DT;
      break;
    }
    minClearanceM = sweep.clearanceM === null ? minClearanceM : Math.min(minClearanceM ?? Number.POSITIVE_INFINITY, sweep.clearanceM);
    const velocity: Vec3 = [(position[0] - previous[0]) / SIM_DT, (position[1] - previous[1]) / SIM_DT, (position[2] - previous[2]) / SIM_DT];
    const acceleration: Vec3 = [(velocity[0] - previousVelocity[0]) / SIM_DT, (velocity[1] - previousVelocity[1]) / SIM_DT, (velocity[2] - previousVelocity[2]) / SIM_DT];
    const jerk: Vec3 = [(acceleration[0] - previousAcceleration[0]) / SIM_DT, (acceleration[1] - previousAcceleration[1]) / SIM_DT, (acceleration[2] - previousAcceleration[2]) / SIM_DT];
    traveledMeters += distance3(previous, position);
    elapsed += SIM_DT;
    frames.push({ tick, dtSeconds: SIM_DT, floorId: 'motion-lab-floor-1', position, velocity, yawRadians: Math.atan2(velocity[0], velocity[2]), traveledMeters, gaitDistanceMeters: traveledMeters, locomotion: 'walk', accelerationMps2: acceleration, jerkMps3: jerk, gaze: null, clearance: { minimumM: sweep.clearanceM, method: 'swept-horizontal-circle-vs-aabb', capsuleHeightM: null, verticalClearanceM: null }, support: { kind: 'flat-demo-floor', elevationM: 0 }, footContact: 'not-modeled', interaction: 'not-modeled' });
    previousVelocity = velocity;
    previousAcceleration = acceleration;
    previous = position;
  }
  return { fixtureId: fixture.id, result: blocked ? 'blocked' : 'clear', frames, routeMeters, traveledMeters, durationSeconds: elapsed, minClearanceM: minClearanceM === null ? null : Math.max(0, minClearanceM), blockedTick };
}

function validateInputTape(tape: InputSample[]) {
  if (!Array.isArray(tape) || tape.length > 1_000_000) return false;
  return tape.every((sample, index) =>
    Number.isInteger(sample.tick) && sample.tick === index &&
    (sample.forward === -1 || sample.forward === 0 || sample.forward === 1) &&
    (sample.strafe === -1 || sample.strafe === 0 || sample.strafe === 1) &&
    typeof sample.sprint === 'boolean',
  );
}

function makeSeededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function runSeededFuzzer(seed: number, count: number) {
  const random = makeSeededRandom(seed);
  let clear = 0;
  let blocked = 0;
  let mismatches = 0;
  for (let index = 0; index < count; index++) {
    const startX = -2 + random() * 4;
    const startZ = -2 + random() * 4;
    const endX = 4 + random() * 4;
    const endZ = -3 + random() * 6;
    const start: Vec3 = [startX, 0, startZ];
    const end: Vec3 = [endX, 0, endZ];
    const bend = (index % 3) === 0;
    const mid: Vec3 = [(startX + endX) / 2, 0, (startZ + endZ) / 2 + (random() - 0.5) * 3];
    const points = bend ? [start, mid, end] : [start, end];
    const centerX = mid[0];
    const centerZ = mid[2];
    const halfWidth = 0.2 + random() * 0.65;
    const halfDepth = 0.2 + random() * 0.65;
    const shouldBlock = index % 2 === 0;
    const offset = shouldBlock ? 0 : 6;
    const fixture: RouteFixture = {
      id: `fuzz-${index}`,
      label: bend ? 'Seeded bent path' : 'Seeded direct path',
      points,
      obstacles: [{ minX: centerX - halfWidth, maxX: centerX + halfWidth, minZ: centerZ + offset - halfDepth, maxZ: centerZ + offset + halfDepth }],
      expected: shouldBlock ? 'blocked' : 'clear',
    };
    const result = simulateRoute(fixture).result;
    if (result === 'clear') clear++; else blocked++;
    if (result !== fixture.expected) mismatches++;
  }
  return { seed, count, clear, blocked, mismatches };
}

const REFERENCE_FIXTURE_SUMMARIES = FIXTURES.map(({ id, expected }) => ({ fixtureId: id, expectedOutcome: expected }));

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sparkline(frames: TelemetryFrame[], metric: (frame: TelemetryFrame) => number | null) {
  const values = frames.map(metric).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => `${values.length <= 1 ? 100 : (index / (values.length - 1)) * 200},${34 - ((value - min) / span) * 30}`).join(' ');
}

function MotionLabScene({
  view,
  destination,
  captureMode,
  inputTape,
  position,
  inputOrigin,
  replayEpoch,
  telemetry,
  onFrame,
  onReplayComplete,
}: {
  view: ViewMode;
  destination: [number, number];
  captureMode: MutableRefObject<'idle' | 'record' | 'replay'>;
  inputTape: MutableRefObject<InputSample[]>;
  position: MutableRefObject<[number, number]>;
  inputOrigin: MutableRefObject<[number, number]>;
  replayEpoch: MutableRefObject<number>;
  telemetry: MutableRefObject<TelemetryFrame[]>;
  onFrame: (frame: TelemetryFrame, recordedInputCount: number) => void;
  onReplayComplete: () => void;
}) {
  const avatar = useRef<Group>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const held = useRef(new Set<string>());
  const replayIndex = useRef(0);
  const observedReplayEpoch = useRef(replayEpoch.current);
  const tick = useRef(0);
  const traveled = useRef(0);
  const yaw = useRef(0);
  const statusElapsed = useRef(0);
  const accumulator = useRef(0);
  const previousVelocity = useRef<Vec3>([0, 0, 0]);
  const previousAcceleration = useRef<Vec3>([0, 0, 0]);
  const lastFrame = useRef<TelemetryFrame | null>(null);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        held.current.add(event.key.toLowerCase());
      }
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    const clear = () => { held.current.clear(); accumulator.current = 0; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      clear();
    };
  }, []);

  useFrame((_, delta) => {
    if (observedReplayEpoch.current !== replayEpoch.current) {
      observedReplayEpoch.current = replayEpoch.current;
      replayIndex.current = 0;
      position.current = [inputOrigin.current[0], inputOrigin.current[1]];
      traveled.current = 0;
      tick.current = 0;
      yaw.current = 0;
      previousVelocity.current = [0, 0, 0];
      previousAcceleration.current = [0, 0, 0];
      accumulator.current = 0;
    }
    const advance = (sample: Omit<InputSample, 'tick'>) => {
      const x = sample.strafe;
      const z = -sample.forward;
      const length = Math.hypot(x, z) || 1;
      const speed = sample.sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
      const before: Vec3 = [position.current[0], 0, position.current[1]];
      const requested: Vec3 = [before[0] + (x / length) * speed * SIM_DT, 0, before[2] + (z / length) * speed * SIM_DT];
      const sweep = resolveSweptStep(before, requested, LIVE_OBSTACLES);
      const current = sweep.blocked ? before : requested;
      position.current = [current[0], current[2]];
      const stepDistance = distance3(before, current);
      traveled.current += stepDistance;
      if (x || z) yaw.current = Math.atan2(x, sample.forward);
      const velocity: Vec3 = stepDistance > 0 ? [(current[0] - before[0]) / SIM_DT, 0, (current[2] - before[2]) / SIM_DT] : [0, 0, 0];
      const acceleration: Vec3 = [(velocity[0] - previousVelocity.current[0]) / SIM_DT, 0, (velocity[2] - previousVelocity.current[2]) / SIM_DT];
      const jerk: Vec3 = [(acceleration[0] - previousAcceleration.current[0]) / SIM_DT, 0, (acceleration[2] - previousAcceleration.current[2]) / SIM_DT];
      const frame: TelemetryFrame = {
        tick: tick.current++, dtSeconds: SIM_DT, floorId: 'motion-lab-floor-1', position: current, velocity,
        yawRadians: yaw.current, traveledMeters: traveled.current, gaitDistanceMeters: traveled.current,
        locomotion: sweep.blocked ? 'blocked' : stepDistance === 0 ? 'idle' : sample.sprint ? 'run' : 'walk',
        accelerationMps2: acceleration, jerkMps3: jerk, gaze: null,
        clearance: { minimumM: sweep.clearanceM === null ? null : Math.max(0, sweep.clearanceM), method: 'swept-horizontal-circle-vs-aabb', capsuleHeightM: null, verticalClearanceM: null },
        support: { kind: 'flat-demo-floor', elevationM: 0 }, footContact: 'not-modeled', interaction: 'not-modeled',
      };
      previousVelocity.current = velocity;
      previousAcceleration.current = acceleration;
      lastFrame.current = frame;
      telemetry.current.push(frame);
      if (telemetry.current.length > 30000) telemetry.current.shift();
      if (captureMode.current === 'record') inputTape.current.push({ tick: inputTape.current.length, ...sample });
    };

    accumulator.current += Math.min(Math.max(delta, 0), 0.25);
    let substeps = 0;
    while (accumulator.current >= SIM_DT && substeps < 8) {
      let sample: Omit<InputSample, 'tick'>;
      if (captureMode.current === 'replay') {
        const next = inputTape.current[replayIndex.current++];
        if (next) sample = { forward: next.forward, strafe: next.strafe, sprint: next.sprint };
        else {
          captureMode.current = 'idle';
          onReplayComplete();
          sample = { forward: 0, strafe: 0, sprint: false };
        }
      } else {
        const keys = held.current;
        sample = {
          forward: (Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))) as -1 | 0 | 1,
          strafe: (Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))) as -1 | 0 | 1,
          sprint: keys.has('shift'),
        };
      }
      advance(sample);
      accumulator.current -= SIM_DT;
      substeps++;
    }
    if (avatar.current) {
      avatar.current.position.set(position.current[0], 0, position.current[1]);
      if (lastFrame.current?.locomotion !== 'idle' && lastFrame.current?.locomotion !== 'blocked') avatar.current.rotation.y = yaw.current;
    }
    if (camera) {
      if (view === 'first') {
        camera.position.set(position.current[0], 1.55, position.current[1]);
        camera.lookAt(position.current[0], 1.5, position.current[1] - 2);
      } else {
        camera.position.set(position.current[0] + 5, 4.5, position.current[1] + 7);
        camera.lookAt(position.current[0], 0.8, position.current[1]);
      }
    }
    statusElapsed.current += delta;
    if (statusElapsed.current >= 0.2 && lastFrame.current) {
      statusElapsed.current = 0;
      onFrame(lastFrame.current, inputTape.current.length);
    }
  });

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 8, 3]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[18, 12]} />
        <meshStandardMaterial color="#e6e9ed" />
      </mesh>
      <gridHelper args={[18, 18, '#8994a3', '#c6ccd4']} position={[0, 0, 0]} />
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[9, 0.16, 0.12]} />
        <meshStandardMaterial color="#c5cbd3" />
      </mesh>
      <mesh position={[-1, 0.65, 1.4]} castShadow>
        <boxGeometry args={[1.8, 1.3, 1.2]} />
        <meshStandardMaterial color="#8aa5b8" />
      </mesh>
      <mesh position={[3.1, 0.5, -1.5]} castShadow>
        <boxGeometry args={[1.4, 1, 1.4]} />
        <meshStandardMaterial color="#d7a36b" />
      </mesh>
      <mesh position={[destination[0], 0.02, destination[1]]}>
        <cylinderGeometry args={[0.38, 0.38, 0.04, 24]} />
        <meshStandardMaterial color="#2f9e74" />
      </mesh>
      <group ref={avatar} position={[-3, 0, 0]}>
        <mesh position={[0, 0.74, 0]} castShadow>
          <capsuleGeometry args={[0.3, 0.88, 8, 16]} />
          <meshStandardMaterial color="#4263eb" />
        </mesh>
        <mesh position={[0, 1.64, 0]} castShadow>
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshStandardMaterial color="#f0c6a3" />
        </mesh>
      </group>
    </>
  );
}

export default function MotionLab() {
  const [view, setView] = useState<ViewMode>('third');
  const [from, setFrom] = useState('west-entry');
  const [to, setTo] = useState('east-exit');
  const [destination, setDestination] = useState<[number, number]>([6, 0]);
  const [routeResult, setRouteResult] = useState<FixtureResult | null>(null);
  const [status, setStatus] = useState('Ready · WASD / arrows to walk');
  const [recording, setRecording] = useState(false);
  const captureMode = useRef<'idle' | 'record' | 'replay'>('idle');
  const inputTape = useRef<InputSample[]>([]);
  const labPosition = useRef<[number, number]>([-3, 0]);
  const inputOrigin = useRef<[number, number]>([-3, 0]);
  const replayEpoch = useRef(0);
  const telemetry = useRef<TelemetryFrame[]>([]);
  const [inputCount, setInputCount] = useState(0);
  const [liveFrame, setLiveFrame] = useState<TelemetryFrame | null>(null);
  const [fixtureResults, setFixtureResults] = useState<FixtureResult[] | null>(null);
  const [fuzzerSummary, setFuzzerSummary] = useState<ReturnType<typeof runSeededFuzzer> | null>(null);
  const [seed, setSeed] = useState('20260619');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRoute = useCallback(() => {
    const start = ROUTE_STOPS.find((stop) => stop.id === from);
    const end = ROUTE_STOPS.find((stop) => stop.id === to);
    if (!start || !end) return;
    setDestination([end.position[0], end.position[2]]);
    const result = simulateRoute({ id: `route-${from}-${to}`, label: `${start.label} to ${end.label}`, points: [start.position, end.position], obstacles: LIVE_OBSTACLES, expected: 'clear' });
    setRouteResult(result);
    setStatus(`A/B candidate ${result.result} · ${start.label} → ${end.label}`);
  }, [from, to]);

  const handleFrame = useCallback((frame: TelemetryFrame, recordedInputCount: number) => {
    setLiveFrame(frame);
    setInputCount(recordedInputCount);
  }, []);
  const handleReplayComplete = useCallback(() => setStatus('Input replay complete'), []);

  const runFixtures = () => {
    const results = FIXTURES.map(simulateRoute);
    setFixtureResults(results);
    setStatus(`Headless fixtures evaluated · ${results.length} fixed-step runs`);
  };
  const fixtureOutcomesMatch = fixtureResults !== null && fixtureResults.length === REFERENCE_FIXTURE_SUMMARIES.length && fixtureResults.every((result) => result.result === REFERENCE_FIXTURE_SUMMARIES.find((reference) => reference.fixtureId === result.fixtureId)?.expectedOutcome);
  const runFuzzer = () => {
    const parsedSeed = Number(seed);
    if (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 0xffffffff) {
      setStatus('Fuzzer seed must be an unsigned 32-bit integer');
      return;
    }
    setFuzzerSummary(runSeededFuzzer(parsedSeed, 32));
  };

  const startInputCapture = () => {
    inputTape.current = [];
    inputOrigin.current = [labPosition.current[0], labPosition.current[1]];
    telemetry.current = [];
    captureMode.current = 'record';
    setInputCount(0);
    setStatus('Input recording started · move with WASD / arrows');
  };
  const stopInputCapture = () => {
    captureMode.current = 'idle';
    setInputCount(inputTape.current.length);
    setStatus(`Input recording stopped · ${inputTape.current.length} samples`);
  };
  const replayInput = () => {
    if (!validateInputTape(inputTape.current) || !inputTape.current.length) {
      setStatus('Input tape is empty or has invalid tick/axis values');
      return;
    }
    telemetry.current = [];
    replayEpoch.current++;
    captureMode.current = 'replay';
    setStatus(`Replaying ${inputTape.current.length} recorded input samples`);
  };

  useEffect(() => {
    const onViewKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'v' || /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      setView((current) => current === 'third' ? 'first' : 'third');
    };
    window.addEventListener('keydown', onViewKey);
    return () => window.removeEventListener('keydown', onViewKey);
  }, []);

  const startCapture = async () => {
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.current = capture;
      chunks.current = [];
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(capture, mimeType ? { mimeType } : undefined);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `motion-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        capture.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        setRecording(false);
      };
      capture.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      }, { once: true });
      mediaRecorder.start(250);
      setRecording(true);
      setStatus('Screen capture recording · select Stop to save WebM');
    } catch (error) {
      setStatus(error instanceof Error ? `Capture unavailable · ${error.message}` : 'Capture unavailable');
    }
  };

  const stopCapture = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else stream.current?.getTracks().forEach((track) => track.stop());
  };

  useEffect(() => () => {
    if (recorder.current?.state !== 'inactive') recorder.current?.stop();
    else stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const diagnosticTrail = telemetry.current.slice(-60);
  const magnitude = (value: Vec3 | null | undefined) => value ? Math.hypot(value[0], value[1], value[2]) : null;

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Development tool</p><h1 className="text-2xl font-semibold">Motion Lab</h1></div>
          <div className="flex gap-2">
            <button className="rounded-md bg-slate-700 px-3 py-2 text-sm" onClick={() => setView(view === 'third' ? 'first' : 'third')}>View: {view === 'third' ? 'Third person' : 'First person'} (V)</button>
            <button className="rounded-md bg-rose-700 px-3 py-2 text-sm" onClick={recording ? stopCapture : startCapture}>{recording ? 'Stop & save recording' : 'Record screen'}</button>
          </div>
        </header>
        <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="relative h-[min(68vh,680px)] min-h-[380px] overflow-hidden rounded-xl border border-slate-700 bg-slate-100">
            <Canvas shadows camera={{ position: [2, 4, 8], fov: 55 }}>
              <MotionLabScene view={view} destination={destination} captureMode={captureMode} inputTape={inputTape} position={labPosition} inputOrigin={inputOrigin} replayEpoch={replayEpoch} telemetry={telemetry} onFrame={handleFrame} onReplayComplete={handleReplayComplete} />
            </Canvas>
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-slate-950/85 px-3 py-2 font-mono text-xs text-emerald-200" aria-live="polite">
              <div>tick {liveFrame?.tick ?? 0} · {liveFrame?.locomotion ?? 'idle'}</div>
              <div>pos {liveFrame?.position.map((value) => value.toFixed(2)).join(', ') ?? '0, 0, 0'}</div>
              <div>distance {(liveFrame?.traveledMeters ?? 0).toFixed(2)} m · capsule r {CAPSULE_RADIUS_M.toFixed(2)} m</div>
              <div>speed {magnitude(liveFrame?.velocity)?.toFixed(2) ?? '0.00'} · accel {magnitude(liveFrame?.accelerationMps2)?.toFixed(2) ?? 'n/a'} · jerk {magnitude(liveFrame?.jerkMps3)?.toFixed(2) ?? 'n/a'}</div>
              <div>horizontal swept clearance {liveFrame?.clearance.minimumM === null || !liveFrame ? 'n/a' : `${liveFrame.clearance.minimumM.toFixed(2)} m`}</div>
              <div>gaze / feet / connector / interactions: not modeled</div>
            </div>
          </div>
          <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div><h2 className="mb-2 font-medium">A → B route candidate</h2><label className="mb-2 block text-xs text-slate-400">From<select className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={from} onChange={(event) => setFrom(event.target.value)}>{ROUTE_STOPS.map((stop) => <option key={stop.id} value={stop.id}>{stop.label}</option>)}</select></label><label className="mb-3 block text-xs text-slate-400">To<select className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={to} onChange={(event) => setTo(event.target.value)}>{ROUTE_STOPS.map((stop) => <option key={stop.id} value={stop.id}>{stop.label}</option>)}</select></label><button className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium" onClick={startRoute}>Resolve route candidate</button>{routeResult && <p className="mt-2 font-mono text-xs text-slate-300">{routeResult.result} · {routeResult.frames.length} frames · {routeResult.traveledMeters.toFixed(2)} / {routeResult.routeMeters.toFixed(2)} m · blocked tick {routeResult.blockedTick ?? '—'}</p>}<p className="mt-2 text-xs text-amber-300">Sandbox resolver only; production route service/controller integration is pending W4/W7.</p></div>
            <div><h2 className="mb-2 font-medium">Free walk</h2><p className="text-sm leading-6 text-slate-300">WASD or arrow keys move · Shift walks faster · V changes view</p></div>
            <section className="space-y-1 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Recent diagnostic trail</h2>
              <svg viewBox="0 0 200 38" className="h-12 w-full rounded bg-slate-950 p-1" role="img" aria-label="Speed, acceleration, jerk and clearance traces over recent simulation ticks">
                <polyline points={sparkline(diagnosticTrail, (frame) => magnitude(frame.velocity))} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
                <polyline points={sparkline(diagnosticTrail, (frame) => magnitude(frame.accelerationMps2))} fill="none" stroke="#fbbf24" strokeWidth="1.2" />
                <polyline points={sparkline(diagnosticTrail, (frame) => magnitude(frame.jerkMps3))} fill="none" stroke="#f472b6" strokeWidth="1.2" />
                <polyline points={sparkline(diagnosticTrail, (frame) => frame.clearance.minimumM)} fill="none" stroke="#34d399" strokeWidth="1.2" />
              </svg>
              <p className="text-xs text-slate-400">Blue speed · amber acceleration · pink jerk · green horizontal clearance. Each trace is normalized separately. No product thresholds are approved here.</p>
              <p className="text-xs text-amber-300">Clearance models horizontal circle vs AABB only. Capsule height, vertical clearance, gaze, foot contact, connector and interaction state remain unavailable until later runtime data exists.</p>
            </section>
            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Headless route fixtures</h2>
              <p className="text-xs text-slate-400">Fixed 1/30 s samples · provisional 0.3 m circle gate. Shared W1–W4 controller / capsule validator integration is pending.</p>
              <button className="w-full rounded bg-slate-700 px-3 py-2 text-sm" onClick={runFixtures}>Evaluate standard fixtures</button>
              {fixtureResults && <div className="space-y-1 font-mono text-xs text-slate-300">
                {fixtureResults.map((result) => <div key={result.fixtureId}>{FIXTURES.find((fixture) => fixture.id === result.fixtureId)?.label}: {result.result} (reference {REFERENCE_FIXTURE_SUMMARIES.find((reference) => reference.fixtureId === result.fixtureId)?.expectedOutcome}), {result.frames.length} frames, {result.traveledMeters.toFixed(2)} / {result.routeMeters.toFixed(2)} m, {result.durationSeconds.toFixed(2)} s, blocked tick {result.blockedTick ?? '—'}, traversed clearance {result.minClearanceM === null ? 'unbounded' : `${result.minClearanceM.toFixed(2)} m`}</div>)}
                <div className="text-amber-300">Reference outcome summary: {fixtureOutcomesMatch ? 'all match' : 'DIFFERENCE'} · these hand-authored expectations describe this sandbox only; they are not production-runtime golden evidence.</div>
              </div>}
            </section>
            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Input record / replay</h2>
              <p className="text-xs text-slate-400">Fixed 1/30 s control ticks, separate from screen video · {inputCount} samples</p>
              <div className="flex flex-wrap gap-2">
                {captureMode.current !== 'record' ? <button className="rounded bg-slate-700 px-2 py-2 text-xs" onClick={startInputCapture}>Record inputs</button> : <button className="rounded bg-rose-800 px-2 py-2 text-xs" onClick={stopInputCapture}>Stop input record</button>}
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" onClick={replayInput}>Replay inputs</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" disabled={!inputTape.current.length} onClick={() => downloadJson('motion-lab-input-tape.json', { schemaVersion: 1, startPosition: inputOrigin.current, samples: inputTape.current })}>Export tape</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" disabled={!telemetry.current.length} onClick={() => downloadJson('motion-lab-telemetry.json', telemetry.current)}>Export telemetry</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" disabled={!fixtureResults} onClick={() => downloadJson('motion-lab-fixture-summary.json', { fixtures: fixtureResults, referenceOutcomes: REFERENCE_FIXTURE_SUMMARIES, limitations: ['2D horizontal circle against axis-aligned rectangles', 'No capsule height, ceiling, floor variation, foot contact, gaze, connector or interaction model', 'Not the shared production capsule validator'] })}>Export fixture summary</button>
              </div>
            </section>
            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Seeded route fuzzer</h2>
              <label className="block text-xs text-slate-400">Seed<input className="mt-1 w-full rounded bg-slate-800 px-2 py-2 font-mono text-sm text-white" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
              <button className="w-full rounded bg-slate-700 px-3 py-2 text-sm" onClick={runFuzzer}>Generate 32 reproducible cases</button>
              {fuzzerSummary && <p className="font-mono text-xs text-slate-300">seed {fuzzerSummary.seed} · {fuzzerSummary.count} cases · {fuzzerSummary.clear} clear / {fuzzerSummary.blocked} blocked · {fuzzerSummary.mismatches} expected-outcome mismatches</p>}
            </section>
            <div role="status" aria-live="polite" className="rounded bg-slate-800 p-3 text-sm text-emerald-200">{status}</div>
            <p className="text-xs leading-5 text-slate-500">Screen recording starts only after your click. The browser asks which screen or window to share; the resulting WebM downloads locally when stopped.</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
