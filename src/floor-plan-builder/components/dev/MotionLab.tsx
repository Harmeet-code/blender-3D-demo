import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ProceduralObject } from '../ProceduralObject.tsx';
import type { PlanDocument } from '../../model/types.ts';
import type { Role } from '../../wayfinding/walkthrough/contracts.ts';
import { CHARACTER_CONFIG } from '../../wayfinding/walkthrough/character-config.ts';
import { WalkthroughLayer } from '../../wayfinding/walkthrough/WalkthroughLayer.tsx';
import { useWayfindingRoute } from '../../wayfinding/navigation/use-wayfinding-route.ts';
import { useWayfindingStore, selectActiveResult } from '../../wayfinding/store/wayfinding-store.ts';
import { usePlaybackStore } from '../../wayfinding/store/playback-store.ts';
import type { RouteRequest, RouteResult } from '../../wayfinding/model/route-schema.ts';
import { MotionLabTelemetryProbe, MotionLabInputProbe, type MotionLabInputState, type MotionLabTelemetry, type RecordedInput } from './motion-lab/TelemetryProbe.tsx';
import { runSharedRouteFuzzer, simulateSharedRoute, STANDARD_ROUTE_FIXTURES, type FixtureSummary } from './motion-lab/diagnostics.ts';
import { createMotionLabDocument, createMotionLabZones, MOTION_LAB_ROLE_AREAS, MOTION_LAB_STOPS } from './motion-lab/world.ts';

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ReplayContext = {
  routeRequest: RouteRequest;
  routeResult: RouteResult;
  routeOption: 'shortest' | 'accessible';
  role: Role;
  floorId: string;
  characterConfigId: typeof CHARACTER_CONFIG.id;
};

function currentReplayContext(activeRoute: RouteResult | null, role: Role, floorId: string): ReplayContext | null {
  const state = useWayfindingStore.getState();
  if (!activeRoute || !state.request) return null;
  return { routeRequest: state.request, routeResult: activeRoute, routeOption: state.option, role, floorId, characterConfigId: CHARACTER_CONFIG.id };
}

function snapshotReplayContext(context: ReplayContext): ReplayContext {
  return JSON.parse(JSON.stringify(context)) as ReplayContext;
}

function sparkline(frames: MotionLabTelemetry[], metric: (frame: MotionLabTelemetry) => number | null) {
  const values = frames.map(metric);
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return '';
  const min = Math.min(...finite), max = Math.max(...finite), span = max - min || 1;
  const path: string[] = [];
  let inSegment = false;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) { inSegment = false; return; }
    const x = values.length <= 1 ? 100 : (index / (values.length - 1)) * 200;
    const y = 34 - ((value - min) / span) * 30;
    path.push(`${inSegment ? 'L' : 'M'}${x},${y}`);
    inSegment = true;
  });
  return path.join(' ');
}

function vectorLength(value: readonly number[]) {
  return Math.hypot(...value);
}

