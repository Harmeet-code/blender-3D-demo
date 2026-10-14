import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, SRGBColorSpace } from 'three';
import { ErrorBoundary } from 'react-error-boundary';
import { BoxesIcon, ExpandIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProceduralAssetIds } from '@/features/assets/catalog/procedural-assets.ts';
import { getAssetCatalog, resolveAsset } from '@/features/assets/model/catalog.ts';
import { proceduralAssetScene, retainViewer } from '@/features/assets/model/resource-cache.ts';
import { LoadedBatch, type BatchPlacement } from '@/features/assets/components/AssetBatch.tsx';
import { LightingRig } from '@/features/world/components/LightingRig.tsx';
import { GRAPHICS, type GraphicsTier } from '@/features/world/model/graphics-quality.ts';
import boothMetadata from '@/assets/metadata/booth-sizes.v1.json';

type Point3 = [number, number, number];
type Bounds = { min: Point3; max: Point3 };
type InventoryEntry = {
  id: string;
  label: string;
  dimensions: Point3;
  bounds: Bounds;
  anchor: string;
  sockets: Record<string, { position: Point3; rotation: Point3 }>;
  feet?: [number, number];
};
const baseCatalog = getAssetCatalog();
const entries: InventoryEntry[] = getProceduralAssetIds().flatMap<InventoryEntry>((id) => {
  const base = baseCatalog.find((asset) => asset.id === id);
  if (base) {
    return [
      {
        id,
        label: base.label,
        dimensions: base.dimensions,
        bounds: base.bounds,
        anchor: base.anchor,
        sockets: base.sockets,
        feet: boothMetadata.find((item) => item.id === id)?.dimensionsFeet as
          | [number, number]
          | undefined,
      },
    ];
  }
  const sized = boothMetadata.find((asset) => asset.id === id);
  if (!sized) {
    return [];
  }
  const feet = sized.dimensionsFeet as [number, number],
    w = feet[0] * 0.3048,
    d = feet[1] * 0.3048;
  return [
    {
      id,
      label: sized.label,
      dimensions: [w, 2.8, d] as Point3,
      bounds: { min: [-w / 2, 0, -d / 2] as Point3, max: [w / 2, 2.8, d / 2] as Point3 },
      anchor: sized.anchor,
      feet,
      sockets: {
        socket_entry: { position: [0, 0, d / 2] as Point3, rotation: [0, 0, 0] as Point3 },
        socket_branding: { position: [0, 2.69, d / 2] as Point3, rotation: [0, 0, 0] as Point3 },
      },
    },
  ];
});
const onePlacement: readonly BatchPlacement[] = [
  { id: 'inventory-preview', position: [0, 0, 0], yawRadians: 0 },
];
const dimensionText = (values: readonly number[]) =>
  values.map((value) => value.toFixed(4)).join(' × ');

