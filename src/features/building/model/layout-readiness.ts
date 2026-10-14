import type { BuildingLayout } from './building-schema.ts';
import { normalizeLayout } from './normalize-layout.ts';
import { authoredWallBoxes } from './authored-walls.ts';
import { boothPhysical, boxFootprint } from './booth-physical.ts';
import { authoredInstancePhysical } from './authored-instance-physical.ts';
import { authoredPointWalkable } from './walkable-surfaces.ts';
import { isFloorPointClear } from './floor-point-clear.ts';
import { portalPlacements } from './portal-placement.ts';
import { pointInPolygon, boundaryDistance } from '@/utils/geometry/polygon.ts';

/** Drafts may be incomplete; publishing has an explicit physical/readiness gate. */
export function publishReadiness(source: BuildingLayout): string[] {
  const issues: string[] = [];
  for (const floor of source.floors) {
    if (floor.calibrationStatus === 'required') {
      issues.push(
        `${floor.name}: calibrate or explicitly confirm the image scale before publishing.`,
      );
    }
  }
  // Legacy layouts keep their historical connector fallback. Newly authored v2
  // documents require entries; they cannot silently route via a guessed origin.
  const canonicalFeatures = source.floors.some((floor) =>
    [floor.authoring?.walls, floor.authoring?.zones, floor.authoring?.pois].some(
      (items) => items?.length,
    ),
  );
  if (source.schemaVersion !== 2 && !canonicalFeatures) {
    return issues;
  }
  const normalized = normalizeLayout(source);
  if (normalized.isErr()) {
    return [...issues, normalized.error.message];
  }
  const layout = normalized.value;
  issues.push(...portalPlacements(layout).warnings);
  for (const portal of layout.portals) {
    const entries = new Set(portal.entries?.map((entry) => entry.floorId));
    for (const floorId of portal.connects) {
      if (!entries.has(floorId)) {
        issues.push(`${portal.id}: place an entry on ${floorId}.`);
      }
    }
  }
  for (const floor of layout.floors) {
    const authored = floor.authoring;
    if (!authored) {
      continue;
    }
    const areas = [
      ...authored.obstacles,
      ...(authored.zones ?? [])
        .filter((zone) => zone.type === 'blocked')
        .map((zone) => zone.polygon),
      ...(authored.walls ?? [])
        .flatMap(authoredWallBoxes)
        .filter(
          (box) =>
            box.position[1] - box.halfExtents[1] < 1.8 &&
            box.position[1] + box.halfExtents[1] > 0.01,
        )
        .map(boxFootprint),
      ...layout.rooms
        .filter((room) => room.floorId === floor.id && room.type === 'booth')
        .flatMap((room) => boothPhysical(room).boxes.map(boxFootprint)),
      ...authored.instances
        .filter((item) => item.collidable)
        .flatMap((item) => authoredInstancePhysical(item).boxes)
        .filter((box) => box.minY < 1.8 && box.maxY > 0.01)
        .map((box) => box.footprint),
    ];
    const targets: Array<{ label: string; point: [number, number] }> = [
      { label: 'Avatar start', point: authored.spawn },
      ...(authored.pois ?? []).map((poi) => ({ label: poi.label, point: poi.position })),
      ...layout.portals.flatMap((portal) =>
        (portal.entries ?? [])
          .filter((entry) => entry.floorId === floor.id)
          .map((entry) => ({ label: `${portal.id} entry`, point: entry.position })),
      ),
    ];
    for (const { label, point } of targets) {
      if (
        !authoredPointWalkable(authored, point) ||
        boundaryDistance(point, authored.boundary) < 0.4
      ) {
        issues.push(`${floor.name}: ${label} needs clearance inside the floor boundary.`);
      } else if (
        areas.some((area) => pointInPolygon(point, area) || boundaryDistance(point, area) < 0.4)
      ) {
        issues.push(`${floor.name}: move ${label} clear of walls, blocked areas and furniture.`);
      } else if (!isFloorPointClear(layout, floor.id, point)) {
        issues.push(
          `${floor.name}: ${label} needs clearance for the whole avatar inside the walkable area.`,
        );
      }
    }
  }
  return issues;
}
