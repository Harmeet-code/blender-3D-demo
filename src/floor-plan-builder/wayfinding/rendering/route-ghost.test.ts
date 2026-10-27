import { describe, expect, test } from 'bun:test';
import { createObject } from '../../model/inventory.ts';
import { routeGhostIds } from './route-ghost.ts';

describe('routeGhostIds', () => {
  test('returns empty sets for empty routes', () => {
    const tent = { ...createObject('barn-tent', [0, 0]), position: [0, 0] as [number, number] };
    expect(routeGhostIds([], [tent]).size).toBe(0);
  });

  test('ghosts nearby tents only', () => {
    const near = { ...createObject('barn-tent', [1, 0]), position: [1, 0] as [number, number] };
    const far = { ...createObject('barn-tent', [30, 30]), position: [30, 30] as [number, number] };
    const bench = { ...createObject('bench', [1, 0]), position: [1, 0] as [number, number] };
    expect(routeGhostIds([[0, 0]], [near, far, bench])).toEqual(new Set([near.id]));
  });
});
