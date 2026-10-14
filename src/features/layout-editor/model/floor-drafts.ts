import type { Floor } from '@/features/building/model/building-schema.ts';

/** A blank metric canvas has no inherited raster, geometry, or asset references. */
export function blankFloor(id: string, name: string, heightOffset: number): Floor {
  return {
    id,
    name,
    heightOffset,
    image: '',
    coordinateSystem: { units: 'meters' },
    calibrationStatus: 'confirmed',
    authoring: {
      boundary: [
        [-20, -15],
        [20, -15],
        [20, 15],
        [-20, 15],
      ],
      obstacles: [],
      spawn: [0, 0],
      instances: [],
      underlayOpacity: 0,
      walls: [],
      zones: [],
      pois: [],
    },
  };
}
