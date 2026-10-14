import type { Floor, PolygonPoint } from './building-schema.ts';
type Coordinates = Floor['coordinateSystem'];
export function sourceToMetres(point: PolygonPoint, coordinates: Coordinates): PolygonPoint {
  if (coordinates?.units !== 'pixels') {
    return [...point];
  }
  const x = point[0] - coordinates.origin[0],
    y = point[1] - coordinates.origin[1];
  const [a, b, c, d] = coordinates.basis ?? [
    coordinates.metersPerPixel,
    0,
    0,
    coordinates.metersPerPixel,
  ];
  return [a * x + c * y, b * x + d * y];
}
export function metresToSource(point: PolygonPoint, coordinates: Coordinates): PolygonPoint {
  if (coordinates?.units !== 'pixels') {
    return [...point];
  }
  if (!coordinates.basis) {
    return [
      point[0] / coordinates.metersPerPixel + coordinates.origin[0],
      point[1] / coordinates.metersPerPixel + coordinates.origin[1],
    ];
  }
  const [a, b, c, d] = coordinates.basis ?? [
    coordinates.metersPerPixel,
    0,
    0,
    coordinates.metersPerPixel,
  ];
  const det = a * d - b * c;
  return [
    (d * point[0] - c * point[1]) / det + coordinates.origin[0],
    (-b * point[0] + a * point[1]) / det + coordinates.origin[1],
  ];
}
/** Three non-collinear image corners resolve scale, rotation, anisotropic stretch and affine skew. */
export function calibrateRectangle(
  corner: PolygonPoint,
  widthEnd: PolygonPoint,
  depthEnd: PolygonPoint,
  widthMetres: number,
  depthMetres: number,
): NonNullable<Coordinates> {
  const ux = widthEnd[0] - corner[0],
    uy = widthEnd[1] - corner[1],
    vx = depthEnd[0] - corner[0],
    vy = depthEnd[1] - corner[1];
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1 || widthMetres <= 0 || depthMetres <= 0) {
    throw new Error('Choose three distinct, non-collinear corners and positive dimensions.');
  }
  return {
    units: 'pixels',
    origin: corner,
    metersPerPixel: widthMetres / Math.hypot(ux, uy),
    basis: [
      (widthMetres * vy) / det,
      (-depthMetres * uy) / det,
      (-widthMetres * vx) / det,
      (depthMetres * ux) / det,
    ],
  };
}
