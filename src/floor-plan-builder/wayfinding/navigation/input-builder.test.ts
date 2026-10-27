import { describe, expect, test } from 'bun:test';
import { createObject } from '../../model/inventory.ts';
import { buildFloorNavInput } from './input-builder.ts';
import type { WalkableZone } from '../model/zone-schema.ts';

const boundary: [number, number][] = [
  [-10, -10],
  [10, -10],
  [10, 10],
  [-10, 10],
];

const zone = (overrides: Partial<WalkableZone> = {}): WalkableZone => ({
  id: 'z1',
  floorId: 'f1',
  name: 'Hall',
  type: 'general',
  polygon: [
    [-8, -8],
    [8, -8],
    [8, 8],
    [-8, 8],
  ],
  holes: [],
  revision: 0,
  ...overrides,
});

describe('buildFloorNavInput', () => {
  test('falls back to the boundary with no zones', () => {
    const input = buildFloorNavInput('f1', boundary, [], []);
    expect(input.surfaces).toEqual([boundary]);
    expect(input.obstacles).toEqual([]);
    expect(input.areas).toEqual([]);
    expect(input.islands).toEqual([]);
  });

  test('collects descriptor obstacles and zone area paints', () => {
    const booth = { ...createObject('booth', [0, 0]), position: [0, 0] as [number, number] };
    const input = buildFloorNavInput('f1', boundary, [zone()], [booth]);
    expect(input.obstacles.length).toBeGreaterThan(0);
    expect(input.areas.length).toBeGreaterThan(0);
    expect(input.areas[0]).toMatchObject({ area: 1, flags: 0x01 });
    expect(input.surfaces).toEqual([
      [
        [-8, -8],
        [8, -8],
        [8, 8],
        [-8, 8],
      ],
    ]);
  });

  test('maps zone types to areas and turns holes into obstacles', () => {
    const input = buildFloorNavInput(
      'f1',
      boundary,
      [
        zone({
          id: 'q',
          type: 'queue-area',
          polygon: [
            [-8, -8],
            [0, -8],
            [0, 8],
            [-8, 8],
          ],
          holes: [
            [
              [-2, -2],
              [-1, -2],
              [-1, -1],
              [-2, -1],
            ],
          ],
        }),
      ],
      [],
    );
    expect(input.areas.every((paint) => paint.area === 4 && paint.flags === 0x08)).toBe(true);
    expect(input.obstacles).toEqual([
      [
        [-2, -2],
        [-1, -2],
        [-1, -1],
        [-2, -1],
      ],
    ]);
  });

  test('a restricted-only overlay does not create walkable ground', () => {
    const input = buildFloorNavInput('f1', boundary, [zone({ type: 'restricted' })], []);
    expect(input.surfaces).toEqual([]);
  });

  test('reports disconnected islands beyond the largest one', () => {
    const wall = {
      ...createObject('barrier', [0, 0]),
      position: [0, 0] as [number, number],
      dimensions: [16, 1, 16] as [number, number, number],
      polygon: [
        [-8, -0.1],
        [8, -0.1],
        [8, 0.1],
        [-8, 0.1],
      ] as [number, number][],
    };
    const input = buildFloorNavInput('f1', boundary, [zone()], [wall]);
    expect(input.islands.length).toBeGreaterThan(0);
  });
});
