import type { Point2 } from '../components/procedural-primitives.ts';
import type { PlanObject } from './types.ts';

/**
 * Layer-split helpers for `table` + `chair` (spec §8–§9).
 * Tables block with a 0.15 m clearance margin; attached chairs generate
 * sitting nodes around the footprint. Chairs also exist standalone.
 */

export const TABLE_MARGIN = 0.15;

export function tableHeight(object: Pick<PlanObject, 'tableVariant'>): number {
  return object.tableVariant === 'cocktail-standing' ? 1.1 : 0.75;
}

export function tableObstacleLocal(object: PlanObject): Point2[] {
  const [w, , d] = object.dimensions;
  if (object.tableTop === 'round') {
    const r = Math.min(w, d) / 2 + TABLE_MARGIN;
    return Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return [Math.cos(a) * r, Math.sin(a) * r] as Point2;
    });
  }
  const hw = w / 2 + TABLE_MARGIN;
  const hd = d / 2 + TABLE_MARGIN;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
}

/** Sitting nodes for attached chairs (2 or 4), facing the table. */
export function tableChairNodes(object: PlanObject): { at: Point2; yaw: number }[] {
  if (object.tableChairs === 'none') {
    return [];
  }
  const [w, , d] = object.dimensions;
  const nodes = [
    { at: [0, d / 2 + 0.55] as Point2, yaw: Math.PI },
    { at: [0, -(d / 2 + 0.55)] as Point2, yaw: 0 },
  ];
  if (object.tableChairs === '4-chairs') {
    nodes.push(
      { at: [w / 2 + 0.55, 0] as Point2, yaw: -Math.PI / 2 },
      { at: [-(w / 2 + 0.55), 0] as Point2, yaw: Math.PI / 2 },
    );
  }
  return nodes;
}

export function tableDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'table' && object.recipe !== 'chair') {
    return null;
  }
  if (object.recipe === 'chair') {
    const [w, h, d] = object.dimensions;
    if (w < 0.4 || w > 0.7 || h < 0.7 || h > 1.0 || d < 0.4 || d > 0.7) {
      return 'Chairs require width/depth 0.4–0.7 m and height 0.7–1.0 m.';
    }
    return null;
  }
  const [w, h, d] = object.dimensions;
  if (w < 0.6 || w > 2.4 || d < 0.6 || d > 1.2) {
    return 'Tables require width 0.6–2.4 m and depth 0.6–1.2 m.';
  }
  const lockedH = object.tableVariant === 'cocktail-standing' ? 1.1 : 0.75;
  if (Math.abs(h - lockedH) > 1e-6) {
    return `Height is locked to the variant standard (${lockedH.toFixed(2)} m for ${object.tableVariant}).`;
  }
  return null;
}
