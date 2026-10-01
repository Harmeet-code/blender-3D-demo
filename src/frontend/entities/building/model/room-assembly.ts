import type { Room } from './building-schema.ts';
import {
  polygonEdges,
  polygonBounds,
  segmentDistance,
  signedArea,
} from '../../../shared/lib/geometry/polygon.ts';
export function roomEntrance(room: Room) {
  if (room.entrance) {
    return room.entrance;
  }
  const edge = polygonEdges(room.polygon).reduce((longest, current) =>
    Math.hypot(current[1][0] - current[0][0], current[1][1] - current[0][1]) >
    Math.hypot(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1])
      ? current
      : longest,
  );
  const dx = edge[1][0] - edge[0][0],
    dz = edge[1][1] - edge[0][1];
  const sign = signedArea(room.polygon) > 0 ? 1 : -1;
  return {
    position: [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2] as [number, number],
    yawRadians: Math.atan2(sign * dz, -sign * dx),
  };
}
export function assembleRoom(room: Room) {
  const bounds = polygonBounds(room.polygon);
  const entrance = roomEntrance(room);
  const center: [number, number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    0,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
  const rectangle =
    room.polygon.length === 4 &&
    room.polygon.every(
      ([x, z]) =>
        (Math.abs(x - bounds.minX) < 0.001 || Math.abs(x - bounds.maxX) < 0.001) &&
        (Math.abs(z - bounds.minZ) < 0.001 || Math.abs(z - bounds.maxZ) < 0.001),
    );
  const canonical =
    rectangle &&
    Math.abs(bounds.maxX - bounds.minX - 4) < 0.005 &&
    Math.abs(bounds.maxZ - bounds.minZ - 4) < 0.005 &&
    Math.hypot(
      entrance.position[0] - center[0] - 2 * Math.sin(entrance.yawRadians),
      entrance.position[1] - center[2] - 2 * Math.cos(entrance.yawRadians),
    ) < 0.005;
  const panels: Array<{ position: [number, number, number]; yawRadians: number; width: number }> =
    [];
  for (const [a, b] of polygonEdges(room.polygon)) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const entryOnEdge = segmentDistance(entrance.position, a, b) < 0.005;
    const entryDistance = Math.hypot(entrance.position[0] - a[0], entrance.position[1] - a[1]);
    const ranges = entryOnEdge
      ? [
          [0, Math.max(0, entryDistance - 0.6)],
          [Math.min(length, entryDistance + 0.6), length],
        ]
      : [[0, length]];
    for (const [start = 0, end = 0] of ranges) {
      for (let cursor = start; cursor < end - 0.005; cursor += 1) {
        const width = Math.min(1, end - cursor);
        panels.push({
          position: [
            a[0] + (dx / length) * (cursor + width / 2),
            0,
            a[1] + (dz / length) * (cursor + width / 2),
          ],
          yawRadians: -Math.atan2(dz, dx),
          width,
        });
      }
    }
  }
  return { bounds, entrance, center, canonical, panels };
}
