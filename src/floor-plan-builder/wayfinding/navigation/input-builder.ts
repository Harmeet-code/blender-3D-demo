import { ShapeUtils, Vector2 } from 'three';
import { pointInPolygon, polygonBounds } from '@/utils/geometry/polygon.ts';
import { objectObstaclePolygons, objectPoints } from '../../model/geometry.ts';
import { washRackApproachLocal, washRackWalkableLocal } from '../../model/wash-rack-spatial.ts';
import type { PlanObject } from '../../model/types.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { NavAreaPaint } from '../model/route-schema.ts';

export type Point2 = [number, number];

export const ZONE_AREA: Record<WalkableZone['type'], { area: number; flags: number }> = {
  general: { area: 1, flags: 0x01 },
  'accessible-only': { area: 2, flags: 0x02 },
  restricted: { area: 3, flags: 0x04 },
  'queue-area': { area: 4, flags: 0x08 },
};
const ZONE_PRIORITY: Record<WalkableZone['type'], number> = {
  general: 0,
  'accessible-only': 1,
  'queue-area': 2,
  restricted: 3,
};

function triangulate(outer: Point2[], holes: Point2[][]): Point2[][] {
  const contour = outer.map(([x, z]) => new Vector2(x, z));
  const holePaths = holes.map((hole) => hole.map(([x, z]) => new Vector2(x, z)));
  const vertices = [...outer, ...holes.flat()];
  return ShapeUtils.triangulateShape(contour, holePaths).map((face) =>
    face.map((index) => vertices[index]!),
  );
}

export interface FloorNavInput {
  floorId: string;
  /** Walkable surfaces (zone innards, holes already subtracted as obstacles). */
  surfaces: Point2[][];
  /** Blocking polygons from item NAV descriptors + zone holes. */
  obstacles: Point2[][];
  /** Convex area paint pieces for the worker (zone type → area/flags). */
  areas: NavAreaPaint[];
  /** Representative point per disconnected island beyond the largest one. */
  islands: Point2[];
}

function insideAny(point: Point2, polygons: Point2[][]): boolean {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

/** Coarse sampled connected-components over walkable-minus-obstacles. */
function findIslands(surfaces: Point2[][], obstacles: Point2[][]): Point2[] {
  if (!surfaces.length) {
    return [];
  }
  const bounds = polygonBounds(surfaces.flat());
  // Bound each axis too: a very long, thin floor must not allocate millions of cells.
  const step = Math.max(0.5, (bounds.maxX - bounds.minX) / 256, (bounds.maxZ - bounds.minZ) / 256);
  const cols = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / step));
  const rows = Math.max(1, Math.floor((bounds.maxZ - bounds.minZ) / step));
  const open: boolean[][] = [];
  for (let iz = 0; iz <= rows; iz++) {
    open.push([]);
    for (let ix = 0; ix <= cols; ix++) {
      const point: Point2 = [bounds.minX + ix * step, bounds.minZ + iz * step];
      open[iz]!.push(insideAny(point, surfaces) && !insideAny(point, obstacles));
    }
  }
  const seen: boolean[][] = open.map((row) => row.map(() => false));
  const components: Point2[][] = [];
  for (let iz = 0; iz <= rows; iz++) {
    for (let ix = 0; ix <= cols; ix++) {
      if (!open[iz]![ix]! || seen[iz]![ix]!) {
        continue;
      }
      const component: Point2[] = [];
      const queue: [number, number][] = [[ix, iz]];
      seen[iz]![ix] = true;
      while (queue.length) {
        const [cx, cz] = queue.pop()!;
        component.push([bounds.minX + cx * step, bounds.minZ + cz * step]);
        for (const [nx, nz] of [
          [cx + 1, cz],
          [cx - 1, cz],
          [cx, cz + 1],
          [cx, cz - 1],
        ] as [number, number][]) {
          if (nx >= 0 && nz >= 0 && nx <= cols && nz <= rows && open[nz]![nx]! && !seen[nz]![nx]!) {
            seen[nz]![nx] = true;
            queue.push([nx, nz]);
          }
        }
      }
      components.push(component);
    }
  }
  components.sort((a, b) => b.length - a.length);
  return components.slice(1).map((component) => component[0]!);
}

export function buildFloorNavInput(
  floorId: string,
  boundary: Point2[],
  zones: WalkableZone[],
  objects: PlanObject[],
  diagnostics = true,
): FloorNavInput {
  const obstacles = objects.flatMap((object) => objectObstaclePolygons(object, objects));
  const surfaces: Point2[][] = [];
  const areas: NavAreaPaint[] = [];
  // Restriction wins even where a queue overlaps it, regardless of authoring order.
  const relevant = zones
    .filter((zone) => zone.floorId === floorId)
    .sort((a, b) => ZONE_PRIORITY[a.type] - ZONE_PRIORITY[b.type]);
  if (!relevant.length) {
    surfaces.push(boundary);
  }
  for (const zone of relevant) {
    const outer = zone.polygon as Point2[];
    // Restricted overlays can affect filtering but must never create walkable ground.
    if (zone.type !== 'restricted') surfaces.push(outer);
    for (const hole of zone.holes) {
      obstacles.push(hole as Point2[]);
    }
    const { area, flags } = ZONE_AREA[zone.type];
    for (const triangle of triangulate(outer, zone.holes as Point2[][])) {
      areas.push({ polygon: triangle, area, flags });
    }
  }
  if (relevant.some((zone) => zone.type !== 'restricted')) {
    for (const object of objects) {
      if (object.recipe !== 'wash-rack' || !object.washRackVariant || !object.collidable) continue;
      surfaces.push(objectPoints(object, washRackWalkableLocal(object)));
      surfaces.push(objectPoints(object, washRackApproachLocal(object)));
    }
  }
  return {
    floorId,
    surfaces,
    obstacles,
    areas,
    islands: diagnostics ? findIslands(surfaces, obstacles) : [],
  };
}
