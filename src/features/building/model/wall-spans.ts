import type { Room } from './building-schema.ts';
import { boothPhysical } from './booth-physical.ts';
import { rawRoomEntrance } from './room-frame.ts';
import { spansAtEntrance } from './wall-spec.ts';
export interface WallSpan {
  a: readonly [number, number];
  b: readonly [number, number];
}
export const BOOTH_WALL_HEIGHT = 2.6;
export const HALL_WALL_HEIGHT = 3;
export const ENTRANCE_OPENING = 2;
export function wallHeightFor(room: Room) {
  return boothPhysical(room).height;
}
export function wallSpans(room: Room, openingWidth?: number): WallSpan[] {
  const spec = boothPhysical(room);
  return spansAtEntrance(
    room.polygon,
    room.type === 'booth' ? spec.entrance.position : rawRoomEntrance(room).position,
    openingWidth ?? spec.opening,
  );
}
