import type { Point2 } from '../../../shared/lib/geometry/polygon.ts';
import { polygonEdges, segmentDistance } from '../../../shared/lib/geometry/polygon.ts';
import type { Room } from './building-schema.ts';
import { roomEntrance } from './room-assembly.ts';

export interface WallSpan {
  a: Point2;
  b: Point2;
}

/** Default wall height for booth rooms, matching the booth frame. */
export const BOOTH_WALL_HEIGHT = 2.6;
/** Default wall height for halls and circulation. */
export const HALL_WALL_HEIGHT = 3;
/** Clear opening kept around a room entrance. */
export const ENTRANCE_OPENING = 2;

export function wallHeightFor(room: Room): number {
  return room.type === 'hall' || room.type === 'walkable' ? HALL_WALL_HEIGHT : BOOTH_WALL_HEIGHT;
}

function projectOntoEdge(
  point: Point2,
  a: Point2,
  b: Point2,
): { distance: number; along: number; length: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    return { distance: Number.POSITIVE_INFINITY, along: 0, length: 0 };
  }
  const t = Math.min(
    1,
    Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (length * length)),
  );
  return {
    distance: Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dz * t)),
    along: t * length,
    length,
  };
}

/**
 * Continuous wall spans for every room edge, minus a centered entrance
 * opening on the edge nearest the (declared or default) entrance.
 */
export function wallSpans(room: Room, openingWidth = ENTRANCE_OPENING): WallSpan[] {
  const entrance = roomEntrance(room).position;
  let entranceEdge = -1;
  let entranceAlong = 0;
  let best = Number.POSITIVE_INFINITY;
  const edges = polygonEdges(room.polygon);
  for (const [index, [a, b]] of edges.entries()) {
    if (segmentDistance(entrance, a, b) > 0.005) {
      continue;
    }
    const projection = projectOntoEdge(entrance, a, b);
    if (projection.distance < best) {
      best = projection.distance;
      entranceEdge = index;
      entranceAlong = projection.along;
    }
  }

  const spans: WallSpan[] = [];
  for (const [index, [a, b]] of edges.entries()) {
    if (index !== entranceEdge) {
      spans.push({ a, b });
      continue;
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length === 0) {
      continue;
    }
    const half = openingWidth / 2;
    const start = Math.max(0, entranceAlong - half);
    const end = Math.min(length, entranceAlong + half);
    if (start > 0.005) {
      spans.push({
        a,
        b: [a[0] + (dx / length) * start, a[1] + (dz / length) * start],
      });
    }
    if (end < length - 0.005) {
      spans.push({
        a: [a[0] + (dx / length) * end, a[1] + (dz / length) * end],
        b,
      });
    }
  }
  return spans;
}
