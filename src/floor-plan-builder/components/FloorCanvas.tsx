import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from 'zustand';
import { Html, Line, OrbitControls, Environment, Lightformer } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import {
  DoubleSide,
  Path,
  Plane,
  Raycaster,
  Shape,
  ShapeGeometry,
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
import { activeFloor, unfinished, type StudioStore } from '../model/store.ts';
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
import {
  placementError,
  resizeFromPointer,
  resizeObjectSafely,
  insideBoundary,
} from '../model/geometry.ts';
import {
  isStructuralRecipe,
  nearestScreenAlignment,
  type ScreenAlignmentCandidate,
} from '../model/alignment.ts';
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
import { washRackRowConnections, type WashRackRowConnections } from '../model/wash-rack-spatial.ts';
import { RouteVisuals } from '../wayfinding/rendering/RouteVisuals.tsx';
import { GameScene } from '../wayfinding/game/GameScene.tsx';

import { routeGhostIds } from '../wayfinding/rendering/route-ghost.ts';
import { selectActiveResult, useWayfindingStore } from '../wayfinding/store/wayfinding-store.ts';
import { usePlaybackStore } from '../wayfinding/store/playback-store.ts';
import { toast } from 'sonner';
import { WalkthroughLayer } from '../wayfinding/walkthrough/WalkthroughLayer.tsx';
import { PlaybackMotionProvider } from '../wayfinding/walkthrough/motion-context.tsx';
import { BoothScreenLabelLayer } from './BoothScreenLabel.tsx';
import { frameCameraToBounds } from '../model/camera-framing.ts';
import {
  POLYGON_CLOSE_RADIUS_PX,
  insertPolygonVertex,
  isPrimaryCanvasClick,
  isWithinScreenRadius,
  movePolygonVertex,
  removePolygonVertex,
} from '../model/viewport-interactions.ts';

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
  onContextMenu: (id: string, event: ThreeEvent<MouseEvent>) => void;
}
interface ObjectEventDispatchRef {
  current: ObjectEventDispatch;
}
interface ObjectLayerProps {
  object: PlanObject;
  rowConnections: WashRackRowConnections;
  color: string;
  colorOverride: boolean;
  selected: boolean;
  topDown: boolean;
  routeCutaway: boolean;
  eventDispatch: ObjectEventDispatchRef;
  onSelectParkingBay?: (objectId: string, bayId: string) => void;
  onSelectParkingBoundary?: (objectId: string) => void;
  suppressBayTooltip: boolean;
  onHoverParkingBay?: (objectId: string, bayId: string | null) => void;
}
/**
 * Keep the per-object event props stable while FloorCanvas refreshes its latest-state dispatch.
 * This lets memoized object layers skip pointer/sidebar-only updates without capturing stale state.
 */
