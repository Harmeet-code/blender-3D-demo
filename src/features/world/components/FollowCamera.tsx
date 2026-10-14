import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Vector3, PerspectiveCamera, MathUtils } from 'three';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { avatarRuntime } from '@/features/viewer/model/avatar-runtime.ts';
import { manualLocomotion } from '@/features/viewer/model/manual-locomotion.ts';
import { frameRuntime } from '../model/frame-runtime.ts';
import { useReducedMotion } from '../hooks/use-reduced-motion.ts';

/** A single camera owner in walking mode; the boom cannot pass through fixed walls. */
export function FollowCamera() {
  const enabled = useWorldStore((s) => s.walkMode);
  const { camera, controls } = useThree();
  const { world, rapier } = useRapier();
  const reducedMotion = useReducedMotion();
  const state = useMemo(
    () => ({
      target: new Vector3(),
      destination: new Vector3(),
      direction: new Vector3(0.45, 0.38, 0.8).normalize(),
      ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
      originalFov: camera instanceof PerspectiveCamera ? camera.fov : 50,
      originalNear: camera.near,
    }),
    [camera, rapier],
  );
  useEffect(() => {
    if (enabled) {
      frameRuntime.wake('follow-camera', 1000);
    }
    return () => {
      if (camera instanceof PerspectiveCamera) {
        camera.fov = state.originalFov;
        camera.near = state.originalNear;
        camera.updateProjectionMatrix();
      }
      frameRuntime.release('follow-camera');
    };
  }, [enabled, camera, state]);
  useFrame((_, delta) => {
    if (!enabled) {
      return;
    }
    const [x, y, z] = avatarRuntime.position;
    state.target.set(x, y + 0.45, z);
    Object.assign(state.ray.origin, { x, y: y + 0.45, z });
    Object.assign(state.ray.dir, state.direction);
    const hit = world.castRay(
      state.ray,
      5.5,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (c) => c.parent()?.isFixed() ?? true,
    );
    const distance = Math.max(0.25, Math.min(5.5, hit ? hit.timeOfImpact - 0.2 : 5.5));
    state.destination.copy(state.target).addScaledVector(state.direction, distance);
    const gain = reducedMotion ? 1 : 1 - Math.exp(-8 * Math.min(delta, 0.05));
    // Pull in immediately on occlusion; easing outward avoids popping at doorway edges.
    if (hit && camera.position.distanceTo(state.target) > distance) {
      camera.position.copy(state.destination);
    } else {
      camera.position.lerp(state.destination, gain);
    }
    camera.lookAt(state.target);
    const orbit = controls as unknown as { target?: Vector3 } | null;
    orbit?.target?.copy(state.target);
    if (camera instanceof PerspectiveCamera) {
      const nearChanged = camera.near !== 0.05;
      camera.near = 0.05;
      const run = Math.hypot(manualLocomotion.vx, manualLocomotion.vz) > 2.3;
      const fov = MathUtils.damp(
        camera.fov,
        state.originalFov + (run && !reducedMotion ? 6 : 0),
        6,
        Math.min(delta, 0.05),
      );
      if (nearChanged || Math.abs(camera.fov - fov) > 0.001) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      if (Math.abs(camera.fov - (state.originalFov + (run && !reducedMotion ? 6 : 0))) > 0.01) {
        frameRuntime.wake('follow-camera', 100);
      }
    }
    if (camera.position.distanceToSquared(state.destination) > 0.0001) {
      frameRuntime.wake('follow-camera', 100);
    }
  });
  return null;
}
