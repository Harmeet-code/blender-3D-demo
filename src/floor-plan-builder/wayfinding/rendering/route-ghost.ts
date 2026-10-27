import {
  pointInPolygon,
  polygonEdges,
  segmentDistance,
  segmentsIntersect,
} from '@/utils/geometry/polygon.ts';
import { footprint } from '../../model/geometry.ts';
import { isBooth, type PlanObject } from '../../model/types.ts';

/** Segment-to-footprint distance catches long sparse funnel legs passing under roofs. */
export function routeGhostIds(
  points: [number, number][],
  objects: PlanObject[],
  radius = 3,
): Set<string> {
  const ids = new Set<string>();
  if (!points.length) {
    return ids;
  }
  for (const object of objects) {
    if (
      !isBooth(object) &&
      !['barn-tent', 'food-kiosk', 'first-aid', 'washroom-men', 'washroom-women'].includes(
        object.recipe,
      )
    ) {
      continue;
    }
    const polygon = footprint(object),
      edges = polygonEdges(polygon);
    const near =
      points.some(
        (point) =>
          pointInPolygon(point, polygon) ||
          edges.some(([a, b]) => segmentDistance(point, a, b) <= radius),
      ) ||
      points.some((b, index) => {
        if (!index) {
          return false;
        }
        const a = points[index - 1]!;
        return edges.some(
          ([c, d]) =>
            segmentsIntersect(a, b, c, d) ||
            Math.min(segmentDistance(c, a, b), segmentDistance(d, a, b)) <= radius,
        );
      });
    if (near) {
      ids.add(object.id);
    }
  }
  return ids;
}
