import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `exit` (spec §8–§9).
 * The door leaf blocks (closed) or admits (open) passage; the frame jambs
 * always block. Navigation consumes these instead of the visual mesh bbox.
 */

export interface ExitLayersInput {
  width: number;
  depth: number;
  open: boolean;
}

export function exitOpening(width: number) {
  const clear = Math.min(width - 0.15, 2.2);
  return { clear, jamb: (width - clear) / 2 };
}

export function exitCollisionLocal({ width, depth, open }: ExitLayersInput): Point2[][] {
  const hw = width / 2;
  const { jamb, clear } = exitOpening(width);
  const polygons: Point2[][] = [
    [
      [-hw, -depth / 2],
      [-hw + jamb, -depth / 2],
      [-hw + jamb, depth / 2],
      [-hw, depth / 2],
    ],
    [
      [hw - jamb, -depth / 2],
      [hw, -depth / 2],
      [hw, depth / 2],
      [hw - jamb, depth / 2],
    ],
  ];
  if (!open) {
    const clearHalf = Math.max(0, width / 2 - jamb);
    polygons.push([
      [-clearHalf, -depth / 2],
      [clearHalf, -depth / 2],
      [clearHalf, depth / 2],
      [-clearHalf, depth / 2],
    ]);
  } else {
    // The open leaf still exists outside the threshold: +Y rotation sends +X to −Z.
    const hinge = -clear / 2;
    polygons.push([
      [hinge - 0.03, -clear],
      [hinge + 0.03, -clear],
      [hinge + 0.03, 0],
      [hinge - 0.03, 0],
    ]);
  }
  return polygons;
}

export function exitCollisionFor(object: PlanObject): Point2[][] {
  return exitCollisionLocal({
    width: object.dimensions[0],
    depth: object.dimensions[2],
    open: object.exitOpen,
  });
}

/** Evacuation sink target in front of the threshold, facing −Z (outward). */
export function exitSinkLocal(): Point2 {
  return [0, 0.5];
}

/**
 * Approach clear zone: 1.5 m × 2.0 m unimpeded floor directly in front of
 * the doorway (hall side). Enforced in placement; no evacuation-goal pathing
 * consumer exists yet. The sink is available as a regular studio direction
 * destination (with avatar clearance); it has no special priority or capacity rating.
 */
export function exitClearLocal(object: PlanObject): Point2[] {
  const [, , d] = object.dimensions;
  const half = 0.75;
  return [
    [-half, d / 2],
    [half, d / 2],
    [half, d / 2 + 2.0],
    [-half, d / 2 + 2.0],
  ];
}

export function exitDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'exit') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 1.2 || w > 2.4 || h < 2.2 || h > 3.0 || d < 0.2 || d > 0.6) {
    return 'Emergency exits require width 1.2–2.4 m, height 2.2–3.0 m and depth 0.2–0.6 m.';
  }
  return null;
}
