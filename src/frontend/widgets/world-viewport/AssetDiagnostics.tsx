import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Mesh, InstancedMesh } from 'three';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cacheSnapshot } from '../../entities/asset/model/resource-cache.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { assetStressLayout } from '../../entities/building/model/asset-stress-layout.ts';
import { useRapier } from '@react-three/rapier';
import { getAssetCatalog, resolveAsset } from '../../entities/asset/model/catalog.ts';
interface ProbeAsset {
  id: string;
  boothId?: string;
  minimumY: number;
  dimensions: number[];
  resources: string[];
}
interface Probe {
  calls: number;
  mainCalls: number;
  shadowCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  activeFloors: string[];
  assets: ProbeAsset[];
  batches: Array<{ id: string; count: number; placements: unknown }>;
  cache: ReturnType<typeof cacheSnapshot>;
  device: string;
  coldAssetBytes: number;
  browser: string;
  viewport: [number, number];
  camera: number[];
  bodies: number;
  logos: Array<{
    boothId?: string;
    name: string;
    dimensions: number[];
    sourcePixels: number[];
    textureId: string;
  }>;
  textureMipBytes: number;
}
interface Tour {
  start: number;
  samples: number[];
  phase: string;
  averageFps?: number;
  p95Ms?: number;
  passed?: boolean;
  peakMainCalls?: number;
  peakTriangles?: number;
}
export const useAssetDiagnostics = create<{
  probe: Probe | null;
  tour: Tour | null;
  focus: { target: [number, number, number]; distance: number } | null;
}>(() => ({
  probe: null,
  tour: null,
  focus: null,
}));
export function startCameraTour() {
  useWorldStore.setState({
    lowQuality: true,
    stressPreview: true,
    assetProof: false,
    dollhouse: false,
    selectedBoothId: null,
    showCeilings: false,
    geometryFallback: false,
  });
  useWorldStore.setState((state) => ({
    cart: {
      ...state.cart,
      ...Object.fromEntries(
        assetStressLayout.rooms.map((room) => [room.id, ['chair', 'table', 'display-case']]),
      ),
    },
  }));
  useAssetDiagnostics.setState({
    tour: { start: performance.now(), samples: [], phase: 'warming up' },
  });
}
export function AssetDiagnostics() {
  const { world } = useRapier();
  const elapsed = useRef(0),
    shadowCalls = useRef(0),
    mainCalls = useRef(0),
    attached = useRef(new WeakSet<Mesh>());
  useFrame(({ scene, gl, camera, controls }, delta) => {
    const focus = useAssetDiagnostics.getState().focus;
    if (focus) {
      const [x, y, z] = focus.target;
      camera.position.set(
        x + focus.distance * 0.85,
        y + focus.distance * 0.5,
        z + focus.distance * 1.4,
      );
      if (
        controls &&
        'target' in controls &&
        controls.target &&
        typeof controls.target === 'object' &&
        'set' in controls.target
      ) {
        (controls.target as { set: (x: number, y: number, z: number) => void }).set(x, y, z);
      }
      camera.lookAt(x, y, z);
      useAssetDiagnostics.setState({ focus: null, tour: null });
    }
    mainCalls.current = 0;
    shadowCalls.current = 0;
    scene.traverse((node) => {
      if (!(node instanceof Mesh) || attached.current.has(node)) {
        return;
      }
      const before = node.onBeforeRender,
        beforeShadow = node.onBeforeShadow;
      node.onBeforeRender = (...args) => {
        mainCalls.current++;
        before.apply(node, args);
      };
      node.onBeforeShadow = (...args) => {
        shadowCalls.current++;
        beforeShadow.apply(node, args);
      };
      attached.current.add(node);
    });
    const { tour } = useAssetDiagnostics.getState();
    if (tour && !['complete', 'cancelled'].includes(tour.phase)) {
      const seconds = (performance.now() - tour.start) / 1000;
      const t = (Math.max(0, seconds - 10) / 60) * Math.PI * 2;
      camera.position.set(Math.cos(t) * 32, 15 + Math.sin(t * 0.5) * 4, Math.sin(t) * 25);
      const target = controls && 'target' in controls ? controls.target : null;
      const floorY = useWorldStore.getState().currentFloorId === 'B1' ? -4 : 0;
      if (
        target &&
        typeof target === 'object' &&
        'set' in target &&
        (target as { set: (x: number, y: number, z: number) => void }).set
      ) {
        (target as { set: (x: number, y: number, z: number) => void }).set(0, floorY, 0);
      }
      camera.lookAt(0, floorY, 0);
      if (seconds >= 10 && seconds < 70) {
        tour.phase = 'measuring';
        tour.samples.push(delta * 1000);
      }
      if (seconds >= 70) {
        const sorted = [...tour.samples].sort((a, b) => a - b),
          total = sorted.reduce((a, b) => a + b, 0);
        const averageFps = sorted.length / (total / 1000),
          p95Ms = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
        useAssetDiagnostics.setState({
          tour: {
            ...tour,
            phase: 'complete',
            averageFps,
            p95Ms,
            passed: averageFps >= 30 && p95Ms <= 33.3,
          },
        });
      }
    }
    // One controlled reset/render point reports main and shadow passes separately.
    gl.info.autoReset = false;
    gl.info.reset();
    gl.render(scene, camera);
    // Count actual draws, including both sides of transparent materials.
    mainCalls.current = gl.info.render.calls - shadowCalls.current;
    if (tour?.phase === 'measuring') {
      tour.peakMainCalls = Math.max(tour.peakMainCalls ?? 0, mainCalls.current);
      tour.peakTriangles = Math.max(tour.peakTriangles ?? 0, gl.info.render.triangles);
    }
    elapsed.current += delta;
    if (elapsed.current < 1) {
      return;
    }
    elapsed.current = 0;
    const assets: ProbeAsset[] = [],
      batches: Probe['batches'] = [],
      activeFloors: string[] = [];
    const logos: Probe['logos'] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
      if (node.userData.ownedLogo) {
        let parent = node.parent;
        while (parent && !parent.userData.boothId) {
          parent = parent.parent;
        }
        logos.push({
          boothId: parent?.userData.boothId,
          name: node.userData.name,
          dimensions: node.userData.dimensions,
          sourcePixels: node.userData.sourcePixels,
          textureId: node.userData.textureId,
        });
      }
      if (typeof node.userData.floorId === 'string') {
        activeFloors.push(node.userData.floorId);
      }
      if (node instanceof InstancedMesh && typeof node.userData.batchAssetId === 'string') {
        batches.push({
          id: node.userData.batchAssetId,
          count: node.count,
          placements: node.userData.placements,
        });
      }
      if (typeof node.userData.assetId !== 'string') {
        return;
      }
      const root = node.getObjectByName('root');
      if (!root) {
        return;
      }
      const bounds = new Box3().setFromObject(root),
        resources: string[] = [];
      if (bounds.isEmpty()) {
        return;
      }
      root.traverse((child) => {
        if (child instanceof Mesh) {
          resources.push(child.geometry.uuid);
        }
      });
      assets.push({
        id: node.userData.assetId,
        boothId: typeof node.userData.boothId === 'string' ? node.userData.boothId : undefined,
        minimumY: bounds.min.y,
        dimensions: [
          bounds.max.x - bounds.min.x,
          bounds.max.y - bounds.min.y,
          bounds.max.z - bounds.min.z,
        ],
        resources,
      });
    });
    const context = gl.getContext(),
      debug = context.getExtension('WEBGL_debug_renderer_info');
    const device = debug
      ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : 'WebGL renderer unavailable';
    const transfers = performance
      .getEntriesByType('resource')
      .filter((entry) => /\.glb(?:\?|$)/.test(entry.name)) as PerformanceResourceTiming[];
    useAssetDiagnostics.setState({
      probe: {
        calls: gl.info.render.calls,
        mainCalls: mainCalls.current,
        shadowCalls: shadowCalls.current,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        pixelRatio: gl.getPixelRatio(),
        activeFloors,
        assets,
        batches,
        cache: cacheSnapshot(),
        device,
        coldAssetBytes: transfers.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        browser: navigator.userAgent,
        viewport: [window.innerWidth, window.innerHeight],
        camera: camera.position.toArray(),
        bodies: world.bodies.len(),
        logos,
        textureMipBytes: logos.reduce(
          (sum, logo) =>
            sum + ((logo.sourcePixels[0] ?? 0) * (logo.sourcePixels[1] ?? 0) * 4 * 4) / 3,
          0,
        ),
      },
    });
  }, 1);
  return null;
}
export function AssetDiagnosticsPanel() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId),
    dollhouse = useWorldStore((s) => s.dollhouse);
  const proof = useWorldStore((s) => s.assetProof),
    stress = useWorldStore((s) => s.stressPreview),
    gallery = useWorldStore((s) => s.galleryAssetId),
    setGallery = useWorldStore((s) => s.setGalleryAsset);
  const probe = useAssetDiagnostics((s) => s.probe),
    tour = useAssetDiagnostics((s) => s.tour),
    layout = useActiveLayout();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="absolute top-28 right-3 z-10 bg-popover/95 shadow-lg"
        >
          Asset diagnostics
          {probe && <Badge variant="secondary">{probe.mainCalls} calls</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Asset diagnostics</p>
            <p className="text-xs text-muted-foreground">
              {layout.rooms.length} rooms · {probe?.triangles ?? 0} triangles ·{' '}
              {probe?.textures ?? 0} textures
            </p>
          </div>
          <Button size="sm" onClick={startCameraTour}>
            Run 60-second camera tour
          </Button>
          {proof && !stress && (
            <Select value={gallery} onValueChange={setGallery}>
              <SelectTrigger aria-label="Catalog asset">
                <SelectValue placeholder="Catalog asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Catalog asset</SelectLabel>
                  {getAssetCatalog().map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="unknown-reference">Unknown reference</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {proof && !stress && !dollhouse && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const resolved = resolveAsset(gallery);
                const dimensions = resolved.isOk()
                  ? resolved.value.metadata.dimensions
                  : [4, 2.5, 4];
                const minY = resolved.isOk() ? resolved.value.metadata.bounds.min[1] : 0;
                useAssetDiagnostics.setState({
                  focus: {
                    target: [
                      -9,
                      (layout.floors.find((f) => f.id === currentFloorId)?.heightOffset ?? 0) +
                        minY +
                        (dimensions[1] ?? 2.5) / 2,
                      7,
                    ],
                    distance: Math.max(...dimensions) * 1.3,
                  },
                });
              }}
            >
              Focus catalog asset
            </Button>
          )}
          <p role="status" className="text-xs text-muted-foreground">
            {tour?.phase ?? 'Ready'}{' '}
            {tour?.averageFps !== undefined
              ? `· ${tour.averageFps.toFixed(1)} FPS · p95 ${tour.p95Ms?.toFixed(1)} ms`
              : ''}
          </p>
          <ScrollArea className="max-h-48 rounded-lg border bg-muted/50 p-3">
            <pre data-testid="asset-diagnostics" className="text-[10px] whitespace-pre-wrap">
              {JSON.stringify({ probe, tour }, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
