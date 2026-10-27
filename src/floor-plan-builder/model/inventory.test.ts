import { describe, expect, test } from 'bun:test';
import { inventory } from './inventory.ts';

describe('editor inventory categories', () => {
  test('uses the six product categories without changing the released asset set', () => {
    expect(new Set(inventory.map((item) => item.category))).toEqual(
      new Set(['Booths', 'Structure', 'Furniture', 'Services', 'Navigation', 'Connectors']),
    );
    expect(inventory.map((item) => item.id)).toHaveLength(29);
    expect(inventory.find((item) => item.id === 'stairs')?.category).toBe('Connectors');
    expect(inventory.find((item) => item.id === 'barrier')?.category).toBe('Structure');
    expect(inventory.find((item) => item.id === 'chair')?.category).toBe('Furniture');
  });
});
