import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import {
  Box3,
  Group,
  Vector3,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PerspectiveCamera,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { reusableObjects, type ReusableObjectEntry } from '../objects/object-library.tsx';

type Point = [number, number, number];
interface Framing {
  center: Point;
  radius: number;
  floor: number;
  dimensions: Point;
}
const initialFrame: Framing = { center: [0, 1, 0], radius: 4, floor: 0, dimensions: [0, 0, 0] };

function ObjectStage({
  entry,
  detail,
  size,
  color,
  reset,
  onMeasure,
}: {
  entry: ReusableObjectEntry;
  detail: 'baseline' | 'low';
  size: number;
  color?: string;
  reset: number;
  onMeasure: (dimensions: Point) => void;
}) {
  const object = useRef<Group>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size: viewport, invalidate, gl } = useThree();
  const [frame, setFrame] = useState<Framing>(initialFrame);
  const content = useMemo(() => entry.render({ detail, color }), [entry, detail, color]);
  useLayoutEffect(() => {
    if (!object.current) {
      return;
    }
    object.current.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(object.current);
    if (bounds.isEmpty()) {
      return;
    }
    const dimensions = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const radius = Math.max(0.3, dimensions.length() / 2);
    const fit = Math.max(1, 1.2 / (viewport.width / viewport.height));
    camera.position
      .copy(center)
      .add(new Vector3(...(entry.viewDirection ?? [1.4, 0.85, 1.8])).multiplyScalar(radius * fit));
    camera.lookAt(center);
    camera.near = Math.max(0.005, radius / 100);
    camera.far = Math.max(100, radius * 40);
    if (camera instanceof PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
    controls.current?.target.copy(center);
    controls.current?.update();
    const measured = dimensions.toArray() as Point;
    setFrame({
      center: center.toArray() as Point,
      radius,
      floor: bounds.min.y,
      dimensions: measured,
    });
    onMeasure(measured);
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [
    entry,
    detail,
    size,
    reset,
    camera,
    viewport.width,
    viewport.height,
    gl,
    invalidate,
    onMeasure,
  ]);
  return (
    <>
      <color attach="background" args={['#8491a2']} />
      <ambientLight intensity={0.5} color="#dde9f7" />
      <directionalLight
        position={[
          frame.center[0] - frame.radius * 2,
          frame.center[1] + frame.radius * 3,
          frame.center[2] + frame.radius * 2,
        ]}
        intensity={2.6}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-frame.radius * 2}
        shadow-camera-right={frame.radius * 2}
        shadow-camera-top={frame.radius * 2}
        shadow-camera-bottom={-frame.radius * 2}
        shadow-camera-far={frame.radius * 12}
        shadow-normalBias={0.025}
      />
      <Environment resolution={64} frames={1}>
        <Lightformer
          position={[0, 5, 0]}
          rotation-x={Math.PI / 2}
          scale={[10, 10, 1]}
          color="#e5efff"
          intensity={2}
        />
        <Lightformer
          position={[-5, 3, 3]}
          rotation-y={Math.PI / 4}
          scale={[6, 4, 1]}
          color="#ffe4be"
          intensity={1.6}
        />
      </Environment>
      <group ref={object} scale={size}>
        {content}
      </group>
      <mesh
        position={[frame.center[0], frame.floor - 0.004, frame.center[2]]}
        rotation-x={-Math.PI / 2}
        receiveShadow
      >
        <planeGeometry args={[frame.radius * 10, frame.radius * 10]} />
        <meshStandardMaterial color="#b8b7ae" roughness={0.84} />
      </mesh>
      <OrbitControls
        ref={controls}
        target={frame.center}
        makeDefault
        minDistance={frame.radius * 0.15}
        maxDistance={frame.radius * 10}
      />
    </>
  );
}

export function ObjectLibrary({ onClose }: { onClose: () => void }) {
  const initialId = new URLSearchParams(location.hash.split('?')[1]).get('object');
  const [selected, setSelected] = useState(initialId ?? 'luminary-suv');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<'baseline' | 'low'>('baseline');
  const [size, setSize] = useState(1);
  const [customColor, setCustomColor] = useState(false);
  const [color, setColor] = useState('#34638c');
  const [reset, setReset] = useState(0);
  const [dimensions, setDimensions] = useState<Point>([0, 0, 0]);
  const entry = reusableObjects.find((item) => item.id === selected) ?? reusableObjects[0]!;
  const filtered = reusableObjects.filter((item) =>
    `${item.label} ${item.family}`.toLowerCase().includes(search.toLowerCase()),
  );
  const measure = useMemo(() => (value: Point) => setDimensions(value), []);
  const select = (id: string) => {
    setSelected(id);
    setSize(1);
    setCustomColor(false);
    const url = new URL(location.href);
    url.hash = `/mall?objects=1&object=${id}`;
    history.replaceState(null, '', url);
  };
  return (
    <main
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6"
      aria-label="Reusable object library"
    >
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Reusable objects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect {reusableObjects.length} objects and their real dimensions before using them in
            a venue.
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Back to mall
        </Button>
      </header>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card p-3">
          <input
            aria-label="Search reusable objects"
            className="mb-3 w-full rounded-md border bg-background p-2 text-sm"
            placeholder="Search objects…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="grid max-h-[65vh] gap-1 overflow-y-auto">
            {filtered.map((item) => (
              <Button
                key={item.id}
                data-object-id={item.id}
                variant={item.id === entry.id ? 'default' : 'ghost'}
                className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
                aria-pressed={item.id === entry.id}
                onClick={() => select(item.id)}
              >
                <span>
                  <span className="block">{item.label}</span>
                  <span className="text-xs opacity-65">{item.family}</span>
                </span>
              </Button>
            ))}
            {!filtered.length && (
              <p className="p-2 text-sm text-muted-foreground">No objects match this search.</p>
            )}
          </div>
        </aside>
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">{entry.label}</h2>
            <Button variant="outline" onClick={() => setReset((value) => value + 1)}>
              Fit object
            </Button>
          </div>
          <div className="h-[52vh] min-h-80 overflow-hidden rounded-xl border">
            <ErrorBoundary
              resetKeys={[entry.id, detail, size, color, customColor]}
              fallbackRender={({ resetErrorBoundary }) => (
                <div className="grid h-full place-content-center gap-3 p-5">
                  <p>Object preview could not open.</p>
                  <Button onClick={resetErrorBoundary}>Try again</Button>
                </div>
              )}
            >
              <Canvas
                frameloop="demand"
                shadows
                dpr={Math.min(devicePixelRatio || 1, 1)}
                camera={{ fov: 45 }}
                onCreated={({ gl }) => {
                  gl.toneMapping = ACESFilmicToneMapping;
                  gl.toneMappingExposure = 0.8;
                  gl.outputColorSpace = SRGBColorSpace;
                }}
              >
                <ObjectStage
                  key={entry.id}
                  entry={entry}
                  detail={detail}
                  size={size}
                  color={customColor ? color : undefined}
                  reset={reset}
                  onMeasure={measure}
                />
              </Canvas>
            </ErrorBoundary>
          </div>
          <p className="text-sm" role="status">
            Width {dimensions[0].toFixed(3)} m · height {dimensions[1].toFixed(3)} m · depth{' '}
            {dimensions[2].toFixed(3)} m
          </p>
          <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-4 text-sm">
            <label>
              Detail{' '}
              <select
                aria-label="Object detail"
                value={detail}
                onChange={(event) => setDetail(event.target.value as 'baseline' | 'low')}
                className="ml-2 rounded-md border bg-background p-2"
              >
                <option value="baseline">Full</option>
                <option value="low">Lightweight</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Size{' '}
              <input
                aria-label="Object size"
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              />
              <span>{size.toFixed(2)}×</span>
            </label>
            {entry.supportsColor && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={customColor}
                  onChange={(event) => setCustomColor(event.target.checked)}
                />
                Custom finish{' '}
                <input
                  aria-label="Object finish"
                  type="color"
                  disabled={!customColor}
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Drag to orbit · scroll to zoom · one scene unit equals one metre.
          </p>
        </section>
      </div>
    </main>
  );
}
