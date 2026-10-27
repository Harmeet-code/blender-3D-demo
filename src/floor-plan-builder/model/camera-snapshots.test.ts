import { afterEach, describe, expect, test } from 'bun:test';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  captureViewportCameraSnapshot,
  clearViewportCameraSnapshots,
  readViewportCameraSnapshot,
  resetViewportCameraSnapshotsForTests,
  restoreViewportCameraSnapshot,
  saveViewportCameraSnapshot,
  viewportCameraKey,
  type ViewportCameraSnapshot,
} from './camera-snapshots.ts';

const snapshot = (x: number): ViewportCameraSnapshot => ({
  position: [x, 8, 10],
  quaternion: [0, 0, 0, 1],
  up: [0, 1, 0],
  target: [0, 0, 0],
  zoom: 1,
  fov: 45,
  near: 0.1,
  far: 1000,
  projection: 'perspective',
});

afterEach(() => resetViewportCameraSnapshotsForTests());

describe('viewport camera snapshots', () => {
  test('separates builder and preview snapshots for each floor', () => {
    saveViewportCameraSnapshot('builder', 'ground floor', snapshot(1));
    saveViewportCameraSnapshot('preview', 'ground floor', snapshot(2));
    saveViewportCameraSnapshot('builder', 'upper', snapshot(3));

    expect(readViewportCameraSnapshot('builder', 'ground floor')?.position[0]).toBe(1);
    expect(readViewportCameraSnapshot('preview', 'ground floor')?.position[0]).toBe(2);
    expect(readViewportCameraSnapshot('builder', 'upper')?.position[0]).toBe(3);
    expect(readViewportCameraSnapshot('preview', 'upper')).toBeNull();
  });

  test('encodes floor ids without collisions and clears all snapshots', () => {
    expect(viewportCameraKey('builder', 'a:b')).not.toBe(viewportCameraKey('builder', 'a/b'));
    saveViewportCameraSnapshot('builder', 'F1', snapshot(4));
    clearViewportCameraSnapshots();
    expect(readViewportCameraSnapshot('builder', 'F1')).toBeNull();
  });

  test('restores the exact preview camera pose and orbit target', () => {
    const camera = new PerspectiveCamera(55, 1.5, 0.2, 900);
    camera.position.set(5, 7, 11);
    camera.up.set(0, 1, 0);
    camera.lookAt(1, 2, 3);
    const target = new Vector3(1, 2, 3);
    const saved = captureViewportCameraSnapshot(camera, target);
    const controls = { target: new Vector3(), update: () => {} };
    camera.position.set(-10, 3, 4);
    camera.fov = 30;
    restoreViewportCameraSnapshot(camera, controls, saved);
    expect(camera.position.toArray()).toEqual(saved.position);
    expect(camera.quaternion.toArray()).toEqual(saved.quaternion);
    expect(controls.target.toArray()).toEqual(saved.target);
    expect(camera.fov).toBe(saved.fov);
    expect(camera.near).toBe(saved.near);
    expect(camera.far).toBe(saved.far);
  });
});
