import type { PolygonPoint } from './building-schema.ts';

/** International foot: exact, independent of image resolution or GLB scale. */
export const METRES_PER_FOOT = 0.3048;
export const BOOTH_DIMENSIONS_FEET = [
  [10, 10],
  [28, 10],
  [28, 36],
  [28, 54],
  [27, 50],
  [20, 20],
  [14, 38],
  [40, 45],
  [30, 30],
] as const;
export function boothRectangle(
  center: PolygonPoint,
  feet: readonly [number, number],
  yaw = 0,
  unitsPerMetre = 1,
): PolygonPoint[] {
  const width = feet[0] * METRES_PER_FOOT * unitsPerMetre;
  const depth = feet[1] * METRES_PER_FOOT * unitsPerMetre;
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ].map(([x = 0, z = 0]) => [
    center[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
    center[1] - x * Math.sin(yaw) + z * Math.cos(yaw),
  ]);
}
