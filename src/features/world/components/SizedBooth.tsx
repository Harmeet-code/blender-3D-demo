import type { Room } from '@/features/building/model/building-schema.ts';
import { boothPhysical } from '@/features/building/model/booth-physical.ts';
import { DetailedBooths } from './DetailedBooths.tsx';
import { RoomWalls } from './RoomWalls.tsx';
/** Compatibility entry point; the shared provider remains the sole physical authority. */
export function SizedBooth({ room }: { room: Room }) {
  return boothPhysical(room).provider === 'premium' ? (
    <DetailedBooths rooms={[room]} floorId={room.floorId} />
  ) : (
    <RoomWalls rooms={[room]} />
  );
}
