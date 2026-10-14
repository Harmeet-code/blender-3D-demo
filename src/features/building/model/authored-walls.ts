import type { AuthoredWall } from './building-schema.ts';
import type { PhysicalBox } from './booth-physical.ts';

const cache = new WeakMap<AuthoredWall, PhysicalBox[]>();

/** Meter endpoints only. Exact solid pieces shared by drawing, collisions, and Recast. */
export function authoredWallBoxes(wall: AuthoredWall): PhysicalBox[] {
  const previous = cache.get(wall);
  if (previous) {
    return previous;
  }
  const dx = wall.end[0] - wall.start[0],
    dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const boxes: PhysicalBox[] = [];
  if (length < 1e-6) {
    return boxes;
  }
  const add = (from: number, to: number, bottom: number, top: number) => {
    if (to - from < 1e-6 || top - bottom < 1e-6) {
      return;
    }
    const t = (from + to) / (2 * length);
    boxes.push({
      position: [wall.start[0] + dx * t, (bottom + top) / 2, wall.start[1] + dz * t],
      halfExtents: [(to - from) / 2, (top - bottom) / 2, wall.thickness / 2],
      yaw: -Math.atan2(dz, dx),
    });
  };
  let cursor = 0;
  for (const opening of [...(wall.openings ?? [])].sort((a, b) => a.offset - b.offset)) {
    const from = opening.offset - opening.width / 2;
    const to = opening.offset + opening.width / 2;
    add(cursor, from, 0, wall.height);
    add(from, to, 0, opening.sill ?? 0);
    add(from, to, (opening.sill ?? 0) + opening.height, wall.height);
    cursor = to;
  }
  add(cursor, length, 0, wall.height);
  cache.set(wall, boxes);
  return boxes;
}
