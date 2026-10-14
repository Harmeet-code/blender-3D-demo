import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
export interface PortalPlacement {
  id: string;
  assetId: string;
  floorId: string;
  position: [number, number, number];
  yawRadians: number;
  scale?: [number, number, number];
}
export function portalPlacements(layout: NormalizedLayout) {
  const records: PortalPlacement[] = [],
    warnings: string[] = [];
  for (const portal of layout.portals) {
    if (portal.connects.some((id) => !portal.entries?.some((entry) => entry.floorId === id))) {
      warnings.push(`${portal.id}: add an entry position on each connected floor.`);
      continue;
    }
    if (portal.type === 'elevator') {
      for (const entry of portal.entries ?? []) {
        records.push({
          id: `${portal.id}:${entry.floorId}`,
          assetId: 'elevator-entrance',
          floorId: entry.floorId,
          position: [...entry.position.slice(0, 1), 0, entry.position[1]] as [
            number,
            number,
            number,
          ],
          yawRadians: entry.yawRadians,
        });
      }
      continue;
    }
    if (portal.connects.length !== 2) {
      warnings.push(`${portal.id}: the authored flight supports exactly two floors.`);
      continue;
    }
    const floors = layout.floors
      .filter((f) => portal.connects.includes(f.id))
      .sort((a, b) => a.heightOffset - b.heightOffset);
    const [lower, upper] = floors;
    if (!lower || !upper) {
      warnings.push(`${portal.id}: connected floors must exist.`);
      continue;
    }
    const rise = upper.heightOffset - lower.heightOffset;
    if (rise <= 0) {
      warnings.push(`${portal.id}: the authored flight requires a positive floor rise.`);
      continue;
    }
    const a = portal.entries?.find((entry) => entry.floorId === lower.id),
      b = portal.entries?.find((entry) => entry.floorId === upper.id);
    if (!a || !b) {
      continue;
    }
    const directionX = b.position[0] - a.position[0];
    const directionZ = b.position[1] - a.position[1];
    const run = Math.hypot(directionX, directionZ);
    if (run <= 0.005) {
      warnings.push(`${portal.id}: the authored flight requires distinct landing positions.`);
      continue;
    }
    records.push({
      id: portal.id,
      assetId: portal.type === 'stairs' ? 'stairs' : 'escalator-entrance',
      floorId: lower.id,
      position: [a.position[0], 0, a.position[1]],
      // Native sockets are at [0, 0, 0] and [0, 4, -7]. Entry yaw is an
      // arrival heading, so the landing centers determine the flight axis.
      yawRadians: Math.atan2(-directionX, -directionZ),
      scale: [1, rise / 4, run / 7],
    });
  }
  return { records, warnings };
}
