import type { Point2 } from '@/utils/geometry/polygon.ts';
import { polygonEdges, segmentDistance } from '@/utils/geometry/polygon.ts';

export function spansAtEntrance(polygon: Point2[], entrance: Point2, openingWidth: number) {
  const edges = polygonEdges(polygon);
  const spans: Array<{ a: Point2; b: Point2 }> = [];
  let nearest = -1,
    best = Infinity;
  edges.forEach(([a, b], index) => {
    const distance = segmentDistance(entrance, a, b);
    if (distance < best && distance < 0.005) {
      nearest = index;
      best = distance;
    }
  });
  edges.forEach(([a, b], index) => {
    if (index !== nearest) {
      spans.push({ a, b });
      return;
    }
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (!length) {
      return;
    }
    const along = Math.max(
      0,
      Math.min(length, ((entrance[0] - a[0]) * dx + (entrance[1] - a[1]) * dz) / length),
    );
    const start = Math.max(0, along - openingWidth / 2),
      end = Math.min(length, along + openingWidth / 2);
    if (start > 0.005) {
      spans.push({ a, b: [a[0] + (dx * start) / length, a[1] + (dz * start) / length] });
    }
    if (end < length - 0.005) {
      spans.push({ a: [a[0] + (dx * end) / length, a[1] + (dz * end) / length], b });
    }
  });
  return spans;
}
