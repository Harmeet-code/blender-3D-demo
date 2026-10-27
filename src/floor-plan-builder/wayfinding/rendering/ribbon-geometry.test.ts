import { describe, expect, test } from 'bun:test';
import { buildRibbonGeometry, tickPositions } from './ribbon-geometry.ts';

describe('buildRibbonGeometry', () => {
  test('returns null for degenerate input', () => {
    expect(buildRibbonGeometry([], 0, 0.5)).toBeNull();
    expect(buildRibbonGeometry([[1, 1]], 0, 0.5)).toBeNull();
    expect(
      buildRibbonGeometry(
        [
          [0, 0],
          [0, 0],
        ],
        0,
        0.5,
      ),
    ).toBeNull();
  });

  test('builds a centered strip with monotonic distances', () => {
    const geometry = buildRibbonGeometry(
      [
        [0, 0],
        [4, 0],
        [4, 3],
      ],
      0.06,
      0.5,
    )!;
    expect(geometry.totalLength).toBeCloseTo(7, 5);
    expect(geometry.positions.length).toBe(3 * 2 * 3);
    expect(geometry.indices.length).toBe(2 * 6);
    const distances = [...geometry.distances];
    expect(distances).toEqual([0, 0, 4, 4, 7, 7]);
    expect([...geometry.sides]).toEqual([1, -1, 1, -1, 1, -1]);
    // Width 0.5 across a straight run: verts sit ±0.25 off the line.
    expect(geometry.positions[0]).toBeCloseTo(0, 5);
    expect(geometry.positions[2]).toBeCloseTo(0.25, 5);
    expect(geometry.positions[5]).toBeCloseTo(-0.25, 5);
  });

  test('ticks land every N metres', () => {
    const geometry = buildRibbonGeometry(
      [
        [0, 0],
        [25, 0],
      ],
      0,
      0.5,
    )!;
    const ticks = tickPositions(geometry.samples, 10);
    expect(ticks.map((tick) => tick.distance)).toEqual([10, 20]);
  });
});
