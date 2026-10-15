import { pointInPolygon, polygonBounds } from '@/utils/geometry/polygon.ts';
import { metresToSource } from '@/features/building/model/floor-coordinates.ts';
import { footprint } from './geometry.ts';
import type { PlanFloor, PlanObject } from './types.ts';

export interface SurfacePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  originalSize?: [number, number];
}
export function sampleSurfaceColor(
  object: PlanObject,
  floor: PlanFloor,
  pixels: SurfacePixels | null,
): string {
  if (object.colorMode === 'explicit' || !pixels) {
    return object.color;
  }
  const shape = footprint(object),
    bounds = polygonBounds(shape),
    floorBounds = polygonBounds(floor.boundary);
  const originalSize = floor.source.authoring?.imageSize ??
    pixels.originalSize ?? [pixels.width, pixels.height];
  const channels: number[][] = [[], [], []];
  for (let iz = 0; iz < 5; iz++) {
    for (let ix = 0; ix < 5; ix++) {
      const point: [number, number] = [
        bounds.minX + ((ix + 0.5) / 5) * (bounds.maxX - bounds.minX),
        bounds.minZ + ((iz + 0.5) / 5) * (bounds.maxZ - bounds.minZ),
      ];
      if (!pointInPolygon(point, shape)) {
        continue;
      }
      const source =
        floor.source.coordinateSystem?.units === 'pixels'
          ? metresToSource(point, floor.source.coordinateSystem)
          : [
              ((point[0] - floorBounds.minX) / (floorBounds.maxX - floorBounds.minX)) *
                originalSize[0]!,
              ((point[1] - floorBounds.minZ) / (floorBounds.maxZ - floorBounds.minZ)) *
                originalSize[1]!,
            ];
      const x = Math.floor((source[0]! / originalSize[0]!) * pixels.width),
        y = Math.floor((source[1]! / originalSize[1]!) * pixels.height);
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) {
        continue;
      }
      const offset = (y * pixels.width + x) * 4;
      if (pixels.data[offset + 3]! < 180) {
        continue;
      }
      // Median samples suppress small text/line marks without sampling the entire floor.
      for (let channel = 0; channel < 3; channel++) {
        channels[channel]!.push(pixels.data[offset + channel]!);
      }
    }
  }
  if (!channels[0]!.length) {
    return object.color;
  }
  return `#${channels
    .map((channel) => {
      channel.sort((a, b) => a - b);
      return channel[Math.floor(channel.length / 2)]!.toString(16).padStart(2, '0');
    })
    .join('')}`;
}
