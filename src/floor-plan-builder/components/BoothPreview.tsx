import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { boothDesignSchema, type BoothDesign } from '../model/booth-schema.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import type { PlanObject } from '../model/types.ts';

function CameraPreset({ top }: { top: boolean }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...((top ? [0, 15, 0.01] : [7, 6, 10]) as [number, number, number]));
    camera.lookAt(0, 1, 0);
    if (controls && 'target' in controls) {
      (
        controls as unknown as {
          target: { set: (x: number, y: number, z: number) => void };
          update: () => void;
        }
      ).target.set(0, 1, 0);
      (controls as unknown as { update: () => void }).update();
    }
    invalidate();
  }, [camera, controls, top, invalidate]);
  return null;
}
function polygonExample(shape: 'L' | 'U'): PlanObject {
  const points: [number, number][] =
    shape === 'L'
      ? [
          [-2, -2],
          [2, -2],
          [2, 0],
          [0, 0],
          [0, 2],
          [-2, 2],
        ]
      : [
          [-2.5, -2],
          [2.5, -2],
          [2.5, 2],
          [1, 2],
          [1, -0.5],
          [-1, -0.5],
          [-1, 2],
          [-2.5, 2],
        ];
  const open = shape === 'L' ? [1, 4] : [2, 6];
  return {
    ...createObject('polygon-booth', [3, 0]),
    polygon: points,
    dimensions: [shape === 'L' ? 4 : 5, 2.6, 4],
    company: 'FORM STUDIO',
    boothNumber: 'B-202',
    boothDesign: boothDesignSchema.parse({
      layout: 'custom',
      edges: points.map((_, edge) => ({ edge, mode: open.includes(edge) ? 'open' : 'wall' })),
    }),
  };
}
/** Isolated visual workbench: no venue client, persisted state, uploads, or publication. */
export default function BoothPreview() {
  const [standard, setStandard] = useState<PlanObject>(() => ({
    ...createObject('booth', [-3.2, 0]),
    company: 'NORTHSTAR',
    boothNumber: 'A-101',
  }));
  const [polygon, setPolygon] = useState(() => polygonExample('L'));
  const [top, setTop] = useState(false);
  const update = (values: Partial<BoothDesign>) =>
    setStandard((object) => ({ ...object, boothDesign: { ...object.boothDesign!, ...values } }));
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Procedural booth preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Modular aluminum · laminate panels · carpet · generated signage
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        <label>
          Standard layout{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview standard layout"
            value={standard.boothDesign!.layout}
            onChange={(event) => update({ layout: event.target.value as BoothDesign['layout'] })}
          >
            {['inline', 'corner', 'peninsula', 'island'].map((layout) => (
              <option key={layout}>{layout}</option>
            ))}
          </select>
        </label>
        <label>
          Polygon shape{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview polygon shape"
            onChange={(event) => setPolygon(polygonExample(event.target.value as 'L' | 'U'))}
          >
            <option value="L">L shape</option>
            <option value="U">U shape</option>
          </select>
        </label>
        <label>
          Polygon roof{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview polygon roof"
            value={polygon.boothDesign!.roof}
            onChange={(event) =>
              setPolygon((object) => ({
                ...object,
                boothDesign: {
                  ...object.boothDesign!,
                  roof: event.target.value as BoothDesign['roof'],
                },
              }))
            }
          >
            {['open', 'truss', 'solid'].map((roof) => (
              <option key={roof}>{roof}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          aria-pressed={standard.boothDesign!.storage}
          onClick={() => update({ storage: !standard.boothDesign!.storage })}
        >
          Storage closet
        </Button>
        {standard.boothDesign!.storage && (
          <Button
            variant="outline"
            onClick={() => update({ closetDoorOpen: !standard.boothDesign!.closetDoorOpen })}
          >
            {standard.boothDesign!.closetDoorOpen ? 'Close' : 'Open'} closet door
          </Button>
        )}
        <Button variant="outline" aria-pressed={top} onClick={() => setTop((value) => !value)}>
          {top ? 'Isometric view' : 'Top view'}
        </Button>
      </div>
      <div className="min-h-0 flex-1" aria-label="Booth material and geometry preview">
        <Canvas
          shadows
          frameloop="demand"
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
            <Lightformer
              position={[-6, 3, 4]}
              rotation-y={Math.PI / 3}
              scale={[4, 6, 1]}
              intensity={2}
              color="#E5F0FF"
            />
          </Environment>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#C2CBC7" roughness={0.92} />
          </mesh>
          <ProceduralObject object={standard} color="#334155" />
          <ProceduralObject object={polygon} color="#334155" />
          <OrbitControls
            makeDefault
            target={[0, 1, 0]}
            minDistance={3}
            maxDistance={35}
            maxPolarAngle={Math.PI / 2 - 0.025}
          />
          <CameraPreset top={top} />
        </Canvas>
      </div>
      <footer className="border-t border-white/10 px-5 py-3 text-sm text-slate-400">
        Drag to orbit · scroll to inspect panel joints · no event data is modified
      </footer>
    </main>
  );
}
