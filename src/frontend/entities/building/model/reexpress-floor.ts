import { err, ok, type Result } from 'neverthrow';
import type { BuildingLayout, Floor } from './building-schema.ts';
/** Re-express source coordinates when units change, preserving their meter positions. */
export function reexpressFloor(
  source: BuildingLayout,
  floorId: string,
  next: Floor['coordinateSystem'],
  image?: string,
): Result<BuildingLayout, { code: 'UNKNOWN_FLOOR'; message: string }> {
  const floor = source.floors.find((item) => item.id === floorId);
  if (!floor) {
    return err({ code: 'UNKNOWN_FLOOR', message: `Unknown floor ${floorId}` });
  }
  const previous = floor.coordinateSystem;
  const point = (value: [number, number]): [number, number] => {
    const meters = value.map((n, i) =>
      previous?.units === 'pixels' ? (n - (previous.origin[i] ?? 0)) * previous.metersPerPixel : n,
    );
    return meters.map((n, i) =>
      next?.units === 'pixels' ? n / next.metersPerPixel + (next.origin[i] ?? 0) : n,
    ) as [number, number];
  };
  return ok({
    ...source,
    floors: source.floors.map((item) =>
      item.id === floorId
        ? {
            ...item,
            image: image ?? item.image,
            coordinateSystem: next,
            logisticsAnchors: item.logisticsAnchors?.map((anchor) => ({
              ...anchor,
              position: point(anchor.position),
            })),
          }
        : item,
    ),
    rooms: source.rooms.map((room) =>
      room.floorId === floorId
        ? {
            ...room,
            polygon: room.polygon.map(point),
            entrance: room.entrance
              ? { ...room.entrance, position: point(room.entrance.position) }
              : undefined,
          }
        : room,
    ),
    portals: source.portals.map((portal) => ({
      ...portal,
      entries: portal.entries?.map((entry) =>
        entry.floorId === floorId ? { ...entry, position: point(entry.position) } : entry,
      ),
    })),
  });
}
