import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `avatar` (§8–§10).
 *
 * Spec/code conflict (documented, not guessed):
 * - The spec claims the 0.3 m capsule radius "directly matches the Recast
 *   agent radius". The worker (`features/building/model/navigation.ts`)
 *   generates with a 0.4 m agent radius (walkableRadius 2 × cs 0.2). Worker
 *   generation settings are intentionally left unchanged — re-tuning global
 *   navigation is out of scope and risky. The avatar keeps its spec 0.3 m
 *   capsule for avatar-to-avatar/avatar-to-booth physics.
 */

export const AVATAR_FOOTPRINT: [number, number, number] = [0.65, 1.8, 0.65];
export const AVATAR_CAPSULE_RADIUS = 0.3;
export const AVATAR_HEIGHT = 1.8;

export function avatarDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'avatar') {
    return null;
  }
  const [sx, sy, sz] = object.scale;
  if (Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9 || Math.abs(sz - 1) > 1e-9) {
    return 'Avatar scale is locked to 1.00 — it is a fixed ergonomic benchmark and must never scale non-uniformly.';
  }
  const [w, h, d] = object.dimensions;
  if (
    Math.abs(w - AVATAR_FOOTPRINT[0]) > 1e-6 ||
    Math.abs(h - AVATAR_FOOTPRINT[1]) > 1e-6 ||
    Math.abs(d - AVATAR_FOOTPRINT[2]) > 1e-6
  ) {
    return 'Avatar dimensions are locked to the 0.65 × 1.8 × 0.65 m benchmark.';
  }
  return null;
}
