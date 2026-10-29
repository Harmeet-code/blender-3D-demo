import { describe, expect, test } from 'bun:test';
import { blankFloor } from './adapter.ts';
import { createObject } from './inventory.ts';
import { placementError, validatePlacementBatch } from './geometry.ts';

describe('placement validation', () => {
  test('requires the complete footprint to remain inside the floor', () => {
    const floor = blankFloor();
    const object = createObject('chair', [0.1, 0.1]);
    expect(placementError(object, floor)).toMatch(/whole object inside/);
  });

  test('rejects positive-area overlap between collidable geometry', () => {
    const floor = blankFloor();
    const fixed = createObject('chair', [5, 5]);
    const overlapping = createObject('chair', [5.2, 5], [fixed]);
    expect(placementError(overlapping, { ...floor, objects: [fixed] })).toMatch(/Overlaps/);
  });

  test('blocks booth-to-booth overlap but allows furniture inside a booth', () => {
    const floor = blankFloor();
    const booth = createObject('booth', [8, 8]);
    const overlappingBooth = createObject('polygon-booth', [8, 8], [booth]);
    expect(placementError(overlappingBooth, { ...floor, objects: [booth] })).toMatch(/Overlaps/);

    const chair = createObject('chair', [8, 8], [booth]);
    expect(placementError(chair, { ...floor, objects: [booth] })).toBeNull();
    expect(placementError(booth, { ...floor, objects: [chair] })).toBeNull();
  });

  test('allows structural edges to touch and noncollidable visuals to overlap', () => {
    const floor = blankFloor();
    const fixed = createObject('barrier', [5, 5]);
    const touching = createObject('barrier', [7, 5], [fixed]);
    expect(placementError(touching, { ...floor, objects: [fixed] })).toBeNull();

    const visual = createObject('avatar', [5, 5]);
    expect(visual.collidable).toBe(false);
    expect(placementError(visual, { ...floor, objects: [fixed] })).toBeNull();
  });

  test('exposes runtime route-connectivity validation after geometry passes', () => {
    const floor = blankFloor();
    const object = createObject('chair', [5, 5]);
    const candidate = { ...floor, objects: [object] };
    const check = (value: typeof floor) => (value.objects.length ? 'Route disconnected.' : null);
    expect(validatePlacementBatch([object], candidate, check)).toBe('Route disconnected.');
    expect(validatePlacementBatch([object], candidate)).toBeNull();
  });
});
