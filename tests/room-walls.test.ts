import { describe, expect, test } from 'bun:test';
import { wallSpans } from '../src/frontend/entities/building/model/wall-spans.ts';
import type { Room } from '../src/frontend/entities/building/model/building-schema.ts';

function room(polygon: Array<[number, number]>, entrance?: Room['entrance']): Room {
  return {
    id: 'room-1',
    floorId: 'F1',
    polygon,
    type: 'booth',
    entrance,
  };
}

function totalLength(spans: ReturnType<typeof wallSpans>): number {
  return spans.reduce(
    (sum, span) => sum + Math.hypot(span.b[0] - span.a[0], span.b[1] - span.a[1]),
    0,
  );
}

describe('wallSpans', () => {
  test('cuts the default entrance opening when none is declared', () => {
    const spans = wallSpans(
      room([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    );
    expect(spans).toHaveLength(5);
    expect(totalLength(spans)).toBeCloseTo(16 - 2, 6);
  });

  test('cuts a centered opening on the entrance edge', () => {
    const spans = wallSpans(
      room(
        [
          [0, 0],
          [10, 0],
          [10, 8],
          [0, 8],
        ],
        { position: [5, 0], yawRadians: 0 },
      ),
    );
    expect(spans).toHaveLength(5);
    expect(totalLength(spans)).toBeCloseTo(36 - 2, 6);
    const bottom = spans.filter(
      (span) => Math.abs(span.a[1]) < 0.001 && Math.abs(span.b[1]) < 0.001,
    );
    expect(bottom).toHaveLength(2);
    const gap = bottom
      .map((span) => [span.a[0], span.b[0]].sort((x, y) => x - y) as [number, number])
      .sort((x, y) => x[0] - y[0]);
    expect(gap[0]?.[1]).toBeCloseTo(4, 6);
    expect(gap[1]?.[0]).toBeCloseTo(6, 6);
  });

  test('leaves concave room spans continuous without an entrance', () => {
    const polygon: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const spans = wallSpans(room(polygon));
    expect(spans).toHaveLength(7);
    expect(totalLength(spans)).toBeCloseTo(10 + 4 + 6 + 6 + 4 + 10 - 2, 6);
  });
});
