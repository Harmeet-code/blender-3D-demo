import { ShapeUtils, Vector2 } from 'three';
import { pointInPolygon, polygonBounds } from '@/utils/geometry/polygon.ts';
import { objectObstaclePolygons, objectPoints } from '../../model/geometry.ts';
import { washRackApproachLocal, washRackWalkableLocal } from '../../model/wash-rack-spatial.ts';
import { parkingLayout } from '../../model/parking-lot.ts';
import { diningLayout } from '../../model/dining.ts';
import { showOfficeSpatialLayout } from '../../model/show-office.ts';
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

function signedArea(polygon: Point2[]): number {
  return (
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2
  );
}

/** Intersect convex polygons; authored concave walk zones are triangulated first. */
function intersectConvex(subject: Point2[], clipInput: Point2[]): Point2[] {
  const clip = signedArea(clipInput) < 0 ? [...clipInput].reverse() : clipInput;
  let output = subject;
  for (let edge = 0; edge < clip.length && output.length; edge++) {
    const a = clip[edge]!,
      b = clip[(edge + 1) % clip.length]!;
    const inside = (point: Point2) =>
      (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-7;
    const crossing = (from: Point2, to: Point2): Point2 => {
      const dx = to[0] - from[0],
        dz = to[1] - from[1];
      const ex = b[0] - a[0],
        ez = b[1] - a[1];
      const denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) < 1e-9) {
        return to;
      }
      const t = ((a[0] - from[0]) * ez - (a[1] - from[1]) * ex) / denominator;
      return [from[0] + t * dx, from[1] + t * dz];
    };
    const input = output;
    output = [];
    let previous = input[input.length - 1]!;
    for (const current of input) {
      const currentInside = inside(current),
        previousInside = inside(previous);
      if (currentInside) {
        if (!previousInside) {
          output.push(crossing(previous, current));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(crossing(previous, current));
      }
      previous = current;
    }
  }
  return output;
}

function parkingVehiclePolygon(
  object: PlanObject,
  bay: ReturnType<typeof parkingLayout>['bays'][number],
): Point2[] {
  const { vehicle } = bay;
  if (!vehicle) {
    return [];
  }
  const along = bay.yaw + Math.PI / 2;
  const ux = Math.cos(along),
    uz = Math.sin(along);
  const vx = -uz,
    vz = ux;
  const halfLength = vehicle.length / 2,
    halfWidth = vehicle.width / 2;
  const local: Point2[] = [
    [
      bay.center[0] - ux * halfLength - vx * halfWidth,
      bay.center[1] - uz * halfLength - vz * halfWidth,
    ],
    [
      bay.center[0] + ux * halfLength - vx * halfWidth,
      bay.center[1] + uz * halfLength - vz * halfWidth,
    ],
    [
      bay.center[0] + ux * halfLength + vx * halfWidth,
      bay.center[1] + uz * halfLength + vz * halfWidth,
    ],
    [
      bay.center[0] - ux * halfLength + vx * halfWidth,
      bay.center[1] - uz * halfLength + vz * halfWidth,
    ],
  ];
  return objectPoints(object, local);
}

