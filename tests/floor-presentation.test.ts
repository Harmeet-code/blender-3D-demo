import { describe, expect, test } from 'bun:test';
import { floorDisplayOffset } from '../src/frontend/widgets/world-viewport/floor-presentation.ts';

describe('floorDisplayOffset', () => {
  test('keeps canonical heights in normal viewing', () => {
    expect(floorDisplayOffset(-4, 0, false)).toBe(-4);
    expect(floorDisplayOffset(0, 1, false)).toBe(0);
  });

  test('separates floors by the stack gap in dollhouse viewing', () => {
    expect(floorDisplayOffset(-4, 0, true)).toBe(-4);
    expect(floorDisplayOffset(0, 1, true)).toBe(8);
    expect(floorDisplayOffset(0, 2, true)).toBe(16);
  });

  test('restores canonical heights when leaving dollhouse mode', () => {
    const stacked = floorDisplayOffset(-4, 0, true);
    const restored = floorDisplayOffset(-4, 0, false);
    expect(stacked).toBe(-4);
    expect(restored).toBe(-4);
  });
});
