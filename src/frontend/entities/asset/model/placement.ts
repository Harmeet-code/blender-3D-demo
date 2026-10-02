import { err, ok, type Result } from 'neverthrow';
import type { AssetMetadata } from './asset-schema.ts';
import { ADD_ON_VISUALS } from './add-on-visuals.ts';
import type { Room, Floor } from '../../building/model/building-schema.ts';
import { roomEntrance } from '../../building/model/room-assembly.ts';
import {
  boundaryDistance,
  pointInPolygon,
  polygonBounds,
  polygonContains,
  polygonsOverlap,
  transformFootprint,
  type Point2,
} from '../../../shared/lib/geometry/polygon.ts';
export interface PlacementRecord {
  id: string;
  roomId: string;
  addOnId: string;
  assetId: string;
  version: number;
  position: [number, number, number];
  yawRadians: number;
}
export interface PlacementError {
  code: 'NO_FIT' | 'UNKNOWN_ASSET' | 'MISSING_ANCHOR';
  message: string;
}
export interface PlacementPlan {
  origin: [number, number, number];
  records: PlacementRecord[];
  warnings: PlacementError[];
}
const STEP = 0.25;
/** An anchor is author intent; its complete footprint must still clear booths and circulation. */
export function placeLogistics(
  floor: Floor,
  rooms: readonly Room[],
  selectedAssets: readonly string[],
  catalog: readonly AssetMetadata[],
): Result<
  { anchors: NonNullable<Floor['logisticsAnchors']>; warnings: PlacementError[] },
  PlacementError
