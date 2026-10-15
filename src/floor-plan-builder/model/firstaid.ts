import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/** Layer-split helpers for `first-aid` (spec §8–§9). */

export function firstAidEntryLocal(object: PlanObject): Point2 {
  return [0, object.dimensions[2] / 2 + 0.2];
}

export function firstAidDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'first-aid') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 1.8 || w > 3 || h < 2.0 || h > 3.2 || d < 1.8 || d > 3) {
    return 'First aid stations require width/depth 1.8–3 m and height 2.0–3.2 m.';
  }
  return null;
}
