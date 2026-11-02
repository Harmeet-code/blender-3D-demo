import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Group, PerspectiveCamera } from 'three';

type ViewMode = 'third' | 'first';

function MotionLabScene({ view, destination }: { view: ViewMode; destination: [number, number] }) {
  const avatar = useRef<Group>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const held = useRef(new Set<string>());
  const position = useRef<[number, number]>([-3, 0]);

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
    const keys = held.current;
    let x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let z = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    const length = Math.hypot(x, z) || 1;
    const speed = keys.has('shift') ? 3.2 : 1.8;
    position.current[0] += (x / length) * speed * delta;
    position.current[1] += (z / length) * speed * delta;
    if (avatar.current) {
      avatar.current.position.set(position.current[0], 0, position.current[1]);
      if (x || z) avatar.current.rotation.y = Math.atan2(x, z);
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
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRoute = useCallback(() => {
    setDestination([4, -2]);
    setStatus(`Route preview · ${from} → ${to}`);
  }, [from, to]);

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
          <div className="h-[min(68vh,680px)] min-h-[380px] overflow-hidden rounded-xl border border-slate-700 bg-slate-100">
            <Canvas shadows camera={{ position: [2, 4, 8], fov: 55 }}>
              <MotionLabScene view={view} destination={destination} />
            </Canvas>
          </div>
          <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div><h2 className="mb-2 font-medium">A → B route preview</h2><label className="mb-2 block text-xs text-slate-400">From<input className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="mb-3 block text-xs text-slate-400">To<input className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-white" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium" onClick={startRoute}>Preview route</button></div>
            <div><h2 className="mb-2 font-medium">Free walk</h2><p className="text-sm leading-6 text-slate-300">WASD or arrow keys move · Shift walks faster · V changes view</p></div>
            <div role="status" aria-live="polite" className="rounded bg-slate-800 p-3 text-sm text-emerald-200">{status}</div>
            <p className="text-xs leading-5 text-slate-500">Screen recording starts only after your click. The browser asks which screen or window to share; the resulting WebM downloads locally when stopped.</p>
          </aside>
        </section>
      </div>
    </main>
  );
}
