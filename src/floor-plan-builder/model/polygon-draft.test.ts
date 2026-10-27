import { describe, expect, test } from 'bun:test';
import { finishPolygonDraft } from './polygon-draft.ts';

const boundary: [number, number][] = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
];

describe('polygon booth draft completion', () => {
  test('accepts three or more vertices and ignores a repeated closing vertex', () => {
    expect(
      finishPolygonDraft(
        [
          [2, 2],
          [8, 2],
          [8, 8],
        ],
        boundary,
      ).ok,
    ).toBe(true);
    const closed = finishPolygonDraft(
      [
        [2, 2],
        [8, 2],
        [8, 8],
        [2, 2],
      ],
      boundary,
    );
    expect(closed).toEqual({
      ok: true,
      polygon: [
        [2, 2],
        [8, 2],
        [8, 8],
      ],
    });
  });

  test('rejects too few vertices, self-intersection and out-of-floor geometry', () => {
    expect(
      finishPolygonDraft(
        [
          [2, 2],
          [8, 2],
        ],
        boundary,
      ),
    ).toMatchObject({ ok: false });
    expect(
      finishPolygonDraft(
        [
          [2, 2],
          [8, 8],
          [2, 8],
          [8, 2],
        ],
        boundary,
      ),
    ).toMatchObject({ ok: false });
    expect(
      finishPolygonDraft(
        [
          [2, 2],
          [22, 2],
          [8, 8],
        ],
        boundary,
      ),
    ).toMatchObject({
      ok: false,
      message: 'Keep the whole booth inside the floor boundary.',
    });
  });

  test('returns a detached candidate so an in-progress draft does not mutate its source', () => {
    const vertices: [number, number][] = [
      [2, 2],
      [8, 2],
      [8, 8],
    ];
    const result = finishPolygonDraft(vertices, boundary);
    expect(result.ok && result.polygon).not.toBe(vertices);
    expect(vertices).toHaveLength(3);
  });
});
