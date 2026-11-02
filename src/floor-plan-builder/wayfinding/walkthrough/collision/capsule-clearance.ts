import type { PlanFloor } from '@/floor-plan-builder/model/types.ts';
import { objectObstaclePolygons, visualHeight } from '@/floor-plan-builder/model/geometry.ts';
import { authoredWallBoxes } from '@/features/building/model/authored-walls.ts';
import { authoredInstancePhysical } from '@/features/building/model/authored-instance-physical.ts';
import { boothPhysical, boxFootprint } from '@/features/building/model/booth-physical.ts';
import type { Role } from '../contracts.ts';
import { CHARACTER_CONFIG, CAPSULE_TOTAL_HEIGHT_M } from '../character-config.ts';

export type Point2 = readonly [number, number];
export type Point3 = readonly [number, number, number];

export interface RoleAreaPolicy {
  id: string;
  polygon: readonly Point2[];
  allowedRoles?: readonly Role[];
}

export interface CollisionPolygon {
  id: string;
  source: 'plan-object' | 'authored-obstacle' | 'blocked-zone' | 'authored-wall' | 'booth' | 'instance';
  polygon: readonly Point2[];
  minY: number;
  maxY: number;
}

export interface CollisionMap {
  floorId: string;
  floorY: number;
  boundary: readonly Point2[];
  obstacles: readonly CollisionPolygon[];
  blockedAreas: readonly CollisionPolygon[];
  roleAreas: readonly RoleAreaPolicy[];
  unsupported: readonly { id: string; reason: string }[];
}

export interface ClearanceResult {
  clear: boolean;
  reason?: string;
  blockerId?: string;
  source?: CollisionPolygon['source'] | 'floor-boundary' | 'role-area' | 'unknown-geometry';
}

export interface CapsuleProfile {
  radiusM: number;
  heightM: number;
}

const DEFAULT_PROFILE: CapsuleProfile = {
  radiusM: CHARACTER_CONFIG.radiusM,
  heightM: CAPSULE_TOTAL_HEIGHT_M,
};
const finite = (n: number) => Number.isFinite(n);
const validPolygon = (polygon: readonly Point2[]) =>
  polygon.length >= 3 && polygon.every(([x, z]) => finite(x) && finite(z));

function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

