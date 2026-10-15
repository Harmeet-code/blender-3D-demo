import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import type { PlanObject } from '../model/types.ts';

/** Isolated workbench for service counters and stations: no venue client. */
export default function ServicePreview() {
  const [info] = useState<PlanObject>(() => ({
    ...createObject('information', [-7.5, 0]),
    company: 'INFO',
  }));
  const [kiosk] = useState<PlanObject>(() => createObject('food-kiosk', [-4, 0]));
  const [water] = useState<PlanObject>(() => createObject('water', [-1, 1.5]));
  const [aid] = useState<PlanObject>(() => createObject('first-aid', [1.5, 0]));
  const [exit, setExit] = useState<PlanObject>(() => createObject('exit', [4.2, 0]));
  const [topDown, setTopDown] = useState(false);
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Procedural services preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Information desk · food kiosk · water station · first aid · emergency exit
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        <Button
          variant="outline"
          onClick={() => setExit((object) => ({ ...object, exitOpen: !object.exitOpen }))}
        >
          {exit.exitOpen ? 'Close' : 'Open'} exit door
        </Button>
        <Button
          variant="outline"
          aria-pressed={topDown}
          onClick={() => setTopDown((value) => !value)}
        >
          {topDown ? 'Isometric view' : 'Top view'}
        </Button>
      </div>
      <div className="min-h-0 flex-1" aria-label="Services preview">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [9, 8, 14], fov: 42, near: 0.05, far: 100 }}
        >
          <color attach="background" args={['#D8DFDD']} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[2, 10, 6]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
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
            <planeGeometry args={[48, 48]} />
            <meshStandardMaterial color="#C2CBC7" roughness={0.92} />
          </mesh>
          <ProceduralObject object={info} color="#dfceb1" topDown={topDown} />
          <ProceduralObject object={kiosk} color="#d8b594" topDown={topDown} />
          <ProceduralObject object={water} color="#8ebbd5" topDown={topDown} />
          <ProceduralObject object={aid} color="#F8F9FA" topDown={topDown} />
          <ProceduralObject object={exit} color="#9fceaa" topDown={topDown} />
          <OrbitControls
            makeDefault
            target={[-1, 1, 0]}
            minDistance={3}
            maxDistance={40}
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
