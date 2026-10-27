import { describe, expect, test } from 'bun:test';
import { parseWorkerRoute, routeRequestSchema, routeResultSchema } from '../model/route-schema.ts';

describe('route schemas', () => {
  test('accepts a minimal request', () => {
    const parsed = routeRequestSchema.safeParse({
      start: { floorId: 'f1', kind: 'point', point: [0, 0] },
      dest: { floorId: 'f1', kind: 'item', itemId: 'abc' },
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects malformed worker payloads', () => {
    expect(parseWorkerRoute(null)).toEqual({ ok: false, error: expect.any(String) });
    expect(parseWorkerRoute({ points: [], floors: [] })).toEqual({
      ok: false,
      error: expect.any(String),
    });
    expect(parseWorkerRoute({ points: [[0, NaN, 0]], floors: ['f1'] })).toEqual({
      ok: false,
      error: expect.any(String),
    });
    expect(parseWorkerRoute({ points: 'nope', floors: ['f1'] })).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  test('accepts a well-formed worker payload with straight output', () => {
    const result = parseWorkerRoute({
      points: [
        [0, 0, 0],
        [1, 0, 1],
      ],
      floors: ['f1', 'f1'],
      straight: [
        [0, 0, 0],
        [1, 0, 1],
      ],
      buildMs: 12,
    });
    expect(result).toEqual({
      ok: true,
      points: [
        [0, 0, 0],
        [1, 0, 1],
      ],
      floors: ['f1', 'f1'],
      straight: [
        [0, 0, 0],
        [1, 0, 1],
      ],
      buildMs: 12,
    });
  });

  test('rejects degenerate route results', () => {
    const parsed = routeResultSchema.safeParse({
      waypoints: [[0, 0, 0]],
      segments: [],
      lengthM: 0,
      secondsEta: 0,
      instructions: [],
      option: 'shortest',
      snapped: { start: false, dest: false },
    });
    expect(parsed.success).toBe(false);
  });
});
