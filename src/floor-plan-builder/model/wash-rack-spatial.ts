import { polygonBounds } from '@/utils/geometry/polygon.ts';
import type { PlanObject } from './types.ts';
import { washRackCanonicalToCenterLocal } from './wash-rack.ts';

export type WashRackRowConnections = { left: boolean; right: boolean };
type Point2 = [number, number];
const ROW_SNAP_TOLERANCE = 0.3;
const ROW_JOIN_TOLERANCE = 0.015;

export function isWashRack(object: PlanObject): boolean {
  return object.recipe === 'wash-rack';
}

function dimensions(object: PlanObject) {
  const bounds = polygonBounds(object.polygon);
  return {
    width: Math.max(0.1, (bounds.maxX - bounds.minX) * object.scale[0]),
    depth: Math.max(0.1, (bounds.maxZ - bounds.minZ) * object.scale[2]),
    height: Math.max(0.1, object.dimensions[1] * object.scale[1]),
  };
}

function yawDelta(a: number, b: number): number {
  let value = (a - b) % (Math.PI * 2);
  if (value > Math.PI) {value -= Math.PI * 2;}
  if (value < -Math.PI) {value += Math.PI * 2;}
  return Math.abs(value);
}

function sameRowConstruction(a: PlanObject, b: PlanObject): boolean {
  if (
    !isWashRack(a) ||
    !isWashRack(b) ||
    !a.washRackVariant ||
    a.washRackVariant !== b.washRackVariant ||
    yawDelta(a.yawRadians, b.yawRadians) > 0.01
  ) {
    return false;
  }
  const aSize = dimensions(a),
    bSize = dimensions(b);
  return Math.abs(aSize.depth - bSize.depth) <= 0.01 && Math.abs(aSize.height - bSize.height) <= 0.01;
}

function localXAxis(object: PlanObject): Point2 {
  return [Math.cos(object.yawRadians), -Math.sin(object.yawRadians)];
}

function localZAxis(object: PlanObject): Point2 {
  return [Math.sin(object.yawRadians), Math.cos(object.yawRadians)];
}

function projectedDelta(
  from: readonly [number, number],
  to: readonly [number, number],
  axis: Point2,
): number {
  return (to[0] - from[0]) * axis[0] + (to[1] - from[1]) * axis[1];
}

/** Compatible side-by-side bays whose physical edges meet within join tolerance. */
function sideOfNeighbor(object: PlanObject, neighbor: PlanObject): 'left' | 'right' | null {
  if (!sameRowConstruction(object, neighbor) || object.id === neighbor.id) {return null;}
  const axisX = localXAxis(object),
    axisZ = localZAxis(object),
    dx = projectedDelta(object.position, neighbor.position, axisX),
    dz = projectedDelta(object.position, neighbor.position, axisZ),
    size = dimensions(object),
    other = dimensions(neighbor),
    clearance = Math.abs(dx) - (size.width + other.width) / 2;
  if (Math.abs(dz) > ROW_JOIN_TOLERANCE || Math.abs(clearance) > ROW_JOIN_TOLERANCE) {return null;}
  return dx < 0 ? 'left' : 'right';
}

export function washRackRowConnections(
  object: PlanObject,
  siblings: readonly PlanObject[],
): WashRackRowConnections {
  const result: WashRackRowConnections = { left: false, right: false };
  if (!isWashRack(object) || !object.washRackVariant) {return result;}
  for (const sibling of siblings) {
    const side = sideOfNeighbor(object, sibling);
    if (side) {result[side] = true;}
  }
  return result;
}

/** Snap only newly authored variant racks to an actual-width compatible neighbor. */
export function snapWashRackPosition(
  object: PlanObject,
  siblings: readonly PlanObject[],
  position: readonly [number, number] = object.position,
): Point2 {
  if (!isWashRack(object) || !object.washRackVariant) {return [position[0], position[1]];}
  const axisX = localXAxis(object),
    axisZ = localZAxis(object),
    size = dimensions(object);
  let best: { point: Point2; score: number } | null = null;
  for (const sibling of siblings) {
    if (!sameRowConstruction(object, sibling) || sibling.id === object.id) {continue;}
    const dx = projectedDelta(position, sibling.position, axisX),
      dz = projectedDelta(position, sibling.position, axisZ),
      other = dimensions(sibling),
      gap = Math.abs(dx) - (size.width + other.width) / 2;
    if (Math.abs(gap) > ROW_SNAP_TOLERANCE || Math.abs(dz) > ROW_SNAP_TOLERANCE) {continue;}
    const side = dx < 0 ? -1 : 1;
    const targetX = sibling.position[0] - axisX[0] * side * (size.width + other.width) / 2;
    const targetZ = sibling.position[1] - axisX[1] * side * (size.width + other.width) / 2;
    const score = Math.hypot(targetX - position[0], targetZ - position[1]);
    if (score <= ROW_SNAP_TOLERANCE && (!best || score < best.score)) {
      best = { point: [targetX, targetZ], score };
    }
  }
  return best?.point ?? [position[0], position[1]];
}

function rectangle(minX: number, minZ: number, maxX: number, maxZ: number): Point2[] {
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
}

function circle(center: Point2, radius: number): Point2[] {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });
}

/** The persisted center remains untouched; canonical Z=0 is the rack's entrance. */
function canonicalToCenterLocal(points: Point2[][], depth: number): Point2[][] {
  return points.map((polygon) =>
    polygon.map(([x, z]) => washRackCanonicalToCenterLocal([x, z], depth)),
  );
}

/** Thin physical barriers in center-local coordinates; the full stall stays traversable. */
export function washRackObstacleLocal(
  object: PlanObject,
  connections: WashRackRowConnections = { left: false, right: false },
): Point2[][] {
  const { width, depth } = dimensions(object),
    halfWidth = width / 2,
    rail = 0.08,
    body: Point2[][] = [];
  // Deterministic seam ownership: the bay with a left neighbor omits its left edge;
  // the leftmost bay retains its right edge. This removes duplicate wall/posts.
  if (!connections.left) {
    body.push(rectangle(-halfWidth - rail / 2, 0, -halfWidth + rail / 2, depth));
  }
  body.push(rectangle(halfWidth - rail / 2, 0, halfWidth + rail / 2, depth));
  body.push(rectangle(-halfWidth, depth - rail / 2, halfWidth, depth + rail / 2));
  const posts: Point2[][] = [];
  if (!connections.left) {
    posts.push(circle([-halfWidth, 0], 0.1), circle([-halfWidth, depth], 0.1));
  }
  posts.push(circle([halfWidth, 0], 0.1), circle([halfWidth, depth], 0.1));
  return canonicalToCenterLocal([...body, ...posts], depth);
}

/** Clear rack interior and centered 1.5 m × 2.5 m entrance approach. */
export function washRackWalkableLocal(object: PlanObject): Point2[] {
  const { width, depth } = dimensions(object);
  const clearance = 0.1;
  return canonicalToCenterLocal([
    rectangle(-width / 2 + clearance, -0.01, width / 2 - clearance, depth - clearance),
  ], depth)[0]!;
}

export function washRackApproachLocal(object: PlanObject): Point2[] {
  const { depth } = dimensions(object);
  return canonicalToCenterLocal([rectangle(-0.75, -2.5, 0.75, 0)], depth)[0]!;
}
