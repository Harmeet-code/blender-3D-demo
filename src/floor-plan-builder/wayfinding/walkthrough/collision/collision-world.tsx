import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { ShapeUtils, Vector2 } from 'three';
import type { PlanFloor } from '@/floor-plan-builder/model/types.ts';
import type { ConnectorRecord } from '../connectors/connector-runtime.ts';
import { createConnectorSurfaceProxy } from './connector-proxies.ts';
import type { Role } from '../contracts.ts';
import { CAPSULE_TOTAL_HEIGHT_M, CHARACTER_CONFIG } from '../character-config.ts';
import {
  buildCollisionMap,
  isValidCollisionPolygon,
  validateCapsuleEndpoint,
  validateCapsuleSweep,
  type ClearanceResult,
  type CollisionMap,
  type Point3,
  type RoleAreaPolicy,
  type CapsuleProfile,
} from './capsule-clearance.ts';

interface CollisionWorldValue {
  map: CollisionMap;
  validateSweep(fromFeet: Point3, toFeet: Point3, profile?: CapsuleProfile): ClearanceResult;
  validateEndpoint(feet: Point3, profile?: CapsuleProfile): ClearanceResult;
  validateConnectorSweep(connectorId: string, fromFeet: Point3, toFeet: Point3, profile?: CapsuleProfile): ClearanceResult;
  validateConnectorEndpoint(connectorId: string, floorId: string, feet: Point3, profile?: CapsuleProfile): ClearanceResult;
}

const CollisionWorldContext = createContext<CollisionWorldValue | null>(null);

function extrudedPolygon(polygon: readonly (readonly [number, number])[], bottom: number, top: number) {
  if (!isValidCollisionPolygon(polygon) || !Number.isFinite(bottom) || !Number.isFinite(top) || top <= bottom) return null;
  const points = polygon.map(([x, z]) => new Vector2(x, z));
  const faces = ShapeUtils.triangulateShape(points, []);
  if (faces.length !== points.length - 2) return null;
  const vertices = new Float32Array(polygon.length * 2 * 3);
  polygon.forEach(([x, z], i) => {
    const b = i * 3, t = (i + polygon.length) * 3;
    vertices[b] = x; vertices[b + 1] = bottom; vertices[b + 2] = z;
    vertices[t] = x; vertices[t + 1] = top; vertices[t + 2] = z;
  });
  const indices: number[] = [];
  for (const [a, b, c] of faces) {
    indices.push(a!, c!, b!, a! + polygon.length, b! + polygon.length, c! + polygon.length);
  }
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length;
    indices.push(i, next, i + polygon.length, next, next + polygon.length, i + polygon.length);
  }
  return { vertices, indices: new Uint32Array(indices) };
}

export interface CollisionWorldProps {
  /** Current builder floor snapshot. Rebuild when the authored floor changes. */
  floor: PlanFloor;
  /** Explicit local runtime role. */
  role: Role;
  /** Optional role-restricted areas supplied by the role-policy adapter. */
  roleAreas?: readonly RoleAreaPolicy[];
  /** Connector instances are excluded from obstacle prisms and represented by their authored walk surfaces. */
  connectors?: readonly ConnectorRecord[];
  /** All stacked floors, in the same rebased physics frame as `floor`. */
  connectorFloors?: readonly PlanFloor[];
  originY?: number;
  children?: ReactNode;
}

/**
 * Builder-local fixed Rapier proxies plus the shared conservative capsule clearance gate.
 * Must be mounted below the existing `Physics` provider and around the single moving capsule.
 */
