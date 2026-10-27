import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `bench` (spec §8).
 * The bench is a blocked obstacle (footprint + 0.1 m margin); the seat top
 * carries 3 sitting nodes consumed by avatar sitting tasks.
 */

export const BENCH_SEAT_HEIGHT = 0.45;
export const BENCH_MARGIN = 0.1;

export function benchObstacleLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  const m = BENCH_MARGIN;
  return [
    [-w / 2 - m, -d / 2 - m],
    [w / 2 + m, -d / 2 - m],
    [w / 2 + m, d / 2 + m],
    [-w / 2 - m, d / 2 + m],
  ];
}

/** Sitting nodes on the seat top, facing +Z (yaw 0). Clamped inside the slats. */
export function benchSeatsLocal(object: PlanObject): { at: Point2; yaw: number }[] {
  const [w] = object.dimensions;
  const half = Math.max(0, w / 2 - 0.3);
  return [
    { at: [-Math.min(0.6, half), 0], yaw: 0 },
    { at: [0, 0], yaw: 0 },
    { at: [Math.min(0.6, half), 0], yaw: 0 },
  ];
}

export function benchDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'bench') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  const lockedH = object.benchVariant === 'backed' ? 0.85 : 0.45;
  if (w < 1.2 || w > 3 || d < 0.5 || d > 0.75) {
    return 'Benches require width 1.2–3 m and depth 0.5–0.75 m.';
  }
  if (Math.abs(h - lockedH) > 1e-6) {
    return `Height is locked to the ergonomic standard (${lockedH.toFixed(2)} m for ${object.benchVariant}).`;
  }
  return null;
}
