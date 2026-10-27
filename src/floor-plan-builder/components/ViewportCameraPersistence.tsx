import { useEffect, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  captureViewportCameraSnapshot,
  readViewportCameraSnapshot,
  restoreViewportCameraSnapshot,
  saveViewportCameraSnapshot,
  type CameraViewport,
  type ViewportCamera,
} from '../model/camera-snapshots.ts';

/** Persists only viewport state; it never reads or mutates a PlanDocument. */
export function ViewportCameraPersistence({
  viewport,
  floorId,
  enabled = true,
}: {
  viewport: CameraViewport;
  floorId: string;
  enabled?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;

  useLayoutEffect(() => {
    if (!enabled || !controls) return;
    const saved = readViewportCameraSnapshot(viewport, floorId);
    if (
      !saved ||
      saved.projection !== (camera.type === 'OrthographicCamera' ? 'orthographic' : 'perspective')
    ) {
      return;
    }
    restoreViewportCameraSnapshot(camera as ViewportCamera, controls, saved);
  }, [camera, controls, enabled, floorId, viewport]);

  useEffect(() => {
    if (!enabled || !controls) return;
    const save = () => {
      saveViewportCameraSnapshot(
        viewport,
        floorId,
        captureViewportCameraSnapshot(camera as ViewportCamera, controls.target),
      );
    };
    controls.addEventListener('change', save);
    save();
    return () => controls.removeEventListener('change', save);
  }, [camera, controls, enabled, floorId, viewport]);

  return null;
}
