import { describe, expect, test } from 'bun:test';
import { createObject, inventory } from './inventory.ts';
import { placementError, resizeObjectSafely } from './geometry.ts';
import { objectSchema } from './types.ts';
import { blankDocument, decodeLayout, encodeLayout } from './adapter.ts';

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

  test('every inventory item accepts and preserves dimensions outside former limits', () => {
    for (const item of inventory) {
      const object = createObject(item.id, [5, 5], [], [], item.washRackVariant, item.showOfficeVariant);
      for (const dimensions of [[0.2, 0.25, 0.3], [1200, 1201, 1202]] as const) {
        const resized = resizeObjectSafely(object, dimensions[0], dimensions[1], dimensions[2]);
        expect(resized.dimensions).toEqual([...dimensions]);
        const parsed = objectSchema.safeParse(resized);
        if (!parsed.success) {
          throw new Error(`${item.catalogId}: ${parsed.error.message}`);
        }
        const document = blankDocument('test-event');
        document.floors[0]!.boundary = [[-5000, -5000], [5000, -5000], [5000, 5000], [-5000, 5000]];
        const placementIssue = placementError(resized, document.floors[0]!);
        if (placementIssue) {
          throw new Error(`${item.catalogId}: ${placementIssue}`);
        }
        document.floors[0]!.objects = [resized];
        const saved = decodeLayout(encodeLayout(document)).floors[0]!.objects[0]!;
        expect(saved.dimensions).toEqual([...dimensions]);
      }
    }
  });
});