function MotionLabStage({
  document,
  floorId,
  role,
  activeRoute,
  destination,
  telemetry,
  onFrame,
  captureMode,
  heldInput,
  inputTape,
  replayEpoch,
  onInputCount,
  onReplayComplete,
  onFloor,
}: {
  document: PlanDocument;
  floorId: string;
  role: Role;
  activeRoute: ReturnType<typeof selectActiveResult>;
  destination: [number, number];
  telemetry: MutableRefObject<MotionLabTelemetry[]>;
  onFrame: (frame: MotionLabTelemetry) => void;
  captureMode: MutableRefObject<'idle' | 'record' | 'replay'>;
  heldInput: MutableRefObject<MotionLabInputState>;
  inputTape: MutableRefObject<RecordedInput[]>;
  replayEpoch: MutableRefObject<number>;
  onInputCount: (count: number) => void;
  onReplayComplete: () => void;
  onFloor: (id: string) => void;
}) {
  const floor = document.floors.find((item) => item.source.id === floorId) ?? document.floors[0]!;
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 9, 5]} intensity={1.8} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.055, 0]} receiveShadow>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial color="#e6e9ed" roughness={0.92} />
      </mesh>
      <gridHelper args={[20, 20, '#8793a0', '#c6ccd4']} position={[0, 0, 0]} />
      {floor.objects.map((object) => (
        <ProceduralObject key={object.id} object={object} color={object.recipe === 'booth' ? '#8aa5b8' : object.color} windSway={false} />
      ))}
      {activeRoute?.segments.filter((segment) => segment.floorId === floorId).map((segment, index) => (
        <Line key={`${segment.floorId}:${index}`} points={segment.points} color="#4f46e5" lineWidth={2.5} />
      ))}
      <mesh position={[destination[0], 0.025, destination[1]]}>
        <cylinderGeometry args={[0.34, 0.34, 0.05, 24]} />
        <meshStandardMaterial color="#2f9e74" />
      </mesh>
      <WalkthroughLayer document={document} floorId={floorId} role={role} roleAreas={MOTION_LAB_ROLE_AREAS} onFloor={(id) => { onFloor(id); return true; }} />
      <MotionLabTelemetryProbe document={document} role={role} roleAreas={MOTION_LAB_ROLE_AREAS} frames={telemetry} onFrame={onFrame} />
      <MotionLabInputProbe captureMode={captureMode} heldInput={heldInput} tape={inputTape} replayEpoch={replayEpoch} onSampleCount={onInputCount} onReplayComplete={onReplayComplete} />
    </>
  );
}

