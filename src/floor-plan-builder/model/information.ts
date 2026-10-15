import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `information` (spec §8).
 * Counter heights are locked standards (1.1 m standing, 0.76 m accessible);
 * only overall W/H/D and the floating-sign height are parameters.
 */

export const INFO_COUNTER_HEIGHT = 1.1;
export const INFO_ACCESSIBLE_HEIGHT = 0.76;

export function infoCustomerNode(): Point2 {
  return [0, 0.8];
}

export function infoStaffNode(): Point2 {
  return [0, -0.7];
}

/** Counter-base obstacle: the back panel itself does not block movement. */
export function infoCounterLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  const standingW = Math.min(1.2, w * 0.6);
  const accessW = Math.min(0.8, Math.max(0.4, w - standingW));
  const total = standingW + accessW;
  const frontZ = d / 2;
  return [
    [-total / 2, frontZ - 0.6],
    [total / 2, frontZ - 0.6],
    [total / 2, frontZ],
    [-total / 2, frontZ],
  ];
}

export function infoDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'information') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 1.6 || w > 3.2 || h < 2.0 || h > 3.2 || d < 0.8 || d > 1.5) {
    return 'Information desks require width 1.6–3.2 m, back-wall height 2.0–3.2 m and depth 0.8–1.5 m.';
  }
  if (object.infoSignHeight < h + 0.3) {
    return 'Floating sign must clear the back wall by at least 0.3 m.';
  }
  return null;
}
