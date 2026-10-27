import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/** Layer-split helpers for `water` (spec §8–§9). Basin heights are locked standards. */

export const WATER_BASIN_HEIGHT = 0.95;
export const WATER_ACCESSIBLE_HEIGHT = 0.76;

export function waterApproachNode(): Point2 {
  return [0, 0.6];
}

export function waterDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'water') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (Math.abs(object.scale[1] - 1) > 0.0001) {
    return 'Keep water station Scale Y at 1 to preserve both fixed basin heights.';
  }
  if (w < 0.5 || w > 0.9 || h < 1.1 || h > 1.4 || d < 0.5 || d > 0.8) {
    return 'Water stations require width/depth 0.5–0.9/0.5–0.8 m and height 1.1–1.4 m.';
  }
  return null;
}
