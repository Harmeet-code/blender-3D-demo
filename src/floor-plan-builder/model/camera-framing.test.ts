import { describe, expect, test } from 'bun:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { frameCameraToBounds } from './camera-framing.ts';

describe('camera framing', () => {
  test('fits every bound corner while preserving the orbit direction', () => {
    const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 5000);
    camera.position.set(10, 12, 16);
    camera.lookAt(0, 0, 0);
    const previousDirection = camera.position.clone().normalize();
    const bounds = { minX: -8, maxX: 12, minY: 0, maxY: 5, minZ: -3, maxZ: 9 };
    const frame = frameCameraToBounds(camera, new Vector3(), bounds);
    camera.position.set(...frame.position);
    camera.lookAt(...frame.target);
    camera.updateProjectionMatrix();

    const framedDirection = camera.position
      .clone()
      .sub(new Vector3(...frame.target))
      .normalize();
    expect(framedDirection.dot(previousDirection)).toBeCloseTo(1, 8);
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const y of [bounds.minY, bounds.maxY]) {
        for (const z of [bounds.minZ, bounds.maxZ]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(0.9);
          expect(Math.abs(projected.y)).toBeLessThan(0.9);
        }
      }
    }
  });
});