const ObjectLayer = memo(
  ({
    object,
    rowConnections,
    color,
    colorOverride,
    selected,
    topDown,
    routeCutaway,
    eventDispatch,
    onSelectParkingBay,
    onSelectParkingBoundary,
    suppressBayTooltip,
    onHoverParkingBay,
  }: ObjectLayerProps) => {
    const events = useMemo(
      () => ({
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
        onContextMenu: (event: ThreeEvent<MouseEvent>) =>
          eventDispatch.current.onContextMenu(object.id, event),
      }),
      [eventDispatch, object.id],
    );

    return (
      <group onContextMenu={events.onContextMenu}>
        <ProceduralObject
          object={object}
          rowConnections={rowConnections}
          color={color}
          colorOverride={colorOverride}
          selected={selected}
          topDown={topDown}
          routeCutaway={routeCutaway}
          onSelectParkingBay={onSelectParkingBay}
          onSelectParkingBoundary={onSelectParkingBoundary}
          suppressBayTooltip={suppressBayTooltip}
          onHoverParkingBay={onHoverParkingBay}
          {...events}
        />
      </group>
    );
  },
);
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
interface CameraClipBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}
function updateCameraClipPlanes(camera: Camera, bounds: CameraClipBounds) {
  if (!(camera instanceof PerspectiveCamera)) {
    return;
  }
  const axisDistance = (value: number, minimum: number, maximum: number) =>
    value < minimum ? minimum - value : value > maximum ? value - maximum : 0;
  const axisFarthest = (value: number, minimum: number, maximum: number) =>
    Math.max(Math.abs(value - minimum), Math.abs(value - maximum));
  const nearest = Math.hypot(
    axisDistance(camera.position.x, bounds.minX, bounds.maxX),
    axisDistance(camera.position.y, bounds.minY, bounds.maxY),
    axisDistance(camera.position.z, bounds.minZ, bounds.maxZ),
  );
  const farthest = Math.hypot(
    axisFarthest(camera.position.x, bounds.minX, bounds.maxX),
    axisFarthest(camera.position.y, bounds.minY, bounds.maxY),
    axisFarthest(camera.position.z, bounds.minZ, bounds.maxZ),
  );
  const near = Math.max(0.005, nearest > 0.02 ? nearest * 0.25 : 0.005);
  const far = Math.max(near + 10, farthest * 1.2 + 2);
  if (
    Math.abs(camera.near - near) > Math.max(0.0001, near * 0.03) ||
    Math.abs(camera.far - far) > Math.max(0.01, far * 0.03)
  ) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
function CameraBridge({
  bridge,
  element,
  floor,
  view,
  frozen = false,
  viewport = 'builder',
  snapshotFloorId,
  focusId,
  focusTick,
  interactionLocked,
  onCameraGestureChange,
}: {
  bridge: React.RefObject<Bridge>;
  element: React.RefObject<HTMLDivElement | null>;
  floor: PlanFloor;
  view: StudioView;
  frozen?: boolean;
  viewport?: CameraViewport;
  snapshotFloorId?: string;
  focusId: string | null;
  focusTick: number;
  interactionLocked: boolean;
  onCameraGestureChange: (active: boolean) => void;
}) {
  const { camera, invalidate, gl, size } = useThree();
  const controls = useRef<Controls>(null);
  const focusAnimation = useRef<number | null>(null);
  const lastFocusTick = useRef(0);
  const restoration = useRef({ frozen: false, pending: false, camera });
  const lastApplied = useRef<{
    viewport: CameraViewport;
    floorId: string;
    cameraMode: StudioView['camera'];
    cameraRevision: number;
  } | null>(null);
  const storageFloorId = snapshotFloorId ?? floor.source.id;
  const bounds = useMemo(() => polygonBounds(floor.boundary), [floor.boundary]),
    cx = (bounds.minX + bounds.maxX) / 2,
    cz = (bounds.minZ + bounds.maxZ) / 2;
  const height = useMemo(() => Math.max(0, ...floor.objects.map(visualHeight)), [floor.objects]);
  const clipBounds = useMemo<CameraClipBounds>(
    () => ({
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: floor.source.heightOffset - 0.05,
      maxY: floor.source.heightOffset + height + 1,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
    }),
    [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ, floor.source.heightOffset, height],
  );
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
      updateCameraClipPlanes(camera, clipBounds);
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
    clipBounds,
  ]);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) {
      return;
    }
    const save = () => {
      updateCameraClipPlanes(camera, clipBounds);
      saveViewportCameraSnapshot(
        viewport,
        storageFloorId,
        captureViewportCameraSnapshot(camera as PerspectiveCamera, orbit.target),
      );
    };
    const start = () => onCameraGestureChange(true);
    const end = () => onCameraGestureChange(false);
    orbit.addEventListener('change', save);
    orbit.addEventListener('start', start);
    orbit.addEventListener('end', end);
    save();
    return () => {
      orbit.removeEventListener('change', save);
      orbit.removeEventListener('start', start);
      orbit.removeEventListener('end', end);
      onCameraGestureChange(false);
    };
  }, [camera, clipBounds, onCameraGestureChange, storageFloorId, viewport]);
  useEffect(() => {
    const orbit = controls.current;
    const object = focusId ? floor.objects.find((item) => item.id === focusId) : undefined;
    if (!orbit || !object || !isBooth(object) || focusTick <= lastFocusTick.current) {
      return;
    }
    lastFocusTick.current = focusTick;
    if (focusAnimation.current !== null) {
      cancelAnimationFrame(focusAnimation.current);
    }
    const focusBounds = polygonBounds(object.polygon);
    const objectHeight = visualHeight(object);
    const frame = frameCameraToBounds(
      camera,
      orbit.target,
      {
        minX: focusBounds.minX,
        maxX: focusBounds.maxX,
        minY: floor.source.heightOffset,
        maxY: floor.source.heightOffset + objectHeight,
        minZ: focusBounds.minZ,
        maxZ: focusBounds.maxZ,
      },
      1.22,
    );
    const fromPosition = camera.position.clone();
    const fromTarget = orbit.target.clone();
    const toPosition = new Vector3(...frame.position);
    const toTarget = new Vector3(...frame.target);
    const started = performance.now();
    const stop = () => {
      if (focusAnimation.current !== null) {
        cancelAnimationFrame(focusAnimation.current);
        focusAnimation.current = null;
      }
    };
    const animate = (now: number) => {
      const linear = Math.min(1, (now - started) / 420);
      const eased = 1 - (1 - linear) ** 3;
      camera.position.lerpVectors(fromPosition, toPosition, eased);
      orbit.target.lerpVectors(fromTarget, toTarget, eased);
      orbit.update();
      invalidate();
      if (linear < 1) {
        focusAnimation.current = requestAnimationFrame(animate);
      } else {
        focusAnimation.current = null;
      }
    };
    orbit.addEventListener('start', stop);
    focusAnimation.current = requestAnimationFrame(animate);
    return () => {
      orbit.removeEventListener('start', stop);
      stop();
    };
  }, [camera, floor.objects, floor.source.heightOffset, focusId, focusTick, invalidate]);
  useEffect(() => {
    const raycaster = new Raycaster(),
      ndc = new Vector2(),
      point = new Vector3(),
      plane = new Plane(new Vector3(0, 1, 0), -floor.source.heightOffset);
    bridge.current.camera = camera;
    bridge.current.projectWorld = (world) => {
      const rect = element.current?.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      const projected = new Vector3(world[0], floor.source.heightOffset, world[1]).project(camera);
      if (projected.z < -1 || projected.z > 1) {
        return null;
      }
      return [
        rect.left + ((projected.x + 1) * rect.width) / 2,
        rect.top + ((1 - projected.y) * rect.height) / 2,
      ];
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
      enableRotate={!view.orbitLocked && !interactionLocked}
      enablePan={!interactionLocked}
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
  fallbackPosition,
  element,
  onAnchor,
}: {
  position: [number, number, number];
  fallbackPosition: [number, number, number];
  element: React.RefObject<HTMLDivElement | null>;
  onAnchor: (anchor: { x: number; y: number; width: number; height: number } | null) => void;
}) {
  const camera = useThree((state) => state.camera);
  const previous = useRef<[number, number] | null>(null);
  const point = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const bounds = element.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    point.set(...position).project(camera);
    // The top of a tall object can be clipped while its footprint is still visible.
    if (point.z < -1 || point.z > 1) {
      point.set(...fallbackPosition).project(camera);
    }
    const x = (point.x + 1) * 0.5 * bounds.width;
    const y = (1 - point.y) * 0.5 * bounds.height;
    if (point.z < -1 || point.z > 1) {
      onAnchor(null);
      previous.current = null;
      return;
    }
    const old = previous.current;
    if (!old || Math.abs(old[0] - x) > 1 || Math.abs(old[1] - y) > 1) {
      previous.current = [x, y];
      onAnchor({ x, y, width: bounds.width, height: bounds.height });
    }
  });
  return null;
}

