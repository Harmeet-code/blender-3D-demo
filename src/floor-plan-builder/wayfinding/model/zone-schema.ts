import { z } from 'zod';
import {
  isSimplePolygon,
  signedArea,
  pointInPolygon,
  polygonEdges,
  segmentsIntersect,
} from '@/utils/geometry/polygon.ts';

const point2 = z.tuple([z.number().finite(), z.number().finite()]);
const ring = z.array(point2).min(3).max(256);

/** Advisory routing thresholds. They are not zone-authoring validity constraints. */
export const WAYFINDING_AGENT_RADIUS = 0.4;
export const WAYFINDING_MIN_CORRIDOR = WAYFINDING_AGENT_RADIUS * 2;
export const WAYFINDING_MIN_AREA = 1;

function ringArea(points: [number, number][]): number {
  return Math.abs(signedArea(points));
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-12) {
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
}

/** Narrowest gap between non-adjacent edges: an upper bound on corridor width. */
export function narrowestCorridor(polygon: [number, number][]): number {
  let nearest = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    for (let j = 0; j < n; j++) {
      if (j === i || (j + 1) % n === i || j === (i + 1) % n) {
        continue;
      }
      const c = polygon[j]!;
      const d = polygon[(j + 1) % n]!;
      nearest = Math.min(
        nearest,
        segmentDistance(a, c, d),
        segmentDistance(b, c, d),
        segmentDistance(c, a, b),
        segmentDistance(d, a, b),
      );
    }
  }
  return nearest;
}

export const walkableZoneSchema = z
  .object({
    id: z.string().min(1).max(256),
    floorId: z.string().min(1).max(256),
    name: z.string().trim().min(1).max(120),
    type: z.enum(['general', 'accessible-only', 'restricted', 'queue-area']),
    polygon: ring,
    holes: z.array(ring).max(16).default([]),
    revision: z.number().int().min(0).default(0),
  })
  .refine((zone) => isSimplePolygon(zone.polygon), {
    message: 'Zone boundary must be a simple polygon without crossings.',
  })
  .refine((zone) => ringArea(zone.polygon) > 0, {
    message: 'Zone must have positive area.',
  })
  .refine((zone) => zone.holes.every((hole) => isSimplePolygon(hole) && ringArea(hole) > 0), {
    message: 'Zone holes must be simple polygons without crossings.',
  })
  .refine(
    (zone) =>
      ringArea(zone.polygon) - zone.holes.reduce((sum, hole) => sum + ringArea(hole), 0) > 0,
    {
      message: 'Walkable area after subtracting holes must be positive.',
    },
  )
  .refine(
    (zone) =>
      zone.holes.every((hole, index) => {
        const crossings = (a: [number, number][], b: [number, number][]) =>
          polygonEdges(a).some(([x, y]) =>
            polygonEdges(b).some(([u, v]) => segmentsIntersect(x, y, u, v)),
          );
        return (
          hole.every((point) => pointInPolygon(point, zone.polygon)) &&
          !crossings(hole, zone.polygon) &&
          zone.holes
            .slice(0, index)
            .every(
              (other) =>
                !crossings(hole, other) &&
                !pointInPolygon(hole[0]!, other) &&
                !pointInPolygon(other[0]!, hole),
            )
        );
      }),
    {
      message:
        'Holes must be strictly inside the zone and must not touch, overlap or contain each other.',
    },
  );

export type WalkableZone = z.infer<typeof walkableZoneSchema>;

/** Advisory only: valid authored geometry need not support an agent-sized route. */
export function zoneNavigationWarnings(
  polygon: [number, number][],
  holes: [number, number][][] = [],
): string[] {
  const warnings: string[] = [];
  const area = ringArea(polygon) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);
  if (area < WAYFINDING_MIN_AREA) {
    warnings.push(`Small zone: less than ${WAYFINDING_MIN_AREA} square meters remain for navigation.`);
  }
  // This is advisory: the gap heuristic is not proof of connected capsule clearance.
  if (narrowestCorridor(polygon) < WAYFINDING_MIN_CORRIDOR) {
    warnings.push(
      `Narrow zone: some passages may not provide the ${WAYFINDING_MIN_CORRIDOR} m clearance required to route the avatar.`,
    );
  }
  return warnings;
}
