import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from 'zustand';
import { Html, Line, OrbitControls, Environment, Lightformer } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import {
  DoubleSide,
  Plane,
  Raycaster,
  Shape,
  Vector2,
  Vector3,
  PerspectiveCamera,
  type Camera,
  type CanvasTexture,
} from 'three';
import type { OrbitControls as Controls } from 'three-stdlib';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { metresToSource } from '@/features/building/model/floor-coordinates.ts';
import { useFloorImage } from '../hooks/use-floor-image.ts';
import { fitFloorImage } from '../model/floor-image.ts';
import { sampleSurfaceColor } from '../model/surface-color.ts';
import { activeFloor, selectionPivot, unfinished, type StudioStore } from '../model/store.ts';
import { createObject } from '../model/inventory.ts';
import { withPreset } from '../model/presets.ts';
import { transformGroup } from '../model/grouping.ts';
import {
  AuthoringSpatialIndex,
  bounds2FromPoints,
  type Bounds2,
} from '../model/authoring-spatial-index.ts';
import { studioDebugEnabled } from '../hooks/use-studio-debug.ts';
import {
  staticBlockers,
  overlaps,
  footprint,
  objectPoints,
  objectFromDrawing,
  visualHeight,
} from '../model/geometry.ts';
import { placementError, resizeFromPointer, resizeObjectSafely, insideBoundary } from '../model/geometry.ts';
import { isStructuralRecipe, nearestScreenAlignment, snapStructuralAngle, type ScreenAlignmentCandidate } from '../model/alignment.ts';
import { referencePoint } from '../model/coordinates.ts';
import {
  isBooth,
  objectSchema,
  polygonSchema,
  type PlanFloor,
  type PlanObject,
} from '../model/types.ts';
import { formatPrice, heatColor, statusColors, type StudioView } from '../model/view.ts';
import {
  captureViewportCameraSnapshot,
  readViewportCameraSnapshot,
  restoreViewportCameraSnapshot,
  saveViewportCameraSnapshot,
  type CameraViewport,
} from '../model/camera-snapshots.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import { RouteVisuals } from '../wayfinding/rendering/RouteVisuals.tsx';
import { GameScene } from '../wayfinding/game/GameScene.tsx';

import { routeGhostIds } from '../wayfinding/rendering/route-ghost.ts';
import { selectActiveResult, useWayfindingStore } from '../wayfinding/store/wayfinding-store.ts';
import { usePlaybackStore } from '../wayfinding/store/playback-store.ts';
import { toast } from 'sonner';
import { WalkthroughLayer } from '../wayfinding/walkthrough/WalkthroughLayer.tsx';
import { PlaybackMotionProvider } from '../wayfinding/walkthrough/motion-context.tsx';

interface Bridge {
  camera: Camera | null;
  project: (x: number, y: number) => [number, number] | null;
  projectWorld: (point: [number, number]) => [number, number] | null;
}
interface AlignTarget {
  kind: 'endpoint' | 'edge' | 'wall';
  points: [number, number][];
  id: string;
}
interface AlignEdge {
  target: AlignTarget;
  edgeIndex: number;
  a: [number, number];
  b: [number, number];
}
interface AlignGeometry {
  key: string;
  index: AuthoringSpatialIndex<AlignEdge>;
}
interface ObjectEventDispatch {
  onPointerOver: (id: string, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (id: string) => void;
  onClick: (id: string, event: ThreeEvent<MouseEvent>) => void;
  onPointerDown: (id: string, event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (id: string, event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (id: string, event: ThreeEvent<PointerEvent>) => void;
}
interface ObjectEventDispatchRef {
  current: ObjectEventDispatch;
}
interface ObjectLayerProps {
  object: PlanObject;
  color: string;
  colorOverride: boolean;
  selected: boolean;
  topDown: boolean;
  routeCutaway: boolean;
  eventDispatch: ObjectEventDispatchRef;
}
/**
 * Keep the per-object event props stable while FloorCanvas refreshes its latest-state dispatch.
 * This lets memoized object layers skip pointer/sidebar-only updates without capturing stale state.
 */
const ObjectLayer = memo(function ObjectLayer({
  object,
  color,
  colorOverride,
  selected,
  topDown,
  routeCutaway,
  eventDispatch,
}: ObjectLayerProps) {
  const events = useMemo(() => ({
    onPointerOver: (event: ThreeEvent<PointerEvent>) =>
      eventDispatch.current.onPointerOver(object.id, event),
    onPointerOut: () => eventDispatch.current.onPointerOut(object.id),
    onClick: (event: ThreeEvent<MouseEvent>) => eventDispatch.current.onClick(object.id, event),
    onPointerDown: (event: ThreeEvent<PointerEvent>) =>
      eventDispatch.current.onPointerDown(object.id, event),
    onPointerMove: (event: ThreeEvent<PointerEvent>) =>
      eventDispatch.current.onPointerMove(object.id, event),
    onPointerUp: (event: ThreeEvent<PointerEvent>) =>
      eventDispatch.current.onPointerUp(object.id, event),
  }), [eventDispatch, object.id]);

  return (
    <ProceduralObject
      object={object}
      color={color}
      colorOverride={colorOverride}
      selected={selected}
      topDown={topDown}
      routeCutaway={routeCutaway}
      {...events}
    />
  );
});
/**
 * World distance covered by the snap threshold. The camera scale is evaluated at the pointer
 * and at the far corner of the floor, so a candidate that sits further from the camera than
 * the pointer is still kept.
 */
function snapWorldRadius(
  camera: Camera,
  pointer: [number, number],
  viewportHeight: number,
  heightOffset: number,
  far: [number, number],
): number {
  if (viewportHeight <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const near = camera.position.distanceTo(new Vector3(pointer[0], heightOffset, pointer[1]));
  const farDistance = camera.position.distanceTo(new Vector3(far[0], heightOffset, far[1]));
  const distance = Math.max(near, farDistance);
  if (camera instanceof PerspectiveCamera) {
    const worldPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight;
    return worldPerPixel * 12;
  }
  const orthographic = camera as unknown as { top: number; bottom: number };
  const worldPerPixel = (orthographic.top - orthographic.bottom) / viewportHeight;
  return worldPerPixel * 12;
}
function CameraBridge({
  bridge,
  element,
  floor,
  view,
  frozen = false,
  viewport = 'builder',
  snapshotFloorId,
}: {
  bridge: React.RefObject<Bridge>;
  element: React.RefObject<HTMLDivElement | null>;
  floor: PlanFloor;
  view: StudioView;
  frozen?: boolean;
  viewport?: CameraViewport;
  snapshotFloorId?: string;
}) {
  const { camera, invalidate, gl, size } = useThree();
  const controls = useRef<Controls>(null);
  const restoration = useRef({ frozen: false, pending: false, camera });
  const lastApplied = useRef<{
    viewport: CameraViewport;
    floorId: string;
    cameraMode: StudioView['camera'];
    cameraRevision: number;
  } | null>(null);
  const storageFloorId = snapshotFloorId ?? floor.source.id;
  const bounds = polygonBounds(floor.boundary),
    cx = (bounds.minX + bounds.maxX) / 2,
    cz = (bounds.minZ + bounds.maxZ) / 2;
  const height = Math.max(0, ...floor.objects.map(visualHeight));
  useEffect(() => {
    if (frozen) {
      restoration.current.frozen = true;
      return;
    }
    if (restoration.current.frozen) {
      restoration.current = { frozen: false, pending: true, camera };
      return;
    }
    if (restoration.current.pending) {
      if (camera !== restoration.current.camera) {
        restoration.current.pending = false;
      }
      return;
    }
    const previous = lastApplied.current;
    const sameViewportFloor =
      previous?.viewport === viewport && previous.floorId === floor.source.id;
    const resetRequested = sameViewportFloor && previous.cameraRevision !== view.cameraRevision;
    const presetRequested = sameViewportFloor && previous.cameraMode !== view.camera;
    const saved =
      !resetRequested && !presetRequested
        ? readViewportCameraSnapshot(viewport, storageFloorId)
        : null;
    if (saved && controls.current) {
      restoreViewportCameraSnapshot(camera as PerspectiveCamera, controls.current, saved);
      lastApplied.current = {
        viewport,
        floorId: floor.source.id,
        cameraMode: view.camera,
        cameraRevision: view.cameraRevision,
      };
      invalidate();
      return;
    }
    const target = new Vector3(cx, floor.source.heightOffset + height / 2, cz);
    const direction = new Vector3(
      ...(view.camera === 'top' ? ([0, 1, 0.00001] as const) : ([0.15, 0.9, 0.55] as const)),
    ).normalize();
    const right = new Vector3().crossVectors(camera.up, direction).normalize(),
      up = new Vector3().crossVectors(direction, right).normalize();
    const vertical = Math.tan(
        ((camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() : 45) * Math.PI) / 360,
      ),
      horizontal = vertical * Math.max(0.01, size.width / Math.max(1, size.height));
    let distance = 0.1;
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const y of [floor.source.heightOffset, floor.source.heightOffset + height]) {
        for (const z of [bounds.minZ, bounds.maxZ]) {
          const point = new Vector3(x, y, z).sub(target);
          distance = Math.max(
            distance,
            point.dot(direction) +
              Math.max(Math.abs(point.dot(right)) / horizontal, Math.abs(point.dot(up)) / vertical),
          );
        }
      }
    }
    distance *= 1.15;
    camera.position.copy(target).addScaledVector(direction, distance);
    if (camera instanceof PerspectiveCamera) {
      camera.near = Math.min(0.1, distance / 100);
      camera.far = Math.max(5000, distance * 8);
      camera.updateProjectionMatrix();
    }
    controls.current?.target.copy(target);
    controls.current?.update();
    if (controls.current) {
      saveViewportCameraSnapshot(
        viewport,
        storageFloorId,
        captureViewportCameraSnapshot(camera as PerspectiveCamera, controls.current.target),
      );
    }
    lastApplied.current = {
      viewport,
      floorId: floor.source.id,
      cameraMode: view.camera,
      cameraRevision: view.cameraRevision,
    };
    invalidate();
  }, [
    floor.source.id,
    storageFloorId,
    cx,
    cz,
    viewport,
    camera,
    invalidate,
    view.camera,
    view.cameraRevision,
    frozen,
  ]);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const save = () =>
      saveViewportCameraSnapshot(
        viewport,
        storageFloorId,
        captureViewportCameraSnapshot(camera as PerspectiveCamera, orbit.target),
      );
    orbit.addEventListener('change', save);
    save();
    return () => orbit.removeEventListener('change', save);
  }, [camera, storageFloorId, viewport]);
  useEffect(() => {
    const raycaster = new Raycaster(),
      ndc = new Vector2(),
      point = new Vector3(),
      plane = new Plane(new Vector3(0, 1, 0), -floor.source.heightOffset);
    bridge.current.camera = camera;
    bridge.current.projectWorld = (world) => {
      const rect = element.current?.getBoundingClientRect();
      if (!rect) return null;
      const projected = new Vector3(world[0], floor.source.heightOffset, world[1]).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      return [rect.left + (projected.x + 1) * rect.width / 2, rect.top + (1 - projected.y) * rect.height / 2];
    };
    bridge.current.project = (x, y) => {
      const rect = element.current?.getBoundingClientRect();
      if (!rect || x < rect.left || y < rect.top || x > rect.right || y > rect.bottom) {
        return null;
      }
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, point) ? [point.x, point.z] : null;
    };
    gl.domElement.dataset.planCanvas = 'true';
    return () => {
      bridge.current.camera = null;
      bridge.current.project = () => null;
      bridge.current.projectWorld = () => null;
    };
  }, [bridge, camera, element, floor.source.heightOffset, gl]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      enableRotate={!view.orbitLocked}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={Math.max(
        0.05,
        Math.min(2, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.05),
      )}
      maxDistance={Math.max(
        2000,
        Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, height) * 30,
      )}
    />
  );
}
function ControlsPolicy({ enabled }: { enabled: boolean }) {
  const controls = useThree((state) => state.controls);
  useEffect(() => {
    if (controls && 'enabled' in controls) {
      controls.enabled = enabled;
    }
    return () => {
      if (controls && 'enabled' in controls) {
        controls.enabled = true;
      }
    };
  }, [controls, enabled]);
  return null;
}
function SelectionAnchor({
  position,
  element,
  onAnchor,
}: {
  position: [number, number, number];
  element: React.RefObject<HTMLDivElement | null>;
  onAnchor: (anchor: { x: number; y: number; width: number; height: number } | null) => void;
}) {
  const camera = useThree((state) => state.camera);
  const previous = useRef<[number, number] | null>(null);
  const point = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const bounds = element.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    point.set(...position).project(camera);
    const x = (point.x + 1) * 0.5 * bounds.width;
    const y = (1 - point.y) * 0.5 * bounds.height;
    if (point.z < -1 || point.z > 1) { onAnchor(null); previous.current = null; return; }
    const old = previous.current;
    if (!old || Math.abs(old[0] - x) > 1 || Math.abs(old[1] - y) > 1) {
      previous.current = [x, y];
      onAnchor({ x, y, width: bounds.width, height: bounds.height });
    }
  });
  return null;
}

