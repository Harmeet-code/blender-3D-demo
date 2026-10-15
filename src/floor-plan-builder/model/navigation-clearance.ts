import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
import { authoredWallBoxes } from '@/features/building/model/authored-walls.ts';
import { boxFootprint } from '@/features/building/model/booth-physical.ts';
import { wallHeightFor, wallSpans } from '@/features/building/model/wall-spans.ts';
import { isFloorPointClear } from '@/features/building/model/floor-point-clear.ts';
import {
  pointInPolygon,
  polygonBounds,
  polygonEdges,
  polygonsOverlap,
} from '@/utils/geometry/polygon.ts';
import { insideBoundary } from './geometry.ts';

type Point = [number, number];
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function hull(points: Point[]): Point[] {
  const sorted = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (values: Point[]) => {
    const result: Point[] = [];
    for (const point of values) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) {
        result.pop();
      }
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.toReversed())];
}
/** Exact strip coverage of a polygon by a union; internal positive-zone seams are not walls. */
function insideUnion(subject: Point[], regions: Point[][]): boolean {
  if (regions.some((polygon) => insideBoundary(subject, polygon))) {
    return true;
  }
  if (!subject.every((point) => regions.some((polygon) => pointInPolygon(point, polygon)))) {
    return false;
  }
  const bounds = polygonBounds(subject),
    polygons = [subject, ...regions];
  const events = [bounds.minZ, bounds.maxZ];
  const add = (z: number) => {
    if (z > bounds.minZ && z < bounds.maxZ) {
      events.push(z);
    }
  };
  polygons.forEach((polygon) => polygon.forEach((point) => add(point[1])));
  const edges = polygons.map(polygonEdges);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      for (const [a, b] of edges[i]!) {
        for (const [c, d] of edges[j]!) {
          const x = b[0] - a[0],
            z = b[1] - a[1],
            u = d[0] - c[0],
            v = d[1] - c[1],
            det = x * v - z * u;
          if (Math.abs(det) < 1e-14) {
            continue;
          }
          const t = ((c[0] - a[0]) * v - (c[1] - a[1]) * u) / det;
          const s = ((c[0] - a[0]) * z - (c[1] - a[1]) * x) / det;
          if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
            add(a[1] + t * z);
          }
        }
      }
    }
  }
  const intervals = (polygon: Point[], z: number): Point[] => {
    const hits = polygonEdges(polygon)
      .filter(([a, b]) => a[1] > z !== b[1] > z)
      .map(([a, b]) => a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      .sort((a, b) => a - b);
    return hits.flatMap((x, index): Point[] => (index % 2 ? [] : [[x, hits[index + 1]!]]));
  };
  events.sort((a, b) => a - b);
  for (let i = 1; i < events.length; i++) {
    if (events[i]! - events[i - 1]! < 1e-12) {
      continue;
    }
    const z = (events[i]! + events[i - 1]!) / 2;
    const coverage = regions
      .flatMap((polygon) => intervals(polygon, z))
      .sort((a, b) => a[0] - b[0]);
    for (const [from, to] of intervals(subject, z)) {
      let covered = from;
      for (const [a, b] of coverage) {
        if (b < covered - 1e-8) {
          continue;
        }
        if (a > covered + 1e-8) {
          break;
        }
        covered = Math.max(covered, b);
      }
      if (covered < to - 1e-8) {
        return false;
      }
    }
  }
  return true;
}

/** Only the endpoint-to-mesh joins are added to Recast's path. Sweep the same square avatar. */
export function clearEndpointJoin(
  layout: NormalizedLayout,
  floorId: string,
  a: Point,
  b: Point,
): boolean {
  if (!isFloorPointClear(layout, floorId, a) || !isFloorPointClear(layout, floorId, b)) {
    return false;
  }
  const authored = layout.floors.find((floor) => floor.id === floorId)?.authoring;
  if (!authored) {
    return false;
  }
  const sweep = hull(
    [a, b].flatMap(([x, z]): Point[] => [
      [x - 0.4, z - 0.4],
      [x + 0.4, z - 0.4],
      [x + 0.4, z + 0.4],
      [x - 0.4, z + 0.4],
    ]),
  );
  if (!insideBoundary(sweep, authored.boundary)) {
    return false;
  }
  const positive = (authored.zones ?? [])
    .filter((zone) => zone.type === 'walkable')
    .map((zone) => zone.polygon);
  if (positive.length && !insideUnion(sweep, positive)) {
    return false;
  }
  const roomWalls = layout.rooms
    .filter((room) => room.floorId === floorId)
    .flatMap((room) =>
      wallSpans(room).map(({ a: start, b: end }) => {
        const height = wallHeightFor(room);
        return {
          position: [(start[0] + end[0]) / 2, height / 2, (start[1] + end[1]) / 2] as [
            number,
            number,
            number,
          ],
          halfExtents: [
            Math.hypot(end[0] - start[0], end[1] - start[1]) / 2,
            height / 2,
            0.075,
          ] as [number, number, number],
          yaw: -Math.atan2(end[1] - start[1], end[0] - start[0]),
        };
      }),
    );
  const walls = [...(authored.walls ?? []).flatMap(authoredWallBoxes), ...roomWalls]
    .filter(
      (box) =>
        box.position[1] - box.halfExtents[1] < 1.8 && box.position[1] + box.halfExtents[1] > 0.01,
    )
    .map(boxFootprint);
  const blocked = [
    ...authored.obstacles,
    ...(authored.zones ?? []).filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ...walls,
  ];
  return !blocked.some((polygon) => polygonsOverlap(sweep, polygon));
}
