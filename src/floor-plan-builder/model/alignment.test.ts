import { describe, expect, test } from 'bun:test';
import {
  canSnapTo,
  isStructuralRecipe,
  nearestScreenAlignment,
  snapStructuralAngle,
} from './alignment.ts';

describe('structural alignment helpers', () => {
  test('snaps structural rotations by 45 degrees and Alt keeps the free angle', () => {
    expect(snapStructuralAngle((Math.PI / 4) * 1.1)).toBeCloseTo(Math.PI / 4);
    expect(snapStructuralAngle(Math.PI / 5, true)).toBeCloseTo(Math.PI / 5);
  });

  test('keeps structural and furniture snap targets distinct', () => {
    expect(isStructuralRecipe('booth')).toBe(true);
    expect(canSnapTo('barrier', 'edge')).toBe(true);
    expect(canSnapTo('chair', 'wall')).toBe(true);
    expect(canSnapTo('chair', 'edge')).toBe(false);
    expect(canSnapTo('avatar', 'wall')).toBe(false);
  });

  test('chooses the nearest eligible target in screen pixels and honors Alt', () => {
    const candidates = [
      {
        id: 'edge',
        kind: 'edge' as const,
        screenPoint: [10, 10] as [number, number],
        worldPoint: [2, 2] as [number, number],
      },
      {
        id: 'wall',
        kind: 'wall' as const,
        screenPoint: [12, 10] as [number, number],
        worldPoint: [3, 2] as [number, number],
      },
    ];
    expect(nearestScreenAlignment([11, 10], candidates, 4, { recipe: 'booth' })?.id).toBe('wall');
    expect(nearestScreenAlignment([11, 10], candidates, 4, { recipe: 'chair' })?.id).toBe('wall');
    expect(
      nearestScreenAlignment([11, 10], candidates, 4, { recipe: 'booth', alt: true }),
    ).toBeNull();
    expect(nearestScreenAlignment([11, 10], candidates, 0.5, { recipe: 'booth' })).toBeNull();
  });
});