export function CollisionWorld({ floor, role, roleAreas = [], connectors = [], connectorFloors = [], originY = 0, children }: CollisionWorldProps) {
  const connectorSurfaceResults = useMemo(
    () => connectors.map((connector) => createConnectorSurfaceProxy(connector, CHARACTER_CONFIG.radiusM * 2)),
    [connectors],
  );
  const connectorIds = useMemo(() => new Set(connectors.flatMap((connector) => {
    const surface = connectorSurfaceResults.find((result) => result.connectorId === connector.id);
    return connector.enabled && (connector.kind === 'elevator' || surface?.supported) ? [connector.id] : [];
  })), [connectors, connectorSurfaceResults]);
  const physicalFloor = useMemo(() => ({
    ...floor,
    objects: floor.objects.filter((object) => !connectorIds.has(object.id)),
    source: floor.source.authoring ? {
      ...floor.source,
      authoring: {
        ...floor.source.authoring,
        instances: floor.source.authoring.instances?.filter((instance) => !connectorIds.has(instance.id)),
      },
    } : floor.source,
  }), [floor, connectorIds]);
  const sourceMap = useMemo(() => buildCollisionMap(physicalFloor, roleAreas), [physicalFloor, roleAreas]);

  const floorShape = useMemo(
    () => extrudedPolygon(sourceMap.boundary, sourceMap.floorY - 0.1, sourceMap.floorY),
    [sourceMap.boundary, sourceMap.floorY],
  );
  const proxyShapes = useMemo(() => [...sourceMap.obstacles, ...sourceMap.blockedAreas].map((item) => ({
    id: item.id,
    shape: extrudedPolygon(item.polygon, item.minY, item.maxY),
  })), [sourceMap.obstacles, sourceMap.blockedAreas]);
  const connectorSurfaceShapes = useMemo(() => connectorSurfaceResults.flatMap((result) => result.supported && connectors.find((item) => item.id === result.proxy.connectorId)?.enabled
    ? [{ id: result.proxy.connectorId, shape: { vertices: result.proxy.vertices, indices: result.proxy.indices } }]
    : []), [connectorSurfaceResults, connectors]);
  const connectorMaps = useMemo(() => (connectorFloors.length ? connectorFloors : [floor]).map((item) => {
    const adjusted = originY ? { ...item, source: { ...item.source, heightOffset: item.source.heightOffset + originY } } : item;
    return { floor: adjusted, map: buildCollisionMap({
      ...adjusted,
      objects: adjusted.objects.filter((object) => !connectorIds.has(object.id)),
      source: adjusted.source.authoring ? { ...adjusted.source, authoring: {
        ...adjusted.source.authoring,
        instances: adjusted.source.authoring.instances?.filter((instance) => !connectorIds.has(instance.id)),
      } } : adjusted.source,
    }, roleAreas) };
  }), [connectorFloors, floor, originY, connectorIds, roleAreas]);
  const connectorMap = useMemo<CollisionMap>(() => {
    const maps = connectorMaps.map(({ map: item }) => item);
    const boundaries = maps.flatMap((item) => item.boundary);
    const xs = boundaries.map(([x]) => x), zs = boundaries.map(([, z]) => z);
    const minX = xs.length ? Math.min(...xs) : -1, maxX = xs.length ? Math.max(...xs) : 1;
    const minZ = zs.length ? Math.min(...zs) : -1, maxZ = zs.length ? Math.max(...zs) : 1;
    const padding = Math.max(1, maxX - minX, maxZ - minZ);
    const boundary: readonly (readonly [number, number])[] = [
      [minX - padding, minZ - padding], [maxX + padding, minZ - padding],
      [maxX + padding, maxZ + padding], [minX - padding, maxZ + padding],
    ];
    return {
      floorId: sourceMap.floorId,
      floorY: sourceMap.floorY,
      boundary,
      obstacles: maps.flatMap((item) => item.obstacles),
      blockedAreas: maps.flatMap((item) => item.blockedAreas),
      roleAreas: [],
      unsupported: [],
    };
  }, [connectorMaps, sourceMap.floorId, sourceMap.floorY]);
  const map = useMemo<CollisionMap>(() => {
    const unsupported = [...sourceMap.unsupported];
    if (!floorShape) unsupported.push({ id: sourceMap.floorId, reason: 'Floor collision proxy could not be triangulated.' });
    for (const proxy of proxyShapes) {
      if (!proxy.shape) unsupported.push({ id: proxy.id, reason: 'Collision proxy could not be triangulated.' });
    }
    return { ...sourceMap, unsupported };
  }, [sourceMap, floorShape, proxyShapes]);
  const value = useMemo<CollisionWorldValue>(() => ({
    map,
    validateSweep: (from, to, profile) => validateCapsuleSweep(map, role, from, to, profile),
    validateEndpoint: (feet, profile) => validateCapsuleEndpoint(map, role, feet, profile),
    validateConnectorSweep: (connectorId, from, to, profile) => {
      if (!connectorIds.has(connectorId)) return { clear: false, reason: 'Connector is not bound to this collision world.', blockerId: connectorId, source: 'unknown-geometry' };
      const dimensions = profile ?? { radiusM: CHARACTER_CONFIG.radiusM, heightM: CAPSULE_TOTAL_HEIGHT_M };
      const minY = Math.min(from[1], to[1]);
      const maxY = Math.max(from[1], to[1]) + dimensions.heightM;
      const relevant = connectorMaps.filter(({ map: item }) => item.floorY <= maxY && item.floorY + 0.1 >= minY);
      const unsupported = relevant.flatMap(({ map: item }) => item.unsupported);
      const surfaceResult = connectorSurfaceResults.find((result) => result.connectorId === connectorId);
      if (surfaceResult && !surfaceResult.supported && connectors.find((item) => item.id === connectorId)?.kind !== 'elevator') {
        unsupported.push({ id: connectorId, reason: surfaceResult.reason });
      }
      return validateCapsuleSweep({
        ...connectorMap,
        roleAreas: relevant.flatMap(({ map: item }) => item.roleAreas),
        unsupported,
      }, role, from, to, dimensions);
    },
    validateConnectorEndpoint: (connectorId, floorId, feet, profile) => {
      if (!connectorIds.has(connectorId)) return { clear: false, reason: 'Connector is not bound to this collision world.', blockerId: connectorId, source: 'unknown-geometry' };
      const mapForFloor = connectorMaps.find((item) => item.floor.source.id === floorId)?.map;
      if (!mapForFloor) return { clear: false, reason: `Connector landing floor ${floorId} is unavailable.`, blockerId: floorId, source: 'unknown-geometry' };
      return validateCapsuleEndpoint(mapForFloor, role, feet, profile);
    },
  }), [map, role, connectorIds, connectorMap, connectorMaps]);

  return (
    <CollisionWorldContext.Provider value={value}>
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        {floorShape && <TrimeshCollider key={`floor:${map.floorId}`} args={[floorShape.vertices, floorShape.indices]} />}
        {proxyShapes.map(({ id, shape }) => shape && (
          <TrimeshCollider key={id} args={[shape.vertices, shape.indices]} />
        ))}
      </RigidBody>
      {connectorSurfaceShapes.length > 0 && <RigidBody type="fixed" colliders={false} position={[0, originY, 0]}>
        {connectorSurfaceShapes.map(({ id, shape }) => (
          <TrimeshCollider key={`connector-surface:${id}`} args={[shape.vertices, shape.indices]} />
        ))}
      </RigidBody>}
      {children}
    </CollisionWorldContext.Provider>
  );
}

/** Access the same gate for both manual motion and route/landing samples. */
export function useCapsuleClearance(): CollisionWorldValue {
  const value = useContext(CollisionWorldContext);
  if (!value) throw new Error('useCapsuleClearance must be used under CollisionWorld.');
  return value;
}

export type { ClearanceResult, CollisionMap, Point3, RoleAreaPolicy, CapsuleProfile };
