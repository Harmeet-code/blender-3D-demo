import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Group, PerspectiveCamera } from 'three';

type ViewMode = 'third' | 'first';
type Vec3 = [number, number, number];
type InputSample = { forward: number; strafe: number; sprint: boolean; dtSeconds: number };
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
};
type FixtureResult = { fixtureId: string; result: 'clear' | 'blocked'; frames: TelemetryFrame[]; routeMeters: number; traveledMeters: number; durationSeconds: number; minClearanceM: number };

const SIM_DT = 1 / 30;
const CAPSULE_RADIUS_M = 0.3;
const WALK_SPEED_MPS = 1.8;
const SPRINT_SPEED_MPS = 3.2;
const FIXTURES: RouteFixture[] = [
  { id: 'straight-clear', label: 'Straight clear corridor', points: [[0, 0, 0], [6, 0, 0]], obstacles: [], expected: 'clear' },
  { id: 'wall-blocked', label: 'Wall blocks direct route', points: [[0, 0, 0], [6, 0, 0]], obstacles: [{ minX: 2.7, maxX: 3.3, minZ: -1, maxZ: 1 }], expected: 'blocked' },
  { id: 'orthogonal-detour', label: 'Clear authored detour', points: [[0, 0, 0], [0, 0, 2], [6, 0, 2], [6, 0, 0]], obstacles: [{ minX: 2.7, maxX: 3.3, minZ: -1, maxZ: 1 }], expected: 'clear' },
];

const distance3 = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const routeLength = (points: Vec3[]) => points.slice(1).reduce((sum, point, index) => sum + distance3(points[index], point), 0);

function clearanceAt(x: number, z: number, obstacles: Obstacle[]) {
  return obstacles.reduce((nearest, obstacle) => {
    const dx = Math.max(obstacle.minX - x, 0, x - obstacle.maxX);
    const dz = Math.max(obstacle.minZ - z, 0, z - obstacle.maxZ);
    return Math.min(nearest, Math.hypot(dx, dz) - CAPSULE_RADIUS_M);
  }, Number.POSITIVE_INFINITY);
}

function sampleRoute(points: Vec3[], stepM = 0.1): Vec3[] {
  const samples: Vec3[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const length = distance3(from, to);
    const steps = Math.max(1, Math.ceil(length / stepM));
    for (let step = index === 1 ? 0 : 1; step <= steps; step++) {
      const t = step / steps;
      samples.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
    }
  }
  return samples;
}

function simulateFixture(fixture: RouteFixture): FixtureResult {
  const route = sampleRoute(fixture.points);
  const cumulative = [0];
  for (let index = 1; index < route.length; index++) cumulative.push(cumulative[index - 1] + distance3(route[index - 1], route[index]));
  const routeMeters = cumulative[cumulative.length - 1] ?? 0;
  const positionAtDistance = (meters: number): Vec3 => {
    const index = cumulative.findIndex((distance) => distance >= meters);
    const nextIndex = index < 0 ? route.length - 1 : index;
    if (nextIndex === 0) return route[0] ?? [0, 0, 0];
    const from = route[nextIndex - 1];
    const to = route[nextIndex];
    const segmentLength = cumulative[nextIndex] - cumulative[nextIndex - 1];
    const t = segmentLength === 0 ? 0 : (meters - cumulative[nextIndex - 1]) / segmentLength;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  };
  const frames: TelemetryFrame[] = [];
  let traveledMeters = 0;
  let tick = 0;
  let previous = route[0] ?? [0, 0, 0];
  let elapsed = 0;
  let blocked = false;
  const tickCount = Math.ceil(routeMeters / (WALK_SPEED_MPS * SIM_DT));
  for (; tick < tickCount; tick++) {
    const targetDistance = Math.min(routeMeters, (tick + 1) * WALK_SPEED_MPS * SIM_DT);
    const position = positionAtDistance(targetDistance);
    const candidateClearance = clearanceAt(position[0], position[2], fixture.obstacles);
    if (candidateClearance < 0) {
      blocked = true;
      frames.push({ tick, dtSeconds: SIM_DT, floorId: 'motion-lab-floor-1', position: [...previous], velocity: [0, 0, 0], yawRadians: 0, traveledMeters, gaitDistanceMeters: traveledMeters, locomotion: 'blocked' });
      elapsed += SIM_DT;
      break;
    }
    const velocity: Vec3 = [(position[0] - previous[0]) / SIM_DT, (position[1] - previous[1]) / SIM_DT, (position[2] - previous[2]) / SIM_DT];
    traveledMeters += distance3(previous, position);
    elapsed += SIM_DT;
    frames.push({ tick, dtSeconds: SIM_DT, floorId: 'motion-lab-floor-1', position, velocity, yawRadians: Math.atan2(velocity[0], velocity[2]), traveledMeters, gaitDistanceMeters: traveledMeters, locomotion: 'walk' });
    previous = position;
  }
  const minClearanceM = Math.min(...route.map(([x, , z]) => clearanceAt(x, z, fixture.obstacles)));
  return { fixtureId: fixture.id, result: blocked ? 'blocked' : 'clear', frames, routeMeters: routeLength(fixture.points), traveledMeters, durationSeconds: elapsed, minClearanceM };
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
    const endX = 4 + random() * 6;
    const z = (random() - 0.5) * 4;
    const centerX = 1 + random() * (endX - 2);
    const halfWidth = 0.15 + random() * 0.8;
    const halfDepth = 0.15 + random() * 1.2;
    const fixture: RouteFixture = {
      id: `fuzz-${index}`,
      label: 'Seeded direct path',
      points: [[0, 0, z], [endX, 0, z]],
      obstacles: [{ minX: centerX - halfWidth, maxX: centerX + halfWidth, minZ: z - halfDepth, maxZ: z + halfDepth }],
      expected: 'blocked',
    };
    const result = simulateFixture(fixture).result;
    if (result === 'clear') clear++; else blocked++;
    if (result !== fixture.expected) mismatches++;
  }
  return { seed, count, clear, blocked, mismatches };
}

