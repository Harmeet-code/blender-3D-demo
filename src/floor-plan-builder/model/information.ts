import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `information` (spec §8).
 * Counter heights are locked standards (1.1 m standing, 0.76 m accessible);
 * only overall W/H/D and the floating-sign height are parameters.
 */

export const INFO_COUNTER_HEIGHT = 1.1;
export const INFO_ACCESSIBLE_HEIGHT = 0.76;

export function infoCustomerNode(object?: PlanObject): Point2 {
  return [0, Math.max(0.8, (object?.dimensions[2] ?? 1) / 2 + 0.3)];
}

export function infoStaffNode(object?: PlanObject): Point2 {
  return [0, -Math.max(0.7, (object?.dimensions[2] ?? 1) / 2 + 0.3)];
}

/** Counter-base obstacle, including the accessible section (conservative for walking). */
export function infoCounterLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  const total = w;
  const frontZ = d / 2;
  return [
    [-total / 2, frontZ - 0.6],
    [total / 2, frontZ - 0.6],
    [total / 2, frontZ],
    [-total / 2, frontZ],
  ];
}

export function infoObstaclesLocal(object: PlanObject): Point2[][] {
  const [w, , d] = object.dimensions;
  return [
    infoCounterLocal(object),
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, -d / 2 + 0.08],
      [-w / 2, -d / 2 + 0.08],
    ],
  ];
}

export function infoDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'information') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (Math.abs(object.scale[1] - 1) > 0.0001) {
    return 'Keep information desk Scale Y at 1 to preserve the fixed counter and knee-clearance heights.';
  }
  if (w < 1.6 || w > 3.2 || h < 2.0 || h > 3.2 || d < 0.8 || d > 1.5) {
    return 'Information desks require width 1.6–3.2 m, back-wall height 2.0–3.2 m and depth 0.8–1.5 m.';
  }
  if (object.infoSignHeight < h + 0.3) {
    return 'Floating sign must clear the back wall by at least 0.3 m.';
  }
  return null;
}
