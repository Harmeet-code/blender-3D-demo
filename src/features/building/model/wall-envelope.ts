import { pointInPolygon, polygonEdges, signedArea, type Point2 } from '@/utils/geometry/polygon.ts';
import type { PhysicalBox } from './booth-physical.ts';

/** Inward wall bands, trimmed at convex tips; openings keep their exact authored endpoints. */
export function wallEnvelope(
  polygon: readonly Point2[],
  a: Point2,
  b: Point2,
  height: number,
  requestedThickness: number,
): PhysicalBox | null {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz);
  if (length < 1e-6) {
    return null;
  }
  const sign = signedArea(polygon) > 0 ? 1 : -1;
  const ux = dx / length,
    uz = dz / length,
    nx = -sign * uz,
    nz = sign * ux;
  const corner = (point: Point2) => {
    const index = polygon.findIndex((p) => Math.hypot(p[0] - point[0], p[1] - point[1]) < 1e-7);
    if (index < 0) {
      return 0;
    } // An entrance cut is not a perimeter corner.
    const prev = polygon[(index + polygon.length - 1) % polygon.length]!,
      next = polygon[(index + 1) % polygon.length]!;
    const ix = point[0] - prev[0],
      iz = point[1] - prev[1],
      ox = next[0] - point[0],
      oz = next[1] - point[1];
    const cross = sign * (ix * oz - iz * ox);
    if (cross <= 1e-10) {
      return 0.5;
    }
    return Math.max(0.5, -(ix * ox + iz * oz) / cross);
  };
  const startFactor = corner(a),
    endFactor = corner(b);
  const make = (thickness: number) => {
    const start = startFactor * thickness,
      end = length - endFactor * thickness;
    const points: Point2[] = [
      [start, 0],
      [end, 0],
      [end, thickness],
      [start, thickness],
    ].map(([along = 0, inward = 0]) => [
      a[0] + ux * along + nx * inward,
      a[1] + uz * along + nz * inward,
    ]);
    const center: Point2 = [
      a[0] + (ux * (start + end)) / 2 + (nx * thickness) / 2,
      a[1] + (uz * (start + end)) / 2 + (nz * thickness) / 2,
    ];
    return { points, center, width: end - start, thickness };
  };
  const cross = (p: Point2, q: Point2, r: Point2) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const edges = polygonEdges(polygon);
  const contained = (band: ReturnType<typeof make>) => {
    if (![band.center, ...band.points].every((p) => pointInPolygon(p, polygon))) {
      return false;
    }
    // Corners alone cannot detect a nonadjacent concave boundary cutting through a band.
    return polygonEdges(band.points).every(([p, q]) =>
      edges.every(([r, s]) => {
        const c1 = cross(p, q, r),
          c2 = cross(p, q, s),
          c3 = cross(r, s, p),
          c4 = cross(r, s, q);
        return !(c1 * c2 < -1e-16 && c3 * c4 < -1e-16);
      }),
    );
  };
  let thickness = Math.min(requestedThickness, length / (startFactor + endFactor + 1));
  let band = make(thickness);
  if (!contained(band)) {
    let low = 0,
      high = thickness;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (contained(make(mid))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    thickness = low;
    band = make(thickness);
  }
  if (thickness < 1e-6 || band.width < 1e-6) {
    return null;
  }
  return {
    position: [band.center[0], height / 2, band.center[1]],
    halfExtents: [band.width / 2, height / 2, thickness / 2],
    yaw: -Math.atan2(dz, dx),
  };
}