export function buildFloorNavInput(
  floorId: string,
  boundary: Point2[],
  zones: WalkableZone[],
  objects: PlanObject[],
  diagnostics = true,
): FloorNavInput {
  const obstacles = objects.flatMap((object) =>
    object.recipe === 'show-office' ? [] : objectObstaclePolygons(object, objects),
  );
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
    if (zone.type !== 'restricted') {
      surfaces.push(outer);
    }
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
      if (object.recipe !== 'wash-rack' || !object.washRackVariant || !object.collidable) {
        continue;
      }
      surfaces.push(objectPoints(object, washRackWalkableLocal(object)));
      surfaces.push(objectPoints(object, washRackApproachLocal(object)));
    }
  }
  for (const object of objects) {
    if (object.recipe === 'show-office') {
      const layout = showOfficeSpatialLayout(object);
      const localize = (polygon: Point2[]) => polygon.map(([x, z]) => [x, z - object.dimensions[2] / 2] as Point2);
      // Cabin ramp and landing are real placement/navigation blockers beyond the shell.
      obstacles.push(objectPoints(object, localize(layout.footprints.shell)));
      obstacles.push(objectPoints(object, localize(layout.footprints.shell)));
      if (relevant.length) {
        const permitted = relevant.filter((zone) => zone.type !== 'restricted');
        for (const polygon of [layout.nav.publicQueue, layout.footprints.ramp, layout.footprints.landing].filter((p) => p.length >= 3)) {
          const world = objectPoints(object, localize(polygon));
          for (const zone of permitted) {
            for (const triangle of triangulate(zone.polygon as Point2[], zone.holes as Point2[][])) {
              const clipped = intersectConvex(world, triangle);
              if (clipped.length >= 3 && Math.abs(signedArea(clipped)) > 0.05) {
                surfaces.push(clipped);
                areas.push({ polygon: clipped, area: ZONE_AREA[zone.type].area, flags: ZONE_AREA[zone.type].flags });
              }
            }
          }
        }
      }
    }
    if (object.recipe === 'dining') {
      const layout = diningLayout(object);
      for (const table of layout.tables) {
        obstacles.push(objectPoints(object, table.footprint));
        for (const chair of table.chairs) {
          obstacles.push(objectPoints(object, chair.blockerFootprint));
        }
      }
      for (const prop of layout.props) {
        if (prop.collidable) {
          obstacles.push(objectPoints(object, prop.footprint));
        }
      }

      // Dining circulation can paint existing authored walkable zones, but cannot
      // manufacture walkable ground where the author has not drawn a zone.
      if (relevant.length) {
        const permitted = relevant.filter((zone) => zone.type !== 'restricted');
        const descriptors = layout.aisles.map((aisle) => ({
          polygon: aisle.polygon,
          area: ZONE_AREA.general,
        }));
        for (let left = 0; left < layout.tables.length; left++) {
          for (let right = left + 1; right < layout.tables.length; right++) {
            const a = layout.tables[left]!;
            const b = layout.tables[right]!;
            const dx = b.center[0] - a.center[0];
            const dz = b.center[1] - a.center[1];
            const distance = Math.hypot(dx, dz);
            if (distance < 3.3 || (Math.abs(dx) > 0.05 && Math.abs(dz) > 0.05)) {
              continue;
            }
            const blockedByNeighbor = layout.tables.some((candidate, index) => {
              if (index === left || index === right) {
                return false;
              }
              const offsetX = candidate.center[0] - a.center[0];
              const offsetZ = candidate.center[1] - a.center[1];
              const projection = (offsetX * dx + offsetZ * dz) / (distance * distance);
              const crossTrack = Math.abs(offsetX * dz - offsetZ * dx) / distance;
              return projection > 0 && projection < 1 && crossTrack < 0.1;
            });
            if (blockedByNeighbor) {
              continue;
            }
            const ux = dx / distance;
            const uz = dz / distance;
            const gapStart =
              0.5 * (Math.abs(ux) * (a.width + b.width) + Math.abs(uz) * (a.depth + b.depth));
            const gap = distance - gapStart;
            if (gap < 1.5) {
              continue;
            }
            const center: Point2 = [
              (a.center[0] + b.center[0]) / 2,
              (a.center[1] + b.center[1]) / 2,
            ];
            const halfLength = (distance - gapStart) / 2;
            const halfWidth = 0.75;
            const nx = -uz * halfWidth;
            const nz = ux * halfWidth;
            const sx = ux * halfLength;
            const sz = uz * halfLength;
            descriptors.push({
              polygon: [
                [center[0] - sx - nx, center[1] - sz - nz],
                [center[0] + sx - nx, center[1] + sz - nz],
                [center[0] + sx + nx, center[1] + sz + nz],
                [center[0] - sx + nx, center[1] - sz + nz],
              ],
              area: ZONE_AREA.general,
            });
          }
        }
        const diningTriangles = triangulate(object.polygon as Point2[], []);
        for (const descriptor of descriptors) {
          for (const zone of permitted) {
            for (const triangle of triangulate(
              zone.polygon as Point2[],
              zone.holes as Point2[][],
            )) {
              for (const diningTriangle of diningTriangles) {
                const inDining = intersectConvex(descriptor.polygon, diningTriangle);
                if (inDining.length < 3) {
                  continue;
                }
                const clipped = intersectConvex(objectPoints(object, inDining), triangle);
                if (clipped.length < 3 || Math.abs(signedArea(clipped)) < 0.05) {
                  continue;
                }
                surfaces.push(clipped);
                areas.push({
                  polygon: clipped,
                  area: ZONE_AREA[zone.type].area,
                  flags: ZONE_AREA[zone.type].flags,
                });
              }
            }
          }
        }
      }
      continue;
    }
    if (object.recipe !== 'parking-lot') {
      continue;
    }
    const layout = parkingLayout(object);
    for (const bay of layout.bays) {
      if (bay.vehicle) {
        obstacles.push(parkingVehiclePolygon(object, bay));
      }
    }
    for (const [x, z] of layout.poles) {
      obstacles.push(
        objectPoints(
          object,
          Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2;
            return [x + Math.cos(angle) * 0.14, z + Math.sin(angle) * 0.14] as Point2;
          }),
        ),
      );
    }
    for (const island of layout.islands) {
      obstacles.push(objectPoints(object, island));
    }

    // Low perimeter curbs are blockers, except across the generated vehicle gate.
    const perimeter =
      signedArea(object.polygon) < 0 ? [...object.polygon].reverse() : object.polygon;
    for (let edgeIndex = 0; edgeIndex < perimeter.length; edgeIndex++) {
      const a = perimeter[edgeIndex]!;
      const b = perimeter[(edgeIndex + 1) % perimeter.length]!;
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      if (length < 0.3) {
        continue;
      }
      const nx = (-dz / length) * (signedArea(perimeter) >= 0 ? 1 : -1);
      const nz = (dx / length) * (signedArea(perimeter) >= 0 ? 1 : -1);
      const gate = layout.gates.find((candidate) => candidate.edgeIndex === edgeIndex);
      const gateHalf = gate ? gate.width / 2 + 0.15 : 0;
      const spans: Array<[number, number]> = gate
        ? [
            [0, Math.max(0, 0.5 - gateHalf / length)],
            [Math.min(1, 0.5 + gateHalf / length), 1],
          ]
        : [[0, 1]];
      for (const [from, to] of spans) {
        if ((to - from) * length < 0.3) {
          continue;
        }
        const p0: Point2 = [a[0] + dx * from, a[1] + dz * from];
        const p1: Point2 = [a[0] + dx * to, a[1] + dz * to];
        obstacles.push(
          objectPoints(object, [
            p0,
            p1,
            [p1[0] + nx * 0.18, p1[1] + nz * 0.18],
            [p0[0] + nx * 0.18, p0[1] + nz * 0.18],
          ]),
        );
      }
    }
    // The rendered attendant booth and gate posts are small blockers. The vehicle
    // lane remains open; its pedestrian crossing is represented by the walkway.
    for (const gate of layout.gates) {
      const [p] = gate.vehicleCenterline;
      if (!p) {
        continue;
      }
      obstacles.push(
        objectPoints(object, [
          [p[0] - 4, p[1] + 1],
          [p[0] - 2, p[1] + 1],
          [p[0] - 2, p[1] + 3],
          [p[0] - 4, p[1] + 3],
        ]),
      );
      for (const offset of [-1.7, 1.7]) {
        const cx = p[0] + offset;
        obstacles.push(
          objectPoints(object, [
            [cx - 0.16, p[1] - 0.16],
            [cx + 0.16, p[1] - 0.16],
            [cx + 0.16, p[1] + 0.16],
            [cx - 0.16, p[1] + 0.16],
          ]),
        );
      }
    }

    // Parking aisles and pedestrian corridors become nav surfaces only where
    // authored walkable zones already permit travel. They never create a zone.
    if (relevant.length) {
      const permitted = relevant.filter((zone) => zone.type !== 'restricted');
      for (const descriptor of layout.navDescriptors) {
        for (const zone of permitted) {
          const zonePolygon = zone.polygon as Point2[];
          for (const triangle of triangulate(zonePolygon, zone.holes as Point2[][])) {
            const clipped = intersectConvex(objectPoints(object, descriptor.polygon), triangle);
            if (clipped.length < 3 || Math.abs(signedArea(clipped)) < 0.05) {
              continue;
            }
            surfaces.push(clipped);
            areas.push({
              polygon: clipped,
              area: ZONE_AREA[zone.type].area,
              flags: ZONE_AREA[zone.type].flags,
            });
          }
        }
      }
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
