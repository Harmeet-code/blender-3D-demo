import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `food-kiosk` (spec §8–§9).
 * The cabin is a solid obstacle; the queue zone in front must stay clear.
 */

export function kioskQueueLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  const depth = object.kioskQueueDepth;
  return [
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [w / 2, d / 2 + depth],
    [-w / 2, d / 2 + depth],
  ];
}

export function kioskQueueEntryLocal(object: PlanObject): Point2 {
  // Waiting node inside the queue zone (spec: 0.5 m shy of its far edge).
  return [0, object.dimensions[2] / 2 + object.kioskQueueDepth - 0.5];
}

export function kioskStaffHatchLocal(object: PlanObject): Point2 {
  return [-object.dimensions[0] / 2 + 0.2, -object.dimensions[2] / 2];
}

export function kioskDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'food-kiosk') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 2.4 || w > 5 || h < 2.2 || h > 3.5 || d < 1.8 || d > 3) {
    return 'Food kiosks require width 2.4–5 m, height 2.2–3.5 m and depth 1.8–3 m.';
  }
  return null;
}
