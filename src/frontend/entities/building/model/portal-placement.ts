import type { NormalizedLayout } from './normalize-layout.ts';
export interface PortalPlacement {
  id: string;
  assetId: string;
  floorId: string;
  position: [number, number, number];
  yawRadians: number;
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
      continue;
    }
    if (Math.abs(upper.heightOffset - lower.heightOffset - 4) > 0.005) {
      warnings.push(
        `${portal.id}: requires a 4 m rise; current rise is ${upper.heightOffset - lower.heightOffset} m.`,
      );
      continue;
    }
    const a = portal.entries?.find((entry) => entry.floorId === lower.id),
      b = portal.entries?.find((entry) => entry.floorId === upper.id);
    if (!a || !b) {
      continue;
    }
    const expected = [
      a.position[0] - 7 * Math.sin(a.yawRadians),
      a.position[1] - 7 * Math.cos(a.yawRadians),
    ];
    if (
      Math.hypot((expected[0] ?? 0) - b.position[0], (expected[1] ?? 0) - b.position[1]) > 0.005 ||
      Math.abs(
        Math.atan2(Math.sin(a.yawRadians - b.yawRadians), Math.cos(a.yawRadians - b.yawRadians)),
      ) > 0.005
    ) {
      warnings.push(
        `${portal.id}: entry anchors must match the 7 m landing-center separation and orientation.`,
      );
      continue;
    }
    records.push({
      id: portal.id,
      assetId: portal.type === 'stairs' ? 'stairs' : 'escalator-entrance',
      floorId: lower.id,
      position: [a.position[0], 0, a.position[1]],
      yawRadians: a.yawRadians,
    });
  }
  return { records, warnings };
}