export default function MotionLab() {
  const document = useMemo(createMotionLabDocument, []);
  const floorId = document.floors[0]!.source.id;
  const zones = useMemo(() => createMotionLabZones(floorId), [floorId]);
  const [role, setRole] = useState<Role>('visitor');
  const [fromStop, setFromStop] = useState(MOTION_LAB_STOPS[0]!.id);
  const [toStop, setToStop] = useState(MOTION_LAB_STOPS[2]!.id);
  const [selectedFloorId, setSelectedFloorId] = useState(floorId);
  const [destination, setDestination] = useState<[number, number]>([8, 0]);
  const [statusMessage, setStatusMessage] = useState('Ready · find an A-to-B route to mount the shared walker');
  const [fixtureResults, setFixtureResults] = useState<FixtureSummary[] | null>(null);
  const [fuzzerSummary, setFuzzerSummary] = useState<ReturnType<typeof runSharedRouteFuzzer> | null>(null);
  const [seedText, setSeedText] = useState('20260619');
  const [liveFrame, setLiveFrame] = useState<MotionLabTelemetry | null>(null);
  const [inputCount, setInputCount] = useState(0);
  const [videoRecording, setVideoRecording] = useState(false);
  const telemetry = useRef<MotionLabTelemetry[]>([]);
  const inputTape = useRef<RecordedInput[]>([]);
  const inputTapeContext = useRef<ReplayContext | null>(null);
  const heldInput = useRef<MotionLabInputState>({ forward: 0, strafe: 0, sprint: false });
  const captureMode = useRef<'idle' | 'record' | 'replay'>('idle');
  const replayEpoch = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  useWayfindingRoute(document, 0, zones, setStatusMessage);
  const routeStatus = useWayfindingStore((state) => state.status);
  const routeFailure = useWayfindingStore((state) => state.outcome?.failure ?? state.failure);
  const routeOption = useWayfindingStore((state) => state.option);
  const activeRoute = useWayfindingStore(selectActiveResult);
  const liveReplayContext = currentReplayContext(activeRoute, role, floorId);
  const replayMatchesContext = !!inputTape.current.length && !!inputTapeContext.current && !!liveReplayContext
    && JSON.stringify(inputTapeContext.current) === JSON.stringify(liveReplayContext);
  const setRouteOption = useWayfindingStore((state) => state.setOption);
  const playback = usePlaybackStore((state) => state.session);
  const playbackStatus = usePlaybackStore((state) => state.status);
  const playbackMessage = usePlaybackStore((state) => state.message);
  const viewMode = usePlaybackStore((state) => state.mode === 'first' ? 'first' : 'chase');

  useEffect(() => {
    const held = new Set<string>();
    const update = () => {
      heldInput.current = {
        forward: (Number(held.has('KeyW') || held.has('ArrowUp')) - Number(held.has('KeyS') || held.has('ArrowDown'))) as -1 | 0 | 1,
        strafe: (Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft'))) as -1 | 0 | 1,
        sprint: held.has('ShiftLeft') || held.has('ShiftRight'),
      };
    };
    const down = (event: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      held.add(event.code);
      update();
    };
    const up = (event: KeyboardEvent) => { held.delete(event.code); update(); };
    const clear = () => { held.clear(); update(); };
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
  }, [document]);

  const onTelemetry = useCallback((frame: MotionLabTelemetry) => setLiveFrame(frame), []);
  const onInputCount = useCallback((count: number) => setInputCount(count), []);
  const onReplayComplete = useCallback(() => setStatusMessage('Input replay finished in the shared walker; compare the exported resolved telemetry.'), []);
  const onFloor = useCallback((id: string) => setSelectedFloorId(id), []);

  const requestRoute = () => {
    const start = MOTION_LAB_STOPS.find((stop) => stop.id === fromStop);
    const dest = MOTION_LAB_STOPS.find((stop) => stop.id === toStop);
    if (!start || !dest) return;
    setDestination(dest.point);
    useWayfindingStore.getState().setRequest({
      start: { floorId, kind: 'point', point: start.point },
      dest: { floorId, kind: 'point', point: dest.point },
      accessibleOnly: routeOption === 'accessible',
      allowRestricted: role === 'staff',
    } satisfies RouteRequest);
    setStatusMessage(`Requesting ${routeOption} route · ${start.label} → ${dest.label}`);
  };

  const startSharedAutoWalk = () => {
    if (!activeRoute) return;
    usePlaybackStore.getState().begin(activeRoute, document, floorId);
    setSelectedFloorId(floorId);
    setStatusMessage('Shared auto-walk started · W1–W5 runtime and capsule controller');
  };
  const toggleWalk = () => {
    usePlaybackStore.getState().toggle();
    setStatusMessage(playbackStatus === 'playing' ? 'Auto-walk stopped · WASD / arrows can steer manually' : 'Auto-walk resumed');
  };
  const exitWalk = () => {
    captureMode.current = 'idle';
    usePlaybackStore.getState().exit();
    setSelectedFloorId(floorId);
    setStatusMessage('Walk session exited');
  };
  const toggleView = () => usePlaybackStore.getState().setMode(viewMode === 'first' ? 'chase' : 'first');

  const runFixtures = () => {
    const results = STANDARD_ROUTE_FIXTURES.map((fixture) => simulateSharedRoute(fixture, role));
    setFixtureResults(results);
    setStatusMessage('Standard route diagnostics completed with shared steerRoute and capsule clearance');
  };
  const runFuzzer = () => {
    const seed = Number(seedText);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      setStatusMessage('Fuzzer seed must be an unsigned 32-bit integer');
      return;
    }
    setFuzzerSummary(runSharedRouteFuzzer(seed));
  };
  const fixtureOutcomesMatch = fixtureResults !== null && fixtureResults.length === STANDARD_ROUTE_FIXTURES.length && fixtureResults.every((result) => result.actualOutcome === result.expectedOutcome);

  const startInputRecord = () => {
    const provenance = currentReplayContext(activeRoute, role, floorId);
    if (!provenance) { setStatusMessage('Find a resolved route request before recording walker inputs'); return; }
    usePlaybackStore.getState().begin(activeRoute, document, floorId);
    usePlaybackStore.getState().toggle();
    inputTape.current = [];
    inputTapeContext.current = snapshotReplayContext(provenance);
    telemetry.current = [];
    setInputCount(0);
    captureMode.current = 'record';
    setStatusMessage('Recording 30 Hz held input from the route start; WASD / arrows / Shift');
  };
  const stopInputRecord = () => {
    captureMode.current = 'idle';
    setInputCount(inputTape.current.length);
    setStatusMessage(`Input recording stopped · ${inputTape.current.length} samples`);
  };
  const replayInputs = () => {
    const currentContext = currentReplayContext(activeRoute, role, floorId);
    if (!inputTape.current.length || !inputTapeContext.current || !currentContext) { setStatusMessage('Record inputs from a resolved route before replay'); return; }
    if (JSON.stringify(inputTapeContext.current) !== JSON.stringify(currentContext)) {
      setStatusMessage('Replay blocked: current route request/result, route policy, role, floor, or character profile differs from the recorded tape.');
      return;
    }
    usePlaybackStore.getState().begin(activeRoute, document, floorId);
    usePlaybackStore.getState().toggle();
    telemetry.current = [];
    replayEpoch.current++;
    captureMode.current = 'replay';
    setStatusMessage(`Replaying ${inputTape.current.length} input ticks with matching recorded route provenance`);
  };

  const startVideoCapture = async () => {
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.current = capture;
      chunks.current = [];
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(capture, mimeType ? { mimeType } : undefined);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = `motion-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        capture.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        setVideoRecording(false);
      };
      capture.getVideoTracks()[0]?.addEventListener('ended', () => { if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }, { once: true });
      mediaRecorder.start(250);
      setVideoRecording(true);
      setStatusMessage('Screen recording started · choose the browser window containing the shared auto-walker');
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Capture unavailable · ${error.message}` : 'Capture unavailable');
    }
  };
  const stopVideoCapture = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else stream.current?.getTracks().forEach((track) => track.stop());
  };
  useEffect(() => () => {
    captureMode.current = 'idle';
    if (recorder.current?.state !== 'inactive') recorder.current?.stop();
    else stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const trail = telemetry.current.slice(-60);
  const currentSpeed = liveFrame ? vectorLength(liveFrame.frame.velocity) : 0;

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Development tool · shared walker</p><h1 className="text-2xl font-semibold">Motion Lab</h1></div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-slate-700 px-3 py-2 text-sm" disabled={!playback} onClick={toggleView}>View: {viewMode === 'first' ? 'First person' : 'Third person'} (V)</button>
            <button className="rounded-md bg-rose-700 px-3 py-2 text-sm" disabled={!playback} onClick={videoRecording ? stopVideoCapture : startVideoCapture}>{videoRecording ? 'Stop & save WebM' : 'Record screen'}</button>
          </div>
        </header>
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="relative h-[min(70vh,720px)] min-h-[420px] overflow-hidden rounded-xl border border-slate-700 bg-slate-100">
            <Canvas shadows camera={{ position: [0, 10, 15], fov: 52 }}>
              <MotionLabStage document={document} floorId={selectedFloorId} role={role} activeRoute={activeRoute} destination={destination} telemetry={telemetry} onFrame={onTelemetry} captureMode={captureMode} heldInput={heldInput} inputTape={inputTape} replayEpoch={replayEpoch} onInputCount={onInputCount} onReplayComplete={onReplayComplete} onFloor={onFloor} />
            </Canvas>
            <div className="pointer-events-none absolute left-3 top-3 max-w-[95%] rounded-md bg-slate-950/90 px-3 py-2 font-mono text-xs text-emerald-200" aria-live="polite">
              <div>resolved tick {liveFrame?.frame.tick ?? 0} · {liveFrame?.frame.locomotion ?? 'idle'} · floor {liveFrame?.frame.floorId ?? '—'}</div>
              <div>pos {liveFrame?.frame.position.map((value) => value.toFixed(2)).join(', ') ?? '—'} · yaw {liveFrame?.frame.yawRadians.toFixed(2) ?? '—'} rad</div>
              <div>speed {currentSpeed.toFixed(2)} m/s · accel {liveFrame ? vectorLength(liveFrame.accelerationMps2).toFixed(2) : '—'} · jerk {liveFrame ? vectorLength(liveFrame.jerkMps3).toFixed(2) : '—'}</div>
              {liveFrame?.derivativeResetReason && <div className="text-amber-200">Derivative baseline reset: {liveFrame.derivativeResetReason}</div>}
              <div>clearance {liveFrame?.clearance.clear === null ? 'connector validator only' : liveFrame?.clearance.clear ? 'capsule sweep clear' : 'blocked / unavailable'} · feet {liveFrame?.feet.basis === 'connector-foot-data-unavailable' ? 'connector samples unavailable' : liveFrame ? `${liveFrame.feet.stance[0] ? 'L stance estimate' : 'L swing estimate'}, ${liveFrame.feet.stance[1] ? 'R stance estimate' : 'R swing estimate'}` : '—'}</div>
              {liveFrame?.clearance.reason && <div className="max-w-lg whitespace-normal text-amber-200">{liveFrame.clearance.blockerId ?? liveFrame.clearance.reason}</div>}
            </div>
          </div>
          <aside className="max-h-[70vh] space-y-4 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-4">
            <section className="space-y-2">
              <h2 className="font-medium">Shared Recast A → B</h2>
              <label className="block text-xs text-slate-400">Runtime role<select disabled={!!playback} className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="visitor">Visitor</option><option value="staff">Staff</option></select></label>
              <label className="block text-xs text-slate-400">From<select disabled={!!playback} className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={fromStop} onChange={(event) => setFromStop(event.target.value)}>{MOTION_LAB_STOPS.map((stop) => <option key={stop.id} value={stop.id}>{stop.label}</option>)}</select></label>
              <label className="block text-xs text-slate-400">To<select disabled={!!playback} className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={toStop} onChange={(event) => setToStop(event.target.value)}>{MOTION_LAB_STOPS.map((stop) => <option key={stop.id} value={stop.id}>{stop.label}</option>)}</select></label>
              <div className="flex gap-2"><button disabled={!!playback} className="flex-1 rounded bg-slate-700 px-2 py-2 text-sm disabled:opacity-50" aria-pressed={routeOption === 'shortest'} onClick={() => setRouteOption('shortest')}>Shortest</button><button disabled={!!playback} className="flex-1 rounded bg-slate-700 px-2 py-2 text-sm disabled:opacity-50" aria-pressed={routeOption === 'accessible'} onClick={() => setRouteOption('accessible')}>Accessible</button></div>
              <button disabled={!!playback} className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium disabled:opacity-50" onClick={requestRoute}>Find route</button>
              <div role="status" aria-live="polite" className="rounded bg-slate-800 p-2 text-xs text-slate-200">{routeStatus === 'routing' ? 'Routing…' : routeFailure ?? (activeRoute ? `${activeRoute.lengthM.toFixed(1)} m · ~${Math.round(activeRoute.secondsEta)} s · ${activeRoute.segments.length} route legs` : 'Choose A and B, then find a route')}</div>
              {activeRoute?.warnings.map((warning) => <p key={warning} className="text-xs text-amber-200">{warning}</p>)}
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-emerald-800 px-2 py-2 text-xs disabled:opacity-50" disabled={!activeRoute || !!playback} onClick={startSharedAutoWalk}>Start shared auto-walk</button>
                {playback && <button className="rounded bg-amber-800 px-2 py-2 text-xs" onClick={toggleWalk}>{playbackStatus === 'playing' ? 'Stop / steer manually' : 'Resume auto-walk'}</button>}
                {playback && <button className="rounded bg-slate-700 px-2 py-2 text-xs" onClick={exitWalk}>Exit walk</button>}
              </div>
              {playbackMessage && <p className="text-xs text-amber-200">{playbackMessage}</p>}
              {playback && <p className="text-xs text-slate-400">Profile: radius {CHARACTER_CONFIG.radiusM.toFixed(2)} m · total height {CHARACTER_CONFIG.heightM.toFixed(2)} m. Manual steering is active while route playback is paused. WalkthroughLayer owns the Rapier capsule, shared sweep gate, avatar rig, camera and distance gait.</p>}
            </section>

            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Resolved telemetry</h2>
              <p className="text-xs text-slate-400">Observational telemetry sampled after the mounted follower frame update. Velocity, acceleration and jerk use observed frame intervals; a boundary frame resets derivatives on playback or floor changes. Tick is per playback generation, identified in each frame. This is not deterministic fixed-tick output, and no numeric motion thresholds have been approved.</p>
              <svg viewBox="0 0 200 38" className="h-12 w-full rounded bg-slate-950 p-1" role="img" aria-label="Observed speed, acceleration and jerk trends">
                <path d={sparkline(trail, (frame) => vectorLength(frame.frame.velocity))} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
                <path d={sparkline(trail, (frame) => vectorLength(frame.accelerationMps2))} fill="none" stroke="#fbbf24" strokeWidth="1.2" />
                <path d={sparkline(trail, (frame) => vectorLength(frame.jerkMps3))} fill="none" stroke="#f472b6" strokeWidth="1.2" />
              </svg>
              <p className="text-xs text-slate-400">Blue speed · amber acceleration · pink jerk; series normalize independently. Gaze vector: {liveFrame?.gazeDirection.map((value) => value.toFixed(2)).join(', ') ?? '—'}.</p>
              <svg viewBox="0 0 200 38" className="h-12 w-full rounded bg-slate-950 p-1" role="img" aria-label="Recent clearance decisions and estimated left and right foot stance states">
                <path d={sparkline(trail, (frame) => frame.clearance.clear === null ? null : Number(frame.clearance.clear))} fill="none" stroke="#2dd4bf" strokeWidth="1.5" />
                <path d={sparkline(trail, (frame) => Number(frame.feet.stance[0]))} fill="none" stroke="#c084fc" strokeWidth="1.2" />
                <path d={sparkline(trail, (frame) => Number(frame.feet.stance[1]))} fill="none" stroke="#f9a8d4" strokeWidth="1.2" />
              </svg>
              <p className="text-xs text-slate-400">Teal clearance decision (gaps mean unavailable) · purple/pink left/right stance estimates. Feet are gait estimates, not measured contact; unavailable connector clearance remains unverified.</p>
              <p className="text-xs text-slate-400">Flat-walk feet are world targets from the shared gait phase; contact is an estimate, not Rapier foot contact. Connector-specific foot samples are unavailable here. Capsule gate reports clear/blocker/source; the shared validator does not expose numeric wall clearance.</p>
              <p className="text-xs text-slate-400">Floor transition: {liveFrame?.floorInteraction.changedFromFloorId ? `${liveFrame.floorInteraction.changedFromFloorId} → ${liveFrame.floorInteraction.floorId}` : liveFrame?.floorInteraction.floorId ?? '—'} · connector phase {liveFrame?.floorInteraction.connectorPhase ?? 'none'}.</p>
              <button className="rounded bg-slate-700 px-2 py-2 text-xs disabled:opacity-50" disabled={!telemetry.current.length} onClick={() => downloadJson('motion-lab-runtime-telemetry.json', { schemaVersion: 2, frames: telemetry.current })}>Export telemetry</button>
            </section>

            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Input record / replay</h2>
              <p className="text-xs text-slate-400">Fixed 30 Hz held-input samples are bound to the recorded route request/result, route option, role, floor, and character profile. Rapier and render scheduling still determine resolved trajectory details, so replay is not deterministic.</p>
              <div className="flex flex-wrap gap-2">
                {captureMode.current === 'record' ? <button className="rounded bg-rose-800 px-2 py-2 text-xs" onClick={stopInputRecord}>Stop input record</button> : <button className="rounded bg-slate-700 px-2 py-2 text-xs disabled:opacity-50" disabled={!liveReplayContext || !!playback} onClick={startInputRecord}>Record inputs</button>}
                <button className="rounded bg-slate-700 px-2 py-2 text-xs disabled:opacity-50" disabled={!replayMatchesContext || !!playback} onClick={replayInputs}>Replay recorded context</button>
                <button className="rounded bg-slate-700 px-2 py-2 text-xs disabled:opacity-50" disabled={!inputTape.current.length} onClick={() => downloadJson('motion-lab-input-tape.json', { schemaVersion: 2, provenance: inputTapeContext.current, samples: inputTape.current })}>Export tape</button>
              </div>
              <p className="font-mono text-xs text-slate-400">{inputCount} samples · {inputTapeContext.current ? replayMatchesContext ? 'recorded provenance matches' : 'recorded provenance does not match current route context' : 'no recorded provenance'} · transient local input, separate from video capture</p>
            </section>

            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Fixed-step headless diagnostics</h2>
              <p className="text-xs text-slate-400">Uses a 1/30 s pure simulation with W1 CHARACTER_CONFIG, W3 validateCapsuleSweep and W4 steerRoute. It does not submit frames to Rapier and is not numerically comparable to the live observational telemetry.</p>
              <button className="w-full rounded bg-slate-700 px-3 py-2 text-sm" onClick={runFixtures}>Run standard route diagnostics</button>
              {fixtureResults && <div className="space-y-1 font-mono text-xs text-slate-300">{fixtureResults.map((result) => <div key={result.fixtureId}>{STANDARD_ROUTE_FIXTURES.find((item) => item.id === result.fixtureId)?.label}: {result.actualOutcome} (reference {result.expectedOutcome}) · {result.resolvedMeters.toFixed(2)}/{result.routeMeters.toFixed(2)} m · {result.elapsedSeconds.toFixed(2)} s · stop tick {result.stopTick ?? '—'} · max accel {result.maxAccelerationMps2.toFixed(2)} · max jerk {result.maxJerkMps3.toFixed(2)} · endpoint {result.endpoint.clear ? 'clear' : result.endpoint.blockerId ?? 'blocked'}</div>)}<div className="text-amber-300">Fixture references {fixtureOutcomesMatch ? 'match' : 'differ'}; this is diagnostic output, not production golden evidence. No numeric motion acceptance thresholds have been approved, so acceleration, jerk, duration, clearance and endpoint metrics do not pass/fail a threshold gate. Numeric wall margin is unavailable.</div></div>}
              <button className="rounded bg-slate-700 px-2 py-2 text-xs disabled:opacity-50" disabled={!fixtureResults} onClick={() => downloadJson('motion-lab-fixture-summary.json', { schemaVersion: 1, fixtures: fixtureResults, references: STANDARD_ROUTE_FIXTURES.map(({ id, points, expectedOutcome }) => ({ id, routeMeters: points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1], point[2] - points[index]![2]), 0), expectedOutcome })), thresholdStatus: 'unapproved-not-evaluated', limitations: ['No connector/floor-transition fixture is available in this synthetic one-floor document.', 'The shared capsule gate returns blocker decisions, not a numeric wall-margin measurement.', 'Avatar foot positions are gait-phase targets, not physics contacts.', 'Fixture expectations are authored alongside their generated obstacle scenarios and are diagnostic, not an independent oracle.', 'No numeric acceleration, jerk, duration, clearance, or endpoint thresholds have been approved.'] })}>Export fixture summaries</button>
            </section>

            <section className="space-y-2 border-t border-slate-700 pt-3">
              <h2 className="font-medium">Seeded shared-route fuzzer</h2>
              <label className="block text-xs text-slate-400">Seed<input className="mt-1 w-full rounded bg-slate-800 px-2 py-2 font-mono text-sm text-white" value={seedText} onChange={(event) => setSeedText(event.target.value)} /></label>
              <button className="w-full rounded bg-slate-700 px-3 py-2 text-sm" onClick={runFuzzer}>Generate 32 route cases</button>
              {fuzzerSummary && <p className="font-mono text-xs text-slate-300">seed {fuzzerSummary.seed} · {fuzzerSummary.count} cases · {fuzzerSummary.clear} clear / {fuzzerSummary.blocked} blocked · {fuzzerSummary.mismatches} expected-outcome mismatches. {fuzzerSummary.limitation}</p>}
            </section>

            <p className="border-t border-slate-700 pt-3 text-xs leading-5 text-slate-500">The browser screen-capture prompt starts only after your click. It records the shared walker viewport and saves WebM locally. This synthetic demo has no authored connector records; production connector transitions, clearance and foot data are unavailable and remain unverified until real linked records are supplied.</p>
            <div role="status" aria-live="polite" className="rounded bg-slate-800 p-3 text-sm text-emerald-200">{statusMessage}</div>
          </aside>
        </section>
      </div>
    </main>
  );
}
