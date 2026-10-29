import { describe, expect, test } from 'bun:test';
import {
  insertPolygonVertex,
  isPrimaryCanvasClick,
  isWithinScreenRadius,
  movePolygonVertex,
  nearestPolygonEdge,
  nearestPolygonVertex,
  removePolygonVertex,
} from './viewport-interactions.ts';
import { blankDocument } from './adapter.ts';
import { createStudioStore } from './store.ts';

const square: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('screen-space authoring interactions', () => {
  test('keeps polygon closure radius constant as world-to-screen scale changes', () => {
    for (const scale of [0.25, 1, 8]) {
      const project = ([x, z]: readonly [number, number]) => [x * scale, z * scale] as const;
      const firstCorner = project(square[0]!);
      expect(isWithinScreenRadius([firstCorner[0] + 15, firstCorner[1]], firstCorner, 16)).toBe(
        true,
      );
      expect(isWithinScreenRadius([firstCorner[0] + 17, firstCorner[1]], firstCorner, 16)).toBe(
        false,
      );
    }
  });

  test('finds the nearest vertex and edge in projected pixels', () => {
    const project = ([x, z]: readonly [number, number]) => [100 + x * 2, 80 + z * 2] as const;
    expect(nearestPolygonVertex(square, [101, 81], project)).toBe(0);
    expect(nearestPolygonEdge(square, [110, 83], project)).toMatchObject({ edgeIndex: 0 });
    expect(nearestPolygonVertex(square, [400, 400], project)).toBeNull();
  });

  test('moves, inserts and removes vertices without introducing a repeated closing point', () => {
    const moved = movePolygonVertex(square, 1, [12, 0]);
    expect(moved?.[1]).toEqual([12, 0]);
    const inserted = insertPolygonVertex(square, 0, [5, 0]);
    expect(inserted).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(removePolygonVertex(inserted!, 1)).toEqual(square);
    expect(
      removePolygonVertex(
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        1,
      ),
    ).toBeNull();
  });

  test('a camera drag cannot add a rectangle corner, and the next clicks still complete it', () => {
    const store = createStudioStore(
      'viewport-interactions',
      blankDocument('viewport-interactions'),
    );
    store.getState().setTool('rectangle');
    const click = (button: number, movementPx: number, point: [number, number]) => {
      if (isPrimaryCanvasClick(button, movementPx)) {
        store.getState().addPoint(point);
      }
    };

    click(0, 24, [1, 1]);
    expect(store.getState().drawing).toEqual([]);
    click(2, 0, [1, 1]);
    expect(store.getState().drawing).toEqual([]);
    click(0, 0, [2, 2]);
    expect(store.getState().drawing).toEqual([[2, 2]]);
    click(0, 0, [8, 8]);
    expect(store.getState().drawing).toHaveLength(2);
    expect(store.getState().apply()).toBe(true);
    expect(store.getState().document.floors[0]!.objects).toHaveLength(1);
  });

  test('camera gestures between polygon clicks leave the next vertex and close click intact', () => {
    const store = createStudioStore(
      'polygon-viewport-interactions',
      blankDocument('polygon-viewport-interactions'),
    );
    store.getState().setTool('polygon');
    const click = (button: number, movementPx: number, point: [number, number]) => {
      if (!isPrimaryCanvasClick(button, movementPx)) {
        return;
      }
      const { drawing } = store.getState();
      const project = ([x, z]: readonly [number, number]) => [x * 20, z * 20] as const;
      const start = drawing.length ? project(drawing[0]!) : null;
      const pointer = project(point);
      if (drawing.length >= 3 && start && isWithinScreenRadius(pointer, start, 16)) {
        store.getState().apply();
        return;
      }
      store.getState().addPoint(point);
    };
    click(0, 0, [2, 2]);
    click(0, 0, [10, 2]);
    click(0, 21, [8, 8]);
    expect(store.getState().drawing).toEqual([
      [2, 2],
      [10, 2],
    ]);
    click(0, 0, [8, 8]);
    click(0, 0, [2, 2]);
    expect(store.getState().drawing).toEqual([]);
    expect(store.getState().document.floors[0]!.objects[0]!.polygon).toHaveLength(3);
  });
});
