import type { NormalizedLayout } from './normalize-layout.ts';
import type { Point2 } from '@/utils/geometry/polygon.ts';
import { pointInPolygon } from '@/utils/geometry/polygon.ts';
import { authoredWallBoxes } from './authored-walls.ts';
import { authoredInstancePhysical } from './authored-instance-physical.ts';
import { boothPhysical, boxFootprint, type PhysicalBox } from './booth-physical.ts';
import { wallHeightFor, wallSpans } from './wall-spans.ts';
import {
  boundsOverlap,
  prepareArea,
  squareInsideUnion,
  squareOverlapsArea,
  type PreparedArea,
  type SquareBounds,
} from './polygon-square.ts';

interface FloorClearance {
  boundary: PreparedArea;
  positive: PreparedArea[];
  blocked: PreparedArea[];
  cells: Map<string, PreparedArea[]>;
}
const cache = new WeakMap<NormalizedLayout, Map<string, FloorClearance | null>>();
const CELL_SIZE = 16;
function floorClearance(layout: NormalizedLayout, floorId: string): FloorClearance | null {
  let floors = cache.get(layout);
  if (!floors) {
    cache.set(layout, (floors = new Map()));
  }
  if (floors.has(floorId)) {
    return floors.get(floorId)!;
  }
  const floor = layout.floors.find((item) => item.id === floorId),
    authored = floor?.authoring;
  if (!authored) {
    floors.set(floorId, null);
    return null;
  }
  const boxes = (authored.walls ?? []).flatMap(authoredWallBoxes);
  for (const room of layout.rooms) {
    if (room.floorId !== floorId) {
      continue;
    }
    if (room.type === 'booth') {
      boxes.push(...boothPhysical(room).boxes);
    } else {
      const height = wallHeightFor(room);
      for (const { a, b } of wallSpans(room)) {
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        boxes.push({
          position: [(a[0] + b[0]) / 2, height / 2, (a[1] + b[1]) / 2],
          halfExtents: [Math.hypot(dx, dz) / 2, height / 2, 0.075],
          yaw: -Math.atan2(dz, dx),
        });
      }
    }
  }
  const intersectsBody = (box: PhysicalBox) =>
    box.position[1] - box.halfExtents[1] < 1.8 && box.position[1] + box.halfExtents[1] > 0.01;
  const blocked = [
    ...authored.obstacles,
    ...(authored.zones ?? []).filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ...boxes.filter(intersectsBody).map(boxFootprint),
    ...authored.instances
      .filter((item) => item.collidable)
      .flatMap((item) => authoredInstancePhysical(item).boxes)
      .filter((box) => box.minY < 1.8 && box.maxY > 0.01)
      .map((box) => box.footprint),
  ].map(prepareArea);
  const result: FloorClearance = {
    boundary: prepareArea(authored.boundary),
    positive: (authored.zones ?? [])
      .filter((zone) => zone.type === 'walkable')
      .map((zone) => prepareArea(zone.polygon)),
    blocked: [],
    cells: new Map(),
  };
  // Bound per-frame work by nearby furniture, rather than every booth on a large map.
  // Very large obstacles remain a bounded global list instead of exploding grid memory.
  for (const area of blocked) {
    const minX = Math.floor(area.bounds.minX / CELL_SIZE),
      maxX = Math.floor(area.bounds.maxX / CELL_SIZE),
      minZ = Math.floor(area.bounds.minZ / CELL_SIZE),
      maxZ = Math.floor(area.bounds.maxZ / CELL_SIZE);
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > 256) {
      result.blocked.push(area);
      continue;
    }
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`,
          entries = result.cells.get(key);
        if (entries) {
          entries.push(area);
        } else {
          result.cells.set(key, [area]);
        }
      }
    }
  }
  floors.set(floorId, result);
  return result;
}

/** Meter-space only. The avatar collider is an axis-aligned square, not a radius.
 * Cached preparation belongs to immutable normalized layouts; source pixel layouts must normalize first.
 * Un-authored legacy floors retain their historical placement behavior. */
export function isFloorPointClear(
  layout: NormalizedLayout,
  floorId: string,
  point: Point2,
  clearance = 0.4,
): boolean {
  if (
    !Number.isFinite(clearance) ||
    clearance < 0 ||
    !point.every(Number.isFinite) ||
    !layout.floors.some((floor) => floor.id === floorId)
  ) {
    return false;
  }
  const physical = floorClearance(layout, floorId);
  if (!physical) {
    return true;
  }
  const square: SquareBounds = {
    minX: point[0] - clearance,
    maxX: point[0] + clearance,
    minZ: point[1] - clearance,
    maxZ: point[1] + clearance,
  };
  if (!clearance) {
    if (
      !pointInPolygon(point, physical.boundary.polygon) ||
      (physical.positive.length &&
        !physical.positive.some((area) => pointInPolygon(point, area.polygon)))
    ) {
      return false;
    }
  } else if (
    !squareInsideUnion(square, [physical.boundary]) ||
    (physical.positive.length && !squareInsideUnion(square, physical.positive))
  ) {
    return false;
  }
  const candidates = new Set(physical.blocked);
  const minX = Math.floor(square.minX / CELL_SIZE),
    maxX = Math.floor(square.maxX / CELL_SIZE),
    minZ = Math.floor(square.minZ / CELL_SIZE),
    maxZ = Math.floor(square.maxZ / CELL_SIZE);
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (const area of physical.cells.get(`${x},${z}`) ?? []) {
        candidates.add(area);
      }
    }
  }
  for (const area of candidates) {
    if (boundsOverlap(square, area.bounds) && squareOverlapsArea(square, area)) {
      return false;
    }
  }
  return true;
}
