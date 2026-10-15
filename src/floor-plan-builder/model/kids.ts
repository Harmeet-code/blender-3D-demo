import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `kids-zone`.
 * Visual / collision / navigation stay separate outputs (spec contract §8).
 *
 * Canonical layout (shared with `KidsZoneObject.tsx`):
 * - Ball pit ring center: back-left quadrant (−W/4, −D/4).
 * - Slide unit center: back-right quadrant (+W/4, −D/4).
 * - Entry gate: 1.0 m gap centered on the front (W) edge at (0, D/2).
 *
 * Schema decisions (documented):
 * - The interior is NOT tagged with a Recast area flag: the worker only
 *   consumes walkable/blocked geometry. Restriction is enforced geometrically
 *   (perimeter wall obstacles with a single gate gap), so the interior is
 *   reachable only through the gate portal.
 * - New kids-zones are collidable so the wall ring participates in placement
 *   and navigation; legacy `collidable: false` objects keep their old
 *   behavior until re-saved.
 */

export const KIDS_WALL_THICKNESS = 0.15;
export const KIDS_WALL_HEIGHT = 0.3;
export const KIDS_GATE_WIDTH = 1.0;
export const KIDS_BALL_PIT_RADIUS = 1.0;
export const KIDS_CORNER_RADIUS = 0.15;

export interface KidsLayout {
  pit: Point2;
  slide: Point2;
  /** Uniform pit-ring scale (< 1 only in narrow zones where a full 2 m ring cannot fit beside the slide). */
  ringScale: number;
}

/**
 * Size-aware element layout: the pit ring (outer 1.0 m at scale 1) and slide
 * hull (0.8 × 1.2 m) stay inside the walls with a 0.1 m margin and never
 * overlap. Narrow zones shrink the pit ring instead of breaching walls.
 * At default 5×4 m this reproduces the canonical back-left / back-right
 * placement at full scale.
 */
export function kidsLayout(object: PlanObject): KidsLayout {
  const [w, , d] = object.dimensions;
  const availX = w / 2 - KIDS_WALL_THICKNESS;
  const availZ = d / 2 - KIDS_WALL_THICKNESS;
  const ringScale = Math.min(1, Math.max(0.5, (availX * 2 - 0.8 - 0.3) / 2));
  const pitR = KIDS_BALL_PIT_RADIUS * ringScale;
  const pit: Point2 = [-(availX - pitR - 0.1), -(availZ - pitR - 0.1)];
  const slide: Point2 = [availX - 0.4 - 0.1, -(availZ - 0.6 - 0.1)];
  return { pit, slide, ringScale };
}

export function ballPitCenter(object: PlanObject): Point2 {
  return kidsLayout(object).pit;
}

export function slideCenter(object: PlanObject): Point2 {
  return kidsLayout(object).slide;
}

/** Gate portal segment on the front edge. */
export function kidsGateLocal(object: PlanObject): [Point2, Point2] {
  const [, , d] = object.dimensions;
  return [
    [-KIDS_GATE_WIDTH / 2, d / 2],
    [KIDS_GATE_WIDTH / 2, d / 2],
  ];
}

/**
 * Navigation obstacles: perimeter wall strips with the front gate left open,
 * plus solid hulls for the ball pit ring and slide unit.
 */
export function kidsObstacleLocal(object: PlanObject): Point2[][] {
  const [w, , d] = object.dimensions;
  const t = KIDS_WALL_THICKNESS;
  const hw = w / 2;
  const hd = d / 2;
  const strip = (a: Point2, b: Point2, outward: Point2): Point2[] => [
    a,
    b,
    [b[0] + outward[0] * t, b[1] + outward[1] * t],
    [a[0] + outward[0] * t, a[1] + outward[1] * t],
  ];
  const gateHalf = KIDS_GATE_WIDTH / 2;
  const polygons: Point2[][] = [
    strip([-hw, -hd], [hw, -hd], [0, -1]),
    strip([hw, -hd], [hw, hd], [1, 0]),
    strip([-hw, hd], [-hw, -hd], [-1, 0]),
    strip([-gateHalf, hd], [-hw, hd], [0, 1]),
    strip([hw, hd], [gateHalf, hd], [0, 1]),
  ];
  const { pit, slide, ringScale } = kidsLayout(object);
  const [bx, bz] = pit;
  const r = KIDS_BALL_PIT_RADIUS * ringScale;
  polygons.push([
    [bx - r, bz - r],
    [bx + r, bz - r],
    [bx + r, bz + r],
    [bx - r, bz + r],
  ]);
  const [sx, sz] = slide;
  polygons.push([
    [sx - 0.4, sz - 0.6],
    [sx + 0.4, sz - 0.6],
    [sx + 0.4, sz + 0.6],
    [sx - 0.4, sz + 0.6],
  ]);
  return polygons;
}

export function kidsDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'kids-zone') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 3 || w > 10 || d < 3 || d > 10) {
    return 'Kids zones require width/depth 3–10 m for the tile grid.';
  }
  if (h < 0.3 || h > 1.5) {
    return 'Kids zone height must stay within 0.3–1.5 m (border to tallest prop).';
  }
  if (Math.min(w, d) < 2.6) {
    return 'Keep at least 2.6 m across so the ball pit and slide fit inside.';
  }
  return null;
}
