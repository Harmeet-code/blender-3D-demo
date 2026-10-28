import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Line, Lightformer, OrbitControls } from '@react-three/drei';
import { blankDocument, blankFloor } from '../model/adapter.ts';
import { StudioNavigator, type PlanRoute } from '../model/directions.ts';
import { createObject } from '../model/inventory.ts';
import { applyWashRackVariant } from '../model/wash-rack.ts';
import {
  washRackRowConnections,
} from '../model/wash-rack-spatial.ts';
import type { PlanObject } from '../model/types.ts';
import { Button } from '@/components/ui/button';
import { FloorSurface } from './FloorCanvas.tsx';
import { ProceduralObject } from './ProceduralObject.tsx';
import { PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

type PreviewFocus =
  | 'overview'
  | 'equestrian'
  | 'livestock'
  | 'vehicle'
  | 'vehicle-water'
  | 'row'
  | 'overhead';

const cameraTarget: Record<PreviewFocus, [number, number, number]> = {
  overview: [0, 0.7, 0],
  equestrian: [-12, 1.1, -5],
  livestock: [-5, 1.1, -5],
  vehicle: [2, 1.2, -5],
  'vehicle-water': [3.4, 1.1, -6.25],
  row: [10.8, 1.1, 3.5],
  overhead: [-5, 0.7, -5],
};

function PreviewCamera({ focus }: { focus: PreviewFocus }) {
  const { camera, controls, invalidate } = useThree();
  const [x, y, z] = cameraTarget[focus];
  useEffect(() => {
    const distance = focus === 'overview' ? 1 : focus === 'row' ? 0.68 : 0.75;
    const targetControls = controls as OrbitControlsImpl | null;
    if (focus === 'vehicle-water') {
      camera.up.set(0, 1, 0);
      camera.position.set(x - 2.2, 1.7, z - 7.75);
      (camera as PerspectiveCamera).zoom = 1.2;
      camera.lookAt(x, y, z);
      camera.updateProjectionMatrix();
      targetControls?.target.set(x, y, z);
      targetControls?.update();
      invalidate();
      return;
    }
    if (focus === 'overhead') {
      camera.up.set(0, 0, -1);
      camera.position.set(x, 22, z);
      camera.lookAt(x, y, z);
      (camera as PerspectiveCamera).zoom = 1.15;
      camera.updateProjectionMatrix();
      targetControls?.target.set(x, y, z);
      targetControls?.update();
      invalidate();
      return;
    }
    camera.up.set(0, 1, 0);
    camera.position.set(
      x + (focus === 'overview' ? 2 : focus === 'row' ? 4.3 : 3.5) * distance,
      focus === 'overview' ? 15 : focus === 'row' ? 8.5 : 5.5,
      z - (focus === 'overview' ? 25 : focus === 'row' ? 12 : 8) * distance,
    );
    (camera as PerspectiveCamera).zoom = focus === 'overview' ? 1 : focus === 'row' ? 1.08 : 1.35;
    camera.lookAt(x, y, z);
    camera.updateProjectionMatrix();
    targetControls?.target.set(x, y, z);
    targetControls?.update();
    invalidate();
  }, [camera, controls, focus, invalidate, x, y, z]);
  return null;
}

function makeRack(
  variant: 'equestrian' | 'livestock' | 'vehicle-bay',
  position: [number, number],
  wetness: number,
  running: boolean,
): PlanObject {
  const base = createObject('wash-rack', position);
  return {
    ...base,
    ...applyWashRackVariant(base, variant),
    washRackWetness: wetness,
    washRackRunning: running,
    washRackBoomAngle: 55,
  };
}

function makePreviewFloor(wetness: number, running: boolean) {
  const floor = blankFloor('Wash rack spatial and visual QA');
  floor.boundary = [
    [-22, -11],
    [22, -11],
    [22, 15],
    [-22, 15],
  ];
  const examples = [
    makeRack('equestrian', [-12, -5], 0, false),
    makeRack('livestock', [-5, -5], wetness, false),
    makeRack('vehicle-bay', [2, -5], 0.82, running),
  ];
  const bank = [
    makeRack('equestrian', [7.2, 3.5], 0.35, false),
    makeRack('equestrian', [10.8, 3.5], 0.35, false),
    makeRack('equestrian', [14.4, 3.5], 0.35, false),
  ];
  floor.objects = [...examples, ...bank];
  return { floor, objects: floor.objects };
}

/** Development-only scene for inspecting rack variants, floor cutouts and shared row topology. */
export default function WashRackPreview() {
  const [wetness, setWetness] = useState(0.72);
  const [running, setRunning] = useState(true);
  const [focus, setFocus] = useState<PreviewFocus>(() => {
    const requested = new URLSearchParams(location.search).get('washRackView');
    return requested === 'vehicle-water' ? requested : 'overview';
  });
  const [route, setRoute] = useState<PlanRoute | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'routing' | 'ready' | 'failed'>('idle');
  const scene = useMemo(() => makePreviewFloor(wetness, running), [wetness, running]);
  const traceRackRoute = async () => {
    setRouteState('routing');
    setRoute(null);
    const navigator = new StudioNavigator();
    const controller = new AbortController();
    const document = blankDocument('wash-rack-spatial-qa');
    document.floors = [scene.floor];
    document.baseline = { ...document.baseline, floors: [scene.floor.source] };
    const rack = scene.objects[1]!;
    const [rackX, rackZ] = rack.position;
    const depth = rack.dimensions[2] * rack.scale[2];
    const floorId = scene.floor.source.id;
    try {
      const result = await navigator.plan(
        document,
        { floorId, point: [rackX, rackZ - depth / 2 - 1.25] },
        { floorId, point: [rackX, rackZ + depth / 2 - 0.65] },
        controller.signal,
        {
          walkableZones: [{ id: 'wash-rack-qa-floor', floorId, polygon: scene.floor.boundary }],
          straight: true,
        },
      );
      setRoute(result);
      setRouteState('ready');
    } catch {
      setRouteState('failed');
    } finally {
      navigator.dispose();
    }
  };
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Wash rack spatial and visual QA</h1>
          <p className="mt-1 text-sm text-slate-400">
            Three specified variants, recessed floors on the real builder floor surface, and a compatible connected row.
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        {(['overview', 'equestrian', 'livestock', 'vehicle', 'vehicle-water', 'row', 'overhead'] as const).map((view) => (
          <Button
            key={view}
            variant={focus === view ? 'default' : 'outline'}
            aria-pressed={focus === view}
            onClick={() => setFocus(view)}
          >
            {view === 'vehicle'
              ? 'Vehicle bay'
              : view === 'vehicle-water'
                ? 'Vehicle spray'
              : view === 'row'
                ? 'Connected row'
                : view === 'overhead'
                  ? 'Overhead'
                  : view[0]!.toUpperCase() + view.slice(1)}
          </Button>
        ))}
        <Button variant="outline" aria-pressed={wetness > 0} onClick={() => setWetness(wetness > 0 ? 0 : 0.72)}>
          {wetness > 0 ? 'Set livestock floor dry' : 'Wet livestock floor'}
        </Button>
        <Button variant="outline" aria-pressed={running} onClick={() => setRunning((value) => !value)}>
          {running ? 'Stop vehicle water' : 'Run vehicle water'}
        </Button>
        <Button variant="outline" disabled={routeState === 'routing'} onClick={traceRackRoute}>
          {routeState === 'routing' ? 'Tracing entry route…' : 'Trace livestock entry route'}
        </Button>
        <span className="text-slate-400" aria-live="polite">
          {routeState === 'ready'
            ? 'Recast route reaches from the clear approach through the livestock stall.'
            : routeState === 'failed'
              ? 'No route connected through the livestock stall; inspect placement and barriers.'
              : `Livestock wetness ${Math.round(wetness * 100)}% · vehicle water ${running ? 'running' : 'off'} · structure stays full detail`}
        </span>
      </div>
      <div className="min-h-0 flex-1" aria-label="Wash rack variants and row preview">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [2, 15, -25], fov: 43, near: 0.05, far: 140 }}
        >
          <color attach="background" args={['#cbd4d1']} />
          <ambientLight intensity={0.72} />
          <directionalLight
            position={[-8, 15, -9]}
            intensity={2.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-25}
            shadow-camera-right={25}
            shadow-camera-top={18}
            shadow-camera-bottom={-18}
            shadow-normalBias={0.012}
          />
          <Environment resolution={64} frames={1}>
            <color attach="background" args={['#bdc9c8']} />
            <Lightformer position={[0, 8, 1]} rotation-x={Math.PI / 2} scale={[18, 8, 1]} intensity={2.3} />
            <Lightformer position={[-12, 5, -2]} rotation-y={Math.PI / 2} scale={[1, 8, 1]} intensity={2} />
            <Lightformer position={[12, 5, 4]} rotation-y={-Math.PI / 2} scale={[1, 8, 1]} intensity={2.4} />
          </Environment>
          <OrbitControls
            target={cameraTarget[focus]}
            makeDefault
            maxPolarAngle={focus === 'overhead' ? Math.PI / 2 : Math.PI * 0.48}
          />
          <PreviewCamera focus={focus} />
          <group>
            <FloorSurface
              floor={scene.floor}
              texture={null}
              imageSize={null}
              click={() => {}}
              move={() => {}}
              pointerDown={() => {}}
            />
            {scene.objects.map((object) => (
              <ProceduralObject
                key={object.id}
                object={object}
                color={object.color}
                rowConnections={washRackRowConnections(object, scene.objects)}
              />
            ))}
            {route?.segments.map((segment, index) => (
              <Line
                key={`route:${index}`}
                points={segment.points.map(([x, z]) => [x, 0.18, z])}
                color="#38bdf8"
                lineWidth={4}
                depthWrite={false}
              />
            ))}
          </group>
        </Canvas>
      </div>
    </main>
  );
}
