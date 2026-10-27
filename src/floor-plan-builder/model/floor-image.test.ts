import { describe, expect, test } from 'bun:test';
import { decodedImageSize, fitFloorImage, validateFloorImage } from './floor-image.ts';

describe('floor image helpers', () => {
  test('accepts PNG, JPEG and WebP and rejects unsupported or mismatched files', () => {
    expect(validateFloorImage({ name: 'map.PNG', type: 'image/png' }).ok).toBe(true);
    expect(validateFloorImage({ name: 'map.jpeg', type: 'image/jpeg' }).ok).toBe(true);
    expect(validateFloorImage({ name: 'map.webp', type: 'image/webp' }).ok).toBe(true);
    expect(validateFloorImage({ name: 'map.gif', type: 'image/gif' }).ok).toBe(false);
    expect(validateFloorImage({ name: 'map.png', type: 'image/jpeg' }).ok).toBe(false);
  });

  test('caps decoded dimensions while preserving aspect ratio', () => {
    expect(decodedImageSize(8000, 4000)).toEqual([2048, 1024]);
    expect(decodedImageSize(400, 200)).toEqual([400, 200]);
    expect(decodedImageSize(Infinity, 200)).toBeNull();
  });

  test('contains and centers the image and recalculates from changed floor bounds', () => {
    const first = fitFloorImage(
      [
        [0, 0],
        [40, 0],
        [40, 20],
        [0, 20],
      ],
      [1600, 900],
    );
    expect(first).toEqual({ center: [20, 10], width: 35.55555555555556, depth: 20 });
    const resized = fitFloorImage(
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
      [1600, 900],
    );
    expect(resized?.width).toBeCloseTo(20);
    expect(resized?.depth).toBeCloseTo(11.25);
    expect(
      fitFloorImage(
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        [10, 10],
      ),
    ).toBeNull();
  });
});
