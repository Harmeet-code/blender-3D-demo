import { describe, expect, test } from 'bun:test';
import { inventory } from './inventory.ts';

describe('editor inventory categories', () => {
  test('keeps booth creation in the scene tools and exposes only placeable assets here', () => {
    expect(new Set(inventory.map((item) => item.category))).toEqual(
      new Set(['Structure', 'Furniture', 'Services', 'Navigation', 'Connectors']),
    );
    expect(new Set(inventory.map((item) => item.catalogId)).size).toBe(inventory.length);
    expect(inventory.some((item) => item.id === 'booth' || item.id === 'polygon-booth')).toBe(false);
    expect(inventory.find((item) => item.id === 'stairs')?.category).toBe('Connectors');
    expect(inventory.find((item) => item.id === 'barrier')?.category).toBe('Structure');
    expect(inventory.find((item) => item.id === 'chair')?.category).toBe('Furniture');
  });
});
