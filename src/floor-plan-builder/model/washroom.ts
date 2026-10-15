import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `washroom-men` / `washroom-women`.
 * Visual / collision / navigation stay separate outputs (spec contract §8).
 *
 * Schema decisions (documented):
 * - Gender accent: men → wayfinding cyan `#06B6D4`; women/unisex → warm
 *   amber `#F59E0B` (spec lists `#F59E0B` or `#D946EF`; amber chosen for
 *   contrast against the dark top-down outline and palette consistency).
 * - Navigation treats the block as a SOLID obstacle footprint (spec §8:
 *   interior is non-routable). The open-maze slot exists in the visual
 *   doorway only; no walkable portal is emitted into the navmesh.
 * - The entry landing point is exposed for spawn/marker consumers; the
 *   Recast worker itself has no landing-node concept.
 */

export function washroomAccent(object: Pick<PlanObject, 'gender'>): string {
  return object.gender === 'men' ? '#06B6D4' : '#F59E0B';
}

export function washroomOpeningOf(object: Pick<PlanObject, 'washroomOpening'>): number {
  return object.washroomOpening;
}

/** Solid non-routable obstacle footprint for the Recast consumer. */
export function washroomObstacleLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
}

/** Entry landing node outside the maze threshold: (0, D/2 + 0.5), facing −Z. */
export function washroomLandingLocal(object: PlanObject): Point2 {
  return [0, object.dimensions[2] / 2 + 0.5];
}

export function washroomDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'washroom-men' && object.recipe !== 'washroom-women') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 2.5 || w > 6 || h < 2.4 || h > 3.5 || d < 2.5 || d > 6) {
    return 'Washroom blocks require width/depth 2.5–6 m and height 2.4–3.5 m.';
  }
  if (object.washroomOpening > Math.min(1.8, w - 0.9) + 1e-7) {
    return 'Entrance opening must fit the 1.0–1.8 m range and leave room for the 0.4 m sign plates.';
  }
  return null;
}