const GOLDEN_FIXTURE_SUMMARY = { fixtureCount: 3, clear: 2, blocked: 1, routeMeters: 22 };

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        held.current.add(event.key.toLowerCase());
      }
    };
    const up = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase());
    const clear = () => held.current.clear();
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
      position.current = [...inputOrigin.current];
      traveled.current = 0;
      tick.current = 0;
      yaw.current = 0;
    }
    const keys = held.current;
    let sample: InputSample;
    if (captureMode.current === 'replay') {
      const next = inputTape.current[replayIndex.current++];
      if (!next) {
        captureMode.current = 'idle';
        onReplayComplete();
        sample = { forward: 0, strafe: 0, sprint: false, dtSeconds: delta };
      } else sample = next;
    } else {
      sample = {
        forward: Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')),
        strafe: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
        sprint: keys.has('shift'),
        dtSeconds: delta,
      };
      if (captureMode.current === 'record') inputTape.current.push(sample);
    }
    const x = sample.strafe;
    const z = -sample.forward;
    const length = Math.hypot(x, z) || 1;
    const dt = captureMode.current === 'replay' ? sample.dtSeconds : delta;
    const speed = sample.sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
    const before: Vec3 = [position.current[0], 0, position.current[1]];
    position.current[0] += (x / length) * speed * dt;
    position.current[1] += (z / length) * speed * dt;
    const current: Vec3 = [position.current[0], 0, position.current[1]];
    const stepDistance = distance3(before, current);
    traveled.current += stepDistance;
    if (x || z) yaw.current = Math.atan2(x, sample.forward);
    if (avatar.current) {
      avatar.current.position.set(position.current[0], 0, position.current[1]);
      if (x || z) avatar.current.rotation.y = yaw.current;
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
    const frame: TelemetryFrame = {
      tick: tick.current++, dtSeconds: dt, floorId: 'motion-lab-floor-1', position: current,
      velocity: stepDistance > 0 ? [(current[0] - before[0]) / dt, 0, (current[2] - before[2]) / dt] : [0, 0, 0],
      yawRadians: yaw.current, traveledMeters: traveled.current, gaitDistanceMeters: traveled.current,
      locomotion: stepDistance === 0 ? 'idle' : sample.sprint ? 'run' : 'walk',
    };
    telemetry.current.push(frame);
    if (telemetry.current.length > 30000) telemetry.current.shift();
    statusElapsed.current += delta;
    if (statusElapsed.current >= 0.2) {
      statusElapsed.current = 0;
      onFrame(frame, inputTape.current.length);
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
  const [from, setFrom] = useState('Start');
  const [to, setTo] = useState('Booth A');
  const [destination, setDestination] = useState<[number, number]>([4, -2]);
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
    setDestination([4, -2]);
    setStatus(`Route preview · ${from} → ${to}`);
  }, [from, to]);

  const handleFrame = useCallback((frame: TelemetryFrame, recordedInputCount: number) => {
    setLiveFrame(frame);
    setInputCount(recordedInputCount);
  }, []);
  const handleReplayComplete = useCallback(() => setStatus('Input replay complete'), []);

  const runFixtures = () => {
    const results = FIXTURES.map(simulateFixture);
    setFixtureResults(results);
    setStatus(`Headless fixtures evaluated · ${results.length} fixed-step runs`);
  };
  const fixtureSummary = fixtureResults && {
    fixtureCount: fixtureResults.length,
    clear: fixtureResults.filter((result) => result.result === 'clear').length,
    blocked: fixtureResults.filter((result) => result.result === 'blocked').length,
    routeMeters: fixtureResults.reduce((sum, result) => sum + result.routeMeters, 0),
  };
  const goldenMatch = fixtureSummary && JSON.stringify(fixtureSummary) === JSON.stringify(GOLDEN_FIXTURE_SUMMARY) && fixtureResults?.every((result) => result.result === FIXTURES.find((fixture) => fixture.id === result.fixtureId)?.expected);
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
    inputOrigin.current = [...labPosition.current];
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
    if (!inputTape.current.length) {
      setStatus('Record input before replaying');
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
            </div>
          </div>
          <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div><h2 className="mb-2 font-medium">A → B route preview</h2><label className="mb-2 block text-xs text-slate-400">From<input className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="mb-3 block text-xs text-slate-400">To<input className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium" onClick={startRoute}>Preview route</button></div>
            <div><h2 className="mb-2 font-medium">Free walk</h2><p className="text-sm leading-6 text-slate-300">WASD or arrow keys move · Shift walks faster · V changes view</p></div>
            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Headless route fixtures</h2>
              <p className="text-xs text-slate-400">Fixed 1/30 s samples · provisional 0.3 m circle gate. Shared W1–W4 controller / capsule validator integration is pending.</p>
              <button className="w-full rounded bg-slate-700 px-3 py-2 text-sm" onClick={runFixtures}>Evaluate standard fixtures</button>
              {fixtureResults && <div className="space-y-1 font-mono text-xs text-slate-300">
                {fixtureResults.map((result) => <div key={result.fixtureId}>{FIXTURES.find((fixture) => fixture.id === result.fixtureId)?.label}: {result.result}, {result.frames.length} frames, {result.traveledMeters.toFixed(2)} / {result.routeMeters.toFixed(2)} m, {result.durationSeconds.toFixed(2)} s, clearance {Number.isFinite(result.minClearanceM) ? `${result.minClearanceM.toFixed(2)} m` : 'n/a'}</div>)}
                <div className={goldenMatch ? 'text-emerald-300' : 'text-amber-300'}>Golden summary: {goldenMatch ? 'MATCH' : 'DIFF'} · {fixtureSummary?.clear} clear / {fixtureSummary?.blocked} blocked / {fixtureSummary?.routeMeters} m</div>
              </div>}
            </section>
            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Input record / replay</h2>
              <p className="text-xs text-slate-400">Transient controls with recorded frame deltas, separate from screen video · {inputCount} samples</p>
              <div className="flex flex-wrap gap-2">
                {captureMode.current !== 'record' ? <button className="rounded bg-slate-700 px-2 py-2 text-xs" onClick={startInputCapture}>Record inputs</button> : <button className="rounded bg-rose-800 px-2 py-2 text-xs" onClick={stopInputCapture}>Stop input record</button>}
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" onClick={replayInput}>Replay inputs</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" disabled={!inputTape.current.length} onClick={() => downloadJson('motion-lab-input-tape.json', { schemaVersion: 1, startPosition: inputOrigin.current, samples: inputTape.current })}>Export tape</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" disabled={!telemetry.current.length} onClick={() => downloadJson('motion-lab-telemetry.json', telemetry.current)}>Export telemetry</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs" disabled={!fixtureResults} onClick={() => downloadJson('motion-lab-fixture-summary.json', { fixtures: fixtureResults, golden: GOLDEN_FIXTURE_SUMMARY })}>Export fixture summary</button>
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
