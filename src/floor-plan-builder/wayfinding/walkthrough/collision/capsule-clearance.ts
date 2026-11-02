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

/** Return the canonical simple ring shared by clearance and Rapier proxy generation. */
export function normalizeCollisionPolygon(polygon: readonly Point2[]): Point2[] | null {
  if (!Array.isArray(polygon)) return null;
  const points: Point2[] = [];
  for (const point of polygon as readonly unknown[]) {
    if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1])) return null;
    points.push([point[0], point[1]]);
  }
  // Authored rings sometimes repeat the first vertex to signal closure. Canonicalize
  // that representation so both planar tests and triangulation see the same ring.
  if (points.length > 3 && samePoint(points[0]!, points.at(-1)!)) points.pop();
  if (points.length < 3) return null;
  for (let i = 0; i < points.length; i++) {
    if (samePoint(points[i]!, points[(i + 1) % points.length]!)) return null;
    for (let j = i + 1; j < points.length; j++) {
      if (samePoint(points[i]!, points[j]!)) return null;
    }
  }
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length]!;
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const toPrevious: Point2 = [previous[0] - current[0], previous[1] - current[1]];
    const toNext: Point2 = [next[0] - current[0], next[1] - current[1]];
    const cross = toPrevious[0] * toNext[1] - toPrevious[1] * toNext[0];
    const dot = toPrevious[0] * toNext[0] + toPrevious[1] * toNext[1];
    const scale = Math.max(1, Math.hypot(...toPrevious) * Math.hypot(...toNext));
    // Collinear rays from the shared vertex that point the same way mean the
    // adjacent edges overlap beyond that vertex (a backtracking spike).
    if (Math.abs(cross) <= 1e-9 * scale && dot > 0) return null;
  }
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  if (!finite(twiceArea) || Math.abs(twiceArea) <= 1e-10) return null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    for (let j = i + 1; j < points.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === points.length - 1);
      if (adjacent) continue;
      const c = points[j]!, d = points[(j + 1) % points.length]!;
      if (segmentDistance(a, b, c, d) <= 1e-9) return null;
    }
  }
  return points;
}

export function isValidCollisionPolygon(polygon: readonly Point2[]): boolean {
  return normalizeCollisionPolygon(polygon) !== null;
}

function samePoint(a: Point2, b: Point2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

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
  const normalized = normalizeCollisionPolygon(polygon);
  if (!normalized || !finite(minY) || !finite(maxY) || maxY <= minY) {
    unsupported.push({ id, reason: 'Collision footprint or vertical extent is malformed.' });
    return;
  }
  list.push({ id, source, polygon: normalized, minY, maxY });
}

/** Map document geometry to conservative, source-linked collision prisms. */
export function buildCollisionMap(floor: PlanFloor, roleAreas: readonly RoleAreaPolicy[] = []): CollisionMap {
  const y = floor.source.heightOffset;
  const obstacles: CollisionPolygon[] = [], blockedAreas: CollisionPolygon[] = [];
  const unsupported: { id: string; reason: string }[] = [];
  const boundary = normalizeCollisionPolygon(floor.boundary);
  if (!boundary) unsupported.push({ id: floor.source.id, reason: 'Floor boundary is unavailable or malformed.' });
  if (!finite(y)) unsupported.push({ id: floor.source.id, reason: 'Floor vertical position is malformed.' });
  const normalizedRoleAreas: RoleAreaPolicy[] = [];
  if (!Array.isArray(roleAreas)) {
    unsupported.push({ id: floor.source.id, reason: 'Role-area policy list is malformed.' });
  } else {
    for (const [index, area] of roleAreas.entries()) {
      const polygon = area && normalizeCollisionPolygon(area.polygon);
      const roles = area?.allowedRoles;
      const validRoles = Array.isArray(roles) && roles.every((role) => role === 'staff' || role === 'visitor');
      if (!area || typeof area.id !== 'string' || !area.id.trim() || !polygon || !validRoles) {
        unsupported.push({ id: typeof area?.id === 'string' && area.id.trim() ? area.id : `role-area:${index}`, reason: 'Role-area policy is missing a valid ID, polygon, or explicit allow-list.' });
        continue;
      }
      normalizedRoleAreas.push({ id: area.id, polygon, allowedRoles: roles });
    }
  }

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
  return { floorId: floor.source.id, floorY: y, boundary: boundary ?? [], obstacles, blockedAreas, roleAreas: normalizedRoleAreas, unsupported };
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