/** Actual bounds drive the preview fit, including negative-Y floor tiles and raised portals. */
function PreviewCamera({ bounds, reset }: { bounds: Bounds; reset: number }) {
  const camera = useThree((state) => state.camera),
    controls = useThree((state) => state.controls),
    invalidate = useThree((state) => state.invalidate),
    size = useThree((state) => state.size);
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) {
      return;
    }
    const center = bounds.min.map((value, index) => (value + bounds.max[index]!) / 2) as Point3;
    const radius = Math.max(
      0.15,
      Math.hypot(...bounds.min.map((value, index) => bounds.max[index]! - value)) / 2,
    );
    const vertical = (camera.fov * Math.PI) / 180,
      horizontal = 2 * Math.atan((Math.tan(vertical / 2) * size.width) / Math.max(1, size.height));
    const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.16;
    const direction = [0.7, 0.52, 1],
      length = Math.hypot(...direction);
    camera.position.set(
      center[0] + (direction[0]! * distance) / length,
      center[1] + (direction[1]! * distance) / length,
      center[2] + (direction[2]! * distance) / length,
    );
    camera.near = Math.max(0.001, radius / 100);
    camera.far = Math.max(100, distance + radius * 20);
    camera.updateProjectionMatrix();
    camera.lookAt(...center);
    if (controls && 'target' in controls && 'update' in controls) {
      const orbit = controls as unknown as {
        target: { set: (x: number, y: number, z: number) => void };
        update: () => void;
      };
      orbit.target.set(...center);
      orbit.update();
    }
    invalidate();
  }, [camera, controls, bounds, reset, size.width, size.height, invalidate]);
  return null;
}
function PreviewScene({
  entry,
  url,
  tier,
  reset,
}: {
  entry: InventoryEntry;
  url: string;
  tier: GraphicsTier;
  reset: number;
}) {
  const scene = useMemo(() => proceduralAssetScene(url), [url]);
  const metrics = scene.userData.proceduralMetrics as { bounds?: Bounds } | undefined;
  const bounds = metrics?.bounds ?? entry.bounds;
  const radius = Math.max(
    2,
    Math.hypot(...bounds.min.map((value, index) => bounds.max[index]! - value)) * 0.7,
  );
  const framing = useMemo(
    () => ({
      center: bounds.min.map((value, index) => (value + bounds.max[index]!) / 2) as Point3,
      radius,
    }),
    [bounds, radius],
  );
  const gl = useThree((state) => state.gl),
    invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [scene, tier, gl, invalidate]);
  return (
    <>
      <color attach="background" args={['#8491a2']} />
      <LightingRig
        studio
        lowQuality={tier === 'efficient'}
        shadowSize={GRAPHICS[tier].shadowSize}
        framing={framing}
      />
      <LoadedBatch
        url={url}
        id={entry.feet ? 'premium-booth' : entry.id}
        statusId={`inventory:${entry.id}`}
        placements={onePlacement}
      />
      <mesh
        rotation-x={-Math.PI / 2}
        position={[framing.center[0], bounds.min[1] - 0.005, framing.center[2]]}
        receiveShadow
      >
        <planeGeometry args={[radius * 5, radius * 5]} />
        <meshStandardMaterial color="#dddcd7" roughness={0.82} />
      </mesh>
      <ContactShadows
        key={`${url}:${tier}`}
        position={[framing.center[0], bounds.min[1] - 0.004, framing.center[2]]}
        scale={radius * 3}
        far={Math.max(1, bounds.max[1] - bounds.min[1])}
        resolution={tier === 'efficient' ? 256 : tier === 'maximum' ? 768 : 512}
        frames={1}
        opacity={0.42}
        blur={2.8}
        color="#4e4840"
      />
      <OrbitControls makeDefault minDistance={radius * 0.12} maxDistance={radius * 8} />
      <PreviewCamera bounds={bounds} reset={reset} />
    </>
  );
}

