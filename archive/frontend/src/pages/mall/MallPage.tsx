import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import {
  ACESFilmicToneMapping,
  Color,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Button } from '@/components/ui/button';
import {
  GRAPHICS,
  useGraphicsQuality,
  type GraphicsMode,
} from '@/features/world/model/graphics-quality.ts';
import { AdaptiveGraphics } from '@/features/world/components/AdaptiveGraphics.tsx';
import { ShaderPreparation } from '@/features/world/components/ShaderPreparation.tsx';
import { retainViewer } from '@/features/assets/model/resource-cache.ts';
import { ProceduralMall } from '@/features/mall/components/ProceduralMall.tsx';
import { clearMallSceneDataCache } from '@/features/mall/model/mall-data.ts';
import type { MallView } from '@/features/mall/model/mall-types.ts';
export type { MallView };
import { useReducedMotion } from '@/features/world/hooks/use-reduced-motion.ts';
import manifest from '@/features/mall/model/mall-views.json';

RectAreaLightUniformsLib.init();
const ObjectLibrary = lazy(() =>
  import('@/features/mall/components/ObjectLibrary.tsx').then((module) => ({
    default: module.ObjectLibrary,
  })),
);
const isObjectLibrary = () =>
  new URLSearchParams(window.location.hash.split('?')[1]).get('objects') === '1';
const VIEW_LABELS = {
  exterior: 'Exterior · four floors',
  arrival: 'Promenade & canopy',
  atrium: 'Atrium · interior cutaway',
  parking: 'P1 · parking aisle',
  suv: 'P1 · SUV detail',
  pickup: 'P1 · pickup detail',
} as const;
export type Lighting = 'daylight' | 'twilight';

