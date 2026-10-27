import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { fitCirculation, circulationMetrics } from '../model/circulation.ts';
import type { PlanObject } from '../model/types.ts';
import type { CirculationDesign } from '../model/circulation-schema.ts';
import { ProceduralObject } from './ProceduralObject.tsx';

const recipes = ['stairs', 'elevator', 'escalator', 'ramp'] as const;
/** Isolated workbench: never imports the event store or API client. */
export default function CirculationPreview() {
  const [objects, setObjects] = useState(() =>
    recipes.map((recipe) => createObject(recipe, [0, 0])),
  );
  const [selected, setSelected] = useState<(typeof recipes)[number] | 'all'>('all');
  const [top, setTop] = useState(false);
  const visible =
    selected === 'all' ? objects : objects.filter((object) => object.recipe === selected);
  const update = (recipe: string, values: Partial<CirculationDesign>) =>
    setObjects((items) =>
      items.map((object) =>
        object.recipe === recipe
          ? fitCirculation({
              ...object,
              circulationDesign: { ...object.circulationDesign!, ...values },
            })
          : object,
      ),
    );
  const elevator = objects.find((object) => object.recipe === 'elevator')!,
    escalator = objects.find((object) => object.recipe === 'escalator')!;
  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Procedural circulation collection</h1>
          <p className="mt-1 text-sm text-slate-400">
            Exposed aluminum · rubber grip · glass · working mechanical assemblies
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3 text-sm">
        <label>
          Inspect{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Inspect connector"
            value={selected}
            onChange={(event) => setSelected(event.target.value as typeof selected)}
          >
            <option value="all">Full collection</option>
            {recipes.map((recipe) => (
              <option key={recipe}>{recipe}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const design = objects[0]!.circulationDesign!;
            const layout = design.layout === 'straight' ? 'switchback' : 'straight';
            update('stairs', { layout });
            update('ramp', { layout });
          }}
        >
          Toggle switchbacks
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            update('elevator', {
              cabinLevel: elevator.circulationDesign!.cabinLevel === 'lower' ? 'upper' : 'lower',
            })
          }
        >
          Call elevator to {elevator.circulationDesign!.cabinLevel === 'lower' ? 'L2' : 'L1'}
        </Button>
        <Button
          variant="outline"
          onClick={() => update('elevator', { doorsOpen: !elevator.circulationDesign!.doorsOpen })}
        >
          {elevator.circulationDesign!.doorsOpen ? 'Close' : 'Open'} doors
        </Button>
        <Button
          variant="outline"
          onClick={() => update('escalator', { running: !escalator.circulationDesign!.running })}
        >
          {escalator.circulationDesign!.running ? 'Stop' : 'Start'} escalator
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            update('escalator', {
              direction: escalator.circulationDesign!.direction === 'UP' ? 'DOWN' : 'UP',
            })
          }
        >
          Direction: {escalator.circulationDesign!.direction}
        </Button>
        <Button variant="outline" aria-pressed={top} onClick={() => setTop(!top)}>
          {top ? 'Isometric view' : 'Top view'}
        </Button>
      </div>
      <div className="min-h-0 flex-1" aria-label="Interactive circulation models">
        <Canvas
          key={`${selected}:${top}`}
          frameloop="demand"
          shadows
          dpr={[1, 1.5]}
          camera={{
            position: top
              ? [0, selected === 'all' ? 24 : 12, 0.01]
              : selected === 'all'
                ? [12, 9, 15]
                : [7, 6, 10],
            fov: 42,
            near: 0.05,
            far: 150,
          }}
        >
          <color attach="background" args={['#D8DFDD']} />
          <ambientLight intensity={0.65} />
          <directionalLight
            position={[4, 12, 9]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-13}
            shadow-camera-right={13}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
            shadow-normalBias={0.015}
          />
          <Environment resolution={64} frames={1}>
            <color attach="background" args={['#B7C3CA']} />
            <Lightformer
              position={[0, 8, 4]}
              rotation-x={Math.PI / 2}
              scale={[18, 8, 1]}
              intensity={2}
            />
            <Lightformer
              position={[-7, 4, 5]}
              rotation-y={Math.PI / 3}
              scale={[5, 8, 1]}
              intensity={2}
              color="#E5F0FF"
            />
          </Environment>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.065, 0]} receiveShadow>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color="#BDC8C4" roughness={0.92} />
          </mesh>
          {visible.map((object, i) => (
            <ProceduralObject
              key={object.id}
              object={
                { ...object, position: [selected === 'all' ? (i - 1.5) * 4.2 : 0, 0] } as PlanObject
              }
              color={object.color}
            />
          ))}
          <OrbitControls
            makeDefault
            target={[0, top ? 0 : 1.5, 0]}
            minDistance={3}
            maxDistance={70}
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
        </Canvas>
      </div>
      <footer className="border-t border-white/10 px-5 py-3 text-sm text-slate-400">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {visible.map((object) => {
            const m = circulationMetrics(object);
            return (
              <span key={object.id}>
                {object.name}: {m.width.toFixed(2)} × {m.rise.toFixed(2)} rise ×{' '}
                {m.depth.toFixed(2)} m
              </span>
            );
          })}
        </div>
        <p className="mt-1">
          Drag to orbit · scroll for joints and grip detail · isolated preview, no event data
          changes
        </p>
      </footer>
    </main>
  );
}
