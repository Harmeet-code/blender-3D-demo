import { calibrateRectangle } from '@/features/building/model/floor-coordinates.ts';
import { polygonBounds, transformFootprint } from '@/utils/geometry/polygon.ts';
import { calibrationChange } from './coordinates.ts';
import { baseFootprint, objectPoints, toLocal } from './geometry.ts';
import { isBooth, type PlanFloor } from './types.ts';

export function prepareFloorEdit(
  pending: PlanFloor,
  applied: PlanFloor,
  naturalSize?: [number, number],
): PlanFloor {
  const { calibrationText, ...floor } = pending;
  if (calibrationText === undefined) {
    return floor;
  }
  const input: unknown = JSON.parse(calibrationText);
  if (
    !Array.isArray(input) ||
    input.length !== 3 ||
    !input.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((n) => typeof n === 'number' && Number.isFinite(n)),
    )
  ) {
    throw new Error('Calibration requires three finite source-pixel corner pairs.');
  }
  if (!applied.source.image) {
    throw new Error('Upload a floor image before calibrating its pixels.');
  }
  const bounds = polygonBounds(floor.boundary);
  const [a, b, c] = input as [[number, number], [number, number], [number, number]];
  const coordinates = calibrateRectangle(
    a,
    b,
    c,
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
  );
  const imageSize = applied.source.authoring?.imageSize ?? naturalSize;
  if (applied.source.coordinateSystem?.units !== 'pixels' && !imageSize) {
    throw new Error(
      'Wait for the original image dimensions to load before calibrating this legacy image.',
    );
  }
  const { reproject, transform } = calibrationChange(applied, coordinates, imageSize);
  return {
    ...floor,
    referenceTransform: transform,
    source: {
      ...floor.source,
      coordinateSystem: coordinates,
      calibrationStatus: 'confirmed',
      authoring: imageSize
        ? {
            boundary: floor.boundary,
            spawn: floor.spawn,
            obstacles: [],
            instances: [],
            underlayOpacity: 0.85,
            ...floor.source.authoring,
            imageSize,
          }
        : floor.source.authoring,
    },
    boundary: applied.boundary.map(reproject),
    spawn: reproject(applied.spawn),
    zones: applied.zones.map((zone) => ({ ...zone, polygon: zone.polygon.map(reproject) })),
    objects: applied.objects.map((object) => {
      const position = reproject(object.position);
      const ahead = reproject([
        object.position[0] + Math.sin(object.yawRadians),
        object.position[1] + Math.cos(object.yawRadians),
      ]);
      const yawRadians = Math.atan2(ahead[0] - position[0], ahead[1] - position[1]);
      if (!isBooth(object)) {
        const axes = toLocal(
          objectPoints(object, [
            [1, 0],
            [0, 1],
          ]).map(reproject),
          position,
          yawRadians,
        );
        const xAxis = axes[0]!,
          zAxis = axes[1]!;
        const sx = Math.hypot(...xAxis),
          sz = Math.hypot(...zAxis);
        return {
          ...object,
          position,
          yawRadians,
          planarMatrix: [xAxis[0] / sx, xAxis[1] / sx, zAxis[0] / sz, zAxis[1] / sz] as [
            number,
            number,
            number,
            number,
          ],
          polygon: object.polygon.map(([x, z]): [number, number] => [x * sx, z * sz]),
          polePositions: object.polePositions.map(([x, z]): [number, number] => [x * sx, z * sz]),
          dimensions: [
            object.dimensions[0] * sx,
            object.dimensions[1],
            object.dimensions[2] * sz,
          ] as [number, number, number],
          scale: [1, object.scale[1], 1] as [number, number, number],
          managed: true,
        };
      }
      const polygon = toLocal(baseFootprint(object).map(reproject), position, yawRadians);
      const localBounds = polygonBounds(polygon);
      return {
        ...object,
        planarMatrix: undefined,
        position,
        yawRadians,
        polygon,
        polePositions: toLocal(
          transformFootprint(
            object.polePositions.map(([x, z]) => [x * object.scale[0], z * object.scale[2]]),
            object.position,
            object.yawRadians,
          ).map(reproject),
          position,
          yawRadians,
        ),
        scale: [1, 1, 1] as [number, number, number],
        dimensions: [
          localBounds.maxX - localBounds.minX,
          object.dimensions[1] * object.scale[1],
          localBounds.maxZ - localBounds.minZ,
        ] as [number, number, number],
        managed: true,
      };
    }),
  };
}
