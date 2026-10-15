import {
  guyAnchorPositions,
  tentPolePositions,
  type Point2,
} from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

export type TentSidewall = 'open' | 'half' | 'full' | 'windows';
export type TentVariant = 'barn' | 'gazebo' | 'marquee';
export type TentFlooring = 'none' | 'grass' | 'wood-deck';

/**
 * Layer-split helpers for `barn-tent`. Visual / collision / navigation are
 * computed independently from the same explicit parameters — navigation is
 * NEVER derived from the visual mesh bounding box (spec contract §8).
 *
 * Schema decisions (spec ambiguities resolved, documented):
 * - `tentStyle` reuses the existing Variant field (barn/gazebo/marquee).
 * - Eaves: absolute `tentEavesHeight` (2.0–3.0, default 2.2). Legacy objects
 *   without it fall back to clamped `dimensions[1] * eavesRatio`.
 * - `half` sidewall = 1.1 m high stub walls around the full perimeter
 *   (still blocking in plan); `full`/`windows` = full-height plan barriers.
 */

export interface TentLayersInput {
  width: number;
  depth: number;
  sidewall: TentSidewall;
}

export function tentEaves(
  object: Pick<PlanObject, 'dimensions' | 'eavesRatio' | 'tentEavesHeight'>,
): number {
  const [, h] = object.dimensions;
  const base = object.tentEavesHeight ?? h * object.eavesRatio;
  return Math.min(Math.max(base, 2.0), Math.min(3.0, h - 0.3));
}

/** Visual: pole ground positions (corners + 2.5 m mid poles). */
export function tentVisualPoles(width: number, depth: number): Point2[] {
  return tentPolePositions(width, depth);
}

/** Visual: guy-rope ground anchors 1 m outside the footprint. */
export function tentVisualAnchors(width: number, depth: number): Point2[] {
  return guyAnchorPositions(width, depth);
}

/**
 * Collision: corner-pole vertical cylinders (R = 0.05 m) + active sidewall
 * planes. Open edges emit no collision. Returned as 2D footprints; heights
 * are enforced by the physics consumer, not by a visual bbox.
 */
export function tentCollisionPolygons({ width, depth, sidewall }: TentLayersInput): Point2[][] {
  const r = 0.05;
  const disc = ([x, z]: Point2): Point2[] => [
    [x - r, z - r],
    [x + r, z - r],
    [x + r, z + r],
    [x - r, z + r],
  ];
  const hw = width / 2;
  const hd = depth / 2;
  const corners: Point2[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const polygons = corners.map(disc);
  if (sidewall === 'open') {
    return polygons;
  }
  const wall = (a: Point2, b: Point2): Point2[][] => [
    [
      [a[0], a[1]],
      [b[0], b[1]],
      [b[0] + 0.01, b[1] + 0.01],
      [a[0] + 0.01, a[1] + 0.01],
    ],
  ];
  const edges: [Point2, Point2][] = [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[2]!],
    [corners[2]!, corners[3]!],
    [corners[3]!, corners[0]!],
  ];
  for (const [a, b] of edges) {
    polygons.push(...wall(a, b));
  }
  return polygons;
}

export function tentCollisionLocal(object: PlanObject): Point2[][] {
  return tentCollisionPolygons({
    width: object.dimensions[0],
    depth: object.dimensions[2],
    sidewall: object.tentSidewall,
  });
}

/**
 * Navigation: walkable interior floor polygon + entry portals on open/half
 * edges. Walled edges act as perimeter obstacles (returned separately so the
 * Recast consumer can apply them without reading visual bounds).
 */
export function tentNavigation({ width, depth, sidewall }: TentLayersInput): {
  walkable: Point2[];
  portals: [Point2, Point2][];
  walls: [Point2, Point2][];
} {
  const hw = width / 2;
  const hd = depth / 2;
  const walkable: Point2[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const edges: [Point2, Point2][] = [
    [walkable[0]!, walkable[1]!],
    [walkable[1]!, walkable[2]!],
    [walkable[2]!, walkable[3]!],
    [walkable[3]!, walkable[0]!],
  ];
  if (sidewall === 'full' || sidewall === 'windows') {
    return { walkable, portals: [], walls: edges };
  }
  return { walkable, portals: edges, walls: [] };
}

export function tentWalkableLocal(object: PlanObject): Point2[] {
  return tentNavigation({
    width: object.dimensions[0],
    depth: object.dimensions[2],
    sidewall: object.tentSidewall,
  }).walkable;
}

export function tentDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'barn-tent') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 3 || w > 12 || d < 3 || d > 16 || h < 2.8 || h > 6) {
    return 'Barn tents require width 3–12 m, depth 3–16 m and ridge height 2.8–6 m.';
  }
  const eaves = tentEaves(object);
  if (eaves < 2.0 || eaves > 3.0 || eaves >= h) {
    return 'Tent eaves height must stay within 2.0–3.0 m and below the ridge.';
  }
  return null;
}