function segmentDistance(a: Point2, b: Point2, c: Point2, d: Point2): number {
  const orient = (p: Point2, q: Point2, r: Point2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  const onSegment = (p: Point2, q: Point2, r: Point2) =>
    q[0] >= Math.min(p[0], r[0]) - 1e-9 && q[0] <= Math.max(p[0], r[0]) + 1e-9 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-9 && q[1] <= Math.max(p[1], r[1]) + 1e-9;
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  if ((Math.abs(o1) <= 1e-9 && onSegment(a, c, b)) || (Math.abs(o2) <= 1e-9 && onSegment(a, d, b)) ||
      (Math.abs(o3) <= 1e-9 && onSegment(c, a, d)) || (Math.abs(o4) <= 1e-9 && onSegment(c, b, d))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function inside(point: Point2, polygon: readonly Point2[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

function segmentHitsPolygon(a: Point2, b: Point2, polygon: readonly Point2[], radius: number): boolean {
  if (inside(a, polygon) || inside(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    if (segmentDistance(a, b, polygon[i]!, polygon[(i + 1) % polygon.length]!) <= radius + 1e-7) return true;
  }
  return false;
}

function polygonContainedBySweep(boundary: readonly Point2[], a: Point2, b: Point2, radius: number): boolean {
  if (!inside(a, boundary) || !inside(b, boundary)) return false;
  for (let i = 0; i < boundary.length; i++) {
    if (segmentDistance(a, b, boundary[i]!, boundary[(i + 1) % boundary.length]!) < radius - 1e-7) return false;
  }
  return true;
}

function addPolygon(
  list: CollisionPolygon[], id: string, source: CollisionPolygon['source'], polygon: readonly Point2[], minY: number, maxY: number,
  unsupported: { id: string; reason: string }[],
) {
  if (!validPolygon(polygon) || !finite(minY) || !finite(maxY) || maxY <= minY) {
    unsupported.push({ id, reason: 'Collision footprint or vertical extent is malformed.' });
    return;
  }
  list.push({ id, source, polygon, minY, maxY });
}

/** Map document geometry to conservative, source-linked collision prisms. */
export function buildCollisionMap(floor: PlanFloor, roleAreas: readonly RoleAreaPolicy[] = []): CollisionMap {
  const y = floor.source.heightOffset;
  const obstacles: CollisionPolygon[] = [], blockedAreas: CollisionPolygon[] = [];
  const unsupported: { id: string; reason: string }[] = [];
  if (!validPolygon(floor.boundary)) unsupported.push({ id: floor.source.id, reason: 'Floor boundary is unavailable or malformed.' });

  const siblings = floor.objects;
  for (const object of siblings) {
    const polygons = objectObstaclePolygons(object, siblings);
    if (object.collidable && polygons.length === 0) unsupported.push({ id: object.id, reason: 'Collidable object has no supported physical footprint.' });
    for (const [index, polygon] of polygons.entries()) {
      addPolygon(obstacles, `${object.id}:${index}`, 'plan-object', polygon, y, y + visualHeight(object), unsupported);
    }
  }

  for (const [index, polygon] of (floor.source.authoring?.obstacles ?? []).entries()) {
    addPolygon(obstacles, `authoring-obstacle:${index}`, 'authored-obstacle', polygon, y, y + 3, unsupported);
  }
  for (const zone of [...(floor.zones ?? []), ...(floor.source.authoring?.zones ?? [])]) {
    if (zone.type === 'blocked') addPolygon(blockedAreas, zone.id, 'blocked-zone', zone.polygon, y, y + 3, unsupported);
  }
  for (const wall of floor.source.authoring?.walls ?? []) {
    for (const [index, box] of authoredWallBoxes(wall).entries()) {
      addPolygon(obstacles, `${wall.id}:${index}`, 'authored-wall', boxFootprint(box), y + box.position[1] - box.halfExtents[1], y + box.position[1] + box.halfExtents[1], unsupported);
    }
  }
  for (const room of floor.source.rooms ?? []) {
    if (room.type !== 'booth') continue;
    const managed = floor.source.authoring?.instances?.some((instance) => instance.id === room.id);
    if (managed) continue;
    for (const [index, box] of boothPhysical(room).boxes.entries()) {
      addPolygon(obstacles, `${room.id}:${index}`, 'booth', boxFootprint(box), y + box.position[1] - box.halfExtents[1], y + box.position[1] + box.halfExtents[1], unsupported);
    }
  }
  for (const instance of floor.source.authoring?.instances ?? []) {
    if (!instance.collidable) continue;
    try {
      for (const [index, box] of authoredInstancePhysical(instance).boxes.entries()) {
        addPolygon(obstacles, `${instance.id}:${index}`, 'instance', box.footprint, y + box.minY, y + box.maxY, unsupported);
      }
    } catch {
      unsupported.push({ id: instance.id, reason: 'Authored instance geometry could not be resolved.' });
    }
  }
  return { floorId: floor.source.id, floorY: y, boundary: floor.boundary, obstacles, blockedAreas, roleAreas, unsupported };
}

/** One capsule sweep contract for free motion, route samples, endpoints, and landings. */
export function validateCapsuleSweep(
  map: CollisionMap,
  role: Role,
  fromFeet: Point3,
  toFeet: Point3,
  profile: CapsuleProfile = DEFAULT_PROFILE,
): ClearanceResult {
  if (![...fromFeet, ...toFeet, profile.radiusM, profile.heightM].every(finite) || profile.radiusM <= 0 || profile.heightM <= profile.radiusM * 2) {
    return { clear: false, reason: 'Capsule pose or dimensions are invalid.', source: 'unknown-geometry' };
  }
  if (map.unsupported.length) {
    const issue = map.unsupported[0]!;
    return { clear: false, reason: issue.reason, blockerId: issue.id, source: 'unknown-geometry' };
  }
  const a: Point2 = [fromFeet[0], fromFeet[2]], b: Point2 = [toFeet[0], toFeet[2]];
  if (!polygonContainedBySweep(map.boundary, a, b, profile.radiusM)) {
    return { clear: false, reason: 'The capsule does not fit inside the floor boundary.', source: 'floor-boundary' };
  }
  const minY = Math.min(fromFeet[1], toFeet[1]);
  const maxY = Math.max(fromFeet[1], toFeet[1]) + profile.heightM;
  for (const area of map.roleAreas) {
    if (!area.allowedRoles || area.allowedRoles.includes(role)) continue;
    if (segmentHitsPolygon(a, b, area.polygon, profile.radiusM)) {
      return { clear: false, reason: `Role ${role} cannot enter area ${area.id}.`, blockerId: area.id, source: 'role-area' };
    }
  }
  for (const item of [...map.blockedAreas, ...map.obstacles]) {
    if (item.maxY <= minY || item.minY >= maxY) continue;
    if (segmentHitsPolygon(a, b, item.polygon, profile.radiusM)) {
      return { clear: false, reason: `Capsule sweep intersects ${item.id}.`, blockerId: item.id, source: item.source };
    }
  }
  return { clear: true };
}

export function validateCapsuleEndpoint(map: CollisionMap, role: Role, feet: Point3, profile?: CapsuleProfile) {
  return validateCapsuleSweep(map, role, feet, feet, profile);
}

