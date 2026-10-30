import { describe, expect, test } from 'bun:test';
import { blankFloor } from './adapter.ts';
import { createObject } from './inventory.ts';
import { sampleSurfaceColor } from './surface-color.ts';

describe('surface color sampling', () => {
  test('continues to honor an image offset saved by an earlier version', () => {
    const floor = blankFloor();
    floor.boundary = [[0, 0], [10, 0], [10, 10], [0, 10]];
    floor.source.authoring = {
      boundary: floor.boundary,
      spawn: [5, 5],
      obstacles: [],
      instances: [],
      imageSize: [4, 4],
      imageOffset: [5, 0],
      underlayOpacity: 0.85,
    };
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4;
        data[i] = x < 2 ? 255 : 0;
        data[i + 2] = x < 2 ? 0 : 255;
        data[i + 3] = 255;
      }
    }
    const object = { ...createObject('chair', [7.5, 5]), colorMode: 'surface' as const };
    expect(sampleSurfaceColor(object, floor, { width: 4, height: 4, data })).toBe('#ff0000');
    floor.source.authoring.imageOffset = [0, 0];
    expect(sampleSurfaceColor(object, floor, { width: 4, height: 4, data })).toBe('#0000ff');
  });
});