export function CameraRig({ view, reset }: { view: MallView; reset: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const reduced = useReducedMotion();
  const initialized = useRef(false);
  const transition = useRef<{
    from: Vector3;
    to: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    start: number;
  } | null>(null);
  useEffect(() => {
    const cancel = () => {
      transition.current = null;
    };
    window.addEventListener('pointerdown', cancel);
    window.addEventListener('wheel', cancel);
    return () => {
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('wheel', cancel);
    };
  }, []);
  useEffect(() => {
    const preset = manifest.views[view];
    const position = new Vector3(...(preset.position as [number, number, number]));
    const target = new Vector3(...(preset.target as [number, number, number]));
    // Match the native camera, pulling the exterior back on portrait displays.
    if (view === 'exterior') {
      position
        .sub(target)
        .multiplyScalar(Math.max(1, 1.45 / (size.width / size.height)))
        .add(target);
    }
    if (initialized.current && !reduced && controls.current) {
      transition.current = {
        from: camera.position.clone(),
        to: position,
        fromTarget: controls.current.target.clone(),
        toTarget: target,
        start: performance.now(),
      };
    } else {
      camera.position.copy(position);
      camera.lookAt(target);
      controls.current?.target.copy(target);
      controls.current?.update();
      initialized.current = true;
    }
    if (camera instanceof PerspectiveCamera) {
      camera.fov = view === 'exterior' ? 45 : Math.max(40, preset.fov);
      camera.near = view === 'exterior' ? 0.5 : 0.03;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, invalidate, reset, size.width, size.height, view, reduced]);
  useFrame(() => {
    const motion = transition.current;
    if (!motion || !controls.current) {
      return;
    }
    const progress = Math.min(1, (performance.now() - motion.start) / 400);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(motion.from, motion.to, eased);
    controls.current.target.lerpVectors(motion.fromTarget, motion.toTarget, eased);
    controls.current.update();
    if (progress === 1) {
      transition.current = null;
    } else {
      invalidate();
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={0.5}
      maxDistance={280}
      maxPolarAngle={Math.PI * 0.95}
      enableDamping
      onChange={() => {
        if (controls.current && camera instanceof PerspectiveCamera) {
          camera.near = Math.max(
            0.02,
            Math.min(1, camera.position.distanceTo(controls.current.target) * 0.003),
          );
          camera.updateProjectionMatrix();
        }
      }}
    />
  );
}

export function MallLights({ view, lighting }: { view: MallView; lighting: Lighting }) {
  const tier = useGraphicsQuality((s) => s.tier);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, tier, view, lighting]);
  const garage = ['parking', 'suv', 'pickup'].includes(view);
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(0, 4, 0);
    return object;
  }, []);
  const lights = useMemo(() => {
    const cameraPosition = new Vector3(
      ...(manifest.views[view].position as [number, number, number]),
    );
    return manifest.lights
      .filter(
        (light) =>
          light.type !== 'SUN' && (garage ? light.position[1]! < 0 : light.position[1]! >= 0),
      )
      .sort(
        (a, b) =>
          cameraPosition.distanceToSquared(
            new Vector3(...(a.position as [number, number, number])),
          ) -
          cameraPosition.distanceToSquared(
            new Vector3(...(b.position as [number, number, number])),
          ),
      )
      .slice(0, garage ? 12 : 8);
  }, [garage, view]);
  return (
    <>
      <hemisphereLight
        args={['#d9e3ef', '#b3a393', garage ? 0.24 : lighting === 'daylight' ? 1.15 : 0.5]}
      />
      <primitive object={target} />
      {!garage && (
        <directionalLight
          key={tier}
          position={[-35, 60, 35]}
          target={target}
          color="#fff0d9"
          intensity={lighting === 'daylight' ? 1.8 : 0.65}
          castShadow
          shadow-mapSize={[GRAPHICS[tier].shadowSize, GRAPHICS[tier].shadowSize]}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={70}
          shadow-camera-bottom={-70}
          shadow-camera-near={0.1}
          shadow-camera-far={180}
          shadow-normalBias={0.12}
          shadow-bias={-0.0008}
        />
      )}
      {lights.map((light) => (
        <rectAreaLight
          key={light.name}
          position={light.position as [number, number, number]}
          color={new Color(...(light.color as [number, number, number]))}
          intensity={
            garage
              ? Math.min(45, light.power / Math.max(1, light.size * 1.4))
              : Math.min(10, (light.power * 0.1) / Math.max(1, light.size * light.size))
          }
          width={light.size}
          height={garage ? 1.4 : light.size}
          onUpdate={(object) => object.lookAt(...(light.target as [number, number, number]))}
        />
      ))}
      <Environment resolution={128} frames={1} environmentIntensity={garage ? 0.2 : 0.45}>
        <Lightformer
          form="rect"
          intensity={2}
          color="#edf3fc"
          position={[0, 30, 0]}
          rotation-x={Math.PI / 2}
          scale={[70, 70, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#ffe7c5"
          position={[-30, 10, 20]}
          rotation-y={Math.PI / 4}
          scale={[30, 20, 1]}
        />
      </Environment>
    </>
  );
}

function LoadingIndicator() {
  return (
    <div
      role="status"
      className="absolute inset-0 grid place-content-center bg-slate-100/90 text-center text-slate-700"
    >
      <p className="font-medium">Loading Luminary Galleria…</p>
      <p className="mt-1 text-sm">Preparing architecture, furniture and parking…</p>
    </div>
  );
}

export default function MallPage() {
  const graphics = useGraphicsQuality();
  useEffect(retainViewer, []);
  const [showObjects, setShowObjects] = useState(isObjectLibrary);
  useEffect(() => {
    const followHash = () => setShowObjects(isObjectLibrary());
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, []);
  const [view, setView] = useState<MallView>('exterior');
  const [lighting, setLighting] = useState<Lighting>('daylight');
  const [reset, setReset] = useState(0);
  const [ready, setReady] = useState(false);
  const onReady = useMemo(() => () => setReady(true), []);
  useEffect(() => {
    setReady(false);
  }, [showObjects]);
  if (showObjects) {
    return (
      <Suspense
        fallback={
          <p className="p-6" role="status">
            Opening object library…
          </p>
        }
      >
        <ObjectLibrary
          onClose={() => {
            window.location.hash = '/mall';
          }}
        />
      </Suspense>
    );
  }
  return (
    <main className="flex min-h-0 flex-1 flex-col" aria-label="Original Luminary mall">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-medium tracking-tight">
            The Luminary Galleria &amp; Promenade
          </h1>
          <p className="text-xs text-muted-foreground">
            Original architectural scene · 4 retail floors · underground P1
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.hash = '/mall?objects=1';
            }}
          >
            Reusable objects
          </Button>
          <label className="flex items-center gap-2">
            View
            <select
              aria-label="Mall view"
              value={view}
              onChange={(event) => setView(event.target.value as MallView)}
              className="h-8 max-w-56 rounded-md border bg-background px-2"
            >
              {Object.entries(VIEW_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Lighting
            <select
              aria-label="Mall lighting"
              value={lighting}
              onChange={(event) => setLighting(event.target.value as Lighting)}
              className="h-8 rounded-md border bg-background px-2"
            >
              <option value="daylight">Soft daylight</option>
              <option value="twilight">Twilight</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={() => setReset((count) => count + 1)}>
            Reset view
          </Button>
        </div>
      </div>
      <ErrorBoundary
        onReset={() => {
          clearMallSceneDataCache();
          setReady(false);
        }}
        fallbackRender={({ resetErrorBoundary }) => (
          <div role="alert" className="m-6 rounded-lg border p-6">
            <p>
              Could not open the original mall. Check your connection and that WebGL is enabled.
            </p>
            <Button className="mt-3" onClick={resetErrorBoundary}>
              Try again
            </Button>
            <Button
              className="mt-3 ml-2"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Refresh app
            </Button>
          </div>
        )}
      >
        <div className="relative min-h-0 flex-1" aria-label="Interactive original mall model">
          <select
            aria-label="Mall graphics quality"
            className="absolute top-3 right-3 z-10 rounded-md border bg-background p-2 text-sm"
            value={graphics.mode}
            onChange={(event) => graphics.setMode(event.target.value as GraphicsMode)}
          >
            <option value="auto">Automatic ({graphics.tier})</option>
            <option value="efficient">Efficient</option>
            <option value="balanced">Balanced</option>
            <option value="maximum">Maximum</option>
          </select>
          <Canvas
            frameloop="demand"
            shadows
            dpr={Math.min(window.devicePixelRatio || 1, GRAPHICS[graphics.tier].dpr)}
            camera={{ near: 0.5, far: 500 }}
            gl={{ antialias: true }}
            onCreated={({ gl }) => {
              gl.toneMapping = ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.8;
              gl.outputColorSpace = SRGBColorSpace;
              gl.shadowMap.type = PCFSoftShadowMap;
              gl.shadowMap.autoUpdate = false;
              gl.shadowMap.needsUpdate = true;
            }}
          >
            <color attach="background" args={[lighting === 'daylight' ? '#8491a2' : '#26364e']} />
            <AdaptiveGraphics />
            <ShaderPreparation />
            <MallLights view={view} lighting={lighting} />
            <Suspense fallback={null}>
              <ProceduralMall view={view} onReady={onReady} />
            </Suspense>
            <CameraRig view={view} reset={reset} />
          </Canvas>
          {!ready && <LoadingIndicator />}
          <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex flex-wrap justify-between gap-2 text-[11px] text-white">
            <span className="rounded-md bg-slate-950/65 px-2 py-1">
              Drag to orbit · scroll / pinch to zoom · right-drag to pan
            </span>
            <span className="rounded-md bg-slate-950/65 px-2 py-1" role="status">
              {ready ? VIEW_LABELS[view] : 'Preparing scene'}
            </span>
          </div>
        </div>
      </ErrorBoundary>
    </main>
  );
}
