import { ShapeUtils, Vector2 } from 'three';
import type { FloorAuthoring, PolygonPoint } from './building-schema.ts';
import { pointInPolygon } from '@/utils/geometry/polygon.ts';

const zoneCache = new WeakMap<FloorAuthoring, PolygonPoint[][]>();
const surfaceCache = new WeakMap<FloorAuthoring, PolygonPoint[][]>();
function walkableZones(authoring: FloorAuthoring) {
  let zones = zoneCache.get(authoring);
  if (!zones) {
    zones = (authoring.zones ?? [])
      .filter((zone) => zone.type === 'walkable')
      .map((zone) => zone.polygon);
    zoneCache.set(authoring, zones);
  }
  return zones;
}
/** Manual movement and teleport must obey the same positive region contract as Recast. */
export function authoredPointWalkable(authoring: FloorAuthoring, point: PolygonPoint): boolean {
  if (!pointInPolygon(point, authoring.boundary)) {
    return false;
  }
  const zones = walkableZones(authoring);
  return !zones.length || zones.some((zone) => pointInPolygon(point, zone));
}

function triangles(polygon: PolygonPoint[]): PolygonPoint[][] {
  const points = polygon.map(([x, z]) => new Vector2(x, z));
  return ShapeUtils.triangulateShape(points, []).map(
    (face) => face.map((index) => polygon[index]!) as PolygonPoint[],
  );
}
const side = (a: PolygonPoint, b: PolygonPoint, p: PolygonPoint) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
/** Convex clipping stays exact for concave authoring shapes after triangulation. */
function intersectTriangle(subject: PolygonPoint[], clip: PolygonPoint[]): PolygonPoint[] {
  const winding = side(clip[0]!, clip[1]!, clip[2]!) >= 0 ? 1 : -1;
  let polygon = subject;
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = clip[edge]!,
      b = clip[(edge + 1) % 3]!;
    const output: PolygonPoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i]!,
        end = polygon[(i + 1) % polygon.length]!;
      const ds = winding * side(a, b, start),
        de = winding * side(a, b, end),
        startInside = ds >= -1e-9,
        endInside = de >= -1e-9;
      if (startInside) {
        output.push(start);
      }
      if (startInside !== endInside) {
        const t = ds / (ds - de);
        output.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
      }
    }
    polygon = output.filter(
      (point, i) =>
        !i || Math.hypot(point[0] - output[i - 1]![0], point[1] - output[i - 1]![1]) > 1e-8,
    );
    if (
      polygon.length > 1 &&
      Math.hypot(polygon[0]![0] - polygon.at(-1)![0], polygon[0]![1] - polygon.at(-1)![1]) < 1e-8
    ) {
      polygon.pop();
    }
  }
  const area = Math.abs(
    polygon.reduce((sum, p, i) => {
      const next = polygon[(i + 1) % polygon.length]!;
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0),
  );
  return polygon.length >= 3 && area > 1e-10 ? polygon : [];
}

/** Union of positive zones, clipped to the floor. Overlap is safe: Recast unions raster spans. */
export function authoredWalkableSurfaces(authoring: FloorAuthoring): PolygonPoint[][] {
  const previous = surfaceCache.get(authoring);
  if (previous) {
    return previous;
  }
  const zones = walkableZones(authoring);
  if (!zones.length) {
    return [authoring.boundary];
  }
  const boundary = triangles(authoring.boundary),
    surfaces: PolygonPoint[][] = [];
  for (const zone of zones) {
    for (const triangle of triangles(zone)) {
      for (const floorTriangle of boundary) {
        const intersection = intersectTriangle(triangle, floorTriangle);
        if (intersection.length) {
          surfaces.push(intersection);
        }
      }
    }
  }
  surfaceCache.set(authoring, surfaces);
  return surfaces;
}
