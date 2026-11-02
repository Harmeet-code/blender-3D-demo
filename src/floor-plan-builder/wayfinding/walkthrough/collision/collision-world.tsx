import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { ShapeUtils, Vector2 } from 'three';
import type { PlanFloor } from '@/floor-plan-builder/model/types.ts';
import type { Role } from '../contracts.ts';
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
  children?: ReactNode;
}

/**
 * Builder-local fixed Rapier proxies plus the shared conservative capsule clearance gate.
 * Must be mounted below the existing `Physics` provider and around the single moving capsule.
 */
export function CollisionWorld({ floor, role, roleAreas = [], children }: CollisionWorldProps) {
  const sourceMap = useMemo(() => buildCollisionMap(floor, roleAreas), [floor, roleAreas]);

  const floorShape = useMemo(
    () => extrudedPolygon(sourceMap.boundary, sourceMap.floorY - 0.1, sourceMap.floorY),
    [sourceMap.boundary, sourceMap.floorY],
  );
  const proxyShapes = useMemo(() => [...sourceMap.obstacles, ...sourceMap.blockedAreas].map((item) => ({
    id: item.id,
    shape: extrudedPolygon(item.polygon, item.minY, item.maxY),
  })), [sourceMap.obstacles, sourceMap.blockedAreas]);
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
  }), [map, role]);

  return (
    <CollisionWorldContext.Provider value={value}>
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        {floorShape && <TrimeshCollider key={`floor:${map.floorId}`} args={[floorShape.vertices, floorShape.indices]} />}
        {proxyShapes.map(({ id, shape }) => shape && (
          <TrimeshCollider key={id} args={[shape.vertices, shape.indices]} />
        ))}
      </RigidBody>
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
