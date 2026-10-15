import { metresToSource, sourceToMetres } from '@/features/building/model/floor-coordinates.ts';
import type { PlanFloor } from './types.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';

export function referencePoint(floor: PlanFloor, point: [number, number]): [number, number] {
  const [x, z] = sourceToMetres(point, floor.referenceCoordinates ?? { units: 'meters' });
  const [a, b, c, d, tx, tz] = floor.referenceTransform ?? [1, 0, 0, 1, 0, 0];
  return [a * x + c * z + tx, b * x + d * z + tz];
}
export function referenceYaw(floor: PlanFloor, yaw: number): number {
  const [a, b, c, d] = floor.referenceTransform ?? [1, 0, 0, 1];
  const x = Math.sin(yaw),
    z = Math.cos(yaw);
  return Math.atan2(a * x + c * z, b * x + d * z);
}

export function calibrationChange(
  floor: PlanFloor,
  coordinates: PlanFloor['source']['coordinateSystem'],
  naturalSize?: [number, number],
) {
  const bounds = polygonBounds(floor.boundary),
    size = floor.source.authoring?.imageSize ?? naturalSize;
  const reproject = (point: [number, number]) => {
    const source: [number, number] =
      floor.source.coordinateSystem?.units !== 'pixels' && size
        ? [
            ((point[0] - bounds.minX) / (bounds.maxX - bounds.minX)) * size[0],
            ((point[1] - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * size[1],
          ]
        : metresToSource(point, floor.source.coordinateSystem);
    return sourceToMetres(source, coordinates);
  };
  const [a, b, c, d, tx, tz] = floor.referenceTransform ?? [1, 0, 0, 1, 0, 0];
  const origin = reproject([tx, tz]),
    x = reproject([a + tx, b + tz]),
    z = reproject([c + tx, d + tz]);
  const transform: NonNullable<PlanFloor['referenceTransform']> = [
    x[0] - origin[0],
    x[1] - origin[1],
    z[0] - origin[0],
    z[1] - origin[1],
    ...origin,
  ];
  return { reproject, transform };
}
