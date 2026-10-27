import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `planter` (spec §8).
 * Only the pot collides/blocks; overhanging leaves are visual-only.
 */

export function planterObstacleLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
}

/** Canopy radius stays inside the pot footprint (leaves emit no collision). */
export function planterCanopyRadius(object: PlanObject): number {
  return Math.min(0.6, object.dimensions[0] * 0.4);
}

export function planterDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'planter') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 0.5 || w > 2 || h < 0.8 || h > 2.5 || d < 0.5 || d > 1) {
    return 'Planters require width 0.5–2 m, height 0.8–2.5 m and depth 0.5–1 m.';
  }
  return null;
}
