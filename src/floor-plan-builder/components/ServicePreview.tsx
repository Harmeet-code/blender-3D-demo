import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import type { PlanObject } from '../model/types.ts';

function PreviewCamera({ topDown, focus }: { topDown: boolean; focus: PlanObject | undefined }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const [x, z] = focus?.position ?? [-1, 0];
    const objectSize = focus
      ? Math.max(...focus.dimensions, focus.recipe === 'information' ? focus.infoSignHeight : 0)
      : 8;
    const distance = focus ? objectSize * 2.1 : 17;
    camera.up.set(0, 1, 0);
    camera.position.set(
      x + (topDown ? 0 : distance * 0.55),
      topDown ? distance : distance * 0.6,
      z + (topDown ? 0 : distance),
    );
    camera.lookAt(x, topDown ? 0 : 1, z);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, focus, topDown, invalidate]);
  const span = focus
    ? Math.max(
        2,
        focus.dimensions[0] * 1.8,
        focus.dimensions[2] +
          (focus.recipe === 'food-kiosk'
            ? focus.kioskQueueDepth + 1
            : focus.recipe === 'exit'
              ? 3.5
              : 1),
      )
    : 20;
  return topDown ? (
    <OrthographicCamera
      makeDefault
      near={0.05}
      far={100}
      zoom={Math.min(size.width, size.height) / span}
    />
  ) : null;
}

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
  const [focusIndex, setFocusIndex] = useState(-1);
  const objects = [info, kiosk, water, aid, exit];
  const focus = objects[focusIndex];
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
          onClick={() => setFocusIndex((index) => (index + 1) % objects.length)}
        >
          Inspect next object
        </Button>
        <Button variant="outline" disabled={focusIndex < 0} onClick={() => setFocusIndex(-1)}>
          Show all objects
        </Button>
        <span aria-live="polite">{focus?.name ?? 'All services'}</span>
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
          frameloop="demand"
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [9, 8, 14], fov: 42, near: 0.05, far: 100 }}
        >
          <color attach="background" args={['#D8DFDD']} />
          <PreviewCamera topDown={topDown} focus={focus} />
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
            <Lightformer
              position={[-4, 3, 1]}
              rotation-y={Math.PI / 2}
              scale={[1, 5, 1]}
              intensity={3}
            />
            <Lightformer
              position={[4, 3, -1]}
              rotation-y={-Math.PI / 2}
              scale={[2, 5, 1]}
              intensity={2}
            />
          </Environment>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
            <planeGeometry args={[48, 48]} />
            <meshStandardMaterial color="#C2CBC7" roughness={0.92} />
          </mesh>
          {(!focus || focus.id === info.id) && (
            <ProceduralObject object={info} color="#dfceb1" topDown={topDown} />
          )}
          {(!focus || focus.id === kiosk.id) && (
            <ProceduralObject object={kiosk} color="#d8b594" topDown={topDown} />
          )}
          {(!focus || focus.id === water.id) && (
            <ProceduralObject object={water} color="#8ebbd5" topDown={topDown} />
          )}
          {(!focus || focus.id === aid.id) && (
            <ProceduralObject object={aid} color="#F8F9FA" topDown={topDown} />
          )}
          {(!focus || focus.id === exit.id) && (
            <ProceduralObject object={exit} color="#9fceaa" topDown={topDown} />
          )}
          <OrbitControls
            makeDefault
            target={[focus?.position[0] ?? -1, topDown ? 0 : 1, focus?.position[1] ?? 0]}
            minDistance={3}
            maxDistance={40}
            maxPolarAngle={topDown ? 0 : Math.PI / 2 - 0.025}
            enableRotate={!topDown}
          />
        </Canvas>
      </div>
      <footer className="border-t border-white/10 px-5 py-3 text-sm text-slate-400">
        Drag to orbit · no event data is modified
      </footer>
    </main>
  );
}