function RotationRing({
  object,
  floor,
  store,
  bridge,
  pivot,
  onExit,
}: {
  object?: PlanObject;
  floor: PlanFloor;
  store: StudioStore;
  bridge: React.RefObject<Bridge>;
  pivot: [number, number];
  onExit: () => void;
}) {
  const gesture = useRef<{ pointerId: number; startYaw: number; startAngle: number; pivot: [number, number]; changed: boolean } | null>(null);
  const position: [number, number, number] = [pivot[0], floor.source.heightOffset + 0.12, pivot[1]];
  const start = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (object?.locked) { toast.error(`${object.name} is locked. Unlock it before rotating.`); onExit(); return; }
    if (unfinished(store.getState())) { toast.error('Finish or cancel the current action before rotating.'); onExit(); return; }
    const point = bridge.current.project(event.clientX, event.clientY);
    if (!point) return;
    gesture.current = { pointerId: event.pointerId, startYaw: object?.yawRadians ?? 0, startAngle: Math.atan2(point[1] - pivot[1], point[0] - pivot[0]), pivot: [...pivot], changed: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = bridge.current.project(event.clientX, event.clientY);
    if (!point) return;
    const angle = Math.atan2(point[1] - current.pivot[1], point[0] - current.pivot[0]);
    const delta = Math.atan2(Math.sin(angle - current.startAngle), Math.cos(angle - current.startAngle));
    const yawRadians = object && isStructuralRecipe(object.recipe)
      ? snapStructuralAngle(current.startYaw + delta, event.altKey)
      : current.startYaw + delta;
    const yawDelta = yawRadians - current.startYaw;
    if (Math.abs(yawDelta) < 1e-8) return;
    if (store.getState().rotateSelection(yawDelta, true)) current.changed = true;
  };
  const finish = (event?: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (cancel) store.getState().cancel();
    else if (current.changed) {
      const warning = store.getState().message;
      if (!store.getState().apply()) toast.error(store.getState().message || 'Selected items could not be rotated.');
      else if (warning.includes('stayed locked')) toast.warning(warning);
    }
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onExit();
  };
  return <Html position={position} center zIndexRange={[30, 0]} style={{ pointerEvents: 'auto' }}>
    <button className="fp-rotation-ring" type="button" aria-label="Drag to rotate selected item; hold Alt for free rotation" title="Drag to rotate · Alt for free angle" onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(undefined, true); } }} />
  </Html>;
}

