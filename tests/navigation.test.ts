import { describe, expect, test } from 'bun:test';
import { normalizeLayout } from '../src/frontend/entities/building/model/normalize-layout.ts';
import {
  queryFloorRoute,
  type RoutePoint,
} from '../src/frontend/entities/building/model/navigation.ts';
import { pointInPolygon } from '../src/frontend/shared/lib/geometry/polygon.ts';

function layoutWithRooms(
  rooms: Array<{ id: string; floorId: string; polygon: Array<[number, number]> }>,
) {
  const parsed = normalizeLayout({
    buildingId: 'nav-test',
    floors: [{ id: 'F1', name: 'Ground', heightOffset: 0, image: 'test.png' }],
    rooms: rooms.map((room) => ({ ...room, type: 'booth' as const })),
    portals: [],
  });
  if (parsed.isErr()) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function length(points: RoutePoint[]): number {
  return points.slice(1).reduce(
    (sum, point, index) => {
      const prev = points[index] as RoutePoint;
      return (
        sum +
        Math.hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2])
      );
    },
    0,
  );
}

describe('queryFloorRoute', () => {
  test('routes straight across an open room', async () => {
    const layout = layoutWithRooms([
      { id: 'hall', floorId: 'F1', polygon: [[0, 0], [10, 0], [10, 2], [0, 2]] },
    ]);
    const result = await queryFloorRoute(layout, 'F1', [1, 1.2, 1], [9, 1.2, 1]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.points.length).toBeGreaterThanOrEqual(2);
    const [first, last] = [result.points[0] as RoutePoint, result.points.at(-1) as RoutePoint];
    expect(Math.hypot(first[0] - 1, first[2] - 1)).toBeLessThan(1);
    expect(Math.hypot(last[0] - 9, last[2] - 1)).toBeLessThan(1);
  });

  test('stays inside an L-shaped room instead of cutting the corner', async () => {
    const polygon: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const layout = layoutWithRooms([{ id: 'ell', floorId: 'F1', polygon }]);
    const result = await queryFloorRoute(layout, 'F1', [2, 1.2, 8], [8, 1.2, 2]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    for (const [x, , z] of result.points) {
      expect(pointInPolygon([x, z], polygon)).toBe(true);
    }
    const straight = Math.hypot(8 - 2, 2 - 8);
    expect(length(result.points)).toBeGreaterThan(straight);
  });

  test('reports no route between disconnected rooms', async () => {
    const layout = layoutWithRooms([
      { id: 'a', floorId: 'F1', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
      { id: 'b', floorId: 'F1', polygon: [[10, 10], [14, 10], [14, 14], [10, 14]] },
    ]);
    const result = await queryFloorRoute(layout, 'F1', [2, 1.2, 2], [12, 1.2, 12]);
    expect(result).toEqual({ ok: false, reason: 'NO_PATH' });
  });

  test('reports outside mesh when starting far from any room', async () => {
    const layout = layoutWithRooms([
      { id: 'a', floorId: 'F1', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
    ]);
    const result = await queryFloorRoute(layout, 'F1', [100, 1.2, 100], [2, 1.2, 2]);
    expect(result).toEqual({ ok: false, reason: 'OUTSIDE_MESH' });
  });
});
