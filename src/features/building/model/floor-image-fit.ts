import { polygonBounds } from '@/utils/geometry/polygon.ts';

export interface FloorImageFit {
  center: [number, number];
  width: number;
  depth: number;
}

/** Centered `contain` fit in the floor boundary bounds, independent of calibration coordinates. */
export function fitFloorImage(
  boundary: [number, number][],
  imageSize: [number, number],
): FloorImageFit | null {
  if (boundary.length < 3 || !imageSize.every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const bounds = polygonBounds(boundary);
  const floorWidth = bounds.maxX - bounds.minX;
  const floorDepth = bounds.maxZ - bounds.minZ;
  if (!(floorWidth > 0) || !(floorDepth > 0)) {
    return null;
  }
  const scale = Math.min(floorWidth / imageSize[0], floorDepth / imageSize[1]);
  return {
    center: [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
    width: imageSize[0] * scale,
    depth: imageSize[1] * scale,
  };
}