function StableFrame({ onStable }: { onStable: () => void }) {
  const completed = useRef(false);
  const callback = useRef(onStable);
  callback.current = onStable;
  const frame = useRef<number | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    // Demand-rendered canvases need an explicit wake after mount. This also
    // lets a canceled readiness check retry after effect cleanup/remount.
    invalidate();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [invalidate]);
  useFrame(() => {
    if (completed.current || frame.current !== null) return;
    // useFrame runs before R3F submits this frame; defer until the browser has
    // advanced past it so BuilderLoading never dismisses on a pre-render signal.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (completed.current) return;
        completed.current = true;
        callback.current();
      });
    });
  });
  return null;
}
function FloorSurface({
  floor,
  texture,
  imageSize,
  click,
  move,
  pointerDown,
}: {
  floor: PlanFloor;
  texture: CanvasTexture | null;
  imageSize: [number, number] | null;
  click: (event: ThreeEvent<MouseEvent>) => void;
  move: (event: ThreeEvent<PointerEvent>) => void;
  pointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const bounds = polygonBounds(floor.boundary);
  const shape = useMemo(() => {
    const value = new Shape();
    floor.boundary.forEach(([x, z], i) => (i ? value.lineTo(x, -z) : value.moveTo(x, -z)));
    value.closePath();
    return value;
  }, [floor.boundary]);
  const imageFit = imageSize ? fitFloorImage(floor.boundary, imageSize) : null;
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={click}
        onPointerDown={pointerDown}
        onPointerMove={move}
        receiveShadow
      >
        <shapeGeometry
          args={[shape]}
          onUpdate={(geometry) => {
            const positions = geometry.getAttribute('position'),
              uv = geometry.getAttribute('uv');
            const size = floor.source.authoring?.imageSize ?? imageSize;
            for (let i = 0; i < positions.count; i++) {
              const world: [number, number] = [positions.getX(i), -positions.getY(i)];
              const source = metresToSource(world, floor.source.coordinateSystem);
              const u =
                size && floor.source.coordinateSystem?.units === 'pixels'
                  ? source[0] / size[0]
                  : (world[0] - bounds.minX) / (bounds.maxX - bounds.minX);
              const v =
                size && floor.source.coordinateSystem?.units === 'pixels'
                  ? source[1] / size[1]
                  : (world[1] - bounds.minZ) / (bounds.maxZ - bounds.minZ);
              uv.setXY(i, u, 1 - v);
            }
            uv.needsUpdate = true;
          }}
        />
        <meshStandardMaterial color="#d7ddd7" roughness={0.94} side={DoubleSide} />
      </mesh>
      {texture && imageFit && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[imageFit.center[0], 0.001, imageFit.center[1]]}
          raycast={() => {}}
        >
          <planeGeometry args={[imageFit.width, imageFit.depth]} />
          <meshBasicMaterial
            map={texture}
            toneMapped={false}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            side={DoubleSide}
          />
        </mesh>
      )}
      {texture && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
          receiveShadow
          raycast={() => {}}
        >
          <shapeGeometry args={[shape]} />
          <shadowMaterial transparent opacity={0.25} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
function ZoneMesh({
  polygon,
  color,
  selected,
  onClick,
  onPointerDown,
}: {
  polygon: [number, number][];
  color: string;
  selected?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const shape = useMemo(() => {
    const value = new Shape();
    polygon.forEach(([x, z], i) => (i ? value.lineTo(x, -z) : value.moveTo(x, -z)));
    value.closePath();
    return value;
  }, [polygon]);
  const outline = polygon.map(([x, z]): [number, number, number] => [x, 0.04, z]);
  outline.push(outline[0]!);
  return (
    <group>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick} onPointerDown={onPointerDown}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial
          color={color}
          opacity={selected ? 0.35 : 0.18}
          transparent
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <Line points={outline} color={color} lineWidth={selected ? 2.5 : 1} />
    </group>
  );
}
export function FloorCanvas({
  store,
  view,
  onInteract,
  onSelectionAnchor,
  rotationActive = false,
  onRotationActiveChange,
  onStableFrame,
  readinessGeneration = 0,
  showRouteLabels = true,
}: {
  store: StudioStore;
  view: StudioView;
  onInteract: () => void;
  onSelectionAnchor?: (anchor: { x: number; y: number; width: number; height: number } | null) => void;
  rotationActive?: boolean;
  onRotationActiveChange?: (active: boolean) => void;
  onStableFrame?: () => void;
  readinessGeneration?: number;
  showRouteLabels?: boolean;
}) {
  // Subscribe to the slices the canvas actually draws. Editor messages, save state and focus
  // ticks change constantly and must not re-render the whole scene.
  const state = useStore(
    store,
    useShallow((value) => ({
      document: value.document,
      revision: value.revision,
      floorId: value.floorId,
      selection: value.selection,
      selectionSet: value.selectionSet,
      tool: value.tool,
      recipe: value.recipe,
      presetId: value.presetId,
      placementYaw: value.placementYaw,
      pointer: value.pointer,
      drawing: value.drawing,
      pendingObject: value.pendingObject,
      pendingObjects: value.pendingObjects,
      pendingZone: value.pendingZone,
      pendingZones: value.pendingZones,
      pendingFloor: value.pendingFloor,
      pendingRemoval: value.pendingRemoval,
    })),
  );
  const floor = activeFloor(state),
    image = useFloorImage(floor);
  useEffect(() => {
    if (!state.selection) onSelectionAnchor?.(null);
  }, [state.selection?.id, state.selection?.kind, onSelectionAnchor]);
  const debug = studioDebugEnabled();
  const imageUrl = floor.source.authoring?.originalImage ?? floor.source.image;
  useEffect(() => {
    if (!image.size || !imageUrl) {
      return;
    }
    const { size } = image;
    store.setState((current) => {
      const known = current.imageSizes[floor.source.id];
      return known?.url === imageUrl && known.size[0] === size[0] && known.size[1] === size[1]
        ? current
        : { imageSizes: { ...current.imageSizes, [floor.source.id]: { url: imageUrl, size } } };
    });
  }, [store, floor.source.id, imageUrl, image.size]);
  const element = useRef<HTMLDivElement>(null),
    bridge = useRef<Bridge>({ camera: null, project: () => null, projectWorld: () => null });
  const drag = useRef<{
    id: string;
    original: PlanObject;
    start: [number, number];
    duplicate: boolean;
    pointerId: number;
    startScreen: [number, number];
    moved: boolean;
    handle?: [number, number];
  } | null>(null);
  const objectEventDispatch = useRef<ObjectEventDispatch>({
    onPointerOver: () => {},
    onPointerOut: () => {},
    onClick: () => {},
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
  });
  const [dragging, setDragging] = useState(false),
    [contextLost, setContextLost] = useState(false);
  const marquee = useRef<{ pointerId: number; startWorld: [number, number]; endWorld: [number, number]; startScreen: [number, number]; endScreen: [number, number]; shiftKey: boolean; moved: boolean } | null>(null);
  const [marqueeFrame, setMarqueeFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [alignmentGuide, setAlignmentGuide] = useState<[number, number, number, number] | null>(null);
  /**
   * Structural alignment geometry is scanned once per applied document, not once per pointer
   * move. The cached targets are world-space, so they stay valid while the camera orbits.
   */
  const alignCache = useRef<AlignGeometry | null>(null);
  const alignCandidateScratch = useRef<AlignEdge[]>([]);
  const alignmentGeometry = (): AlignGeometry => {
    const key = `${floor.source.id}:${state.revision}:${floor.objects.length}:${floor.boundary.length}`;
    const cached = alignCache.current;
    if (cached && cached.key === key) {
      return cached;
    }
    const targets: AlignTarget[] = [];
    for (const object of floor.objects) {
      if (!isStructuralRecipe(object.recipe)) continue;
      targets.push({ kind: 'endpoint', points: footprint(object), id: object.id });
    }
    for (const [index, wall] of (floor.source.authoring?.walls ?? []).entries()) {
      targets.push({
        kind: 'wall',
        points: [referencePoint(floor, wall.start), referencePoint(floor, wall.end)],
        id: `wall-${index}`,
      });
    }
    for (const [index, room] of (floor.referenceRooms ?? []).entries()) {
      const polygon = room.polygon.map((point) => referencePoint(floor, point));
      if (polygon.length >= 2) targets.push({ kind: 'wall', points: polygon, id: `room-wall-${index}` });
    }
    for (const [index, a] of floor.boundary.entries()) {
      const end = floor.boundary[(index + 1) % floor.boundary.length]!;
      targets.push({ kind: 'wall', points: [a, end], id: `boundary-${index}` });
    }
    const edges: AlignEdge[] = [];
    for (const target of targets) {
      const edgeCount = target.points.length > 2 ? target.points.length : 1;
      for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
        const a = target.points[edgeIndex]!;
        const b = target.points.length > 2
          ? target.points[(edgeIndex + 1) % target.points.length]!
          : target.points[1]!;
        edges.push({ target, edgeIndex, a, b });
      }
    }
    const geometry: AlignGeometry = {
      key,
      index: new AuthoringSpatialIndex(
        edges.map((edge) => ({ bounds: bounds2FromPoints([edge.a, edge.b]), value: edge })),
      ),
    };
    alignCache.current = geometry;
    return geometry;
  };
  const [hover, setHover] = useState<{ id: string; x: number; y: number; context: string } | null>(
    null,
  );
  /**
   * The hover tooltip is stamped with the context that produced it. A changed
   * floor, revision, tool or camera invalidates the stamp, so a stale tooltip is
   * dropped during render instead of by an effect that writes state back into
   * the tree. That effect could re-arm itself against a moving pointer and
   * exceed React's nested update limit.
   */
  const hoverContext = `${state.floorId}:${state.revision}:${state.tool}:${view.cameraRevision}:${view.touring}`;
  const activeHover = hover && hover.context === hoverContext ? hover : null;
  const hovered =
    !dragging && state.tool === 'select'
      ? floor.objects.find(
          (object) =>
            object.id === activeHover?.id &&
            isBooth(object) &&
            object.id !== state.pendingRemoval?.id,
        )
      : undefined;
  const boothPrices = useMemo(
    () => floor.objects.filter(isBooth).map((object) => object.price),
    [floor.objects],
  );
  const minPrice = boothPrices.length ? Math.min(...boothPrices) : 0,
    maxPrice = boothPrices.length ? Math.max(...boothPrices.map((price) => price || 1)) : 1;
  const definition = useMemo(
    () => ({
      ...withPreset(createObject(state.recipe, [0, 0], floor.objects), state.presetId),
      yawRadians: state.placementYaw,
    }),
    [state.recipe, state.presetId, state.placementYaw, floor.objects],
  );
  const selectedObject = floor.objects.find(
    (object) => object.id === state.selection?.id && object.id !== state.pendingRemoval?.id,
  );
  const rotationObject = state.selection?.kind === 'object'
    ? selectedObject
    : state.selectionSet
        .filter((selection) => selection.kind === 'object')
        .map((selection) => floor.objects.find((object) => object.id === selection.id))
        .find((object) => object && !object.locked);
  const rotationAllowed = state.selection?.kind === 'object'
    ? !!selectedObject && !selectedObject.locked
    : !!floor.zones.find((zone) => zone.id === state.selection?.id && !zone.locked);
  const ghost =
    state.pointer &&
    ['place', 'move', 'duplicate'].includes(state.tool) &&
    !selectedObject?.locked &&
    !(state.selection?.kind === 'zone' && state.tool !== 'place')
      ? {
          ...(state.tool === 'place' || !selectedObject ? definition : selectedObject),
          position: state.pointer,
        }
      : null;
  const selectedZone = floor.zones.find((zone) => zone.id === state.selection?.id);
  const zoneBounds = selectedZone ? polygonBounds(selectedZone.polygon) : null;
  const zoneGhost =
    selectedZone && !selectedZone.locked && zoneBounds && state.pointer && ['move', 'duplicate'].includes(state.tool)
      ? selectedZone.polygon.map(([x, z]): [number, number] => [
          x + state.pointer![0] - (zoneBounds.minX + zoneBounds.maxX) / 2,
          z + state.pointer![1] - (zoneBounds.minZ + zoneBounds.maxZ) / 2,
        ])
      : null;
  const pendingMembers = useMemo(
    () =>
      state.pendingObjects?.length
        ? state.pendingObjects
        : state.pendingObject && selectedObject && objectSchema.safeParse(state.pendingObject).success
          ? transformGroup(floor, selectedObject, state.pendingObject)
          : [],
    [floor, selectedObject, state.pendingObject, state.pendingObjects],
  );
  const pendingMemberById = useMemo(() => {
    const members = new Map<string, PlanObject>();
    for (const member of pendingMembers) {
      if (!members.has(member.id)) members.set(member.id, member);
    }
    return members;
  }, [pendingMembers]);
  const selectedObjectIds = useMemo(() => {
    const ids = new Set(
      state.selectionSet
        .filter((selection) => selection.kind === 'object')
        .map((selection) => selection.id),
    );
    if (selectedObject?.groupId) {
      for (const object of floor.objects) {
        if (object.groupId === selectedObject.groupId) ids.add(object.id);
      }
    }
    return ids;
  }, [floor.objects, selectedObject?.groupId, state.selectionSet]);
  const ghostMembers =
    ghost && selectedObject && ['move', 'duplicate'].includes(state.tool)
      ? transformGroup(floor, selectedObject, ghost)
      : ghost
        ? [ghost]
        : [];
  const duplicateMode = drag.current?.duplicate || state.tool === 'duplicate';
  const candidates = (state.pendingObject ? pendingMembers : ghostMembers).map((object) =>
    duplicateMode ? Object.assign({}, object, { id: `ghost-copy:${object.id}` }) : object,
  );
  const alignPointer = (point: [number, number] | null, clientX: number, clientY: number, altKey: boolean) => {
    if (!point || altKey) { setAlignmentGuide(null); return point; }
    const current = store.getState();
    const moving = current.tool === 'place' ? definition : selectedObject;
    if (!moving || !['place', 'move', 'duplicate'].includes(current.tool)) { setAlignmentGuide(null); return point; }
    const movingAtPointer = { ...moving, position: point };
    const movingPoints = footprint(movingAtPointer);
    const rect = element.current?.getBoundingClientRect();
    const camera = bridge.current.camera;
    if (!rect || !camera) {
      setAlignmentGuide(null);
      return point;
    }
    const bounds = polygonBounds(floor.boundary);
    const farCorner: [number, number] = camera.position.x > bounds.minX ? [bounds.maxX, bounds.maxZ] : [bounds.minX, bounds.minZ];
    // Only candidates within the snap threshold can win, so they are pruned in world space
    // before the far more expensive screen projection runs.
    const worldRadius = snapWorldRadius(camera, point, rect.height, floor.source.heightOffset, farCorner);
    const movingBounds = bounds2FromPoints(movingPoints);
    let nearbyEdges = alignCandidateScratch.current;
    const coordinateScale = movingBounds
      ? Math.max(
          1,
          Math.abs(movingBounds.minX),
          Math.abs(movingBounds.minZ),
          Math.abs(movingBounds.maxX),
          Math.abs(movingBounds.maxZ),
          Math.abs(worldRadius),
        )
      : 1;
    const broadphaseRadius =
      worldRadius >= 0
        ? worldRadius + Number.EPSILON * coordinateScale * 8
        : worldRadius;
    const queryBounds: Bounds2 = movingBounds
      ? {
          minX: movingBounds.minX - broadphaseRadius,
          minZ: movingBounds.minZ - broadphaseRadius,
          maxX: movingBounds.maxX + broadphaseRadius,
          maxZ: movingBounds.maxZ + broadphaseRadius,
        }
      : { minX: Number.NaN, minZ: Number.NaN, maxX: Number.NaN, maxZ: Number.NaN };
    nearbyEdges = alignmentGeometry().index.query(queryBounds, nearbyEdges);
    const projected = new Vector3();
    const project = (world: [number, number]): [number, number] | null => {
      projected.set(world[0], floor.source.heightOffset, world[1]).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      return [
        rect.left + ((projected.x + 1) * rect.width) / 2,
        rect.top + ((1 - projected.y) * rect.height) / 2,
      ];
    };
    const screenCandidates: ScreenAlignmentCandidate[] = [];
    const pushCandidate = (kind: ScreenAlignmentCandidate['kind'], id: string, target: [number, number], offset: [number, number]) => {
      const center: [number, number] = [target[0] - offset[0], target[1] - offset[1]];
      const screenPoint = project(center);
      if (screenPoint) screenCandidates.push({ id, kind, screenPoint, worldPoint: center });
    };
    for (const edge of nearbyEdges) {
      const { target, edgeIndex, a, b } = edge;
      if (target.kind === 'endpoint' && target.id === moving.id) continue;
      for (const vertex of movingPoints) {
        const offset: [number, number] = [vertex[0] - point[0], vertex[1] - point[1]];
        if (target.kind === 'endpoint') {
          if (Math.hypot(a[0] - vertex[0], a[1] - vertex[1]) <= worldRadius) {
            pushCandidate('endpoint', `${target.id}-v${edgeIndex}`, a, offset);
          }
        }
        const t = Math.max(0, Math.min(1, ((vertex[0] - a[0]) * (b[0] - a[0]) + (vertex[1] - a[1]) * (b[1] - a[1])) / Math.max(1e-8, (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
        const nearest: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        if (Math.hypot(nearest[0] - vertex[0], nearest[1] - vertex[1]) > worldRadius) {
          continue;
        }
        pushCandidate(target.kind === 'endpoint' ? 'edge' : 'wall', `${target.id}-e${edgeIndex}`, nearest, offset);
      }
    }
    const pointer = [clientX, clientY] as [number, number];
    const nearest = nearestScreenAlignment(pointer, screenCandidates, 12, { recipe: moving.recipe, alt: altKey });
    if (!nearest) { setAlignmentGuide(null); return point; }
    setAlignmentGuide([point[0], point[1], nearest.worldPoint[0], nearest.worldPoint[1]]);
    return nearest.worldPoint;
  };
  const candidateFloor = {
    ...floor,
    objects: [
      ...floor.objects.filter(
        (object) => !candidates.some((candidate) => candidate.id === object.id),
      ),
      ...candidates,
    ],
  };
  const placementMessages = candidates
    .map((object) => placementError(object, candidateFloor))
    .filter((message): message is string => !!message);
  const ghostError = placementMessages[0] ?? null;
  const conflictIds = new Set(
    floor.objects
      .filter(
        (object) =>
          !candidates.some((candidate) => candidate.id === object.id) &&
          object.collidable &&
          candidates.some(
            (candidate) =>
              candidate.collidable && overlaps(footprint(candidate), footprint(object)),
          ),
      )
      .map((object) => object.id),
  );
  const candidateValidation = state.pendingObject
    ? objectSchema.safeParse(state.pendingObject)
    : null;
  const objectValidationMessages =
    candidateValidation && !candidateValidation.success
      ? candidateValidation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      : [...new Set(placementMessages)];
  const zoneValidation = state.pendingZone
    ? polygonSchema.safeParse(state.pendingZone.polygon)
    : null;
  const validationMessages = [
    ...objectValidationMessages,
    ...(state.pendingZone && !state.pendingZone.label.trim() ? ['Zone name is required.'] : []),
    ...(zoneValidation && !zoneValidation.success
      ? zoneValidation.error.issues.map(
          (issue) => `Zone vertex ${issue.path.join('.')}: ${issue.message}`,
        )
      : state.pendingZone && !insideBoundary(state.pendingZone.polygon, floor.boundary)
        ? ['Keep the whole zone inside the floor boundary.']
        : []),
  ];
  const invalidPolygon =
    state.pendingObject && !polygonSchema.safeParse(state.pendingObject.polygon).success
      ? footprint(state.pendingObject).filter((point) => point.every(Number.isFinite))
      : state.pendingZone && !polygonSchema.safeParse(state.pendingZone.polygon).success
        ? state.pendingZone.polygon.filter((point) => point.every(Number.isFinite))
        : [];
  const liveRoute = useWayfindingStore(selectActiveResult);
  const playback = usePlaybackStore((playbackState) => playbackState.session);
  const playbackMode = usePlaybackStore((playbackState) => playbackState.mode);
  const activeRoute = playback?.route ?? liveRoute;
  const ghostIds = useMemo(() => {
    if (!activeRoute) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    for (const segment of activeRoute.segments) {
      if (segment.floorId !== floor.source.id || segment.toFloorId) {
        continue;
      }
      for (const id of routeGhostIds(
        segment.points.map(([x, , z]) => [x, z]),
        floor.objects,
      )) {
        ids.add(id);
      }
    }
    return ids;
  }, [activeRoute, floor.objects, floor.source.id]);
  const routeAnimated = useWayfindingStore((wayfinding) => wayfinding.animated);
  const click = (event: ThreeEvent<MouseEvent>, routeItemId?: string) => {
    event.stopPropagation();
    if (usePlaybackStore.getState().session && usePlaybackStore.getState().mode !== 'overview') {
      return;
    }
    const current = store.getState(),
      rawPoint: [number, number] = [event.point.x, event.point.z],
      point = alignPointer(rawPoint, event.clientX, event.clientY, event.nativeEvent.altKey) ?? rawPoint;
    if (event.delta > 3 || drag.current) {
      return;
    }
    if (current.tool === 'route-start' || current.tool === 'route-dest') {
      const end = current.tool === 'route-start' ? 'start' : 'dest';
      const wayfinding = useWayfindingStore.getState();
      const previous = wayfinding.request;
      const endpoint = routeItemId
        ? { floorId: floor.source.id, kind: 'item' as const, itemId: routeItemId }
        : { floorId: floor.source.id, kind: 'point' as const, point };
      wayfinding.setRequest({
        start: end === 'start' ? endpoint : (previous?.start ?? endpoint),
        dest: end === 'dest' ? endpoint : (previous?.dest ?? endpoint),
        accessibleOnly: previous?.accessibleOnly ?? false,
        allowRestricted: previous?.allowRestricted ?? false,
      });
      current.setTool('select');
      return;
    }
    if (
      ['rectangle', 'polygon', 'zone-rectangle', 'zone-polygon', 'blocked-rectangle'].includes(
        current.tool,
      )
    ) {
      if (event.nativeEvent.detail > 1) {
        return;
      }
      if (
        current.tool === 'polygon' &&
        current.drawing.length >= 3 &&
        Math.hypot(point[0] - current.drawing[0]![0], point[1] - current.drawing[0]![1]) < 0.3
      ) {
        if (!current.apply()) toast.error(current.message || 'Polygon could not be created.');
        return;
      }
      current.addPoint(point);
      if (current.tool.includes('rectangle') && store.getState().drawing.length === 2) {
        store.getState().apply();
      }
    } else if (['place', 'move', 'duplicate', 'spawn'].includes(current.tool)) {
      if (!current.place(point)) {
        toast.error(store.getState().message || 'That placement is not valid.');
      } else if (store.getState().message.includes('stayed locked')) {
        toast.warning(store.getState().message);
      }
      setAlignmentGuide(null);
    } else {
      if (!event.nativeEvent.shiftKey) current.select(null);
    }
  };
  const beginMarquee = (event: ThreeEvent<PointerEvent>) => {
    const current = store.getState();
    if (current.tool !== 'select' || view.camera !== 'top' || event.button !== 0 || unfinished(current)) return;
    event.stopPropagation();
    // R3F registers its pointer listeners passively, so preventDefault is not allowed here.
    // The canvas disables text selection instead.
    event.nativeEvent.stopImmediatePropagation();
    const rect = element.current?.getBoundingClientRect();
    if (!rect) return;
    const local: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
    marquee.current = {
      pointerId: event.pointerId,
      startWorld: [event.point.x, event.point.z],
      endWorld: [event.point.x, event.point.z],
      startScreen: local,
      endScreen: local,
      shiftKey: event.nativeEvent.shiftKey,
      moved: false,
    };
    setDragging(true);
  };
  const finish = () => {
    if (store.getState().drawing.length >= 3) {
      const current = store.getState();
      if (!current.apply()) toast.error(current.message || 'Polygon could not be created.');
    }
  };
  const drawing = [...state.drawing];
  if (state.pointer && drawing.length) {
    if (state.tool.includes('rectangle')) {
      const first = drawing[0]!;
      drawing.splice(
        0,
        drawing.length,
        first,
        [state.pointer[0], first[1]],
        state.pointer,
        [first[0], state.pointer[1]],
        first,
      );
    } else {
      drawing.push(state.pointer);
    }
  }
  const drawingPolygon = [...drawing];
  if (
    drawingPolygon.length > 1 &&
    drawingPolygon[0]!.every((value, axis) => value === drawingPolygon.at(-1)![axis])
  ) {
    drawingPolygon.pop();
  }
  if (drawingPolygon.length >= 3) {
    const result = polygonSchema.safeParse(drawingPolygon);
    if (!result.success) {
      validationMessages.push(...result.error.issues.map((issue) => `Drawing: ${issue.message}`));
    } else if (!insideBoundary(drawingPolygon, floor.boundary)) {
      validationMessages.push('Keep the whole drawing inside the floor boundary.');
    } else if (state.tool === 'polygon' || state.tool === 'rectangle') {
      const candidate = objectFromDrawing(
        drawingPolygon,
        withPreset(
          createObject(state.tool === 'polygon' ? 'polygon-booth' : 'booth', [0, 0]),
          state.presetId,
        ),
      );
      const error = placementError(candidate, floor);
      if (error) {
        validationMessages.push(error);
      }
    }
  }
  const endDrag = (event?: ThreeEvent<PointerEvent>, cancel = false) => {
    const active = drag.current;
    if (!active) {
      return;
    }
    drag.current = null;
    setDragging(false);
    if (
      event?.target &&
      'releasePointerCapture' in event.target &&
      typeof event.target.releasePointerCapture === 'function'
    ) {
      event.target.releasePointerCapture(active.pointerId);
    }
    if (!active.moved) {
      return;
    }
    if (cancel) {
      store.getState().cancel();
    } else {
      store.getState().apply();
      store.setState({ tool: 'select' });
    }
    setAlignmentGuide(null);
  };
  // Refresh a single latest-state dispatch object instead of building six inline closures for
  // every object. ObjectLayer callbacks stay stable and resolve the current scene state here.
  const latestObjectEventDispatch: ObjectEventDispatch = {
    onPointerOver: (id, event) => {
      const object = floor.objects.find((item) => item.id === id);
      if (state.tool !== 'select' || dragging || !object || !isBooth(object)) {
        return;
      }
      event.stopPropagation();
      const rect = element.current?.getBoundingClientRect();
      if (rect) {
        setHover({
          id,
          x: Math.max(8, Math.min(rect.width - 180, event.clientX - rect.left + 12)),
          y: Math.max(8, Math.min(rect.height - 90, event.clientY - rect.top + 12)),
          context: hoverContext,
        });
      }
    },
    onPointerOut: () => setHover(null),
    onClick: (id, event) => {
      event.stopPropagation();
      const object = floor.objects.find((item) => item.id === id);
      if (!object || (playback && playbackMode !== 'overview')) {
        return;
      }
      if (dragging || event.delta > 3) {
        return;
      }
      if (state.tool === 'remove') {
        const current = store.getState(), before = current.revision;
        current.remove({ kind: 'object', id });
        const latest = store.getState();
        if (latest.revision === before && latest.message.includes('locked')) toast.error(latest.message);
      } else if (['select', 'move', 'duplicate', 'resize'].includes(state.tool)) {
        if (state.tool === 'select' && event.nativeEvent.shiftKey) {
          const current = store.getState();
          if (!current.toggleSelection({ kind: 'object', id })) toast.error(store.getState().message);
        } else {
          store.getState().select({ kind: 'object', id });
        }
      } else {
        click(event, id);
      }
    },
    onPointerDown: (id, event) => {
      const object = floor.objects.find((item) => item.id === id);
      if (!object || (playback && playbackMode !== 'overview')) {
        return;
      }
      if (state.tool === 'select' && object.managed && event.button === 0) {
        beginMarquee(event);
        return;
      }
      if (state.tool !== 'move' || state.selection?.id !== id || event.button !== 0) {
        return;
      }
      event.stopPropagation();
      if (object.locked) {
        const message = `${object.name} is locked. Unlock it before moving.`;
        store.getState().notify(message);
        toast.error(message);
        return;
      }
      if (unfinished(store.getState()) || drag.current) {
        store.getState().notify('Apply or discard the unfinished edit before dragging.');
        return;
      }
      const point = alignPointer(
        bridge.current.project(event.clientX, event.clientY),
        event.clientX,
        event.clientY,
        event.altKey,
      );
      if (!point) {
        return;
      }
      drag.current = {
        id,
        original: object,
        start: point,
        duplicate: event.shiftKey && state.tool === 'move',
        pointerId: event.pointerId,
        startScreen: [event.clientX, event.clientY],
        moved: false,
      };
      setDragging(true);
      store.getState().setPointer(null);
      if (
        event.target &&
        'setPointerCapture' in event.target &&
        typeof event.target.setPointerCapture === 'function'
      ) {
        event.target.setPointerCapture(event.pointerId);
      }
    },
    onPointerMove: (id, event) => {
      const object = floor.objects.find((item) => item.id === id);
      const active = drag.current;
      if (!object) {
        return;
      }
      if (!active || active.id !== id || active.handle || active.pointerId !== event.pointerId) {
        if (state.tool === 'select' && isBooth(object)) {
          event.stopPropagation();
        }
        return;
      }
      event.stopPropagation();
      if (
        !active.moved &&
        Math.hypot(event.clientX - active.startScreen[0], event.clientY - active.startScreen[1]) < 3
      ) {
        return;
      }
      active.moved = true;
      const point = bridge.current.project(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      const next =
        state.tool === 'resize'
          ? resizeObjectSafely(active.original, ...resizeFromPointer(
              active.original,
              active.start,
              point,
              [1, 1],
              false,
              event.shiftKey || view.resizeAspect,
              view.resizeSnap,
            ).dimensions)
          : {
              ...active.original,
              position: [
                active.original.position[0] + point[0] - active.start[0],
                active.original.position[1] + point[1] - active.start[1],
              ] as [number, number],
            };
      store.getState().patchObject(next);
    },
    onPointerUp: (_id, event) => {
      if (drag.current?.handle) {
        return;
      }
      if (!drag.current || drag.current.pointerId !== event.pointerId) {
        return;
      }
      if (!drag.current.moved) {
        endDrag(event);
        return;
      }
      if (!bridge.current.project(event.clientX, event.clientY)) {
        endDrag(event, true);
        return;
      }
      if (drag.current.duplicate && state.tool === 'move') {
        const next = store.getState().pendingObject;
        if (next) {
          store.getState().cancel();
          store.getState().setTool('duplicate');
          store.getState().place(next.position);
          store.setState({ tool: 'select' });
        }
        drag.current = null;
        setDragging(false);
        if (
          event.target &&
          'releasePointerCapture' in event.target &&
          typeof event.target.releasePointerCapture === 'function'
        ) {
          event.target.releasePointerCapture(event.pointerId);
        }
      } else {
        endDrag(event);
      }
    },
  };
  useLayoutEffect(() => {
    objectEventDispatch.current = latestObjectEventDispatch;
  });
  useEffect(() => {
    if (state.tool === 'select' && drag.current) {
      drag.current = null;
      setDragging(false);
    }
  }, [state.tool]);
  useEffect(() => {
    const stop = () => {
      if (marquee.current) {
        marquee.current = null;
        setMarqueeFrame(null);
        setDragging(false);
      }
      if (!drag.current) {
        return;
      }
      drag.current = null;
      setDragging(false);
      store.getState().cancel();
    };
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('blur', stop);
    };
  }, [store]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = marquee.current;
      const rect = element.current?.getBoundingClientRect();
      if (!active || active.pointerId !== event.pointerId || !rect) return;
      const x = Math.max(rect.left, Math.min(rect.right, event.clientX));
      const y = Math.max(rect.top, Math.min(rect.bottom, event.clientY));
      const point = bridge.current.project(x, y);
      if (!point) return;
      active.endWorld = point;
      active.endScreen = [x - rect.left, y - rect.top];
      active.moved ||= Math.hypot(active.endScreen[0] - active.startScreen[0], active.endScreen[1] - active.startScreen[1]) > 5;
      if (active.moved) {
        setMarqueeFrame({
          left: Math.min(active.startScreen[0], active.endScreen[0]),
          top: Math.min(active.startScreen[1], active.endScreen[1]),
          width: Math.abs(active.endScreen[0] - active.startScreen[0]),
          height: Math.abs(active.endScreen[1] - active.startScreen[1]),
        });
      }
    };
    const finish = (event: PointerEvent, cancel = false) => {
      const active = marquee.current;
      if (!active || active.pointerId !== event.pointerId) return;
      marquee.current = null;
      setMarqueeFrame(null);
      setDragging(false);
      if (cancel || !active.moved) return;
      const current = store.getState();
      const currentFloor = activeFloor(current);
      const box: [number, number][] = [
        [Math.min(active.startWorld[0], active.endWorld[0]), Math.min(active.startWorld[1], active.endWorld[1])],
        [Math.max(active.startWorld[0], active.endWorld[0]), Math.min(active.startWorld[1], active.endWorld[1])],
        [Math.max(active.startWorld[0], active.endWorld[0]), Math.max(active.startWorld[1], active.endWorld[1])],
        [Math.min(active.startWorld[0], active.endWorld[0]), Math.max(active.startWorld[1], active.endWorld[1])],
      ];
      const hits = currentFloor.objects
        .filter((object) => object.managed && !object.locked && overlaps(footprint(object), box))
        .map((object) => ({ kind: 'object' as const, id: object.id }));
      // Zones join the marquee so a single sweep can select objects and areas together.
      const zoneHits = currentFloor.zones
        .filter((zone) => !zone.locked && overlaps(zone.polygon, box))
        .map((zone) => ({ kind: 'zone' as const, id: zone.id }));
      const previous = active.shiftKey ? current.selectionSet : [];
      const allHits = [...hits, ...zoneHits];
      const next = active.shiftKey
        ? [...previous.filter((item) => !allHits.some((hit) => hit.kind === item.kind && hit.id === item.id)), ...allHits.filter((hit) => !previous.some((item) => item.kind === hit.kind && item.id === hit.id))]
        : allHits;
      current.setSelectionSet(next);
    };
    const cancel = (event: PointerEvent) => finish(event, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [store]);
  return (
    <div
      ref={element}
      className="fp-canvas"
      aria-label="Interactive floor plan"
      data-testid="floor-plan-viewport"
      onPointerDownCapture={(event) => {
        setHover(null);
        onInteract();
        if (rotationActive && !(event.target as HTMLElement).closest?.('.fp-rotation-ring')) onRotationActiveChange?.(false);
      }}
      onPointerLeave={() => setHover(null)}
      onWheel={() => {
        setHover(null);
        onInteract();
      }}
      onDoubleClick={finish}
      onContextMenu={(event) => {
        event.preventDefault();
        if (unfinished(store.getState())) store.getState().cancel();
      }}
      onPointerCancel={(event) => {
        if (event.pointerId === drag.current?.pointerId) {
          endDrag(undefined, true);
        }
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          endDrag(undefined, true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-floor-plan-recipe')) {
          event.preventDefault();
          const point = bridge.current.project(event.clientX, event.clientY);
          store.getState().setPointer(alignPointer(point, event.clientX, event.clientY, event.altKey));
        }
      }}
      onDragLeave={(event) => {
        if (!element.current?.contains(event.relatedTarget as Node | null)) {
          store.getState().setPointer(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const rawPoint = bridge.current.project(event.clientX, event.clientY),
          point = alignPointer(rawPoint, event.clientX, event.clientY, event.altKey),
          recipe = event.dataTransfer.getData('application/x-floor-plan-recipe');
        if (point && recipe === store.getState().recipe) {
          store.getState().place(point);
        }
        store.getState().setPointer(null);
      }}
    >
      {contextLost ? (
        <div className="fp-canvas-error" role="alert">
          The graphics context was lost. Your draft is preserved.{' '}
          <button onClick={() => setContextLost(false)}>Reopen viewport</button>
        </div>
      ) : (
        <ErrorBoundary
          fallbackRender={({ resetErrorBoundary }) => (
            <div className="fp-canvas-error" role="alert">
              The viewport could not render. Your document and draft are preserved.{' '}
              <button onClick={resetErrorBoundary}>Reopen viewport</button>
            </div>
          )}
        >
          <Canvas
            shadows
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [20, 38, 38], fov: 45, near: 0.1, far: 5000 }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                'webglcontextlost',
                (event) => {
                  event.preventDefault();
                  setContextLost(true);
                },
                { once: true },
              );
            }}
          >
            {playback ? (
              <GameScene
                document={state.document}
                floorId={floor.source.id}
                batchingEnabled={!state.pendingObject && !state.pendingRemoval}
              />
            ) : (
              <>
                <color attach="background" args={[view.night ? '#0b1423' : '#242e32']} />
                <ambientLight intensity={view.night ? 0.25 : 0.45} />
                <Environment
                  key={`booth-reflections-${view.night}`}
                  resolution={64}
                  frames={1}
                  environmentIntensity={0.45}
                >
                  <color attach="background" args={[view.night ? '#27313F' : '#B7C3CA']} />
                  <Lightformer
                    position={[0, 6, 2]}
                    rotation-x={Math.PI / 2}
                    scale={[10, 6, 1]}
                    intensity={view.night ? 0.5 : 2}
                  />
                  <Lightformer
                    position={[-6, 3, 3]}
                    rotation-y={Math.PI / 3}
                    scale={[5, 7, 1]}
                    intensity={view.night ? 0.3 : 1.5}
                    color="#E9F1F7"
                  />
                </Environment>
                <directionalLight
                  position={[25, 45, 15]}
                  intensity={view.night ? 0.8 : 1.8}
                  color={view.night ? '#9dbbff' : '#ffffff'}
                  castShadow
                  shadow-mapSize={[1024, 1024]}
                  shadow-camera-left={-50}
                  shadow-camera-right={50}
                  shadow-camera-top={50}
                  shadow-camera-bottom={-50}
                />
              </>
            )}
            <CameraBridge
              bridge={bridge}
              element={element}
              floor={floor}
              view={view}
              frozen={!!playback}
              viewport={view.preview ? 'preview' : 'builder'}
              snapshotFloorId={`${state.document.baseline.buildingId}:${floor.source.id}`}
            />
            {/* The authored floor image is optional enhancement: a failed or slow image request
                must not hold the canvas readiness gate forever when the fallback floor rendered. */}
            {onStableFrame && (
              <StableFrame
                key={`${floor.source.id}:${readinessGeneration}`}
                onStable={onStableFrame}
              />
            )}
            {onSelectionAnchor && state.selection && (() => {
              const object = state.selection.kind === 'object' ? floor.objects.find((item) => item.id === state.selection!.id) : null;
              const zone = state.selection.kind === 'zone' ? floor.zones.find((item) => item.id === state.selection!.id) : null;
              const center = zone ? polygonBounds(zone.polygon) : null;
              const position: [number, number, number] | null = object
                ? [object.position[0], floor.source.heightOffset + Math.max(0.6, object.dimensions[1] * object.scale[1] + 0.35), object.position[1]]
                : center ? [(center.minX + center.maxX) / 2, floor.source.heightOffset + 0.6, (center.minZ + center.maxZ) / 2] : null;
              return position ? <SelectionAnchor position={position} element={element} onAnchor={onSelectionAnchor} /> : null;
            })()}
            {rotationActive && rotationAllowed && <RotationRing object={rotationObject ?? undefined} floor={floor} store={store} bridge={bridge} pivot={selectionPivot(floor, state.selectionSet)} onExit={() => onRotationActiveChange?.(false)} />}
            <ControlsPolicy
              enabled={
                state.tool === 'select' && !dragging && !rotationActive && (!playback || playbackMode === 'overview')
              }
            />
            <PlaybackMotionProvider>
              <group position={[0, floor.source.heightOffset, 0]}>
                <FloorSurface
                  key={`${floor.source.id}:${JSON.stringify(floor.source.coordinateSystem)}:${image.texture?.uuid ?? ''}`}
                  floor={floor}
                  texture={image.texture}
                  imageSize={image.size}
                  click={click}
                  pointerDown={beginMarquee}
                  move={(event) => {
                    setHover(null);
                    if (state.tool !== 'select' || debug) {
                      store.getState().setPointer(alignPointer([event.point.x, event.point.z], event.clientX, event.clientY, event.nativeEvent.altKey));
                    }
                  }}
                />
                {!image.texture && floor.boundary.length === 4 && (
                  <gridHelper
                    args={[
                      Math.min(
                        polygonBounds(floor.boundary).maxX - polygonBounds(floor.boundary).minX,
                        polygonBounds(floor.boundary).maxZ - polygonBounds(floor.boundary).minZ,
                      ),
                      32,
                      '#859592',
                      '#bac4bd',
                    ]}
                    position={[
                      (polygonBounds(floor.boundary).minX + polygonBounds(floor.boundary).maxX) / 2,
                      0.006,
                      (polygonBounds(floor.boundary).minZ + polygonBounds(floor.boundary).maxZ) / 2,
                    ]}
                  />
                )}
                {staticBlockers(floor, 1.8).map((polygon, index) => (
                  <ZoneMesh key={`legacy-blocker:${index}`} polygon={polygon} color="#b99a7b" />
                ))}
                {floor.zones
                  .filter((zone) => zone.id !== state.pendingRemoval?.id)
                  .map((zone) => (
                    <ZoneMesh
                      key={zone.id}
                      polygon={
                        state.pendingZone?.id === zone.id &&
                        polygonSchema.safeParse(state.pendingZone.polygon).success
                          ? state.pendingZone.polygon
                          : zone.polygon
                      }
                      color={
                        state.pendingZone?.id === zone.id && validationMessages.length
                          ? '#e26e68'
                          : zone.type === 'blocked'
                            ? '#c97571'
                            : '#5ba89b'
                      }
                      selected={state.selectionSet.some((selection) => selection.kind === 'zone' && selection.id === zone.id)}
                      onPointerDown={(event) => {
                        if (state.tool === 'select' || state.tool === 'remove') event.stopPropagation();
                      }}
                      onClick={(event) => {
                        if (event.delta > 3) {
                          return;
                        }
                        if (state.tool === 'select' || state.tool === 'remove') {
                          event.stopPropagation();
                          if (state.tool === 'remove') {
                            const current = store.getState(), before = current.revision;
                            current.remove({ kind: 'zone', id: zone.id });
                            const latest = store.getState();
                            if (latest.revision === before && latest.message.includes('locked')) toast.error(latest.message);
                          } else {
                            if (event.nativeEvent.shiftKey) {
                              const current = store.getState();
                              if (!current.toggleSelection({ kind: 'zone', id: zone.id })) toast.error(store.getState().message);
                            } else store.getState().select({ kind: 'zone', id: zone.id });
                          }
                        }
                      }}
                    />
                  ))}
                {floor.objects
                  .filter(
                    (object) =>
                      object.id !== state.pendingRemoval?.id &&
                      !(activeRoute && object.recipe === 'avatar'),
                  )
                  .map((object) => {
                    const displayed = !drag.current?.duplicate
                      ? (pendingMemberById.get(object.id) ?? object)
                      : object;
                    return (
                      <ObjectLayer
                        key={object.id}
                        object={displayed}
                        eventDispatch={objectEventDispatch}
                        colorOverride={
                          (isBooth(displayed) && view.display !== 'surface') ||
                          conflictIds.has(object.id) ||
                          !!(
                            ghostError &&
                            state.pendingObject &&
                            pendingMemberById.has(object.id)
                          )
                        }
                        color={
                          conflictIds.has(object.id) ||
                          !!(
                            ghostError &&
                            state.pendingObject &&
                              pendingMemberById.has(object.id)
                          )
                            ? '#d87572'
                            : isBooth(displayed) && view.display === 'availability'
                              ? statusColors[displayed.status]
                              : isBooth(displayed) && view.display === 'heat'
                                ? heatColor(
                                    ((displayed.price || minPrice) - minPrice) /
                                      Math.max(1e-6, maxPrice - minPrice),
                                  )
                                : sampleSurfaceColor(displayed, floor, image.pixels)
                        }
                        selected={selectedObjectIds.has(object.id)}
                        topDown={view.camera === 'top'}
                        routeCutaway={ghostIds.has(object.id)}
                      />
                    );
                  })}
                {selectedObject &&
                  state.tool === 'resize' &&
                  !selectedObject.locked &&
                  selectedObject.recipe !== 'avatar' &&
                  (() => {
                    const candidate =
                      state.pendingObject && objectSchema.safeParse(state.pendingObject).success
                        ? state.pendingObject
                        : selectedObject;
                    const b = polygonBounds(candidate.polygon);
                    const corners: [number, number][] = [
                      [b.minX, b.minZ],
                      [b.maxX, b.minZ],
                      [b.maxX, b.maxZ],
                      [b.minX, b.maxZ],
                    ];
                    const positions = objectPoints(candidate, corners);
                    return positions.map(([x, z], index) => (
                      <mesh
                        key={index}
                        position={[x, candidate.dimensions[1] * candidate.scale[1] + 0.25, z]}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          if (event.button !== 0) {
                            return;
                          }
                          event.stopPropagation();
                          if (candidate.locked) {
                            const message = `${candidate.name} is locked. Unlock it before resizing.`;
                            store.getState().notify(message);
                            toast.error(message);
                            return;
                          }
                          if (unfinished(store.getState()) || drag.current) {
                            store
                              .getState()
                              .notify('Apply or discard the unfinished edit before resizing.');
                            return;
                          }
                          const point = bridge.current.project(event.clientX, event.clientY);
                          if (!point) {
                            return;
                          }
                          drag.current = {
                            id: candidate.id,
                            original: candidate,
                            start: point,
                            duplicate: false,
                            pointerId: event.pointerId,
                            startScreen: [event.clientX, event.clientY],
                            moved: false,
                            handle: [index === 0 || index === 3 ? -1 : 1, index < 2 ? -1 : 1],
                          };
                          setDragging(true);
                          if (
                            event.target &&
                            'setPointerCapture' in event.target &&
                            typeof event.target.setPointerCapture === 'function'
                          ) {
                            event.target.setPointerCapture(event.pointerId);
                          }
                        }}
                        onPointerMove={(event) => {
                          const active = drag.current;
                          if (!active?.handle || active.pointerId !== event.pointerId) {
                            return;
                          }
                          event.stopPropagation();
                          if (
                            !active.moved &&
                            Math.hypot(
                              event.clientX - active.startScreen[0],
                              event.clientY - active.startScreen[1],
                            ) < 3
                          ) {
                            return;
                          }
                          active.moved = true;
                          const point = bridge.current.project(event.clientX, event.clientY);
                          if (point) {
                            store
                              .getState()
                              .patchObject(
                                resizeObjectSafely(active.original, ...resizeFromPointer(
                                  active.original,
                                  active.start,
                                  point,
                                  active.handle,
                                  true,
                                  event.shiftKey || view.resizeAspect,
                                  view.resizeSnap,
                                ).dimensions),
                              );
                          }
                        }}
                        onPointerUp={(event) => {
                          if (event.pointerId === drag.current?.pointerId) {
                            endDrag(event, !bridge.current.project(event.clientX, event.clientY));
                          }
                        }}
                      >
                        <boxGeometry args={[0.3, 0.3, 0.3]} />
                        <meshBasicMaterial color="#f3cc7b" depthTest={false} />
                      </mesh>
                    ));
                  })()}
                {ghostMembers.map((member) => (
                  <ProceduralObject
                    key={`ghost:${member.id}`}
                    object={member}
                    color={ghostError ? '#d87572' : '#86c9ad'}
                    colorOverride
                    ghost
                  />
                ))}
                {alignmentGuide && <Line points={[[alignmentGuide[0], 0.09, alignmentGuide[1]], [alignmentGuide[2], 0.09, alignmentGuide[3]]]} color="#74d5e8" lineWidth={1.5} dashed dashSize={0.16} gapSize={0.08} />}
                {zoneGhost && (
                  <ZoneMesh
                    polygon={zoneGhost}
                    color={insideBoundary(zoneGhost, floor.boundary) ? '#86c9ad' : '#d87572'}
                    selected
                  />
                )}
                {drag.current?.duplicate &&
                  pendingMembers.map((member) => (
                    <ProceduralObject
                      key={`drag-copy:${member.id}`}
                      object={member}
                      color={ghostError ? '#d87572' : '#86c9ad'}
                      colorOverride
                      ghost
                    />
                  ))}
                {invalidPolygon.map(([x, z], index) => (
                  <group key={`invalid-vertex:${index}`} position={[x, 0.12, z]}>
                    <mesh>
                      <sphereGeometry args={[0.12, 10, 8]} />
                      <meshBasicMaterial color="#ff7777" depthTest={false} />
                    </mesh>
                    <Html center position={[0, 0.35, 0]} style={{ pointerEvents: 'none' }}>
                      <span className="fp-label">Vertex {index + 1}</span>
                    </Html>
                  </group>
                ))}
                {invalidPolygon.length > 1 && (
                  <Line
                    points={[...invalidPolygon, invalidPolygon[0]!].map(([x, z]) => [x, 0.1, z])}
                    color="#ff7777"
                    lineWidth={3}
                  />
                )}
                {drawing.length >= 2 && (
                  <Line
                    points={drawing.map(([x, z]) => [x, 0.08, z])}
                    color={
                      state.drawing.length >= 3 && !polygonSchema.safeParse(state.drawing).success
                        ? '#ff7777'
                        : '#e3bf81'
                    }
                    lineWidth={2}
                  />
                )}
                <RouteVisuals
                  route={activeRoute}
                  document={state.document}
                  floorId={floor.source.id}
                  topDown={view.camera === 'top'}
                  animated={routeAnimated}
                  showRouteLabels={showRouteLabels}
                />
                <mesh
                  position={[floor.spawn[0], 0.04, floor.spawn[1]]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <ringGeometry args={[0.22, 0.38, 24]} />
                  <meshBasicMaterial color="#487a9b" />
                </mesh>
                {selectedObject && (
                  <Html
                    position={[
                      selectedObject.position[0],
                      visualHeight(selectedObject) + 0.6,
                      selectedObject.position[1],
                    ]}
                    center
                    style={{ pointerEvents: 'none' }}
                  >
                    <span className="fp-label">{selectedObject.name}</span>
                  </Html>
                )}
              </group>
              <WalkthroughLayer
                document={state.document}
                floorId={floor.source.id}
                onFloor={(id) => store.getState().setFloor(id)}
              />
            </PlaybackMotionProvider>
          </Canvas>
        </ErrorBoundary>
      )}
      {!playback && hovered && activeHover && (
        <div
          className="fp-hover-tooltip"
          role="tooltip"
          style={{ left: activeHover.x, top: activeHover.y }}
        >
          <strong>
            {hovered.boothNumber || '—'} · {hovered.name || 'Unnamed booth'}
          </strong>
          <span>
            <i className="fp-status-dot" style={{ background: statusColors[hovered.status] }} />
            {hovered.status}
          </span>
          <span>Price: {formatPrice(hovered.price)}</span>
        </div>
      )}
      {!playback && debug && (
        <div className="fp-debug-panel" aria-label="Coordinate debug">
          <strong>DEVELOPMENT · coordinate audit</strong>
          <span>
            Floor {floor.source.id} · revision {state.revision}
          </span>
          <span>Units {floor.source.coordinateSystem?.units ?? 'meters'}</span>
          <span>
            World {state.pointer?.map((n) => n.toFixed(2)).join(', ') ?? 'Move over floor'}
          </span>
          <span>
            Source{' '}
            {state.pointer
              ? metresToSource(state.pointer, floor.source.coordinateSystem)
                  .map((n) => n.toFixed(2))
                  .join(', ')
              : '—'}
          </span>
          <code>FLOOR_PLAN_AUDIT.audit()</code>
        </div>
      )}
      {marqueeFrame && (
        <div
          className="fp-marquee-selection"
          aria-hidden="true"
          style={{ left: marqueeFrame.left, top: marqueeFrame.top, width: marqueeFrame.width, height: marqueeFrame.height }}
        />
      )}
      {!playback && <div className="fp-canvas-caption">
        <span>{floor.source.name} · meters</span>
        <span>
          {state.tool === 'select'
            ? 'Drag to orbit · Scroll to zoom'
            : 'Click to author · Escape to cancel'}
        </span>
      </div>}
      {!playback && image.error && (
        <p className="fp-image-notice" role="status">
          {image.error}
        </p>
      )}
    </div>
  );
}
