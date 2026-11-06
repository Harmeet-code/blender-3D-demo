import { createContext, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { ShapeUtils, Vector2 } from 'three';
import { objectPoints } from '../../../model/geometry.ts';
import { pointInPolygon } from '@/utils/geometry/polygon.ts';
import { ElevatorPhysics, type ElevatorPhysicsHandle } from './elevator-physics.tsx';
import type { PlanFloor } from '@/floor-plan-builder/model/types.ts';
import type { WalkableZone } from '../../model/zone-schema.ts';
import type { ConnectorRecord } from '../connectors/connector-runtime.ts';
import { createConnectorSurfaceProxy } from './connector-proxies.ts';
import type { Role } from '../contracts.ts';
import { CAPSULE_TOTAL_HEIGHT_M, CHARACTER_CONFIG } from '../character-config.ts';
import { getCollisionOpenDoorIds, subscribeCollisionDoorState } from '../../game/door-state.ts';
import {
  buildCollisionMap,
  physicalFloor as preparePhysicalFloor,
  physicalConnectorIds,
  isValidCollisionPolygon,
  validateCapsuleEndpoint,
  validateCapsuleSweep,
  type ClearanceResult,
  type CollisionMap,
  type Point2,
  type Point3,
  type RoleAreaPolicy,
  type CapsuleProfile,
} from './capsule-clearance.ts';
import {
  buildWalkableRegionMesh,
} from './walkable-region.ts';

export interface CollisionWorldValue {
  map: CollisionMap;
  setElevatorPose(id: string, cabinY: number, open: number): boolean;
  rollbackElevatorPose(id: string): void;
  elevatorReady(id: string): boolean;
  getElevatorDoorOpen(id: string): number | undefined;
  getElevatorCabinY(id: string): number | undefined;
  validateSweep(fromFeet: Point3, toFeet: Point3, profile?: CapsuleProfile): ClearanceResult;
  validateEndpoint(feet: Point3, profile?: CapsuleProfile): ClearanceResult;
  validateConnectorSweep(connectorId: string, fromFeet: Point3, toFeet: Point3, profile?: CapsuleProfile): ClearanceResult;
  validateConnectorEndpoint(connectorId: string, floorId: string, feet: Point3, profile?: CapsuleProfile): ClearanceResult;
}

const CollisionWorldContext = createContext<CollisionWorldValue | null>(null);

function colliderShapeKey(shape: { vertices: Float32Array; indices: Uint32Array }): string {
  let hash = 2166136261;
  const vertexBits = new Uint32Array(
    shape.vertices.buffer,
    shape.vertices.byteOffset,
    shape.vertices.byteLength / Uint32Array.BYTES_PER_ELEMENT,
  );
  for (const value of vertexBits) {hash = Math.imul(hash ^ value, 16777619);}
  for (const value of shape.indices) {hash = Math.imul(hash ^ value, 16777619);}
  return `${shape.vertices.length}:${shape.indices.length}:${hash >>> 0}`;
}

function connectorProxyId(result: ReturnType<typeof createConnectorSurfaceProxy>): string {
  return result.supported ? result.proxy.connectorId : result.connectorId;
}

function extrudedPolygon(polygon: readonly (readonly [number, number])[], bottom: number, top: number, holes: readonly (readonly Point2[])[] = []) {
  if (!isValidCollisionPolygon(polygon) || !Number.isFinite(bottom) || !Number.isFinite(top) || top <= bottom) {return null;}
  if (holes.some((hole) => !isValidCollisionPolygon(hole) || hole.some((point) => !pointInPolygon(point, polygon)))) {return null;}
  const rings = [polygon, ...holes];
  // Holes must be strictly interior and mutually disjoint; touching rings have no
  // well-defined slab side wall and must retain the solid slab instead.
  const cross = (a: Point2, b: Point2, c: Point2) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for (let r = 0; r < rings.length; r++) {
    for (let t = r + 1; t < rings.length; t++) {
      const one = rings[r]!, two = rings[t]!;
      if (r > 0 && (pointInPolygon(one[0]!, two) || pointInPolygon(two[0]!, one))) {return null;}
      for (let i = 0; i < one.length; i++) {for (let j = 0; j < two.length; j++) {
        const a = one[i]!, b = one[(i+1)%one.length]!, c = two[j]!, d = two[(j+1)%two.length]!;
        if (Math.max(a[0],b[0]) < Math.min(c[0],d[0]) || Math.max(c[0],d[0]) < Math.min(a[0],b[0]) || Math.max(a[1],b[1]) < Math.min(c[1],d[1]) || Math.max(c[1],d[1]) < Math.min(a[1],b[1])) {continue;}
        if (cross(a,b,c)*cross(a,b,d) <= 1e-12 && cross(c,d,a)*cross(c,d,b) <= 1e-12) {return null;}
      }}
    }
  }
  const points = rings.flatMap((ring) => ring.map(([x,z]) => new Vector2(x,z)));
  const faces = ShapeUtils.triangulateShape(polygon.map(([x,z]) => new Vector2(x,z)), holes.map((ring) => ring.map(([x,z]) => new Vector2(x,z))));
  // Earcut can discard collinear bridge vertices between aligned holes. Triangle
  // count is therefore not a validity invariant; covered area is.
  const ringArea = (ring: readonly Point2[]) => Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0)) / 2;
  const expectedArea = ringArea(polygon) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);
  const coveredArea = faces.reduce((sum, face) => {
    const a = points[face[0]!]!, b = points[face[1]!]!, c = points[face[2]!]!;
    return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  }, 0);
  if (!faces.length || expectedArea <= 0 || !Number.isFinite(coveredArea) || Math.abs(coveredArea - expectedArea) > Math.max(1e-6, expectedArea * 1e-8)) {return null;}
  const count = points.length;
  const vertices = new Float32Array(count * 6);
  points.forEach(({x,y:z}, i) => {
    vertices.set([x,bottom,z],i*3); vertices.set([x,top,z],(i+count)*3);
  });
  const indices: number[] = [];
  for (const [a,b,c] of faces) {indices.push(a!,c!,b!,a!+count,b!+count,c!+count);}
  let offset = 0;
  for (const ring of rings) {
    for (let i=0;i<ring.length;i++) {
      const a=offset+i,b=offset+(i+1)%ring.length;
      indices.push(a,b,a+count,b,b+count,a+count);
    }
    offset += ring.length;
  }
  return { vertices, indices: new Uint32Array(indices) };
}