function StableFrame({ onStable, ready }: { onStable: () => void; ready: boolean }) {
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
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
      frame.current = null;
    };
  }, [invalidate, ready]);
  useFrame(() => {
    if (!ready || completed.current || frame.current !== null) {
      return;
    }
    // useFrame runs before R3F submits this frame; defer until the browser has
    // advanced past it so BuilderLoading never dismisses on a pre-render signal.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (completed.current) {
          return;
        }
        completed.current = true;
        callback.current();
      });
    });
  }, -1);
  return null;
}
export function FloorSurface({
  floor,
  texture,
  imageSize,
  click,
  move,
  imageOffset,
  pointerUp,
  pointerDown,
}: {
  floor: PlanFloor;
  texture: CanvasTexture | null;
  imageSize: [number, number] | null;
  click: (event: ThreeEvent<MouseEvent>) => void;
  move: (event: ThreeEvent<PointerEvent>) => void;
  imageOffset?: [number, number];
  pointerUp?: (event: ThreeEvent<PointerEvent>) => void;
  pointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const bounds = polygonBounds(floor.boundary);
  const shape = useMemo(() => {
    const value = new Shape();
    floor.boundary.forEach(([x, z], i) => (i ? value.lineTo(x, -z) : value.moveTo(x, -z)));
    value.closePath();
    const area = (points: [number, number][]) =>
      points.reduce((sum, [x, z], index) => {
        const next = points[(index + 1) % points.length]!;
        return sum + x * next[1] - next[0] * z;
      }, 0);
    const outerArea = area(floor.boundary);
    for (const object of floor.objects) {
      if (object.recipe !== 'wash-rack' || !object.washRackVariant) {
        continue;
      }
      // Earcut is undefined for touching holes. Keep a 2 cm floor land under the
      // 8 cm shared rail so side-by-side rack apertures remain disjoint and stable.
      const rackBounds = polygonBounds(object.polygon),
        centerX = (rackBounds.minX + rackBounds.maxX) / 2,
        centerZ = (rackBounds.minZ + rackBounds.maxZ) / 2,
        inset = 0.02,
        localInsetX = inset / Math.max(0.1, Math.abs(object.scale[0])),
        localInsetZ = inset / Math.max(0.1, Math.abs(object.scale[2])),
        factorX = Math.max(
          0.1,
          (rackBounds.maxX - rackBounds.minX - 2 * localInsetX) /
            (rackBounds.maxX - rackBounds.minX),
        ),
        factorZ = Math.max(
          0.1,
          (rackBounds.maxZ - rackBounds.minZ - 2 * localInsetZ) /
            (rackBounds.maxZ - rackBounds.minZ),
        ),
        insetPolygon = object.polygon.map(
          ([x, z]) =>
            [centerX + (x - centerX) * factorX, centerZ + (z - centerZ) * factorZ] as [
              number,
              number,
            ],
        );
      const world = objectPoints(object, insetPolygon);
      const cutout = area(world) * outerArea > 0 ? [...world].reverse() : world;
      const hole = new Path();
      cutout.forEach(([x, z], index) => (index ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
      hole.closePath();
      value.holes.push(hole);
    }
    return value;
  }, [floor.boundary, floor.objects]);
  const imageFit = useMemo(
    () => (imageSize ? fitFloorImage(floor.boundary, imageSize) : null),
    [floor.boundary, imageSize],
  );
  const imageGeometry = useMemo(() => {
    if (!texture || !imageFit) {
      return null;
    }
    const geometry = new ShapeGeometry(shape);
    const positions = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv'),
      left = imageFit.center[0] - imageFit.width / 2 + (imageOffset?.[0] ?? 0),
      top = imageFit.center[1] + imageFit.depth / 2 + (imageOffset?.[1] ?? 0);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index),
        z = -positions.getY(index);
      uv.setXY(index, (x - left) / imageFit.width, (top - z) / imageFit.depth);
    }
    uv.needsUpdate = true;
    return geometry;
  }, [shape, texture, imageFit, imageOffset?.[0], imageOffset?.[1]]);
  useEffect(() => () => imageGeometry?.dispose(), [imageGeometry]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={click}
        onPointerDown={pointerDown}
        onPointerMove={move}
        onPointerUp={pointerUp}
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
      {texture && imageFit && imageGeometry && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} raycast={() => {}}>
          <primitive object={imageGeometry} attach="geometry" />
          <meshBasicMaterial
            map={texture}
            toneMapped={false}
            transparent
            depthWrite={false}
            onBeforeCompile={(shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                '#include <map_fragment>\n if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;',
              );
            }}
            customProgramCacheKey={() => 'floor-image-clipped-v1'}
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
      <mesh
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={onClick}
        onPointerDown={onPointerDown}
      >
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
  onCustomizeObject,
  onSelectParkingBay,
  onSelectParkingBoundary,
  onHoverParkingBay,
  onStableFrame,
  readinessGeneration = 0,
  showRouteLabels = true,
}: {
  store: StudioStore;
  view: StudioView;
  onInteract: () => void;
  onSelectionAnchor?: (
    anchor: { x: number; y: number; width: number; height: number } | null,
  ) => void;
  onCustomizeObject?: (id: string) => void;
  onSelectParkingBay?: (objectId: string, bayId: string) => void;
  onSelectParkingBoundary?: (objectId: string) => void;
  onHoverParkingBay?: (objectId: string, bayId: string | null) => void;
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
      focusId: value.focusId,
      focusTick: value.focusTick,
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
  const boothLabels = useMemo(() => floor.objects.filter(isBooth), [floor.objects]);
  const floorImageReady =
    !image.url ||
    image.url !== (floor.source.authoring?.originalImage ?? floor.source.image) ||
    !!image.texture ||
    !!image.error;
  useEffect(() => {
    const id = `floor-image-${floor.source.id}`;
    if (image.error) {
      toast.warning(image.error, { id });
    } else {
      toast.dismiss(id);
    }
    return () => {
      toast.dismiss(id);
    };
  }, [floor.source.id, image.error]);
  useEffect(() => {
    if (!state.selection) {
      onSelectionAnchor?.(null);
    }
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
    invalidMessage?: string;
    handle?: [number, number];
  } | null>(null);
  const vertexDrag = useRef<{
    id: string;
    original: PlanObject;
    vertexIndex: number;
    pointerId: number;
    startScreen: [number, number];
    moved: boolean;
    invalidMessage?: string;
  } | null>(null);
  const objectEventDispatch = useRef<ObjectEventDispatch>({
    onPointerOver: () => {},
    onPointerOut: () => {},
    onClick: () => {},
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
    onContextMenu: () => {},
  });
  const [imageSelected, setImageSelected] = useState(false);
  const [imageMoveMode, setImageMoveMode] = useState(false);
  const [imagePreviewOffset, setImagePreviewOffset] = useState<[number, number] | null>(null);
  const imageDrag = useRef<{ pointerId: number; start: [number, number]; offset: [number, number]; next: [number, number] } | null>(null);
  const imageOffset = imagePreviewOffset ?? floor.source.authoring?.imageOffset ?? [0, 0];
  useEffect(() => {
    setImageSelected(false);
    setImageMoveMode(false);
    setImagePreviewOffset(null);
    imageDrag.current = null;
  }, [floor.source.id]);
  useEffect(() => {
    if (state.tool !== 'select') {
      setImageSelected(false);
      setImageMoveMode(false);
    }
  }, [state.tool]);
  const [dragging, setDragging] = useState(false),
    [orbiting, setOrbiting] = useState(false),
    [contextLost, setContextLost] = useState(false);
  const marquee = useRef<{
    pointerId: number;
    startWorld: [number, number];
    endWorld: [number, number];
    startScreen: [number, number];
    endScreen: [number, number];
    shiftKey: boolean;
    moved: boolean;
  } | null>(null);
  const [marqueeFrame, setMarqueeFrame] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [alignmentGuide, setAlignmentGuide] = useState<[number, number, number, number] | null>(
    null,
  );
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
      if (!isStructuralRecipe(object.recipe)) {
        continue;
      }
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
      if (polygon.length >= 2) {
        targets.push({ kind: 'wall', points: polygon, id: `room-wall-${index}` });
      }
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
        const b =
          target.points.length > 2
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
  const hoverContext = `${state.floorId}:${state.revision}:${state.tool}:${state.focusTick}:${view.cameraRevision}:${view.touring}`;
  const activeHover = hover && hover.context === hoverContext ? hover : null;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHover = useCallback(() => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHover(null);
  }, []);
  const onCameraGestureChange = useCallback(
    (active: boolean) => {
      setOrbiting(active);
      if (active) {
        clearHover();
      }
    },
    [clearHover],
  );
  useEffect(() => {
    clearHover();
  }, [clearHover, hoverContext]);
  useEffect(
    () => () => {
      if (hoverTimer.current !== null) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
    },
    [],
  );
  const hovered =
    !dragging && !orbiting && state.tool === 'select'
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
    selectedZone &&
    !selectedZone.locked &&
    zoneBounds &&
    state.pointer &&
    ['move', 'duplicate'].includes(state.tool)
      ? selectedZone.polygon.map(([x, z]): [number, number] => [
          x + state.pointer![0] - (zoneBounds.minX + zoneBounds.maxX) / 2,
          z + state.pointer![1] - (zoneBounds.minZ + zoneBounds.maxZ) / 2,
        ])
      : null;
  const pendingMembers = useMemo(
    () =>
      state.pendingObjects?.length
        ? state.pendingObjects
        : state.pendingObject &&
            selectedObject &&
            objectSchema.safeParse(state.pendingObject).success
          ? transformGroup(floor, selectedObject, state.pendingObject)
          : [],
    [floor, selectedObject, state.pendingObject, state.pendingObjects],
  );
  const pendingMemberById = useMemo(() => {
    const members = new Map<string, PlanObject>();
    for (const member of pendingMembers) {
      if (!members.has(member.id)) {
        members.set(member.id, member);
      }
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
        if (object.groupId === selectedObject.groupId) {
          ids.add(object.id);
        }
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
  const alignPointer = (
    point: [number, number] | null,
    clientX: number,
    clientY: number,
    altKey: boolean,
  ) => {
    if (!point || altKey) {
      setAlignmentGuide(null);
      return point;
    }
    const current = store.getState();
    const moving = current.tool === 'place' ? definition : selectedObject;
    if (!moving || !['place', 'move', 'duplicate'].includes(current.tool)) {
      setAlignmentGuide(null);
      return point;
    }
    const movingAtPointer = { ...moving, position: point };
    const movingPoints = footprint(movingAtPointer);
    const rect = element.current?.getBoundingClientRect();
    const { camera } = bridge.current;
    if (!rect || !camera) {
      setAlignmentGuide(null);
      return point;
    }
    const bounds = polygonBounds(floor.boundary);
    const farCorner: [number, number] =
      camera.position.x > bounds.minX ? [bounds.maxX, bounds.maxZ] : [bounds.minX, bounds.minZ];
    // Only candidates within the snap threshold can win, so they are pruned in world space
    // before the far more expensive screen projection runs.
    const worldRadius = snapWorldRadius(
      camera,
      point,
      rect.height,
      floor.source.heightOffset,
      farCorner,
    );
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
      worldRadius >= 0 ? worldRadius + Number.EPSILON * coordinateScale * 8 : worldRadius;
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
      if (projected.z < -1 || projected.z > 1) {
        return null;
      }
      return [
        rect.left + ((projected.x + 1) * rect.width) / 2,
        rect.top + ((1 - projected.y) * rect.height) / 2,
      ];
    };
    const screenCandidates: ScreenAlignmentCandidate[] = [];
    const pushCandidate = (
      kind: ScreenAlignmentCandidate['kind'],
      id: string,
      target: [number, number],
      offset: [number, number],
    ) => {
      const center: [number, number] = [target[0] - offset[0], target[1] - offset[1]];
      const screenPoint = project(center);
      if (screenPoint) {
        screenCandidates.push({ id, kind, screenPoint, worldPoint: center });
      }
    };
    for (const edge of nearbyEdges) {
      const { target, edgeIndex, a, b } = edge;
      if (target.kind === 'endpoint' && target.id === moving.id) {
        continue;
      }
      for (const vertex of movingPoints) {
        const offset: [number, number] = [vertex[0] - point[0], vertex[1] - point[1]];
        if (target.kind === 'endpoint') {
          if (Math.hypot(a[0] - vertex[0], a[1] - vertex[1]) <= worldRadius) {
            pushCandidate('endpoint', `${target.id}-v${edgeIndex}`, a, offset);
          }
        }
        const t = Math.max(
          0,
          Math.min(
            1,
            ((vertex[0] - a[0]) * (b[0] - a[0]) + (vertex[1] - a[1]) * (b[1] - a[1])) /
              Math.max(1e-8, (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2),
          ),
        );
        const nearest: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        if (Math.hypot(nearest[0] - vertex[0], nearest[1] - vertex[1]) > worldRadius) {
          continue;
        }
        pushCandidate(
          target.kind === 'endpoint' ? 'edge' : 'wall',
          `${target.id}-e${edgeIndex}`,
          nearest,
          offset,
        );
      }
    }
    const pointer = [clientX, clientY] as [number, number];
    const nearest = nearestScreenAlignment(pointer, screenCandidates, 12, {
      recipe: moving.recipe,
      alt: altKey,
    });
    if (!nearest) {
      setAlignmentGuide(null);
      return point;
    }
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
      point =
        alignPointer(rawPoint, event.clientX, event.clientY, event.nativeEvent.altKey) ?? rawPoint;
    if (!isPrimaryCanvasClick(event.nativeEvent.button, event.delta) || drag.current) {
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
      if (
        ['polygon', 'zone-polygon'].includes(current.tool) &&
        current.drawing.length >= 3 &&
        (() => {
          const startScreen = bridge.current.projectWorld(current.drawing[0]!);
          return (
            !!startScreen &&
            isWithinScreenRadius(
              [event.clientX, event.clientY],
              startScreen,
              POLYGON_CLOSE_RADIUS_PX,
            )
          );
        })()
      ) {
        if (!current.apply()) {
          toast.error(current.message || 'Polygon could not be created.');
        }
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
    } else if (current.tool !== 'edit-footprint') {
      if (!event.nativeEvent.shiftKey) {
        current.select(null);
      }
    }
  };
  const beginMarquee = (event: ThreeEvent<PointerEvent>) => {
    const current = store.getState();
    if (
      current.tool !== 'select' ||
      view.camera !== 'top' ||
      event.button !== 0 ||
      !event.nativeEvent.shiftKey ||
      unfinished(current)
    ) {
      return;
    }
    event.stopPropagation();
    // R3F registers its pointer listeners passively, so preventDefault is not allowed here.
    // The canvas disables text selection instead.
    event.nativeEvent.stopImmediatePropagation();
    const rect = element.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
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
  const pointerScreen = state.pointer ? bridge.current.projectWorld(state.pointer) : null;
  const startScreen = state.drawing.length ? bridge.current.projectWorld(state.drawing[0]!) : null;
  const polygonCanClose =
    state.drawing.length >= 3 &&
    polygonSchema.safeParse(state.drawing).success &&
    insideBoundary(state.drawing, floor.boundary) &&
    (state.tool !== 'polygon' ||
      !placementError(
        objectFromDrawing(
          state.drawing,
          withPreset(createObject('polygon-booth', [0, 0]), state.presetId),
        ),
        floor,
      ));
  const polygonSnapPreview =
    ['polygon', 'zone-polygon'].includes(state.tool) &&
    polygonCanClose &&
    !!pointerScreen &&
    !!startScreen &&
    isWithinScreenRadius(pointerScreen, startScreen, POLYGON_CLOSE_RADIUS_PX);
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
      drawing.push(polygonSnapPreview ? drawing[0]! : state.pointer);
    }
  }
  const drawingPolygon = [...drawing];
  if (
    drawingPolygon.length > 1 &&
    drawingPolygon[0]!.every((value, axis) => value === drawingPolygon.at(-1)![axis])
  ) {
    drawingPolygon.pop();
  }
  const drawingValidation =
    drawingPolygon.length >= 3 ? polygonSchema.safeParse(drawingPolygon) : null;
  const drawingOutsideBoundary =
    drawingPolygon.length >= 3 && !insideBoundary(drawingPolygon, floor.boundary);
  const drawingPlacementError =
    drawingValidation?.success &&
    !drawingOutsideBoundary &&
    (state.tool === 'polygon' || state.tool === 'rectangle')
      ? placementError(
          objectFromDrawing(
            drawingPolygon,
            withPreset(
              createObject(state.tool === 'polygon' ? 'polygon-booth' : 'booth', [0, 0]),
              state.presetId,
            ),
          ),
          floor,
        )
      : null;
  const drawingInvalid =
    drawingPolygon.length >= 3 &&
    (!drawingValidation?.success || drawingOutsideBoundary || !!drawingPlacementError);
  if (drawingPolygon.length >= 3) {
    if (drawingValidation && !drawingValidation.success) {
      validationMessages.push(
        ...drawingValidation.error.issues.map((issue) => `Drawing: ${issue.message}`),
      );
    } else if (drawingOutsideBoundary) {
      validationMessages.push('Keep the whole drawing inside the floor boundary.');
    } else if (drawingPlacementError) {
      validationMessages.push(drawingPlacementError);
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
      const applied = store.getState().apply();
      if (!applied) {
        toast.error(
          active.invalidMessage || store.getState().message || 'That edit could not be applied.',
        );
      } else if (active.invalidMessage) {
        toast.error(active.invalidMessage);
      }
      store.setState({ tool: 'select' });
    }
    setAlignmentGuide(null);
  };
  const placementErrorForCandidate = (candidate: PlanObject) => {
    const current = store.getState();
    const selected = current.selectionSet.length
      ? current.selectionSet
      : current.selection
        ? [current.selection]
        : [];
    const ignored = new Set(
      selected.filter((item) => item.kind === 'object').map((item) => item.id),
    );
    ignored.add(candidate.id);
    if (candidate.groupId) {
      for (const item of floor.objects) {
        if (item.groupId === candidate.groupId) {
          ignored.add(item.id);
        }
      }
    }
    return placementError(candidate, {
      ...floor,
      objects: floor.objects.filter((item) => !ignored.has(item.id)),
      zones: floor.zones.filter(
        (zone) => !selected.some((item) => item.kind === 'zone' && item.id === zone.id),
      ),
    });
  };
  const stageFootprint = (object: PlanObject, polygon: [number, number][]) => {
    if (!polygonSchema.safeParse(polygon).success || !insideBoundary(polygon, floor.boundary)) {
      return false;
    }
    const bounds = polygonBounds(polygon);
    const candidate: PlanObject = {
      ...object,
      polygon,
      dimensions: [bounds.maxX - bounds.minX, object.dimensions[1], bounds.maxZ - bounds.minZ],
    };
    if (placementErrorForCandidate(candidate)) {
      return false;
    }
    store.getState().patchObject({ polygon, dimensions: candidate.dimensions });
    return true;
  };
  const beginVertexDrag = (
    object: PlanObject,
    vertexIndex: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0 || object.locked || unfinished(store.getState())) {
      return;
    }
    vertexDrag.current = {
      id: object.id,
      original: object,
      vertexIndex,
      pointerId: event.pointerId,
      startScreen: [event.clientX, event.clientY],
      moved: false,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveVertexDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = vertexDrag.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
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
    const polygon = movePolygonVertex(active.original.polygon, active.vertexIndex, point);
    if (polygon && !stageFootprint(active.original, polygon)) {
      active.invalidMessage = 'Corner kept at its last valid position.';
    } else {
      active.invalidMessage = undefined;
    }
  };
  const finishVertexDrag = (event: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    const active = vertexDrag.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    vertexDrag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!active.moved) {
      return;
    }
    if (cancel) {
      store.getState().cancel();
      return;
    }
    const { invalidMessage } = active;
    if (!store.getState().apply()) {
      toast.error(
        invalidMessage || store.getState().message || 'That footprint edit is not valid.',
      );
    } else if (invalidMessage) {
      toast.error(invalidMessage);
    }
  };
  const applyFootprintShape = (object: PlanObject, polygon: [number, number][]) => {
    if (!stageFootprint(object, polygon)) {
      toast.error('Keep the footprint inside the floor with at least three valid corners.');
      return;
    }
    if (!store.getState().apply()) {
      toast.error(store.getState().message || 'That footprint edit is not valid.');
    }
  };
  // Refresh a single latest-state dispatch object instead of building six inline closures for
  // every object. ObjectLayer callbacks stay stable and resolve the current scene state here.
  const latestObjectEventDispatch: ObjectEventDispatch = {
    onPointerOver: (id, event) => {
      const object = floor.objects.find((item) => item.id === id);
      if (state.tool !== 'select' || dragging || orbiting || !object || !isBooth(object)) {
        return;
      }
      event.stopPropagation();
      const rect = element.current?.getBoundingClientRect();
      if (rect) {
        if (hoverTimer.current !== null) {
          clearTimeout(hoverTimer.current);
        }
        setHover(null);
        const next = {
          id,
          x: Math.max(8, Math.min(rect.width - 180, event.clientX - rect.left + 12)),
          y: Math.max(8, Math.min(rect.height - 90, event.clientY - rect.top + 12)),
          context: hoverContext,
        };
        hoverTimer.current = setTimeout(() => {
          hoverTimer.current = null;
          setHover(next);
        }, 500);
      }
    },
    onPointerOut: clearHover,
    onClick: (id, event) => {
      event.stopPropagation();
      if (imageMoveMode) {return;}
      setImageSelected(false);
      setImageMoveMode(false);
      const object = floor.objects.find((item) => item.id === id);
      if (!object || (playback && playbackMode !== 'overview')) {
        return;
      }
      if (dragging || event.delta > 3) {
        return;
      }
      if (state.tool === 'remove') {
        const current = store.getState(),
          before = current.revision;
        current.remove({ kind: 'object', id });
        const latest = store.getState();
        if (latest.revision === before && latest.message.includes('locked')) {
          toast.error(latest.message);
        }
      } else if (['select', 'move', 'duplicate', 'resize', 'edit-footprint'].includes(state.tool)) {
        if (state.tool === 'select' && event.nativeEvent.shiftKey) {
          const current = store.getState();
          if (!current.toggleSelection({ kind: 'object', id })) {
            toast.error(store.getState().message);
          }
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
          if (!dragging && !orbiting) {
            if (hoverTimer.current !== null) {
              clearTimeout(hoverTimer.current);
            }
            setHover(null);
            const rect = element.current?.getBoundingClientRect();
            if (rect) {
              const next = {
                id,
                x: Math.max(8, Math.min(rect.width - 180, event.clientX - rect.left + 12)),
                y: Math.max(8, Math.min(rect.height - 90, event.clientY - rect.top + 12)),
                context: hoverContext,
              };
              hoverTimer.current = setTimeout(() => {
                hoverTimer.current = null;
                setHover(next);
              }, 500);
            }
          }
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
          ? resizeObjectSafely(
              active.original,
              ...resizeFromPointer(
                active.original,
                active.start,
                point,
                [1, 1],
                false,
                event.shiftKey || view.resizeAspect,
                view.resizeSnap,
              ).dimensions,
            )
          : {
              ...active.original,
              position: [
                active.original.position[0] + point[0] - active.start[0],
                active.original.position[1] + point[1] - active.start[1],
              ] as [number, number],
            };
      const invalidMessage = placementErrorForCandidate(next);
      if (invalidMessage) {
        active.invalidMessage = invalidMessage;
        return;
      }
      active.invalidMessage = undefined;
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
        drag.current.invalidMessage ??= 'Keep the whole object inside the floor boundary.';
        endDrag(event);
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
    onContextMenu: (id, event) => {
      event.nativeEvent.preventDefault();
      event.stopPropagation();
      if (event.delta > 3 || (playback && playbackMode !== 'overview')) {
        return;
      }
      if (store.getState().drawing.length) {
        event.nativeEvent.stopPropagation();
        store.getState().removePoint();
        return;
      }
      onCustomizeObject?.(id);
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
      if (imageDrag.current) {
        imageDrag.current = null;
        setImagePreviewOffset(null);
        setDragging(false);
      }
      if (marquee.current) {
        marquee.current = null;
        setMarqueeFrame(null);
        setDragging(false);
      }
      if (vertexDrag.current) {
        vertexDrag.current = null;
        setDragging(false);
        store.getState().cancel();
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
      if (!active || active.pointerId !== event.pointerId || !rect) {
        return;
      }
      const x = Math.max(rect.left, Math.min(rect.right, event.clientX));
      const y = Math.max(rect.top, Math.min(rect.bottom, event.clientY));
      const point = bridge.current.project(x, y);
      if (!point) {
        return;
      }
      active.endWorld = point;
      active.endScreen = [x - rect.left, y - rect.top];
      active.moved ||=
        Math.hypot(
          active.endScreen[0] - active.startScreen[0],
          active.endScreen[1] - active.startScreen[1],
        ) > 5;
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
      if (!active || active.pointerId !== event.pointerId) {
        return;
      }
      marquee.current = null;
      setMarqueeFrame(null);
      setDragging(false);
      if (cancel || !active.moved) {
        return;
      }
      const current = store.getState();
      const currentFloor = activeFloor(current);
      const box: [number, number][] = [
        [
          Math.min(active.startWorld[0], active.endWorld[0]),
          Math.min(active.startWorld[1], active.endWorld[1]),
        ],
        [
          Math.max(active.startWorld[0], active.endWorld[0]),
          Math.min(active.startWorld[1], active.endWorld[1]),
        ],
        [
          Math.max(active.startWorld[0], active.endWorld[0]),
          Math.max(active.startWorld[1], active.endWorld[1]),
        ],
        [
          Math.min(active.startWorld[0], active.endWorld[0]),
          Math.max(active.startWorld[1], active.endWorld[1]),
        ],
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
        ? [
            ...previous.filter(
              (item) => !allHits.some((hit) => hit.kind === item.kind && hit.id === item.id),
            ),
            ...allHits.filter(
              (hit) => !previous.some((item) => item.kind === hit.kind && item.id === hit.id),
            ),
          ]
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
      onPointerDownCapture={() => {
        clearHover();
        onInteract();
      }}
      onPointerLeave={clearHover}
      onWheel={() => {
        clearHover();
        onInteract();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        clearHover();
        if (!playback && store.getState().drawing.length) {
          store.getState().removePoint();
        }
      }}
      onPointerCancel={(event) => {
        clearHover();
        if (imageDrag.current?.pointerId === event.pointerId) {
          imageDrag.current = null;
          setImagePreviewOffset(null);
          setDragging(false);
        }
        if (event.pointerId === vertexDrag.current?.pointerId) {
          const active = vertexDrag.current;
          vertexDrag.current = null;
          setDragging(false);
          if (active?.moved) {
            store.getState().cancel();
          }
        }
        if (event.pointerId === drag.current?.pointerId) {
          endDrag(undefined, true);
        }
      }}
      onLostPointerCapture={(event) => {
        if (imageDrag.current?.pointerId === event.pointerId) {
          imageDrag.current = null;
          setImagePreviewOffset(null);
          setDragging(false);
        }
        if (drag.current?.pointerId === event.pointerId) {
          endDrag(undefined, true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-floor-plan-recipe')) {
          event.preventDefault();
          const point = bridge.current.project(event.clientX, event.clientY);
          store
            .getState()
            .setPointer(alignPointer(point, event.clientX, event.clientY, event.altKey));
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
              focusId={state.focusId}
              focusTick={state.focusTick}
              interactionLocked={dragging}
              onCameraGestureChange={onCameraGestureChange}
            />
            <BoothScreenLabelLayer
              booths={boothLabels}
              heightOffset={floor.source.heightOffset}
              container={element}
              enabled={!playback}
              selectedId={selectedObject && isBooth(selectedObject) ? selectedObject.id : null}
            />
            {/* The authored floor image is optional enhancement: a failed or slow image request
                must not hold the canvas readiness gate forever when the fallback floor rendered. */}
            {onStableFrame && (
              <StableFrame
                key={`${floor.source.id}:${image.url}:${readinessGeneration}`}
                onStable={onStableFrame}
                ready={floorImageReady}
              />
            )}
            {onSelectionAnchor &&
              state.selection &&
              (() => {
                const object =
                  state.selection.kind === 'object'
                    ? floor.objects.find((item) => item.id === state.selection!.id)
                    : null;
                const zone =
                  state.selection.kind === 'zone'
                    ? floor.zones.find((item) => item.id === state.selection!.id)
                    : null;
                const center = zone ? polygonBounds(zone.polygon) : null;
                const position: [number, number, number] | null = object
                  ? [
                      object.position[0],
                      floor.source.heightOffset +
                        Math.max(0.6, object.dimensions[1] * object.scale[1] + 0.35),
                      object.position[1],
                    ]
                  : center
                    ? [
                        (center.minX + center.maxX) / 2,
                        floor.source.heightOffset + 0.6,
                        (center.minZ + center.maxZ) / 2,
                      ]
                    : null;
                return position ? (
                  <SelectionAnchor
                    position={position}
                    fallbackPosition={[position[0], floor.source.heightOffset, position[2]]}
                    element={element}
                    onAnchor={onSelectionAnchor}
                  />
                ) : null;
              })()}
            <ControlsPolicy enabled={!playback || playbackMode === 'overview'} />
            <PlaybackMotionProvider>
              <group position={[0, floor.source.heightOffset, 0]}>
                <FloorSurface
                  key={`${floor.source.id}:${JSON.stringify(floor.source.coordinateSystem)}:${image.texture?.uuid ?? ''}`}
                  floor={floor}
                  texture={image.texture}
                  imageSize={image.size}
                  imageOffset={imageOffset as [number, number]}
                  click={(event) => {
                    if (imageMoveMode) {
                      event.stopPropagation();
                      return;
                    }
                    if (image.texture && store.getState().tool === 'select') {
                      setImageSelected(true);
                    }
                    click(event);
                  }}
                  pointerDown={(event) => {
                    if (!imageMoveMode || event.button !== 0) {
                      beginMarquee(event);
                      return;
                    }
                    const point = bridge.current.project(event.clientX, event.clientY);
                    if (!point) {return;}
                    event.stopPropagation();
                    const offset: [number, number] = [...imageOffset] as [number, number];
                    imageDrag.current = { pointerId: event.pointerId, start: point, offset, next: offset };
                    setDragging(true);
                    if (event.target && 'setPointerCapture' in event.target && typeof event.target.setPointerCapture === 'function') {
                      event.target.setPointerCapture(event.pointerId);
                    }
                  }}
                  pointerUp={(event) => {
                    const active = imageDrag.current;
                    if (!active || active.pointerId !== event.pointerId) {return;}
                    event.stopPropagation();
                    imageDrag.current = null;
                    setDragging(false);
                    const current = store.getState();
                    const currentFloor = activeFloor(current);
                    const authoring = currentFloor.source.authoring ?? {
                      boundary: currentFloor.boundary.map((point) => metresToSource(point, currentFloor.source.coordinateSystem)),
                      spawn: metresToSource(currentFloor.spawn, currentFloor.source.coordinateSystem),
                      obstacles: [], instances: [], underlayOpacity: 0.85, imageSize: image.size ?? undefined,
                    };
                    if (active.next[0] !== active.offset[0] || active.next[1] !== active.offset[1]) {
                      if (!current.commitFloor({ ...currentFloor, source: { ...currentFloor.source, authoring: { ...authoring, imageSize: authoring.imageSize ?? image.size ?? undefined, imageOffset: active.next } } })) {
                        toast.error(store.getState().message || 'Could not move the floor image.');
                      }
                    }
                    setImagePreviewOffset(null);
                    if (event.target && 'releasePointerCapture' in event.target && typeof event.target.releasePointerCapture === 'function') {
                      event.target.releasePointerCapture(event.pointerId);
                    }
                  }}
                  move={(event) => {
                    const active = imageDrag.current;
                    if (active?.pointerId === event.pointerId) {
                      event.stopPropagation();
                      const point = bridge.current.project(event.clientX, event.clientY);
                      if (point) {
                        active.next = [active.offset[0] + point[0] - active.start[0], active.offset[1] + point[1] - active.start[1]];
                        setImagePreviewOffset(active.next);
                      }
                      return;
                    }
                    setHover(null);
                    if (state.tool !== 'select' || debug) {
                      store
                        .getState()
                        .setPointer(
                          alignPointer(
                            [event.point.x, event.point.z],
                            event.clientX,
                            event.clientY,
                            event.nativeEvent.altKey,
                          ),
                        );
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
                      selected={state.selectionSet.some(
                        (selection) => selection.kind === 'zone' && selection.id === zone.id,
                      )}
                      onPointerDown={(event) => {
                        if (state.tool === 'select' || state.tool === 'remove') {
                          event.stopPropagation();
                        }
                      }}
                      onClick={(event) => {
                        if (event.delta > 3) {
                          return;
                        }
                        if (state.tool === 'select' || state.tool === 'remove') {
                          event.stopPropagation();
                          if (state.tool === 'remove') {
                            const current = store.getState(),
                              before = current.revision;
                            current.remove({ kind: 'zone', id: zone.id });
                            const latest = store.getState();
                            if (latest.revision === before && latest.message.includes('locked')) {
                              toast.error(latest.message);
                            }
                          } else {
                            if (event.nativeEvent.shiftKey) {
                              const current = store.getState();
                              if (!current.toggleSelection({ kind: 'zone', id: zone.id })) {
                                toast.error(store.getState().message);
                              }
                            } else {
                              store.getState().select({ kind: 'zone', id: zone.id });
                            }
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
                        rowConnections={washRackRowConnections(
                          displayed,
                          floor.objects.map(
                            (candidate) => pendingMemberById.get(candidate.id) ?? candidate,
                          ),
                        )}
                        eventDispatch={objectEventDispatch}
                        onSelectParkingBay={onSelectParkingBay}
                        onSelectParkingBoundary={onSelectParkingBoundary}
                        suppressBayTooltip={state.tool === 'edit-footprint'}
                        onHoverParkingBay={onHoverParkingBay}
                        colorOverride={
                          (isBooth(displayed) && view.display !== 'surface') ||
                          conflictIds.has(object.id) ||
                          !!(ghostError && state.pendingObject && pendingMemberById.has(object.id))
                        }
                        color={
                          conflictIds.has(object.id) ||
                          !!(ghostError && state.pendingObject && pendingMemberById.has(object.id))
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
                            const next = resizeObjectSafely(
                              active.original,
                              ...resizeFromPointer(
                                active.original,
                                active.start,
                                point,
                                active.handle,
                                true,
                                event.shiftKey || view.resizeAspect,
                                view.resizeSnap,
                              ).dimensions,
                            );
                            const invalidMessage = placementErrorForCandidate(next);
                            if (invalidMessage) {
                              active.invalidMessage = invalidMessage;
                              return;
                            }
                            active.invalidMessage = undefined;
                            store.getState().patchObject(next);
                          }
                        }}
                        onPointerUp={(event) => {
                          if (event.pointerId === drag.current?.pointerId) {
                            if (!bridge.current.project(event.clientX, event.clientY)) {
                              drag.current.invalidMessage ??=
                                'Keep the whole object inside the floor boundary.';
                            }
                            endDrag(event);
                          }
                        }}
                      >
                        <boxGeometry args={[0.3, 0.3, 0.3]} />
                        <meshBasicMaterial color="#000000" depthTest={false} />
                      </mesh>
                    ));
                  })()}
                {state.tool === 'edit-footprint' &&
                  (selectedObject?.recipe === 'polygon-booth' ||
                    selectedObject?.recipe === 'parking-lot' ||
                    selectedObject?.recipe === 'dining') &&
                  !selectedObject.locked &&
                  (() => {
                    const footprintObject = state.pendingObject ?? selectedObject;
                    const { polygon } = footprintObject;
                    const height = visualHeight(footprintObject) + 0.22;
                    return (
                      <>
                        {polygon.map(([x, z], index) => (
                          <Html
                            key={`vertex:${index}`}
                            center
                            position={[x, height, z]}
                            style={{ pointerEvents: 'auto' }}
                          >
                            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                              <button
                                type="button"
                                aria-label={`Move corner ${index + 1}`}
                                title={`Drag corner ${index + 1}`}
                                onPointerDown={(event) =>
                                  beginVertexDrag(footprintObject, index, event)
                                }
                                onPointerMove={moveVertexDrag}
                                onPointerUp={finishVertexDrag}
                                onPointerCancel={(event) => finishVertexDrag(event, true)}
                                onLostPointerCapture={(event) => finishVertexDrag(event, true)}
                                style={{
                                  width: 18,
                                  height: 18,
                                  padding: 0,
                                  border: '2px solid white',
                                  borderRadius: '50%',
                                  background: '#257e72',
                                  color: 'white',
                                  cursor: 'move',
                                  touchAction: 'none',
                                }}
                              />
                              <button
                                type="button"
                                aria-label={`Remove corner ${index + 1}`}
                                title={`Remove corner ${index + 1}`}
                                disabled={polygon.length <= 3}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  const next = removePolygonVertex(polygon, index);
                                  if (next) {
                                    applyFootprintShape(footprintObject, next);
                                  }
                                }}
                                style={{
                                  width: 18,
                                  height: 18,
                                  padding: 0,
                                  border: 0,
                                  borderRadius: '50%',
                                  background: '#702f34',
                                  color: 'white',
                                  cursor: polygon.length <= 3 ? 'not-allowed' : 'pointer',
                                  opacity: polygon.length <= 3 ? 0.5 : 1,
                                  touchAction: 'none',
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </Html>
                        ))}
                        {polygon.map((point, index) => {
                          const next = polygon[(index + 1) % polygon.length]!;
                          return (
                            <Html
                              key={`edge:${index}`}
                              center
                              position={[
                                (point[0] + next[0]) / 2,
                                height,
                                (point[1] + next[1]) / 2,
                              ]}
                              style={{ pointerEvents: 'auto' }}
                            >
                              <button
                                type="button"
                                aria-label={`Add corner on edge ${index + 1}`}
                                title={`Add corner on edge ${index + 1}`}
                                disabled={polygon.length >= 256}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  const location: [number, number] = [
                                    (point[0] + next[0]) / 2,
                                    (point[1] + next[1]) / 2,
                                  ];
                                  const updated = insertPolygonVertex(polygon, index, location);
                                  if (updated) {
                                    applyFootprintShape(footprintObject, updated);
                                  }
                                }}
                                style={{
                                  width: 18,
                                  height: 18,
                                  padding: 0,
                                  border: '1px solid white',
                                  borderRadius: '50%',
                                  background: '#142f35',
                                  color: 'white',
                                  cursor: polygon.length >= 256 ? 'not-allowed' : 'pointer',
                                  opacity: polygon.length >= 256 ? 0.5 : 1,
                                  touchAction: 'none',
                                }}
                              >
                                +
                              </button>
                            </Html>
                          );
                        })}
                      </>
                    );
                  })()}
                {state.tool === 'resize' && dragging && selectedObject && state.pendingObject && (
                  <Html
                    center
                    position={[
                      state.pendingObject.position[0],
                      visualHeight(state.pendingObject) + 0.55,
                      state.pendingObject.position[1],
                    ]}
                    style={{ pointerEvents: 'none' }}
                  >
                    <span
                      className="fp-resize-measurement"
                      aria-live="polite"
                      style={{
                        display: 'block',
                        padding: '5px 8px',
                        borderRadius: 5,
                        background: '#000000',
                        color: '#fff',
                        font: '600 13px/1.2 system-ui, sans-serif',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 5px rgba(0, 0, 0, 0.45)',
                      }}
                    >
                      {`${(state.pendingObject.dimensions[0] * state.pendingObject.scale[0]).toFixed(2)} × ${(state.pendingObject.dimensions[2] * state.pendingObject.scale[2]).toFixed(2)} m`}
                    </span>
                  </Html>
                )}
                {ghostMembers.map((member) => (
                  <ProceduralObject
                    key={`ghost:${member.id}`}
                    object={member}
                    rowConnections={washRackRowConnections(member, [
                      ...floor.objects,
                      ...ghostMembers,
                    ])}
                    color={ghostError ? '#d87572' : '#86c9ad'}
                    colorOverride
                    ghost
                  />
                ))}
                {state.tool === 'move' && selectedObject &&
                  (pendingMembers.length ? pendingMembers : ghostMembers).map((member) => {
                    const outline = objectPoints(member, member.polygon);
                    if (outline.length < 3) {return null;}
                    return (
                      <Line
                        key={`move-outline:${member.id}`}
                        points={[...outline, outline[0]!].map(([x, z]) => [x, 0.08, z])}
                        color="#000000"
                        lineWidth={2}
                        depthTest={false}
                        renderOrder={1000}
                      />
                    );
                  })}
                {alignmentGuide && (
                  <Line
                    points={[
                      [alignmentGuide[0], 0.09, alignmentGuide[1]],
                      [alignmentGuide[2], 0.09, alignmentGuide[3]],
                    ]}
                    color="#74d5e8"
                    lineWidth={1.5}
                    dashed
                    dashSize={0.16}
                    gapSize={0.08}
                  />
                )}
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
                      rowConnections={washRackRowConnections(member, [
                        ...floor.objects,
                        ...pendingMembers,
                      ])}
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
                {polygonSnapPreview && state.drawing[0] && (
                  <Html
                    center
                    position={[state.drawing[0]![0], 0.14, state.drawing[0]![1]]}
                    style={{ pointerEvents: 'none' }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'block',
                        width: 22,
                        height: 22,
                        border: '3px solid #75e3c1',
                        borderRadius: '50%',
                        background: 'rgba(11, 46, 39, 0.72)',
                        boxShadow: '0 0 0 3px rgba(117, 227, 193, 0.24)',
                      }}
                    />
                  </Html>
                )}
                {drawing.length >= 2 && (
                  <Line
                    points={drawing.map(([x, z]) => [x, 0.08, z])}
                    depthTest={false}
                    renderOrder={1000}
                    color={
                      drawingInvalid
                        ? '#ff7777'
                        : state.tool === 'rectangle' || state.tool === 'polygon'
                          ? '#000000'
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
                    transform={false}
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
      {!playback && imageSelected && image.texture && (
        <div className="fp-selection-actions" style={{ left: 12, top: 12, transform: 'none' }} role="toolbar" aria-label="Floor image actions" onPointerDown={(event) => event.stopPropagation()}>
          <span className="fp-muted">Floor image</span>
          <button type="button" className="fp-image-move-button" aria-pressed={imageMoveMode} onClick={() => {
            if (!imageMoveMode && unfinished(store.getState())) {
              toast.error('Apply or discard the current edit before moving the image.');
              return;
            }
            setImageMoveMode((value) => !value);
            store.getState().select(null);
            store.getState().setTool('select');
          }}>{imageMoveMode ? 'Done moving' : 'Move image'}</button>
          {imageMoveMode && <span className="fp-muted">Drag the image on the floor</span>}
        </div>
      )}
      {!playback && hovered && activeHover && (
        <div
          className="fp-hover-tooltip"
          role="tooltip"
          style={{ left: activeHover.x, top: activeHover.y, pointerEvents: 'none' }}
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
          style={{
            left: marqueeFrame.left,
            top: marqueeFrame.top,
            width: marqueeFrame.width,
            height: marqueeFrame.height,
          }}
        />
      )}
      {!playback && (
        <div className="fp-canvas-caption">
          <span>{floor.source.name} · meters</span>
          <span>
            {state.tool === 'select'
              ? 'Drag to orbit · Scroll to zoom'
              : 'Click to author · Escape to cancel'}
          </span>
        </div>
      )}
      {!playback && image.error && (
        <p className="fp-image-notice" role="status">
          {image.error}
        </p>
      )}
    </div>
  );
}
