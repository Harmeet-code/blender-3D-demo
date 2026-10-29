import { describe, expect, test } from 'bun:test';
import { blankDocument, decodeLayout, encodeLayout } from './adapter.ts';
import { createStudioStore } from './store.ts';
import { resizeObjectSafely } from './geometry.ts';

function makeStore() {
  return createStudioStore('test-event', blankDocument('test-event'));
}

describe('editor placement and document history', () => {
  test('image movement persists independently of objects and can be undone', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const floor = store.getState().document.floors[0]!;
    expect(store.getState().commitFloor({
      ...floor,
      source: { ...floor.source, authoring: { boundary: floor.boundary, spawn: floor.spawn, obstacles: [], instances: [], underlayOpacity: 0.85, imageOffset: [3, -2] } },
    })).toBe(true);
    const decoded = decodeLayout(encodeLayout(store.getState().document));
    expect(decoded.floors[0]!.source.authoring?.imageOffset).toEqual([3, -2]);
    expect(decoded.floors[0]!.objects[0]!.position).toEqual([5, 5]);
    store.getState().undo();
    expect(store.getState().document.floors[0]!.source.authoring?.imageOffset).toBeUndefined();
  });
  test('resized entrance can be applied and saved at its dimension limits', () => {
    const store = makeStore();
    store.getState().beginPlacement('entrance');
    expect(store.getState().place([10, 10])).toBe(true);
    const entrance = store.getState().document.floors[0]!.objects[0]!;
    store.getState().setTool('resize');
    store.getState().patchObject(resizeObjectSafely(entrance, 9, 3, 0.1));
    expect(store.getState().apply()).toBe(true);
    const saved = decodeLayout(encodeLayout(store.getState().document));
    const dimensions = saved.floors[0]!.objects[0]!.dimensions;
    expect(dimensions[0]).toBeCloseTo(8);
    expect(dimensions[1]).toBeCloseTo(3);
    expect(dimensions[2]).toBeCloseTo(0.4);
  });
  test('undo removes unfinished rectangle and polygon points before committed history', () => {
    for (const tool of ['rectangle', 'polygon', 'zone-rectangle', 'zone-polygon'] as const) {
      const store = makeStore();
      store.getState().beginPlacement('chair');
      expect(store.getState().place([5, 5])).toBe(true);
      store.getState().setTool(tool);
      store.getState().addPoint([1, 1]);
      store.getState().addPoint([2, 2]);
      store.getState().undo();
      expect(store.getState().drawing).toEqual([[1, 1]]);
      store.getState().undo();
      expect(store.getState().drawing).toEqual([]);
      expect(store.getState().document.floors[0]!.objects).toHaveLength(1);
      expect(store.getState().tool).toBe(tool);
    }
  });
  test('commits one valid placement and returns to idle', () => {
    const store = makeStore();
    const state = store.getState();
    expect(state.beginPlacement('chair')).toBe(true);
    state.setPointer([5, 5]);
    expect(store.getState().tool).toBe('place');
    expect(store.getState().place([5, 5])).toBe(true);
    const after = store.getState();
    expect(after.tool).toBe('select');
    expect(after.pointer).toBeNull();
    expect(after.pendingObject).toBeNull();
    expect(after.document.floors[0]!.objects).toHaveLength(1);
    expect(after.revision).toBe(1);
    expect(after.history[after.floorId]?.undo).toHaveLength(1);
  });

  test('keeps an invalid placement active and supports explicit cancellation', () => {
    const store = makeStore();
    const state = store.getState();
    expect(state.beginPlacement('chair')).toBe(true);
    expect(state.place([50, 50])).toBe(false);
    expect(store.getState().tool).toBe('place');
    expect(store.getState().document.floors[0]!.objects).toHaveLength(0);
    expect(store.getState().revision).toBe(0);
    store.getState().cancel();
    expect(store.getState().tool).toBe('select');
    expect(store.getState().pointer).toBeNull();
    expect(store.getState().pendingObject).toBeNull();
  });

  test('Shift+D integration can begin duplication and a copy is one undoable commit', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const originalId = store.getState().selection!.id;
    expect(store.getState().beginDuplicate()).toBe(true);
    expect(store.getState().place([12, 12])).toBe(true);
    expect(store.getState().tool).toBe('select');
    expect(store.getState().document.floors[0]!.objects).toHaveLength(2);
    expect(store.getState().history[store.getState().floorId]?.undo).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().document.floors[0]!.objects.map((item) => item.id)).toEqual([
      originalId,
    ]);
  });

  test('move and delete each create one mutation step; undo preserves live selection when possible', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const selected = store.getState().selection;
    store.getState().setTool('move');
    expect(store.getState().place([10, 10])).toBe(true);
    expect(store.getState().history[store.getState().floorId]?.undo).toHaveLength(2);
    expect(store.getState().selection).toEqual(selected);
    store.getState().undo();
    expect(store.getState().selection).toEqual(selected);
    expect(store.getState().document.floors[0]!.objects[0]!.position).toEqual([5, 5]);

    store.getState().remove();
    expect(store.getState().document.floors[0]!.objects).toHaveLength(0);
    expect(store.getState().history[store.getState().floorId]?.undo).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().document.floors[0]!.objects).toHaveLength(1);
  });

  test('a multi-update move/rotate gesture commits as one document-history entry', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const original = store.getState().document.floors[0]!.objects[0]!;
    store.getState().setTool('move');
    store.getState().patchObject({ position: [8, 8] });
    store.getState().patchObject({ position: [9, 9], yawRadians: Math.PI / 4 });
    expect(store.getState().document.floors[0]!.objects[0]!.position).toEqual([5, 5]);
    expect(store.getState().apply()).toBe(true);
    expect(store.getState().history[store.getState().floorId]?.undo).toHaveLength(2);
    store.getState().undo();
    const restored = store.getState().document.floors[0]!.objects[0]!;
    expect(restored.position).toEqual(original.position);
    expect(restored.yawRadians).toBe(original.yawRadians);
  });

  test('undo history contains document mutations, not selection or draft preview edits', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const revision = store.getState().revision;
    store.getState().markSaved(revision);
    store.getState().select(null);
    expect(store.getState().revision).toBe(revision);
    expect(store.getState().saveState).toBe('Saved');

    store.getState().beginPlacement('table');
    store.getState().place([12, 12]);
    const changedRevision = store.getState().revision;
    expect(changedRevision).toBe(revision + 1);
    store.getState().undo();
    expect(store.getState().revision).toBe(changedRevision + 1);
    expect(store.getState().saveState).toBe('Unsynced');
    expect(store.getState().document.floors[0]!.objects).toHaveLength(1);
  });

  test('commits valid Inspector edits into the shared draft before switching selection', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const first = store.getState().selection!;
    store.getState().beginPlacement('table');
    expect(store.getState().place([12, 12])).toBe(true);
    const second = store.getState().selection!;
    store.getState().select(first);
    const focusTick = store.getState().focusTick;
    store.getState().patchObject({ name: 'Custom chair' });

    expect(store.getState().select(second)).toBe(true);
    expect(store.getState().pendingObject).toBeNull();
    expect(store.getState().document.floors[0]!.objects.find((item) => item.id === first.id)?.name).toBe('Custom chair');
    expect(store.getState().history[store.getState().floorId]?.undo).toHaveLength(3);
    expect(store.getState().focusTick).toBe(focusTick);
  });

  test('keeps invalid Inspector input staged when switching selection is rejected', () => {
    const store = makeStore();
    store.getState().beginPlacement('chair');
    expect(store.getState().place([5, 5])).toBe(true);
    const first = store.getState().selection!;
    store.getState().beginPlacement('table');
    expect(store.getState().place([12, 12])).toBe(true);
    const second = store.getState().selection!;
    store.getState().select(first);
    store.getState().patchObject({ name: '' });

    expect(store.getState().select(second)).toBe(false);
    expect(store.getState().pendingObject?.name).toBe('');
    expect(store.getState().document.floors[0]!.objects.find((item) => item.id === first.id)?.name).not.toBe('');
    expect(store.getState().message).toContain('Name is required');
  });
});
