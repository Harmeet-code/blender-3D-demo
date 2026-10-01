import { err, ok, type Result } from 'neverthrow';
import {
  buildingLayoutSchema,
  type BuildingLayout,
  type Floor,
  type PolygonPoint,
} from './building-schema.ts';

export interface LayoutError {
  code: 'INVALID_LAYOUT' | 'ALREADY_NORMALIZED';
  message: string;
}
export type NormalizedLayout = BuildingLayout & { readonly coordinateUnits: 'meters' };

function convertPoint(point: PolygonPoint, floor: Floor): PolygonPoint {
  const calibration = floor.coordinateSystem;
  return calibration?.units === 'pixels'
    ? [
        (point[0] - calibration.origin[0]) * calibration.metersPerPixel,
        (point[1] - calibration.origin[1]) * calibration.metersPerPixel,
      ]
    : [...point];
}

export function normalizeLayout(input: unknown): Result<NormalizedLayout, LayoutError> {
  if (typeof input === 'object' && input !== null && 'coordinateUnits' in input) {
    return err({
      code: 'ALREADY_NORMALIZED',
      message: 'Layout has already been converted to meters',
    });
  }
  const parsed = buildingLayoutSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'INVALID_LAYOUT',
      message: parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    });
  }
  const layout = parsed.data;
  const floors = new Map(layout.floors.map((f) => [f.id, f]));
  const rooms = layout.rooms.map((room) => {
    const floor = floors.get(room.floorId);
    if (!floor) {
      return room;
    } // Referential integrity was checked by the shared schema.
    return {
      ...room,
      polygon: room.polygon.map((point) => convertPoint(point, floor)),
      entrance: room.entrance
        ? { ...room.entrance, position: convertPoint(room.entrance.position, floor) }
        : undefined,
    };
  });
  const portals = layout.portals.map((portal) => ({
    ...portal,
    entries: portal.entries?.map((entry) => {
      const floor = floors.get(entry.floorId);
      return floor ? { ...entry, position: convertPoint(entry.position, floor) } : entry;
    }),
  }));
  return ok({
    ...layout,
    coordinateUnits: 'meters',
    rooms,
    portals,
    floors: layout.floors.map((floor) => ({
      ...floor,
      coordinateSystem: { units: 'meters' as const },
      logisticsAnchors: floor.logisticsAnchors?.map((anchor) => ({
        ...anchor,
        position: convertPoint(anchor.position, floor),
      })),
    })),
  });
}
