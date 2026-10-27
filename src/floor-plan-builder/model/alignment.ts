import { inventory } from './inventory.ts';
import type { RecipeId } from './types.ts';

const EIGHTH_TURN = Math.PI / 4;
export const ROTATION_NUDGE_RADIANS = Math.PI / 36;

export type AlignmentKind = 'endpoint' | 'edge' | 'wall';
export interface ScreenAlignmentCandidate {
  id: string;
  kind: AlignmentKind;
  screenPoint: [number, number];
  worldPoint: [number, number];
}

/** Booths, entrances and barriers participate in structural edge alignment. */
export function isStructuralRecipe(recipe: RecipeId): boolean {
  return (
    recipe === 'booth' ||
    recipe === 'polygon-booth' ||
    recipe === 'entrance' ||
    recipe === 'barrier'
  );
}

/** Furniture gets wall alignment only; other objects do not auto-align. */
export function canSnapTo(recipe: RecipeId, kind: AlignmentKind): boolean {
  if (isStructuralRecipe(recipe)) {
    return true;
  }
  return inventory.find((item) => item.id === recipe)?.category === 'Furniture' && kind === 'wall';
}

/** Structural rotations quantize to 45 degree increments; Alt preserves the free angle. */
export function snapStructuralAngle(yawRadians: number, alt = false): number {
  if (alt || !Number.isFinite(yawRadians)) {
    return yawRadians;
  }
  return Math.round(yawRadians / EIGHTH_TURN) * EIGHTH_TURN;
}

/**
 * Resolve a pointer snap in screen space so the UI can use a stable pixel threshold at every zoom.
 * The candidates carry their corresponding world point for the accepted placement transform.
 */
export function nearestScreenAlignment(
  pointer: [number, number],
  candidates: readonly ScreenAlignmentCandidate[],
  thresholdPx: number,
  options: { recipe: RecipeId; alt?: boolean },
): ScreenAlignmentCandidate | null {
  if (
    options.alt ||
    !pointer.every(Number.isFinite) ||
    !Number.isFinite(thresholdPx) ||
    thresholdPx < 0
  ) {
    return null;
  }
  let nearest: ScreenAlignmentCandidate | null = null;
  let distance = thresholdPx;
  for (const candidate of candidates) {
    if (!canSnapTo(options.recipe, candidate.kind)) {
      continue;
    }
    const next = Math.hypot(
      candidate.screenPoint[0] - pointer[0],
      candidate.screenPoint[1] - pointer[1],
    );
    if (next <= distance) {
      distance = next;
      nearest = candidate;
    }
  }
  return nearest;
}
