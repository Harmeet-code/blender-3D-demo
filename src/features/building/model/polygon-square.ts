import type { Point2 } from '@/utils/geometry/polygon.ts';
import { pointInPolygon, polygonBounds } from '@/utils/geometry/polygon.ts';

const EPSILON = 1e-8;
export interface PreparedArea {
  polygon: readonly Point2[];
  bounds: ReturnType<typeof polygonBounds>;
  edges: Array<readonly [Point2, Point2]>;
}
export interface SquareBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export function prepareArea(polygon: readonly Point2[]): PreparedArea {
  return {
    polygon,
    bounds: polygonBounds(polygon),
    edges: polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length]!] as const),
  };
}
export function boundsOverlap(a: SquareBounds, b: SquareBounds): boolean {
  return (
    a.minX <= b.maxX + EPSILON &&
    a.maxX >= b.minX - EPSILON &&
    a.minZ <= b.maxZ + EPSILON &&
    a.maxZ >= b.minZ - EPSILON
  );
}
function corners(square: SquareBounds): Point2[] {
  return [
    [square.minX, square.minZ],
    [square.maxX, square.minZ],
    [square.maxX, square.maxZ],
    [square.minX, square.maxZ],
  ];
}
/** Liang–Barsky clipping, including a segment fully enclosed by the square. */
function segmentTouchesSquare(a: Point2, b: Point2, square: SquareBounds): boolean {
  let from = 0,
    to = 1;
  for (const [origin, delta, low, high] of [
    [a[0], b[0] - a[0], square.minX, square.maxX],
    [a[1], b[1] - a[1], square.minZ, square.maxZ],
  ]) {
    if (Math.abs(delta!) < 1e-14) {
      if (origin! < low! || origin! > high!) {
        return false;
      }
      continue;
    }
    const t0 = (low! - origin!) / delta!,
      t1 = (high! - origin!) / delta!;
    from = Math.max(from, Math.min(t0, t1));
    to = Math.min(to, Math.max(t0, t1));
    if (from > to) {
      return false;
    }
  }
  return true;
}
export function squareOverlapsArea(square: SquareBounds, area: PreparedArea): boolean {
  if (!boundsOverlap(square, area.bounds)) {
    return false;
  }
  return (
    corners(square).some((p) => pointInPolygon(p, area.polygon)) ||
    area.edges.some(([a, b]) => segmentTouchesSquare(a, b, square))
  );
}
function squareInsideArea(square: SquareBounds, area: PreparedArea): boolean {
  if (!corners(square).every((p) => pointInPolygon(p, area.polygon))) {
    return false;
  }
  // Corners alone miss an inward notch or a whole polygon edge inside the avatar.
  const inset = Math.min(EPSILON, (square.maxX - square.minX) / 4, (square.maxZ - square.minZ) / 4);
  const interior = {
    minX: square.minX + inset,
    maxX: square.maxX - inset,
    minZ: square.minZ + inset,
    maxZ: square.maxZ - inset,
  };
  return !area.edges.some(([a, b]) => segmentTouchesSquare(a, b, interior));
}
const crossingCache = new WeakMap<PreparedArea, WeakMap<PreparedArea, number[]>>();
function crossingHeights(a: PreparedArea, b: PreparedArea): number[] {
  let cache = crossingCache.get(a);
  if (!cache) {
    crossingCache.set(a, (cache = new WeakMap()));
  }
  const prior = cache.get(b);
  if (prior) {
    return prior;
  }
  const heights: number[] = [];
  for (const [p, q] of a.edges) {
    for (const [r, s] of b.edges) {
      if (
        Math.max(p[0], q[0]) < Math.min(r[0], s[0]) ||
        Math.max(r[0], s[0]) < Math.min(p[0], q[0]) ||
        Math.max(p[1], q[1]) < Math.min(r[1], s[1]) ||
        Math.max(r[1], s[1]) < Math.min(p[1], q[1])
      ) {
        continue;
      }
      const dx = q[0] - p[0],
        dz = q[1] - p[1],
        ex = s[0] - r[0],
        ez = s[1] - r[1],
        det = dx * ez - dz * ex;
      if (Math.abs(det) < 1e-14) {
        continue;
      } // Collinear changes occur at cached vertex heights.
      const rx = r[0] - p[0],
        rz = r[1] - p[1],
        t = (rx * ez - rz * ex) / det,
        u = (rx * dz - rz * dx) / det;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        heights.push(p[1] + t * dz);
      }
    }
  }
  cache.set(b, heights);
  return heights;
}
/** Exact piecewise-linear union coverage: overlapping zones do not create artificial seams.
 * Checking only the avatar center/corners misses holes between several positive zones. */
export function squareInsideUnion(square: SquareBounds, regions: readonly PreparedArea[]): boolean {
  const near = regions.filter((area) => boundsOverlap(square, area.bounds));
  if (!near.length) {
    return false;
  }
  if (near.some((area) => squareInsideArea(square, area))) {
    return true;
  }
  if (near.length === 1) {
    return false;
  }
  if (!corners(square).every((point) => near.some((area) => pointInPolygon(point, area.polygon)))) {
    return false;
  }
  const events = [square.minZ, square.maxZ];
  const add = (z: number) => {
    if (z > square.minZ && z < square.maxZ) {
      events.push(z);
    }
  };
  for (const area of near) {
    for (const [a, b] of area.edges) {
      add(a[1]);
      const dx = b[0] - a[0];
      if (Math.abs(dx) < 1e-14) {
        continue;
      }
      for (const x of [square.minX, square.maxX]) {
        const t = (x - a[0]) / dx;
        if (t > 0 && t < 1) {
          add(a[1] + t * (b[1] - a[1]));
        }
      }
    }
  }
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      if (boundsOverlap(near[i]!.bounds, near[j]!.bounds)) {
        for (const z of crossingHeights(near[i]!, near[j]!)) {
          add(z);
        }
      }
    }
  }
  events.sort((a, b) => a - b);
  // Between consecutive events, endpoint ordering and coverage cannot change.
  // Closed polygons also cover the limit at each event if both adjacent strips are covered.
  for (let i = 1; i < events.length; i++) {
    if (events[i]! - events[i - 1]! < 1e-12) {
      continue;
    }
    const z = (events[i]! + events[i - 1]!) / 2,
      intervals: Array<[number, number]> = [];
    for (const area of near) {
      const hits: number[] = [];
      for (const [a, b] of area.edges) {
        if (a[1] > z !== b[1] > z) {
          hits.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      hits.sort((a, b) => a - b);
      for (let j = 1; j < hits.length; j += 2) {
        intervals.push([hits[j - 1]!, hits[j]!]);
      }
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let covered = square.minX;
    for (const [from, to] of intervals) {
      if (to < covered - EPSILON) {
        continue;
      }
      if (from > covered + EPSILON) {
        return false;
      }
      covered = Math.max(covered, to);
      if (covered >= square.maxX - EPSILON) {
        break;
      }
    }
    if (covered < square.maxX - EPSILON) {
      return false;
    }
  }
  return true;
}
