import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { useAssetDiagnostics } from './AssetDiagnostics.tsx';
import { FixedStepClock, frameRuntime } from '../model/frame-runtime.ts';
import { drainUploads, cancelUploads } from '../model/upload-admission.ts';
import { manualLocomotion } from '@/features/viewer/model/manual-locomotion.ts';

/** Rendering stays R3F-owned (or diagnostic-owned), never a second gl.render. */
export function FrameCoordinator() {
  const { invalidate, gl } = useThree();
  const { world, step } = useRapier();
  const clock = useRef(new FixedStepClock());
  const physicsUntil = useRef(performance.now() + 300);
  const resumed = useRef(true);
  const contextLost = useRef(false);
  useEffect(() => {
    const wake = () => {
      if (!document.hidden) {
        invalidate();
      }
    };
    const lease = frameRuntime.subscribe(wake);
    const change = useWorldStore.subscribe((state, old) => {
      frameRuntime.wake('state');
      if (state.autopilot) {
        frameRuntime.wake('walking', Infinity);
      } else {
        frameRuntime.release('walking');
      }
      if (state.remoteAvatars !== old.remoteAvatars) {
        frameRuntime.wake('remote', 1500);
      }
      if (state.localAvatar !== old.localAvatar || state.currentFloorId !== old.currentFloorId) {
        physicsUntil.current = performance.now() + 300;
      }
      if (state.previewDoorsOpen !== old.previewDoorsOpen) {
        frameRuntime.wake('doors', 1500);
      }
      if (state.dollhouse !== old.dollhouse) {
        frameRuntime.wake('floors', 800);
      }
      gl.shadowMap.needsUpdate = true;
    });
    const layoutChange = useLayoutStore.subscribe(() => {
      physicsUntil.current = performance.now() + 300;
      frameRuntime.wake('layout', 350);
      gl.shadowMap.needsUpdate = true;
    });
    const diagnostics = useAssetDiagnostics.subscribe((state, old) => {
      if (state.tour !== old.tour || state.focus !== old.focus) {
        const touring = state.tour && !['complete', 'cancelled'].includes(state.tour.phase);
        if (touring) {
          frameRuntime.wake('tour', Infinity);
        } else {
          frameRuntime.release('tour');
        }
        frameRuntime.wake('diagnostics', 200);
      }
    });
    const visibility = () => {
      clock.current.reset();
      resumed.current = true;
      if (!document.hidden) {
        physicsUntil.current = performance.now() + 300;
        frameRuntime.wake('resume', 350);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost.current = true;
      clock.current.reset();
      resumed.current = true;
    };
    const restored = () => {
      contextLost.current = false;
      gl.shadowMap.needsUpdate = true;
      physicsUntil.current = performance.now() + 300;
      frameRuntime.wake('context-restored', 500);
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', restored);
    frameRuntime.wake('mount', 500);
    if (useWorldStore.getState().autopilot) {
      frameRuntime.wake('walking', Infinity);
    }
    return () => {
      lease();
      change();
      layoutChange();
      diagnostics();
      document.removeEventListener('visibilitychange', visibility);
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', restored);
      cancelUploads();
      frameRuntime.reset();
    };
  }, [invalidate, gl]);
  useFrame((_, delta) => {
    frameRuntime.renderedFrames++;
    if (document.hidden || contextLost.current) {
      return;
    }
    drainUploads();
    const state = useWorldStore.getState();
    let dynamic = false;
    world.forEachActiveRigidBody((body) => {
      if (body.isDynamic() && !body.isSleeping()) {
        dynamic = true;
      }
    });
    const simulate =
      !state.dollhouse &&
      (state.autopilot ||
        manualLocomotion.active ||
        dynamic ||
        performance.now() < physicsUntil.current);
    if (simulate) {
      const result = clock.current.advance(resumed.current ? 1 / 60 : delta, (seconds) => {
        step(seconds);
        frameRuntime.simulationSteps++;
      });
      frameRuntime.alpha = result.alpha;
      resumed.current = false;
    } else {
      clock.current.reset();
      frameRuntime.alpha = 1;
      resumed.current = true;
    }
    if (state.autopilot || manualLocomotion.active || dynamic) {
      gl.shadowMap.needsUpdate = true;
    }
    if (simulate || frameRuntime.active()) {
      invalidate();
    }
  }, -50);
  return null;
}
