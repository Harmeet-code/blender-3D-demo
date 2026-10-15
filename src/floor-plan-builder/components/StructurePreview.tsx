import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import type { PlanObject } from '../model/types.ts';

/** Isolated workbench for tents + entrances: no venue client or persistence. */
export default function StructurePreview() {
  const [tent, setTent] = useState<PlanObject>(() => ({
    ...createObject('barn-tent', [-4.5, 0]),
    dimensions: [5, 3.5, 4],
    company: 'NORTHSTAR',
    boothNumber: 'T-01',
  }));
  const [entrance, setEntrance] = useState<PlanObject>(() => ({
    ...createObject('entrance', [4.5, 0]),
    dimensions: [4.8, 3, 0.6],
  }));
  const [topDown, setTopDown] = useState(false);
  const [windSway, setWindSway] = useState(true);
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Procedural structures preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Barn tent variants · sidewalls · flooring · entrance gates
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        <label>
          Tent variant{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview tent variant"
            value={tent.tentStyle}
            onChange={(event) =>
              setTent((object) => ({
                ...object,
                tentStyle: event.target.value as PlanObject['tentStyle'],
              }))
            }
          >
            {['barn', 'gazebo', 'marquee'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Sidewalls{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview sidewalls"
            value={tent.tentSidewall}
            onChange={(event) =>
              setTent((object) => ({
                ...object,
                tentSidewall: event.target.value as PlanObject['tentSidewall'],
              }))
            }
          >
            {['open', 'half', 'full', 'windows'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Flooring{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview flooring"
            value={tent.tentFlooring}
            onChange={(event) =>
              setTent((object) => ({
                ...object,
                tentFlooring: event.target.value as PlanObject['tentFlooring'],
              }))
            }
          >
            {['none', 'grass', 'wood-deck'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Gate{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview gate"
            value={entrance.entranceGate}
            onChange={(event) =>
              setEntrance((object) => ({
                ...object,
                entranceGate: event.target.value as PlanObject['entranceGate'],
              }))
            }
          >
            {['arch-sliding-doors', 'turnstile-lanes', 'open-arch'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() =>
            setEntrance((object) => ({ ...object, entranceOpen: !object.entranceOpen }))
          }
        >
          {entrance.entranceOpen ? 'Close' : 'Open'} doors
        </Button>
        <Button
          variant="outline"
          aria-pressed={topDown}
          onClick={() => setTopDown((value) => !value)}
        >
          {topDown ? 'Isometric view' : 'Top view'}
        </Button>
        <Button
          variant="outline"
          aria-pressed={windSway}
          onClick={() => setWindSway((value) => !value)}
        >
          Wind sway {windSway ? 'on' : 'off'}
        </Button>
      </div>
      <div className="min-h-0 flex-1" aria-label="Tent and entrance preview">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [8, 8, 13], fov: 42, near: 0.05, far: 100 }}
        >
          <color attach="background" args={['#D8DFDD']} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[2, 10, 6]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={8}
            shadow-camera-bottom={-8}
            shadow-normalBias={0.012}
          />
          <Environment resolution={64} frames={1}>
            <color attach="background" args={['#B7C3CA']} />
            <Lightformer
              position={[0, 6, 3]}
              rotation-x={Math.PI / 2}
              scale={[10, 5, 1]}
              intensity={2}
            />
          </Environment>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#C2CBC7" roughness={0.92} />
          </mesh>
          <ProceduralObject object={tent} color="#e4d5bc" topDown={topDown} windSway={windSway} />
          <ProceduralObject object={entrance} color="#87cdb9" topDown={topDown} />
          <OrbitControls
            makeDefault
            target={[0, 1, 0]}
            minDistance={3}
            maxDistance={35}
            maxPolarAngle={Math.PI / 2 - 0.025}
          />
        </Canvas>
      </div>
      <footer className="border-t border-white/10 px-5 py-3 text-sm text-slate-400">
        Drag to orbit · no event data is modified
      </footer>
    </main>
  );
}