export function InventoryPage() {
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? ''),
    [search, setSearch] = useState('');
  const [tier, setTier] = useState<GraphicsTier>('balanced'),
    [lightweight, setLightweight] = useState(false),
    [reset, setReset] = useState(0);
  const entry = entries.find((item) => item.id === selectedId) ?? entries[0];
  const filtered = useMemo(
    () =>
      entries.filter((item) =>
        `${item.label} ${item.id} ${item.feet?.join('x') ?? ''}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [search],
  );
  const variants = baseCatalog.find((item) => item.id === entry?.id)?.variants;
  const supportsLightweight = !!(variants?.low || variants?.opaque);
  const resolved = entry ? resolveAsset(entry.id, 1, lightweight && supportsLightweight) : null;
  const url = resolved?.isOk()
    ? resolved.value.url
    : entry
      ? `procedural:${entry.id}@1:baseline`
      : '';
  useEffect(retainViewer, []);
  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-[1500px] content-start gap-5 overflow-y-auto p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <BoxesIcon className="size-6" />
          Asset inventory
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Browse {entries.length} assets. Inspect their real dimensions, orientation and attachment
          points before placing them in a venue.
        </p>
      </header>
      <div className="grid min-h-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="grid content-start gap-3 rounded-xl border bg-card p-3">
          <Label className="relative">
            <span className="sr-only">Search inventory</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Search inventory"
              placeholder="Search assets or booth sizes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </Label>
          <p className="text-xs text-muted-foreground">{filtered.length} assets</p>
          <div className="grid max-h-[64vh] gap-2 overflow-y-auto" aria-label="Inventory assets">
            {filtered.map((item) => (
              <Button
                key={item.id}
                variant={entry?.id === item.id ? 'default' : 'outline'}
                aria-pressed={entry?.id === item.id}
                onClick={() => setSelectedId(item.id)}
                className="h-auto flex-col items-start gap-1 whitespace-normal px-3 py-3 text-left"
              >
                <span>{item.label}</span>
                <span className="text-xs opacity-75">
                  {item.dimensions[0].toFixed(2)} × {item.dimensions[2].toFixed(2)} m footprint
                </span>
              </Button>
            ))}
          </div>
          {!filtered.length && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              No assets match this search.
            </p>
          )}
        </aside>
        {entry && (
          <section className="grid content-start gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-medium">{entry.label}</h2>
                <p className="text-xs text-muted-foreground">{entry.id}</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Label>
                  Graphics
                  <select
                    aria-label="Inventory graphics quality"
                    value={tier}
                    onChange={(event) => setTier(event.target.value as GraphicsTier)}
                    className="mt-1 rounded-md border bg-background px-3 py-2"
                  >
                    {(['efficient', 'balanced', 'maximum'] as const).map((value) => (
                      <option key={value} value={value}>
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label className="flex items-center gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={lightweight && supportsLightweight}
                    disabled={!supportsLightweight}
                    onChange={(event) => setLightweight(event.target.checked)}
                  />
                  Lightweight variant
                </Label>
                <Button variant="outline" onClick={() => setReset((value) => value + 1)}>
                  <ExpandIcon />
                  Fit asset
                </Button>
              </div>
            </div>
            <div className="h-[50vh] min-h-80 overflow-hidden rounded-xl border bg-[#8491a2]">
              <ErrorBoundary
                resetKeys={[url]}
                fallbackRender={({ error, resetErrorBoundary }) => (
                  <div className="grid h-full content-center gap-3 p-6">
                    <p>Asset preview is unavailable.</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : String(error)}
                    </p>
                    <Button variant="outline" onClick={resetErrorBoundary}>
                      Retry preview
                    </Button>
                  </div>
                )}
              >
                <Canvas
                  frameloop="demand"
                  shadows
                  dpr={Math.min(window.devicePixelRatio || 1, GRAPHICS[tier].dpr)}
                  camera={{ position: [6, 4, 8], fov: 50 }}
                  onCreated={({ gl }) => {
                    gl.toneMapping = ACESFilmicToneMapping;
                    gl.toneMappingExposure = 0.8;
                    gl.outputColorSpace = SRGBColorSpace;
                    gl.shadowMap.type = PCFSoftShadowMap;
                    gl.shadowMap.autoUpdate = false;
                    gl.shadowMap.needsUpdate = true;
                  }}
                >
                  <Suspense fallback={null}>
                    <PreviewScene entry={entry} url={url} tier={tier} reset={reset} />
                  </Suspense>
                </Canvas>
              </ErrorBoundary>
            </div>
            <p className="text-xs text-muted-foreground">
              Drag to orbit. Scroll to zoom. Dimensions below use width × height × depth; one scene
              unit is one metre.
            </p>
            <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Dimensions (m)</p>
                <p className="mt-1 font-mono text-sm">{dimensionText(entry.dimensions)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dimensions (ft)</p>
                <p className="mt-1 font-mono text-sm">
                  {dimensionText(entry.dimensions.map((value) => value / 0.3048))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Minimum bounds [X,Y,Z], m</p>
                <p className="mt-1 font-mono text-sm">
                  [{entry.bounds.min.map((value) => value.toFixed(4)).join(', ')}]
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Maximum bounds [X,Y,Z], m</p>
                <p className="mt-1 font-mono text-sm">
                  [{entry.bounds.max.map((value) => value.toFixed(4)).join(', ')}]
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Origin and facing</p>
                <p className="mt-1 text-sm">
                  {entry.anchor === 'floor-top'
                    ? 'Top surface at Y = 0'
                    : entry.anchor === 'portal-entry'
                      ? 'Lower portal entry at Y = 0'
                      : 'Floor contact at Y = 0'}{' '}
                  · forward +Z
                </p>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-medium">Attachment points</h3>
              <div className="mt-3 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-4">Point</th>
                      <th className="pb-2 pr-4">Position [X,Y,Z], m</th>
                      <th className="pb-2">Rotation [X,Y,Z], radians</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(entry.sockets).map(([name, socket]) => (
                      <tr key={name} className="border-t">
                        <td className="py-2 pr-4">{name}</td>
                        <td className="py-2 pr-4 font-mono">
                          [{socket.position.map((value) => value.toFixed(4)).join(', ')}]
                        </td>
                        <td className="py-2 font-mono">
                          [{socket.rotation.map((value) => value.toFixed(4)).join(', ')}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