> {
  const anchors: NonNullable<Floor['logisticsAnchors']> = [],
    warnings: PlacementError[] = [],
    occupied: Array<Array<[number, number]>> = [];
  const serviceAreas = rooms.filter((room) => room.type === 'service');
  for (const anchor of floor.logisticsAnchors ?? []) {
    if (!selectedAssets.includes(anchor.assetId)) {
      continue;
    }
    const metadata = catalog.find((asset) => asset.id === anchor.assetId && asset.version === 1);
    if (!metadata) {
      warnings.push({
        code: 'UNKNOWN_ASSET',
        message: `${anchor.id}: ${anchor.assetId} is unavailable; service remains selected.`,
      });
      continue;
    }
    const footprint = transformFootprint(metadata.footprint, anchor.position, anchor.yawRadians);
    const conflict = rooms.find(
      (room) => room.type !== 'service' && polygonsOverlap(room.polygon, footprint),
    );
    if (
      conflict ||
      occupied.some((previous) => polygonsOverlap(previous, footprint)) ||
      (serviceAreas.length &&
        !serviceAreas.some((area) => polygonContains(area.polygon, footprint, 0.05)))
    ) {
      warnings.push({
        code: 'NO_FIT',
        message: `${anchor.id}: ${anchor.assetId} preview overlaps ${conflict?.id ?? 'another preview or the service boundary'}; service remains selected.`,
      });
      continue;
    }
    anchors.push(anchor);
    occupied.push(footprint);
  }
  return ok({ anchors, warnings });
}
function envelope(center: Point2, radius = 0.5): Array<[number, number]> {
  return [
    [center[0] - radius, center[1] - radius],
    [center[0] + radius, center[1] - radius],
    [center[0] + radius, center[1] + radius],
    [center[0] - radius, center[1] + radius],
  ];
}
/** Conservative square envelopes check cells AND connecting segments. */
export function hasClearanceRoute(
  room: Room,
  obstacles: readonly (readonly Point2[])[],
  targets: readonly Point2[],
): boolean {
  const bounds = polygonBounds(room.polygon),
    entrance = roomEntrance(room);
  const width = Math.floor((bounds.maxX - bounds.minX) / STEP) + 1;
  const height = Math.floor((bounds.maxZ - bounds.minZ) / STEP) + 1;
  if (width * height > 40000) {
    return false;
  }
  const point = (x: number, z: number): Point2 => [bounds.minX + x * STEP, bounds.minZ + z * STEP];
  const free = (shape: readonly Point2[]) =>
    polygonContains(room.polygon, shape, 0.001) &&
    !obstacles.some((obstacle) => polygonsOverlap(shape, obstacle));
  const cells = new Set<string>();
  const inward: Point2 = [
    entrance.position[0] - Math.sin(entrance.yawRadians) * 0.75,
    entrance.position[1] - Math.cos(entrance.yawRadians) * 0.75,
  ];
  const sx = Math.round((inward[0] - bounds.minX) / STEP),
    sz = Math.round((inward[1] - bounds.minZ) / STEP);
  if (
    !free(envelope(point(sx, sz))) ||
    obstacles.some(
      (obstacle) =>
        pointInPolygon(entrance.position, obstacle) ||
        boundaryDistance(entrance.position, obstacle) < 0.5,
    )
  ) {
    return false;
  }
  const queue: Array<[number, number]> = [[sx, sz]];
  cells.add(`${sx},${sz}`);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    if (!cell) {
      continue;
    }
    for (const [dx = 0, dz = 0] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cell[0] + dx,
        nz = cell[1] + dz,
        key = `${nx},${nz}`;
      if (nx < 0 || nz < 0 || nx >= width || nz >= height || cells.has(key)) {
        continue;
      }
      const from = point(...cell),
        to = point(nx, nz);
      const swept: Array<[number, number]> = [
        [Math.min(from[0], to[0]) - 0.5, Math.min(from[1], to[1]) - 0.5],
        [Math.max(from[0], to[0]) + 0.5, Math.min(from[1], to[1]) - 0.5],
        [Math.max(from[0], to[0]) + 0.5, Math.max(from[1], to[1]) + 0.5],
        [Math.min(from[0], to[0]) - 0.5, Math.max(from[1], to[1]) + 0.5],
      ];
      if (free(swept)) {
        cells.add(key);
        queue.push([nx, nz]);
      }
    }
  }
  return targets.every((target) => {
    const x = Math.round((target[0] - bounds.minX) / STEP),
      z = Math.round((target[1] - bounds.minZ) / STEP);
    return cells.has(`${x},${z}`) && free(envelope(target, 0.63));
  });
}
export function placeAddOns(
  room: Room,
  selected: readonly string[],
  catalog: readonly AssetMetadata[],
): Result<PlacementPlan, PlacementError> {
  const bounds = polygonBounds(room.polygon),
    entrance = roomEntrance(room);
  if ((bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ) > 2500) {
    return err({ code: 'NO_FIT', message: 'Room exceeds bounded preview placement grid' });
  }
  const origin: [number, number, number] = [bounds.minX, 0, bounds.minZ];
  const records: PlacementRecord[] = [],
    warnings: PlacementError[] = [];
  const blocking: Array<Array<[number, number]>> = [],
    interactions: Point2[] = [];
  const candidates: Array<[number, number]> = [];
  for (let z = bounds.minZ + STEP; z < bounds.maxZ; z += STEP) {
    for (let x = bounds.minX + STEP; x < bounds.maxX; x += STEP) {
      candidates.push([x, z]);
    }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(b[0] - entrance.position[0], b[1] - entrance.position[1]) -
        Math.hypot(a[0] - entrance.position[0], a[1] - entrance.position[1]) ||
      a[1] - b[1] ||
      a[0] - b[0],
  );
  for (const addOnId of Object.keys(ADD_ON_VISUALS).filter((id) => selected.includes(id))) {
    const visual = ADD_ON_VISUALS[addOnId];
    if (!visual || visual.kind === 'nonvisual' || visual.kind === 'logistics') {
      continue;
    }
    const asset = catalog.find((entry) => entry.id === visual.assetId && entry.version === 1);
    if (!asset) {
      warnings.push({
        code: 'UNKNOWN_ASSET',
        message: `${visual.assetId} has not been released yet`,
      });
      continue;
    }
    let accepted = false;
    const yaw = (Math.round(entrance.yawRadians / (Math.PI / 2)) * Math.PI) / 2;
    for (const position of candidates) {
      const footprint = transformFootprint(asset.footprint, position, yaw);
      if (
        !polygonContains(room.polygon, footprint, 0.05) ||
        blocking.some((other) => polygonsOverlap(footprint, other))
      ) {
        continue;
      }
      const reach = asset.bounds.max[2] + 0.75;
      const interaction: Point2 = [
        position[0] + Math.sin(yaw) * reach,
        position[1] + Math.cos(yaw) * reach,
      ];
      if (!hasClearanceRoute(room, [...blocking, footprint], [...interactions, interaction])) {
        continue;
      }
      records.push({
        id: `${room.id}:${addOnId}`,
        roomId: room.id,
        addOnId,
        assetId: asset.id,
        version: asset.version,
        position: [position[0] - bounds.minX, 0, position[1] - bounds.minZ],
        yawRadians: yaw,
      });
      blocking.push(footprint);
      interactions.push(interaction);
      accepted = true;
      break;
    }
    if (!accepted) {
      warnings.push({
        code: 'NO_FIT',
        message: `${asset.label} cannot fit while preserving a 1 m entrance route. It remains selected.`,
      });
    }
  }
  return ok({ origin, records, warnings });
}
