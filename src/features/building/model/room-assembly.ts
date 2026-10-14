import type { Room } from '@/features/building/model/building-schema.ts';
import { polygonEdges, polygonBounds, segmentDistance } from '@/utils/geometry/polygon.ts';
import { boothPhysical } from './booth-physical.ts';
import { rawRoomEntrance } from './room-frame.ts';
export function roomEntrance(room: Room) {
  return room.type === 'booth' ? boothPhysical(room).entrance : rawRoomEntrance(room);
}
export function assembleRoom(room: Room) {
  const bounds = polygonBounds(room.polygon);
  const entrance = roomEntrance(room);
  const spec = boothPhysical(room);
  const center: [number, number, number] = [spec.interior[0], 0, spec.interior[1]];
  const canonical = spec.provider === 'catalog';
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
