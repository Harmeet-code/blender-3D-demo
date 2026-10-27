import { transformFootprint } from '@/utils/geometry/polygon.ts';
import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `barrier` (spec §8).
 * Two post discs (R 0.18) joined by a thin belt-wall strip: a continuous
 * solid wall obstacle. Snap-chain auto-merge (spec §9) is open — segments
 * place standalone; see the component note.
 */

export const BARRIER_POST_RADIUS = 0.18;

export function barrierBeltColor(object: Pick<PlanObject, 'barrierBelt'>): string {
  return object.barrierBelt === 'red'
    ? '#EF4444'
    : object.barrierBelt === 'blue'
      ? '#2563EB'
      : '#06B6D4';
}

export function barrierObstacleLocal(object: PlanObject): Point2[][] {
  const [w] = object.dimensions;
  const r = BARRIER_POST_RADIUS;
  const disc = (cx: number): Point2[] => [
    [cx - r, -r],
    [cx + r, -r],
    [cx + r, r],
    [cx - r, r],
  ];
  return [
    disc(-w / 2),
    disc(w / 2),
    [
      [-w / 2, -0.025],
      [w / 2, -0.025],
      [w / 2, 0.025],
      [-w / 2, 0.025],
    ],
  ];
}

export function barrierDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'barrier') {
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 0.8 || w > 3) {
    return 'Barrier segments require length 0.8–3 m.';
  }
  if (Math.abs(h - 1.0) > 1e-6 || Math.abs(d - 0.3) > 1e-6) {
    return 'Barrier post height (1.0 m) and base depth (0.3 m) are fixed standards.';
  }
  return null;
}

function barrierEndpoints(object: PlanObject, position: Point2): [Point2, Point2] {
  // Endpoints lie on the local X axis (z = 0), so only the a/b shear terms apply.
  const [a, b] = object.planarMatrix ?? [1, 0, 0, 1];
  const local = (x: number): Point2 => [a * x * object.scale[0], b * x * object.scale[2]];
  const [start, end] = transformFootprint(
    [local(-object.dimensions[0] / 2), local(object.dimensions[0] / 2)],
    position,
    object.yawRadians,
  );
  return [start as Point2, end as Point2];
}

/**
 * Snap-chain placement: when a barrier end lands within 0.3 m of another
 * segment's post, snap the endpoints together. Segments stay standalone
 * objects (no post merging) — chains read continuous via the shared node.
 */
export function snapBarrierPosition(
  object: PlanObject,
  objects: PlanObject[],
  position: Point2,
): Point2 {
  if (object.recipe !== 'barrier') {
    return position;
  }
  const [start, end] = barrierEndpoints(object, position);
  let best: Point2 = position;
  let nearest = 0.3;
  for (const other of objects.filter(
    (item) => item.id !== object.id && item.recipe === 'barrier',
  )) {
    const [a, b] = barrierEndpoints(other, other.position);
    for (const [from, to] of [
      [start, a],
      [start, b],
      [end, a],
      [end, b],
    ] as [Point2, Point2][]) {
      const distance = Math.hypot(from[0] - to[0], from[1] - to[1]);
      if (distance < nearest) {
        nearest = distance;
        best = [position[0] + to[0] - from[0], position[1] + to[1] - from[1]];
      }
    }
  }
  return best;
}
