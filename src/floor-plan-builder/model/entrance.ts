import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

export type EntranceGate = 'arch-sliding-doors' | 'turnstile-lanes' | 'open-arch';

/**
 * Layer-split helpers for `entrance`. Visual / collision / navigation stay
 * separate outputs; door open state is an explicit input, never inferred
 * from the rendered mesh (spec contract §8).
 *
 * Schema decisions (documented):
 * - Corrected default width 4.8 m lives in `inventory.ts`; the 3.0 m arch
 *   remains valid for secondary gates (spec §13).
 * - `entranceOpening` (clear opening, 1.2–6 m) defaults to `width − 1.0`
 *   (two 0.5 m columns), clamped to the valid range.
 * - `entranceOpen` persists the state-bearing door (`isOpen`); avatar
 *   proximity auto-trigger is future work — Inspector toggles it for now.
 */

export interface EntranceLayersInput {
  width: number;
  height: number;
  depth: number;
  gate: EntranceGate;
  doorsOpen: boolean;
}

export function entranceClearWidth(
  object: Pick<PlanObject, 'dimensions' | 'entranceOpening'>,
): number {
  const [w] = object.dimensions;
  const raw = object.entranceOpening ?? w - 1.0;
  return Math.min(Math.max(raw, 1.2), Math.min(6.0, Math.max(0.6, w - 1.0)));
}

/** Visual: side-column center positions at X = ±(W/2 − 0.25). Columns are 0.5 m wide. */
export function entranceColumnPositions(width: number): [number, number][] {
  return [
    [-(width / 2 - 0.25), 0],
    [width / 2 - 0.25, 0],
  ];
}

/** Collision: side-column boxes 0.5 × H × D. Door portal toggles with open state. */
export function entranceCollisionPolygons({
  width,
  depth,
  gate,
  doorsOpen,
}: EntranceLayersInput): Point2[][] {
  const [left, right] = entranceColumnPositions(width);
  const box = (cx: number): Point2[] => [
    [cx - 0.25, -depth / 2],
    [cx + 0.25, -depth / 2],
    [cx + 0.25, depth / 2],
    [cx - 0.25, depth / 2],
  ];
  const polygons = [box(left![0]), box(right![0])];
  if (!doorsOpen && gate !== 'open-arch') {
    const clearHalf = Math.max(0, width / 2 - 0.5);
    polygons.push([
      [-clearHalf, -depth / 2],
      [clearHalf, -depth / 2],
      [clearHalf, depth / 2],
      [-clearHalf, depth / 2],
    ]);
  }
  return polygons;
}

export function entranceCollisionLocal(object: PlanObject): Point2[][] {
  return entranceCollisionPolygons({
    width: object.dimensions[0],
    height: object.dimensions[1],
    depth: object.dimensions[2],
    gate: object.entranceGate,
    doorsOpen: object.entranceGate === 'open-arch' ? true : object.entranceOpen,
  });
}

/** Navigation: bidirectional walkable portal; blocked barrier when doors closed. */
export function entranceNavigation({ width, doorsOpen, gate }: EntranceLayersInput): {
  entry: Point2;
  exit: Point2;
  blocked: boolean;
  portal: [Point2, Point2] | null;
} {
  const blocked = !doorsOpen && gate !== 'open-arch';
  const clearHalf = Math.max(0.6, width / 2 - 0.5);
  return {
    entry: [0, 1.2],
    exit: [0, -1.2],
    blocked,
    portal: blocked
      ? null
      : ([
          [-clearHalf, 0],
          [clearHalf, 0],
        ] as [Point2, Point2]),
  };
}

export const entranceDimensionLimits = [[2.4, 8], [2.5, 4.5], [0.4, 1.2]] as const;

export function entranceDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'entrance') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  const epsilon = 1e-7;
  if (
    w < 2.4 - epsilon || w > 8 + epsilon ||
    h < 2.5 - epsilon || h > 4.5 + epsilon ||
    d < 0.4 - epsilon || d > 1.2 + epsilon
  ) {
    return 'Entrances require width 2.4–8 m, height 2.5–4.5 m and depth 0.4–1.2 m.';
  }
  const opening = entranceClearWidth(object);
  if (opening < 1.2 || opening > 6 || opening > w - 1.0 + 1e-7) {
    return 'Clear opening must stay within 1.2–6 m and fit between the 0.5 m columns.';
  }
  return null;
}
