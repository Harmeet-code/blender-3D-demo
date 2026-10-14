import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
import { cacheSnapshot } from '@/features/assets/model/resource-cache.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { frameStatistics } from '../model/performance-metrics.ts';
import { useRapier } from '@react-three/rapier';
import { getAssetCatalog, resolveAsset } from '@/features/assets/model/catalog.ts';
import { GpuTimer } from '../model/gpu-timer.ts';
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
  p50Ms?: number;
  p99Ms?: number;
  warmupSeconds: number;
  durationSeconds: number;
  quality?: { lowQuality: boolean; floorId: string; pixelRatio: number; browser: string };
  passed?: boolean;
  peakMainCalls?: number;
  peakTriangles?: number;
  gpuSamples?: number[];
  submissionSamples?: number[];
  gpu?: { supported: boolean; sampleCount: number; p95Ms?: number; p50Ms?: number; p99Ms?: number };
  submission?: { sampleCount: number; p95Ms?: number; p50Ms?: number; p99Ms?: number };
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
export function startCameraTour(options?: { warmupSeconds?: number; durationSeconds?: number }) {
  const warmupSeconds = options?.warmupSeconds ?? 10;
  const durationSeconds = options?.durationSeconds ?? 60;
  if (
    !Number.isFinite(warmupSeconds) ||
    warmupSeconds < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    throw new RangeError('Camera tour durations must be finite and positive (warmup may be zero)');
  }
  useAssetDiagnostics.setState({
    tour: {
      start: performance.now(),
      samples: [],
      phase: 'warming up',
      warmupSeconds,
      durationSeconds,
    },
  });
}
export function cancelCameraTour() {
  const { tour } = useAssetDiagnostics.getState();
  if (tour && !['complete', 'cancelled'].includes(tour.phase)) {
    useAssetDiagnostics.setState({ tour: { ...tour, phase: 'cancelled' } });
  }
}
const tourSceneFields = [
  'lowQuality',
  'dollhouse',
  'assetProof',
  'stressPreview',
  'geometryFallback',
  'showCeilings',
  'showLabels',
  'galleryAssetId',
  'previewDoorsOpen',
  'selectedBoothId',
  'cart',
  'logos',
] as const;
export function AssetDiagnostics() {
  const { world } = useRapier();
  const layout = useActiveLayout();
  const { gl, camera } = useThree();
  const latestLayout = useRef(layout);
  latestLayout.current = layout;
  const savedView = useRef<{
    tourStart: number;
    position: typeof camera.position;
    quaternion: typeof camera.quaternion;
    target: typeof camera.position | null;
    targetObject: typeof camera.position | null;
    layout: typeof layout;
    floorId: string;
    state: ReturnType<typeof useWorldStore.getState>;
  } | null>(null);
  const restoreView = () => {
    const saved = savedView.current;
    if (!saved) {
      return;
    }
    if (
      saved.floorId === useWorldStore.getState().currentFloorId &&
      saved.layout === latestLayout.current &&
      saved.state.selectedBoothId === useWorldStore.getState().selectedBoothId
    ) {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      if (saved.target && saved.targetObject) {
        saved.targetObject.copy(saved.target);
      }
    }
    savedView.current = null;
  };
  const elapsed = useRef(0),
    shadowCalls = useRef(0),
    mainCalls = useRef(0);
  const device = useRef('WebGL renderer unavailable');
  const gpuTimer = useRef<GpuTimer | null>(null);
  useEffect(() => {
    const context = gl.getContext();
    if ('beginQuery' in context && new URLSearchParams(window.location.search).has('gpu-timing')) {
      gpuTimer.current = new GpuTimer(context);
    }
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    device.current = debug
      ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : 'WebGL renderer unavailable';
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    const previousShadowRender = gl.shadowMap.render;
    const shadowRender: typeof previousShadowRender = function (...args) {
      const before = gl.info.render.calls;
      previousShadowRender.apply(gl.shadowMap, args);
      shadowCalls.current += gl.info.render.calls - before;
    };
    if (typeof previousShadowRender === 'function') {
      gl.shadowMap.render = shadowRender;
    }
    const cancel = () => cancelCameraTour();
    gl.domElement.addEventListener('pointerdown', cancel);
    gl.domElement.addEventListener('wheel', cancel);
    const onVisibility = () => {
      if (document.hidden) {
        cancel();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      gpuTimer.current?.dispose();
      gpuTimer.current = null;
      cancel();
      restoreView();
      gl.info.autoReset = previousAutoReset;
      if (gl.shadowMap.render === shadowRender) {
        gl.shadowMap.render = previousShadowRender;
      }
      gl.domElement.removeEventListener('pointerdown', cancel);
      gl.domElement.removeEventListener('wheel', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [gl]);
  useFrame(({ scene, gl, camera, controls }, delta) => {
    const { focus } = useAssetDiagnostics.getState();
    if (focus) {
      cancelCameraTour();
      restoreView();
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
    const { tour } = useAssetDiagnostics.getState();
    if (!tour || ['complete', 'cancelled'].includes(tour.phase)) {
      restoreView();
    }
    if (tour && !['complete', 'cancelled'].includes(tour.phase)) {
      if (savedView.current?.tourStart !== tour.start) {
        restoreView();
        const state = useWorldStore.getState();
        savedView.current = {
          tourStart: tour.start,
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
          target:
            controls && 'target' in controls
              ? (controls.target as typeof camera.position).clone()
              : null,
          targetObject:
            controls && 'target' in controls ? (controls.target as typeof camera.position) : null,
          layout,
          floorId: state.currentFloorId,
          state,
        };
        tour.quality = {
          lowQuality: state.lowQuality,
          floorId: state.currentFloorId,
          pixelRatio: gl.getPixelRatio(),
          browser: navigator.userAgent,
        };
      }
      const state = useWorldStore.getState();
      const saved = savedView.current!;
      if (
        saved.layout !== layout ||
        saved.floorId !== state.currentFloorId ||
        tourSceneFields.some((field) => saved.state[field] !== state[field]) ||
        gl.getPixelRatio() !== tour.quality?.pixelRatio
      ) {
        cancelCameraTour();
        restoreView();
      } else {
        const seconds = (performance.now() - tour.start) / 1000;
        const t = (Math.max(0, seconds - tour.warmupSeconds) / tour.durationSeconds) * Math.PI * 2;
        const floor = layout.floors.find((item) => item.id === state.currentFloorId);
        const bounds = floor?.authoring
          ? polygonBounds(floor.authoring.boundary)
          : { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };
        const x = (bounds.minX + bounds.maxX) / 2;
        const z = (bounds.minZ + bounds.maxZ) / 2;
        const span = Math.max(20, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
        const floorY = floor?.heightOffset ?? 0;
        camera.position.set(
          x + Math.cos(t) * span * 0.8,
          floorY + span * (0.65 + Math.sin(t * 0.5) * 0.1),
          z + Math.sin(t) * span * 0.65,
        );
        const target = controls && 'target' in controls ? controls.target : null;
        if (
          target &&
          typeof target === 'object' &&
          'set' in target &&
          (target as { set: (x: number, y: number, z: number) => void }).set
        ) {
          (target as { set: (x: number, y: number, z: number) => void }).set(x, floorY, z);
        }
        camera.lookAt(x, floorY, z);
        if (seconds >= tour.warmupSeconds && seconds < tour.warmupSeconds + tour.durationSeconds) {
          tour.phase = 'measuring';
          tour.samples.push(delta * 1000);
        }
        if (seconds >= tour.warmupSeconds + tour.durationSeconds) {
          useAssetDiagnostics.setState({
            tour: {
              ...tour,
              phase: 'complete',
              ...frameStatistics(tour.samples, state.lowQuality ? 33.3 : 16.7),
              ...(gpuTimer.current
                ? {
                    gpu: {
                      supported: gpuTimer.current.supported,
                      sampleCount: tour.gpuSamples?.length ?? 0,
                      ...(tour.gpuSamples?.length ? frameStatistics(tour.gpuSamples, 16.7) : {}),
                    },
                    submission: {
                      sampleCount: tour.submissionSamples?.length ?? 0,
                      ...(tour.submissionSamples?.length
                        ? frameStatistics(tour.submissionSamples, 16.7)
                        : {}),
                    },
                  }
                : {}),
            },
          });
          restoreView();
        }
      }
    }
    // One controlled reset/render point reports main and shadow passes separately.
    gl.info.reset();
    const measuring = tour?.phase === 'measuring' && gpuTimer.current;
    if (measuring) {
      (tour.gpuSamples ??= []).push(...gpuTimer.current!.poll());
      gpuTimer.current!.begin();
    }
    const submissionStart = performance.now();
    gl.render(scene, camera);
    if (measuring) {
      gpuTimer.current!.end();
      (tour.submissionSamples ??= []).push(performance.now() - submissionStart);
    }
    // Count actual draws, including both sides of transparent materials.
    mainCalls.current = gl.info.render.calls - shadowCalls.current;
    if (tour?.phase === 'measuring') {
      tour.peakMainCalls = Math.max(tour.peakMainCalls ?? 0, mainCalls.current);
      tour.peakTriangles = Math.max(tour.peakTriangles ?? 0, gl.info.render.triangles);
    }
    elapsed.current += delta;
    if (elapsed.current < 1) {
      const { probe } = useAssetDiagnostics.getState();
      if (probe) {
        // Keep live diagnostic reads accurate without causing a React update on every frame.
        camera.position.toArray(probe.camera);
      }
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
        let { parent } = node;
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
        device: device.current,
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
          <Button size="sm" onClick={() => startCameraTour()}>
            Run 60-second camera tour
          </Button>
          {tour && !['complete', 'cancelled'].includes(tour.phase) && (
            <Button size="sm" variant="outline" onClick={cancelCameraTour}>
              Cancel camera tour
            </Button>
          )}
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
              {JSON.stringify(
                { probe, tour: tour ? { ...tour, samples: tour.samples.length } : null },
                null,
                2,
              )}
            </pre>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
