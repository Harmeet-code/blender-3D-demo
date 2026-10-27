import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `bin` (spec §8).
 * Compartment count derives from width (one 0.6 m stream each, up to 3):
 * narrow units render a single stream, wide units a multi-stream array.
 */

export function binCompartments(object: PlanObject): number {
  return Math.min(3, Math.max(1, Math.round(object.dimensions[0] / 0.6)));
}

export function binStreamColor(object: Pick<PlanObject, 'binStream'>): string {
  return object.binStream === 'recycling'
    ? '#06B6D4'
    : object.binStream === 'organics'
      ? '#10B981'
      : '#1E2022';
}

export function binDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'bin') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 0.5 || w > 2 || h < 0.8 || h > 1.1 || d < 0.5 || d > 0.7) {
    return 'Bins require width 0.5–2 m, height 0.8–1.1 m and depth 0.5–0.7 m.';
  }
  return null;
}
