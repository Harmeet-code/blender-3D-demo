import { err, ok, type Result } from 'neverthrow';
import type { BuildingLayout, Floor } from '@/features/building/model/building-schema.ts';
import { sourceToMetres, metresToSource } from './floor-coordinates.ts';
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
    return metresToSource(sourceToMetres(value, previous), next);
  };
  return ok({
    ...source,
    floors: source.floors.map((item) =>
      item.id === floorId
        ? {
            ...item,
            image: image ?? item.image,
            coordinateSystem: next,
            authoring: item.authoring
              ? {
                  ...item.authoring,
                  boundary: item.authoring.boundary.map(point),
                  obstacles: item.authoring.obstacles.map((area) => area.map(point)),
                  spawn: point(item.authoring.spawn),
                  walls: item.authoring.walls?.map((wall) => ({
                    ...wall,
                    start: point(wall.start),
                    end: point(wall.end),
                  })),
                  zones: item.authoring.zones?.map((zone) => ({
                    ...zone,
                    polygon: zone.polygon.map(point),
                  })),
                  pois: item.authoring.pois?.map((poi) => ({
                    ...poi,
                    position: point(poi.position),
                  })),
                  instances: item.authoring.instances.map((instance) => ({
                    ...instance,
                    position: point(instance.position),
                  })),
                }
              : undefined,
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
