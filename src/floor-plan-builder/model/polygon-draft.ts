import { insideBoundary } from './geometry.ts';
import { polygonSchema } from './types.ts';

export type PolygonDraftResult =
  | { ok: true; polygon: [number, number][] }
  | { ok: false; message: string };

/**
 * Shared completion path for first-vertex closure, double-click and Enter. The input remains a
 * transient draft; callers append the returned polygon to the document only after `ok` is true.
 */
export function finishPolygonDraft(
  vertices: readonly [number, number][],
  boundary: [number, number][],
): PolygonDraftResult {
  const polygon = vertices.map(([x, z]): [number, number] => [x, z]);
  if (polygon.length > 1 && samePoint(polygon[0]!, polygon.at(-1)!)) {
    polygon.pop();
  }
  if (polygon.length < 3) {
    return { ok: false, message: 'Add at least three vertices to create a booth.' };
  }
  const parsed = polygonSchema.safeParse(polygon);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Use a valid polygon.' };
  }
  if (!insideBoundary(polygon, boundary)) {
    return { ok: false, message: 'Keep the whole booth inside the floor boundary.' };
  }
  return { ok: true, polygon };
}

function samePoint(a: [number, number], b: [number, number]): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8;
}
