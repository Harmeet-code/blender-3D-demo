import type { TilePyramid } from './floor-tiles.ts';
import type { BuildingLayout, Floor } from './building-schema.ts';
import { reexpressFloor } from './reexpress-floor.ts';

/** Replacing/resizing the raster preserves world positions and physical model sizes. */
export function replaceFloorImage(
  source: BuildingLayout,
  floorId: string,
  image: { url: string; originalUrl: string; width: number; height: number; tiles?: TilePyramid },
) {
  const floor = source.floors.find((item) => item.id === floorId);
  const old = floor?.coordinateSystem;
  const oldSize = floor?.authoring?.imageSize;
  let next: Floor['coordinateSystem'] = {
    units: 'pixels',
    metersPerPixel: 0.05,
    origin: [image.width / 2, image.height / 2],
  };
  if (old?.units === 'pixels' && oldSize) {
    const sx = oldSize[0] / image.width;
    const sy = oldSize[1] / image.height;
    const [a, b, c, d] = old.basis ?? [old.metersPerPixel, 0, 0, old.metersPerPixel];
    next = {
      units: 'pixels',
      metersPerPixel: old.metersPerPixel * sx,
      origin: [old.origin[0] / sx, old.origin[1] / sy],
      basis: [a * sx, b * sx, c * sy, d * sy],
    };
  }
  const converted = reexpressFloor(source, floorId, next, image.url);
  return converted.map((layout) => ({
    ...layout,
    floors: layout.floors.map((item) =>
      item.id !== floorId
        ? item
        : {
            ...item,
            calibrationStatus: 'required' as const,
            authoring: {
              obstacles: [],
              instances: [],
              spawn: [image.width / 2, image.height / 2] as [number, number],
              ...item.authoring,
              underlayOpacity: item.authoring?.underlayOpacity || 0.85,
              // A new image defines a new canvas. The old Blender shell cannot follow a changed outline.
              boundary: [
                [0, 0],
                [image.width, 0],
                [image.width, image.height],
                [0, image.height],
              ] as Array<[number, number]>,
              shellUrl: undefined,
              imageSize: [image.width, image.height] as [number, number],
              originalImage: image.originalUrl,
              tiles: image.tiles,
            },
          },
    ),
  }));
}
