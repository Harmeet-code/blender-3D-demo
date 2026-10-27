import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import type { PlanObject } from '../model/types.ts';

/** Isolated workbench for furniture props: no venue client. */
export default function FurniturePreview() {
  const [bench] = useState<PlanObject>(() => createObject('bench', [-7, 0.5]));
  const [table, setTable] = useState<PlanObject>(() => ({
    ...createObject('table', [-3.5, 0]),
    tableChairs: '4-chairs' as const,
  }));
  const [barrier] = useState<PlanObject>(() => createObject('barrier', [0, 0.5]));
  const [planter, setPlanter] = useState<PlanObject>(() => createObject('planter', [2.8, 0]));
  const [bin, setBin] = useState<PlanObject>(() => ({
    ...createObject('bin', [5.2, 0.3]),
    dimensions: [1.8, 0.9, 0.6],
  }));
  const [topDown, setTopDown] = useState(false);
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Procedural furniture preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Bench · table + chairs · belt barrier · planter · waste station
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        <label>
          Table variant{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview table variant"
            value={table.tableVariant}
            onChange={(event) =>
              setTable((object) => ({
                ...object,
                tableVariant: event.target.value as PlanObject['tableVariant'],
              }))
            }
          >
            {['cocktail-standing', 'standard-dining', 'cloth-draped'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Foliage{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview foliage"
            value={planter.planterVariant}
            onChange={(event) =>
              setPlanter((object) => ({
                ...object,
                planterVariant: event.target.value as PlanObject['planterVariant'],
              }))
            }
          >
            {['tall-tree', 'hedge-box', 'flower-shrub'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Waste stream{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview waste stream"
            value={bin.binStream}
            onChange={(event) =>
              setBin((object) => ({
                ...object,
                binStream: event.target.value as PlanObject['binStream'],
              }))
            }
          >
            {['general-waste', 'recycling', 'organics'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          aria-pressed={topDown}
          onClick={() => setTopDown((value) => !value)}
        >
          {topDown ? 'Isometric view' : 'Top view'}
        </Button>
      </div>
      <div className="min-h-0 flex-1" aria-label="Furniture preview">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [4.5, 4, 7.5], fov: 42, near: 0.05, far: 100 }}
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
          <ProceduralObject object={bench} color="#b7a386" topDown={topDown} />
          <ProceduralObject object={table} color="#c6b99d" topDown={topDown} />
          <ProceduralObject object={barrier} color="#adb6c0" topDown={topDown} />
          <ProceduralObject object={planter} color="#9ab594" topDown={topDown} />
          <ProceduralObject object={bin} color="#9ba8b0" topDown={topDown} />
          <OrbitControls
            makeDefault
            target={[-1, 0.5, 0]}
            minDistance={2}
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