function connectorCorridor(record: ConnectorRecord): readonly Point2[] | null {
  const {path} = record;
  if (!path || path.points.length < 2 || !Number.isFinite(path.widthM) || path.widthM <= 0) {return null;}
  const directions: Point2[] = [];
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i]!, b = path.points[i + 1]!;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length <= 1e-8) {return null;}
    directions.push([dx / length, dz / length]);
  }
  const left: Point2[] = [], right: Point2[] = [];
  for (let i = 0; i < path.points.length; i++) {
    const previous = directions[Math.max(0, i - 1)]!;
    const next = directions[Math.min(i, directions.length - 1)]!;
    const pn: Point2 = [-previous[1], previous[0]], nn: Point2 = [-next[1], next[0]];
    let nx: number, nz: number, scale = path.widthM / 2;
    if (i === 0) { nx = nn[0]; nz = nn[1]; }
    else if (i === path.points.length - 1) { nx = pn[0]; nz = pn[1]; }
    else {
      const mx = pn[0] + nn[0], mz = pn[1] + nn[1], ml = Math.hypot(mx, mz);
      if (ml <= 1e-8) {return null;}
      nx = mx / ml; nz = mz / ml;
      const denominator = nx * nn[0] + nz * nn[1];
      if (Math.abs(denominator) < 0.2) {return null;}
      scale /= denominator;
    }
    const sample = path.points[i]!;
    // Portal entries lie on ordinary floor, beyond the authored surface. Cap the
    // query corridor around their full capsule, rather than through its centre.
    // Endpoint floor validation and every obstacle/slab sweep still apply.
    const cap = CHARACTER_CONFIG.radiusM + 0.02;
    const p = i === 0
      ? [sample[0] - next[0] * cap, sample[1], sample[2] - next[1] * cap]
      : i === path.points.length - 1
        ? [sample[0] + previous[0] * cap, sample[1], sample[2] + previous[1] * cap]
        : sample;
    left.push([p[0] + nx * scale, p[2] + nz * scale]);
    right.push([p[0] - nx * scale, p[2] - nz * scale]);
  }
  const boundary = [...left, ...right.reverse()];
  return isValidCollisionPolygon(boundary) ? boundary : null;
}

