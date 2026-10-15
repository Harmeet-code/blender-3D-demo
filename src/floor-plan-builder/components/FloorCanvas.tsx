import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
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
import { sampleSurfaceColor } from '../model/surface-color.ts';
import { activeFloor, unfinished, type StudioStore } from '../model/store.ts';
import { createObject } from '../model/inventory.ts';
import { withPreset } from '../model/presets.ts';
import { transformGroup } from '../model/grouping.ts';
import { studioDebugEnabled } from '../hooks/use-studio-debug.ts';
import {
  staticBlockers,
  overlaps,
  footprint,
  objectPoints,
  objectFromDrawing,
  placementClearance,
  visualHeight,
} from '../model/geometry.ts';
import { placementError, resizeFromPointer, insideBoundary } from '../model/geometry.ts';
import {
  isBooth,
  objectSchema,
  polygonSchema,
  type PlanFloor,
  type PlanObject,
} from '../model/types.ts';
import { formatPrice, heatColor, statusColors, type StudioView } from '../model/view.ts';
import type { PlanRoute } from '../model/directions.ts';
import { ProceduralObject } from './ProceduralObject.tsx';

interface Bridge {
  camera: Camera | null;
  project: (x: number, y: number) => [number, number] | null;
}
function CameraBridge({
  bridge,
  element,
  floor,
  focus,
  focusTick,
  view,
}: {
  bridge: React.RefObject<Bridge>;
  element: React.RefObject<HTMLDivElement | null>;
  floor: PlanFloor;
  focus: string | null;
  focusTick: number;
  view: StudioView;
}) {
  const { camera, invalidate, gl, size } = useThree();
  const controls = useRef<Controls>(null);
  const bounds = polygonBounds(floor.boundary),
    cx = (bounds.minX + bounds.maxX) / 2,
    cz = (bounds.minZ + bounds.maxZ) / 2;
  const height = Math.max(0, ...floor.objects.map(visualHeight));
  useEffect(() => {
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
    invalidate();
  }, [
    floor.source.id,
    cx,
    cz,
    bounds.maxX,
    bounds.minX,
    bounds.maxZ,
    bounds.minZ,
    camera,
    floor.source.heightOffset,
    invalidate,
    size.width,
    size.height,
    view.camera,
    view.cameraRevision,
    height,
  ]);
  useEffect(() => {
    const object = floor.objects.find((o) => o.id === focus);
    const zone = floor.zones.find((item) => item.id === focus),
      zoneBounds = zone ? polygonBounds(zone.polygon) : null;
    const position =
      object?.position ??
      (zoneBounds
        ? [(zoneBounds.minX + zoneBounds.maxX) / 2, (zoneBounds.minZ + zoneBounds.maxZ) / 2]
        : null);
    if (!position || !controls.current) {
      return;
    }
    const delta = new Vector3(position[0]!, floor.source.heightOffset, position[1]!).sub(
      controls.current.target,
    );
    camera.position.add(delta);
    controls.current.target.add(delta);
    controls.current.update();
    invalidate();
  }, [focus, focusTick, floor.source.id, camera, invalidate]);
  useEffect(() => {
    const raycaster = new Raycaster(),
      ndc = new Vector2(),
      point = new Vector3(),
      plane = new Plane(new Vector3(0, 1, 0), -floor.source.heightOffset);
    bridge.current.camera = camera;
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
    };
  }, [bridge, camera, element, floor.source.heightOffset, gl]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
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
      target={[cx, floor.source.heightOffset, cz]}
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
function FloorSurface({
  floor,
  texture,
  imageSize,
  click,
  move,
}: {
  floor: PlanFloor;
  texture: CanvasTexture | null;
  imageSize: [number, number] | null;
  click: (event: ThreeEvent<MouseEvent>) => void;
  move: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const bounds = polygonBounds(floor.boundary);
  const shape = useMemo(() => {
    const value = new Shape();
    floor.boundary.forEach(([x, z], i) => (i ? value.lineTo(x, -z) : value.moveTo(x, -z)));
    value.closePath();
    return value;
  }, [floor.boundary]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={click} onPointerMove={move} receiveShadow>
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
      <meshStandardMaterial
        map={texture}
        color={texture ? '#ffffff' : '#d7ddd7'}
        roughness={0.94}
        side={DoubleSide}
      />
    </mesh>
  );
}
function ZoneMesh({
  polygon,
  color,
  selected,
  onClick,
}: {
  polygon: [number, number][];
  color: string;
  selected?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
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
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
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
  route,
  view,
  onInteract,
}: {
  store: StudioStore;
  route: PlanRoute | null;
  view: StudioView;
  onInteract: () => void;
}) {
  const state = store(),
    floor = activeFloor(state),
    image = useFloorImage(floor);
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
    bridge = useRef<Bridge>({ camera: null, project: () => null });
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
  const [dragging, setDragging] = useState(false),
    [contextLost, setContextLost] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(
    () => setHover(null),
    [state.floorId, state.revision, state.tool, view.cameraRevision, view.touring],
  );
  const hovered =
    !dragging && state.tool === 'select'
      ? floor.objects.find(
          (object) =>
            object.id === hover?.id && isBooth(object) && object.id !== state.pendingRemoval?.id,
        )
      : undefined;
  const boothPrices = floor.objects.filter(isBooth).map((object) => object.price);
  const minPrice = boothPrices.length ? Math.min(...boothPrices) : 0,
    maxPrice = boothPrices.length ? Math.max(...boothPrices.map((price) => price || 1)) : 1;
  const definition = useMemo(
    () => ({
      ...withPreset(createObject(state.recipe, [0, 0]), state.presetId),
      yawRadians: state.placementYaw,
    }),
    [state.recipe, state.presetId, state.placementYaw],
  );
  const selectedObject = floor.objects.find(
    (object) => object.id === state.selection?.id && object.id !== state.pendingRemoval?.id,
  );
  const ghost =
    state.pointer &&
    ['place', 'move', 'duplicate'].includes(state.tool) &&
    !(state.selection?.kind === 'zone' && state.tool !== 'place')
      ? {
          ...(state.tool === 'place' || !selectedObject ? definition : selectedObject),
          position: state.pointer,
        }
      : null;
  const selectedZone = floor.zones.find((zone) => zone.id === state.selection?.id);
  const zoneBounds = selectedZone ? polygonBounds(selectedZone.polygon) : null;
  const zoneGhost =
    selectedZone && zoneBounds && state.pointer && ['move', 'duplicate'].includes(state.tool)
      ? selectedZone.polygon.map(([x, z]): [number, number] => [
          x + state.pointer![0] - (zoneBounds.minX + zoneBounds.maxX) / 2,
          z + state.pointer![1] - (zoneBounds.minZ + zoneBounds.maxZ) / 2,
        ])
      : null;
  const pendingMembers =
    state.pendingObject && selectedObject && objectSchema.safeParse(state.pendingObject).success
      ? transformGroup(floor, selectedObject, state.pendingObject)
      : [];
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
  const clearance = candidates.length ? placementClearance(candidates, floor) : null;
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
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const current = store.getState(),
      point: [number, number] = [event.point.x, event.point.z];
    if (event.delta > 3 || drag.current) {
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
      current.addPoint(point);
      if (current.tool.includes('rectangle') && store.getState().drawing.length === 2) {
        store.getState().apply();
      }
    } else if (['place', 'move', 'duplicate', 'spawn'].includes(current.tool)) {
      current.place(point);
    } else {
      current.select(null);
    }
  };
  const finish = () => {
    if (store.getState().drawing.length >= 3) {
      store.getState().apply();
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
  };
  useEffect(() => {
    if (state.tool === 'select' && drag.current) {
      drag.current = null;
      setDragging(false);
    }
  }, [state.tool]);
  useEffect(() => {
    const stop = () => {
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
  return (
    <div
      ref={element}
      className="fp-canvas"
      aria-label="Interactive floor plan"
      data-testid="floor-plan-viewport"
      onPointerDownCapture={() => {
        setHover(null);
        onInteract();
      }}
      onPointerLeave={() => setHover(null)}
      onWheel={() => {
        setHover(null);
        onInteract();
      }}
      onDoubleClick={finish}
      onContextMenu={(event) => {
        if (state.drawing.length) {
          event.preventDefault();
          finish();
        }
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
          store.getState().setPointer(point);
        }
      }}
      onDragLeave={(event) => {
        if (!element.current?.contains(event.relatedTarget as Node | null)) {
          store.getState().setPointer(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const point = bridge.current.project(event.clientX, event.clientY),
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
            <color attach="background" args={[view.night ? '#0b1423' : '#242e32']} />
            <ambientLight intensity={view.night ? 0.4 : 1.2} />
            <Environment key={`booth-reflections-${view.night}`} resolution={64} frames={1}>
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
              intensity={view.night ? 0.8 : 2.3}
              color={view.night ? '#9dbbff' : '#ffffff'}
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-50}
              shadow-camera-right={50}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
            />
            <CameraBridge
              bridge={bridge}
              element={element}
              floor={floor}
              focus={state.focusId}
              focusTick={state.focusTick}
              view={view}
            />
            <ControlsPolicy enabled={state.tool === 'select' && !dragging} />
            <group position={[0, floor.source.heightOffset, 0]}>
              <FloorSurface
                key={`${floor.source.id}:${JSON.stringify(floor.source.coordinateSystem)}:${image.texture?.uuid ?? ''}`}
                floor={floor}
                texture={image.texture}
                imageSize={image.size}
                click={click}
                move={(event) => {
                  setHover(null);
                  if (state.tool !== 'select' || debug) {
                    store.getState().setPointer([event.point.x, event.point.z]);
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
                    selected={state.selection?.id === zone.id}
                    onClick={(event) => {
                      if (event.delta > 3) {
                        return;
                      }
                      if (state.tool === 'select' || state.tool === 'remove') {
                        event.stopPropagation();
                        if (state.tool === 'remove') {
                          state.remove({ kind: 'zone', id: zone.id });
                        } else {
                          state.select({ kind: 'zone', id: zone.id });
                        }
                      }
                    }}
                  />
                ))}
              {floor.objects
                .filter((object) => object.id !== state.pendingRemoval?.id)
                .map((object) => {
                  const displayed = !drag.current?.duplicate
                    ? (pendingMembers.find((member) => member.id === object.id) ?? object)
                    : object;
                  return (
                    <ProceduralObject
                      key={object.id}
                      object={displayed}
                      colorOverride={
                        view.display !== 'surface' ||
                        conflictIds.has(object.id) ||
                        !!(
                          ghostError &&
                          state.pendingObject &&
                          pendingMembers.some((member) => member.id === object.id)
                        )
                      }
                      color={
                        conflictIds.has(object.id) ||
                        !!(
                          ghostError &&
                          state.pendingObject &&
                          pendingMembers.some((member) => member.id === object.id)
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
                      selected={
                        state.selection?.id === object.id ||
                        !!(selectedObject?.groupId && selectedObject.groupId === object.groupId)
                      }
                      onPointerOver={(event) => {
                        if (state.tool !== 'select' || dragging || !isBooth(object)) {
                          return;
                        }
                        event.stopPropagation();
                        const rect = element.current?.getBoundingClientRect();
                        if (rect) {
                          setHover({
                            id: object.id,
                            x: Math.max(
                              8,
                              Math.min(rect.width - 180, event.clientX - rect.left + 12),
                            ),
                            y: Math.max(
                              8,
                              Math.min(rect.height - 90, event.clientY - rect.top + 12),
                            ),
                          });
                        }
                      }}
                      onPointerOut={() => setHover(null)}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (dragging || event.delta > 3) {
                          return;
                        }
                        if (state.tool === 'remove') {
                          state.remove({ kind: 'object', id: object.id });
                        } else if (['select', 'move', 'duplicate', 'resize'].includes(state.tool)) {
                          state.select({ kind: 'object', id: object.id });
                        } else {
                          click(event);
                        }
                      }}
                      onPointerDown={(event) => {
                        if (
                          !['move', 'resize'].includes(state.tool) ||
                          state.selection?.id !== object.id ||
                          event.button !== 0
                        ) {
                          return;
                        }
                        event.stopPropagation();
                        if (unfinished(store.getState()) || drag.current) {
                          store
                            .getState()
                            .notify('Apply or discard the unfinished edit before dragging.');
                          return;
                        }
                        const point = bridge.current.project(event.clientX, event.clientY);
                        if (!point) {
                          return;
                        }
                        drag.current = {
                          id: object.id,
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
                      }}
                      onPointerMove={(event) => {
                        const active = drag.current;
                        if (
                          !active ||
                          active.id !== object.id ||
                          active.handle ||
                          active.pointerId !== event.pointerId
                        ) {
                          if (state.tool === 'select' && isBooth(object)) {
                            event.stopPropagation();
                          }
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
                        if (!point) {
                          return;
                        }
                        const next =
                          state.tool === 'resize'
                            ? resizeFromPointer(
                                active.original,
                                active.start,
                                point,
                                [1, 1],
                                false,
                                event.shiftKey || view.resizeAspect,
                                view.resizeSnap,
                              )
                            : {
                                ...active.original,
                                position: [
                                  active.original.position[0] + point[0] - active.start[0],
                                  active.original.position[1] + point[1] - active.start[1],
                                ] as [number, number],
                              };
                        store.getState().patchObject(next);
                      }}
                      onPointerUp={(event) => {
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
                      }}
                      topDown={view.camera === 'top'}
                    />
                  );
                })}
              {selectedObject &&
                state.tool === 'resize' &&
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
                              resizeFromPointer(
                                active.original,
                                active.start,
                                point,
                                active.handle,
                                true,
                                event.shiftKey || view.resizeAspect,
                                view.resizeSnap,
                              ),
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
              {route?.segments
                .filter((segment) => segment.floorId === floor.source.id)
                .map(
                  (segment, index) =>
                    segment.points.length >= 2 && (
                      <Line
                        key={index}
                        points={segment.points.map(([x, z]) => [x, 0.15, z])}
                        color="#8bc8ed"
                        lineWidth={3}
                      />
                    ),
                )}
              {route?.segments.flatMap((segment, index) => {
                if (segment.floorId !== floor.source.id) {
                  return [];
                }
                const endpoints: { label: string; point: [number, number] }[] = [];
                if (index === 0 && segment.points[0]) {
                  endpoints.push({ label: 'START', point: segment.points[0] });
                }
                if (index === route.segments.length - 1 && segment.points.at(-1)) {
                  endpoints.push({ label: 'REACHED', point: segment.points.at(-1)! });
                }
                return endpoints.map(({ label, point }) => (
                  <group key={label} position={[point[0], 0.06, point[1]]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[0.25, 0.4, 24]} />
                      <meshBasicMaterial color={label === 'START' ? '#80c9ff' : '#9ce6a9'} />
                    </mesh>
                    <Html center position={[0, 0.65, 0]} style={{ pointerEvents: 'none' }}>
                      <span className="fp-label">{label}</span>
                    </Html>
                  </group>
                ));
              })}
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
          </Canvas>
        </ErrorBoundary>
      )}
      {(validationMessages.length > 0 || clearance) && (
        <div
          className={`fp-validation-summary${validationMessages.length ? '' : ' fp-placement-valid'}`}
          role="status"
        >
          <strong>
            {validationMessages.length ? 'Placement needs attention' : 'Placement preview'}
          </strong>
          {clearance && (
            <p>
              Floor edge: {clearance.boundary.toFixed(2)} m · Nearest blocked geometry:{' '}
              {clearance.obstacle === null ? 'none' : `${clearance.obstacle.toFixed(2)} m`}
            </p>
          )}
          <ul>
            {validationMessages.slice(0, 5).map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {hovered && hover && (
        <div className="fp-hover-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}>
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
      {debug && (
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
      <div className="fp-canvas-caption">
        <span>{floor.source.name} · meters</span>
        <span>
          {state.tool === 'select'
            ? 'Drag to orbit · Scroll to zoom'
            : 'Click to author · Escape to cancel'}
        </span>
      </div>
      {image.error && (
        <p className="fp-image-notice" role="status">
          {image.error}
        </p>
      )}
    </div>
  );
}