export interface CollisionWorldProps {
  /** Current floor selector and fallback when no stacked snapshot is supplied. */
  floor: PlanFloor;
  /** Explicit local runtime role. */
  role: Role;
  /** Optional role-restricted areas supplied by the role-policy adapter. */
  roleAreas?: readonly RoleAreaPolicy[];
  /** Connector instances are excluded from obstacle prisms and represented by their authored walk surfaces. */
  connectors?: readonly ConnectorRecord[];
  /** All stacked floors from one pinned document snapshot; `originY` is applied here. */
  connectorFloors?: readonly PlanFloor[];
  /** Hole-bearing zones from the same pinned generation as `connectorFloors`. */
  walkableZones?: readonly WalkableZone[];
  originY?: number;
  children?: ReactNode;
}

const EMPTY_ROLE_AREAS: readonly RoleAreaPolicy[] = [];
const EMPTY_CONNECTORS: readonly ConnectorRecord[] = [];
const EMPTY_FLOORS: readonly PlanFloor[] = [];
const EMPTY_WALKABLE_ZONES: readonly WalkableZone[] = [];

/**
 * Builder-local fixed Rapier proxies plus the shared conservative capsule clearance gate.
 * Must be mounted below the existing `Physics` provider and around the single moving capsule.
 */
export function CollisionWorld({ floor, role, roleAreas = EMPTY_ROLE_AREAS, connectors = EMPTY_CONNECTORS, connectorFloors = EMPTY_FLOORS, walkableZones = EMPTY_WALKABLE_ZONES, originY = 0, children }: CollisionWorldProps) {
  const elevatorHandles = useRef(new Map<string, ElevatorPhysicsHandle>());
  const collisionOpenDoorIds = useSyncExternalStore(
    subscribeCollisionDoorState,
    getCollisionOpenDoorIds,
    getCollisionOpenDoorIds,
  );
  const connectorSurfaceResults = useMemo(
    () => connectors.map((connector) => createConnectorSurfaceProxy(connector, CHARACTER_CONFIG.radiusM * 2)),
    [connectors],
  );
  const connectorIds = useMemo(() => physicalConnectorIds(connectors, role), [connectors, role]);
  const snapshotFloors = useMemo(
    () => connectorFloors.length
      ? connectorFloors.map((item) => originY
          ? { ...item, source: { ...item.source, heightOffset: item.source.heightOffset + originY } }
          : item)
      : [floor],
    [connectorFloors, floor, originY],
  );
  const connectorSurfaceShapes = useMemo(() => connectorSurfaceResults.flatMap((result) => result.supported && connectorIds.has(result.proxy.connectorId)
    ? [{ id: result.proxy.connectorId, shape: { vertices: result.proxy.vertices, indices: result.proxy.indices } }]
    : []), [connectorSurfaceResults, connectorIds]);
  const connectorMaps = useMemo(() => snapshotFloors.map((item) => {
    const physical = preparePhysicalFloor(item, snapshotFloors, connectors, role, collisionOpenDoorIds);
    return {
      floor: item,
      map: buildCollisionMap(physical, roleAreas, 'manual', {
        floors: snapshotFloors,
        connectors,
        role,
        originY,
        walkableZones,
      }),
    };
  }), [snapshotFloors, connectors, role, roleAreas, collisionOpenDoorIds, originY, walkableZones]);
  const sourceMap = useMemo(() => {
    const snapshot = connectorMaps.find(({ map: item }) => item.floorId === floor.source.id)?.map;
    if (snapshot) {return snapshot;}
    const physical = preparePhysicalFloor(floor, snapshotFloors, connectors, role, collisionOpenDoorIds);
    const fallback = buildCollisionMap(physical, roleAreas, 'manual', {
      floors: snapshotFloors,
      connectors,
      role,
      originY,
      walkableZones,
    });
    return {
      ...fallback,
      supportValid: false,
      unsupported: [...fallback.unsupported, {
        id: floor.source.id,
        reason: 'Current floor is absent from the pinned collision snapshot.',
      }],
    };
  }, [connectorMaps, floor, snapshotFloors, connectors, role, collisionOpenDoorIds, roleAreas, originY, walkableZones]);
  const proxyShapes = useMemo(() => connectorMaps.flatMap(({map:item}) => [...item.obstacles,...item.blockedAreas].map((obstacle) => ({
    id: `${item.floorId}:${obstacle.id}`,
    floorId: item.floorId,
    shape: extrudedPolygon(obstacle.polygon,obstacle.minY,obstacle.maxY),
  }))), [connectorMaps]);
  const slabs = useMemo(() => connectorMaps.map(({ map: item }) => {
    const shape = item.supportRegion
      ? buildWalkableRegionMesh(item.supportRegion, item.floorY - 0.1, item.floorY)
      : null;
    return {
      id: item.floorId,
      floorY: item.floorY,
      connectorHoles: item.connectorHoles ?? [],
      valid: item.supportValid === true && !!shape,
      shape,
    };
  }), [connectorMaps]);
  const collisionMaps = useMemo(() => connectorMaps.map(({ floor: itemFloor, map: item }) => {
    const unsupported = [...item.unsupported];
    const slab = slabs.find((candidate) => candidate.id === item.floorId);
    if (!slab?.valid) {
      unsupported.push({ id: item.floorId, reason: 'Floor support region or aperture mesh is invalid.' });
    }
    for (const proxy of proxyShapes) {
      if (proxy.floorId === item.floorId && !proxy.shape) {
        unsupported.push({ id: proxy.id, reason: 'Collision proxy could not be triangulated.' });
      }
    }
    return {
      floor: itemFloor,
      map: {
        ...item,
        unsupported: unsupported.filter((issue, index, issues) =>
          issues.findIndex((candidate) => candidate.id === issue.id && candidate.reason === issue.reason) === index),
      },
    };
  }), [connectorMaps, slabs, proxyShapes]);
  const map = useMemo<CollisionMap>(() =>
    collisionMaps.find(({ map: item }) => item.floorId === sourceMap.floorId)?.map ?? sourceMap,
  [collisionMaps, sourceMap]);
  const connectorMap = useMemo<CollisionMap>(() => {
    const maps = collisionMaps.map(({ map: item }) => item);
    return {
      floorId: map.floorId,
      floorY: map.floorY,
      boundary: [],
      obstacles: maps.flatMap((item) => item.obstacles),
      blockedAreas: maps.flatMap((item) => item.blockedAreas),
      roleAreas: [],
      unsupported: [],
    };
  }, [collisionMaps, map.floorId, map.floorY]);
  const value = useMemo<CollisionWorldValue>(() => ({
    map,
    getElevatorDoorOpen: (id) => elevatorHandles.current.get(id)?.getDoorOpen(),
    getElevatorCabinY: (id) => { const y = elevatorHandles.current.get(id)?.getCabinY(); return y === undefined ? undefined : y - originY; },
    rollbackElevatorPose: (id) => elevatorHandles.current.get(id)?.rollback(),
    elevatorReady: (id) => {
      const connector = connectors.find((item) => item.id === id);
      if (!connector || !connectorIds.has(id)) {return false;}
      const low = Math.min(...connector.stops.map((stop) => stop.entry[1])) + originY;
      const high = Math.max(...connector.stops.map((stop) => stop.entry[1])) + originY;
      const relevantSlabs = slabs.filter((slab) =>
        slab.floorY >= low - 1e-4 && slab.floorY <= high + 1e-4);
      const relevantMaps = collisionMaps.filter(({ map: item }) =>
        item.floorY >= low - 1e-4 && item.floorY <= high + 1e-4);
      return relevantSlabs.length > 0 && relevantSlabs.every((slab) => slab.valid) &&
        relevantMaps.every(({ map: item }) => item.unsupported.length === 0);
    },
    setElevatorPose: (id, y, open) => elevatorHandles.current.get(id)?.setPose(y + originY, open) ?? false,
    validateSweep: (from, to, profile) => validateCapsuleSweep(map, role, from, to, profile),
    validateEndpoint: (feet, profile) => validateCapsuleEndpoint(map, role, feet, profile),
    validateConnectorSweep: (connectorId, from, to, profile) => {
      const connector = connectors.find((item) => item.id === connectorId);
      if (!connectorIds.has(connectorId)) {return { clear: false, reason: 'Connector is not bound to this collision world.', blockerId: connectorId, source: 'unknown-geometry' };}
      const boundary = connector?.elevator
        ? objectPoints(connector.elevator.object, [
          [-connector.elevator.object.dimensions[0]/2, -connector.elevator.object.dimensions[2]/2],
          [connector.elevator.object.dimensions[0]/2, -connector.elevator.object.dimensions[2]/2],
          [connector.elevator.object.dimensions[0]/2, connector.elevator.object.dimensions[2]/2+1.5],
          [-connector.elevator.object.dimensions[0]/2, connector.elevator.object.dimensions[2]/2+1.5],
        ]) : connector && connectorCorridor(connector);
      if (!boundary) {return { clear: false, reason: 'Connector surface footprint is unavailable or malformed.', blockerId: connectorId, source: 'unknown-geometry' };}
      const dimensions = profile ?? { radiusM: CHARACTER_CONFIG.radiusM, heightM: CAPSULE_TOTAL_HEIGHT_M };
      const minY = Math.min(from[1], to[1]);
      const maxY = Math.max(from[1], to[1]) + dimensions.heightM;
      const slab = collisionMaps.find(({map:item}) => {
        if (!(item.floorY > minY + 1e-4 && item.floorY - 0.1 < maxY - 1e-4)) {return false;}
        const aperture = slabs.find((s) => s.id === item.floorId);
        return !aperture?.valid || !aperture.connectorHoles.some((hole) =>
          hole.connectorId === connectorId &&
          validateCapsuleSweep({ ...connectorMap, boundary: hole.polygon, obstacles: [], blockedAreas: [], unsupported: [] }, role, from, to, dimensions).clear);
      });
      if (slab) {return {clear:false, reason:`Capsule intersects slab ${slab.map.floorId} outside a validated aperture.`};}
      const relevant = collisionMaps.filter(({ map: item }) => item.floorY <= maxY && item.floorY + 0.1 >= minY);
      const unsupported = relevant.flatMap(({ map: item }) => item.unsupported);
      const surfaceResult = connectorSurfaceResults.find((result) => connectorProxyId(result) === connectorId);
      if (surfaceResult && !surfaceResult.supported && connectors.find((item) => item.id === connectorId)?.kind !== 'elevator') {
        unsupported.push({ id: connectorId, reason: surfaceResult.reason });
      }
      return validateCapsuleSweep({
        ...connectorMap,
        boundary,
        roleAreas: relevant.flatMap(({ map: item }) => item.roleAreas),
        unsupported,
      }, role, from, to, dimensions);
    },
    validateConnectorEndpoint: (connectorId, floorId, feet, profile) => {
      if (!connectorIds.has(connectorId)) {return { clear: false, reason: 'Connector is not bound to this collision world.', blockerId: connectorId, source: 'unknown-geometry' };}
      const mapForFloor = collisionMaps.find((item) => item.floor.source.id === floorId)?.map;
      if (!mapForFloor) {return { clear: false, reason: `Connector landing floor ${floorId} is unavailable.`, blockerId: floorId, source: 'unknown-geometry' };}
      return validateCapsuleEndpoint(mapForFloor, role, feet, profile);
    },
  }), [map, role, connectors, connectorIds, connectorMap, collisionMaps, connectorSurfaceResults, slabs, originY]);

  return (
    <CollisionWorldContext.Provider value={value}>
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        {slabs.map(({id, shape}) => shape && <TrimeshCollider key={`floor:${id}:${colliderShapeKey(shape)}`} args={[shape.vertices, shape.indices]} />)}
        {proxyShapes.map(({ id, shape }) => shape && (
          <TrimeshCollider key={`${id}:${colliderShapeKey(shape)}`} args={[shape.vertices, shape.indices]} />
        ))}
      </RigidBody>
      {connectorSurfaceShapes.length > 0 && <RigidBody type="fixed" colliders={false} position={[0, originY, 0]}>
        {connectorSurfaceShapes.map(({ id, shape }) => (
          <TrimeshCollider key={`connector-surface:${id}:${colliderShapeKey(shape)}`} args={[shape.vertices, shape.indices]} />
        ))}
      </RigidBody>}
      {connectors.filter((record) => connectorIds.has(record.id) && record.elevator).map((record) =>
        <ElevatorPhysics key={record.id} record={record} originY={originY} register={(handle) => {
          if (handle) {elevatorHandles.current.set(record.id, handle);} else {elevatorHandles.current.delete(record.id);}
        }} />)}
      {children}
    </CollisionWorldContext.Provider>
  );
}

/** Access the same gate for both manual motion and route/landing samples. */
export function useCapsuleClearance(): CollisionWorldValue {
  const value = useContext(CollisionWorldContext);
  if (!value) {throw new Error('useCapsuleClearance must be used under CollisionWorld.');}
  return value;
}

export type { ClearanceResult, CollisionMap, Point3, RoleAreaPolicy, CapsuleProfile };
