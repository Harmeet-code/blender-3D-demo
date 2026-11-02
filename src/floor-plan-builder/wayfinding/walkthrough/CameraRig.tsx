import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3, type OrthographicCamera } from 'three';
import { gsap } from 'gsap';
import type { OrbitControls } from 'three-stdlib';
import type { PlanDocument } from '../../model/types.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
import { useRouteMotion } from '../rendering/use-route-motion.ts';
import type { Follower } from './follower.ts';
import { cameraObstacles, safeCamera } from './camera-collision.ts';
import type { Vec3 } from './path.ts';
import { CHARACTER_CONFIG } from './character-config.ts';
import {
  captureViewportCameraSnapshot,
  restoreViewportCameraSnapshot,
  type ViewportCamera,
  type ViewportCameraSnapshot,
} from '../../model/camera-snapshots.ts';

export function CameraRig({
  runtime,
  document,
  floorId,
  originY,
}: {
  runtime: Follower;
  document: PlanDocument;
  floorId: string;
  originY: number;
}) {
  const get = useThree((state) => state.get),
    set = useThree((state) => state.set),
    invalidate = useThree((state) => state.invalidate),
    size = useThree((state) => state.size);
  const activeControls = useThree((state) => state.controls);
  const mode = usePlaybackStore((state) => state.mode),
    comfort = usePlaybackStore((state) => state.comfort),
    motion = useRouteMotion();
  const owned = useMemo(() => new PerspectiveCamera(45, 1, 0.06, 5000), []);
  const saved = useRef<{
    camera: PerspectiveCamera | OrthographicCamera;
    position: Vector3;
    quaternion: Quaternion;
    up: Vector3;
    target: Vector3;
    enabled: boolean;
    fov: number;
    zoom: number;
    near: number;
    far: number;
    aspect: number | null;
    frustum: [number, number, number, number] | null;
    snapshot: ViewportCameraSnapshot;
  } | null>(null);
  const overview = useRef({ position: new Vector3(), quaternion: new Quaternion(), fov: 45 });
  const transition = useMemo(() => ({ t: 1 }), []),
    source = useMemo(
      () => ({ position: new Vector3(), quaternion: new Quaternion(), fov: 45 }),
      [],
    );
  const previous = useRef(mode),
    projectedFov = useRef(Number.NaN),
    look = useMemo(() => new Vector3(), []),
    desired = useMemo(() => new Vector3(), []),
    q = useMemo(() => new Quaternion(), []),
    transitionedQ = useMemo(() => new Quaternion(), []),
    matrix = useMemo(() => new Matrix4(), []);
  const focus: Vec3 = useMemo(() => [0, 0, 0], []),
    candidate: Vec3 = useMemo(() => [0, 0, 0], []),
    safe: Vec3 = useMemo(() => [0, 0, 0], []);
  const samplePoint = useMemo<[number, number]>(() => [0, 0], []);
  const free = useMemo(() => ({ yaw: 0, pitch: 0, orbitYaw: 0, orbitPitch: 0 }), []);
  const lastOrigin = useRef(originY);
  const obstacles = useMemo(() => cameraObstacles(document, floorId), [document, floorId]);
  useLayoutEffect(() => {
    const state = get(),
      { camera } = state,
      controls = state.controls as OrbitControls | null;
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 45;
    saved.current = {
      camera,
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      target: controls?.target.clone() ?? new Vector3(),
      enabled: controls?.enabled ?? true,
      fov,
      zoom: camera.zoom,
      near: camera.near,
      far: camera.far,
      aspect: camera instanceof PerspectiveCamera ? camera.aspect : null,
      frustum:
        camera.type === 'OrthographicCamera'
          ? [
              (camera as OrthographicCamera).left,
              (camera as OrthographicCamera).right,
              (camera as OrthographicCamera).top,
              (camera as OrthographicCamera).bottom,
            ]
          : null,
      snapshot: captureViewportCameraSnapshot(
        camera as ViewportCamera,
        controls?.target ?? new Vector3(),
      ),
    };
    owned.position.copy(camera.position);
    owned.quaternion.copy(camera.quaternion);
    owned.up.copy(camera.up);
    owned.fov = fov;
    if (camera.type === 'OrthographicCamera') {
      const ortho = camera as OrthographicCamera,
        dist = owned.position.distanceTo(saved.current.target);
      owned.fov =
        (2 * Math.atan((ortho.top - ortho.bottom) / (2 * ortho.zoom * Math.max(0.1, dist))) * 180) /
        Math.PI;
    }
    owned.aspect = state.size.width / Math.max(1, state.size.height);
    owned.updateProjectionMatrix();
    projectedFov.current = owned.fov;
    overview.current.position.copy(owned.position);
    overview.current.quaternion.copy(owned.quaternion);
    overview.current.fov = owned.fov;
    set({ camera: owned });
    invalidate();
    return () => {
      const original = saved.current;
      if (!original) {
        return;
      }
      const controlsNow = get().controls as OrbitControls | null;
      restoreViewportCameraSnapshot(
        original.camera as ViewportCamera,
        controlsNow ?? { target: new Vector3(), update: () => {} },
        original.snapshot,
      );
      set({ camera: original.camera });
      if (controlsNow) {
        controlsNow.enabled = original.enabled;
      }
      usePlaybackStore.setState({
        cameraAudit: {
          positionError: original.camera.position.distanceTo(
            new Vector3(...original.snapshot.position),
          ),
          rotationError: original.camera.quaternion.angleTo(
            new Quaternion(...original.snapshot.quaternion),
          ),
        },
      });
      invalidate();
    };
    // The snapshot belongs to the session, never a mode/resize update.
  }, [owned, get, set, invalidate]);
  useLayoutEffect(() => {
    const delta = originY - lastOrigin.current;
    lastOrigin.current = originY;
    owned.position.y += delta;
    source.position.y += delta;
    overview.current.position.y += delta;
    invalidate();
  }, [originY, owned, source, invalidate]);
  useEffect(() => {
    const controls = activeControls as OrbitControls | null;
    if (controls) {
      controls.enabled = mode === 'overview';
    }
  }, [activeControls, mode]);
  useEffect(() => {
    owned.aspect = size.width / Math.max(1, size.height);
    owned.updateProjectionMatrix();
    invalidate();
  }, [size.width, size.height, owned, invalidate]);
  useEffect(() => {
    const controls = get().controls as OrbitControls | null;
    if (controls) {
      controls.enabled = mode === 'overview';
      if (mode === 'overview') {
        controls.target.fromArray(saved.current?.snapshot.target ?? [0, 0, 0]);
      }
    }
    if (previous.current === 'overview') {
      overview.current.position.copy(owned.position);
      overview.current.quaternion.copy(owned.quaternion);
      overview.current.fov = owned.fov;
    }
    source.position.copy(owned.position);
    source.quaternion.copy(owned.quaternion);
    source.fov = owned.fov;
    transition.t = 0;
    previous.current = mode;
    const tween = gsap.to(transition, {
      t: 1,
      duration: motion.reduced || comfort ? 0.2 : 0.8,
      ease: 'power2.inOut',
      onUpdate: invalidate,
    });
    return () => {
      tween.kill();
    };
  }, [mode, comfort, motion.reduced, get, owned, source, transition, invalidate]);
  useEffect(() => {
    const canvas = get().gl.domElement;
    let pointer: number | null = null,
      x = 0,
      y = 0;
    const down = (event: PointerEvent) => {
      const state = usePlaybackStore.getState();
      if (state.status === 'playing' || !['first', 'chase'].includes(state.mode) || event.button !== 0) {
        return;
      }
      pointer = event.pointerId;
      x = event.clientX;
      y = event.clientY;
      canvas.setPointerCapture(pointer);
      gsap.killTweensOf(free);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      const deltaX = event.clientX - x;
      const deltaY = event.clientY - y;
      if (usePlaybackStore.getState().mode === 'chase') {
        free.orbitYaw = Math.max(-2.2, Math.min(2.2, free.orbitYaw - deltaX * 0.004));
        free.orbitPitch = Math.max(-0.65, Math.min(0.55, free.orbitPitch + deltaY * 0.004));
      } else {
        free.yaw = Math.max(-1.1, Math.min(1.1, free.yaw - deltaX * 0.004));
        free.pitch = Math.max(-0.5, Math.min(0.5, free.pitch + deltaY * 0.004));
      }
      x = event.clientX;
      y = event.clientY;
      invalidate();
    };
    const up = () => {
      if (pointer !== null && canvas.hasPointerCapture(pointer)) {
        canvas.releasePointerCapture(pointer);
      }
      pointer = null;
      if (usePlaybackStore.getState().mode === 'first') {
        gsap.to(free, { yaw: 0, pitch: 0, duration: 0.35, onUpdate: invalidate });
      }
    };
    const unsubscribe = usePlaybackStore.subscribe((state, previousState) => {
      if (state.status === 'playing' && previousState.status !== 'playing') {
        // Auto-walk owns the camera while active. Release both browser lock and any
        // pointer capture acquired for manual look before the first route frame.
        if (typeof globalThis.document !== 'undefined' && globalThis.document.pointerLockElement) {
          try { globalThis.document.exitPointerLock(); } catch { /* Browser may already be releasing it. */ }
        }
        up();
      }
      if (state.status === 'playing' && state.mode === 'overview') {
        state.setMode('chase');
      }
    });
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      unsubscribe();
      gsap.killTweensOf(free);
    };
  }, [get, free, invalidate]);
  useFrame((_, dt) => {
    if (mode === 'overview' && transition.t >= 1) {
      return;
    }
    const { position } = runtime,
      first = mode === 'first',
      quiet = comfort || motion.reduced;
    const inElevator = runtime.path.legs[runtime.leg]?.kind === 'elevator';
    const ahead = runtime.look;
    const bob =
      first && !quiet
        ? Math.sin((runtime.gaitDistance / 0.96) * 4 * Math.PI) *
          0.014 *
          Math.min(1, runtime.speed / 1.2)
        : 0;
    [focus[0], , focus[2]] = position;
    focus[1] = position[1] + originY + 1.4;
    if (mode === 'overview') {
      desired.copy(overview.current.position);
      q.copy(overview.current.quaternion);
    } else {
      // The hall's chase arm would pass through the cabin shell. Keep it inside while riding.
      const cameraYaw = runtime.yaw + (first ? free.yaw : free.orbitYaw);
      const chaseOffset = CHARACTER_CONFIG.camera.chaseOffsetM;
      const scale = inElevator ? Math.min(1, 0.65 / Math.hypot(chaseOffset[0], chaseOffset[2])) : 1;
      const localX = chaseOffset[0] * scale;
      const localZ = chaseOffset[2] * scale;
      candidate[0] =
        position[0] + (first ? 0 : Math.cos(cameraYaw) * localX - Math.sin(cameraYaw) * localZ);
      candidate[1] =
        position[1] +
        originY +
        (first
          ? CHARACTER_CONFIG.eyeHeightM + bob + free.pitch * 1.7
          : chaseOffset[1] + free.orbitPitch * 1.7);
      candidate[2] =
        position[2] + (first ? 0 : -Math.sin(cameraYaw) * localX - Math.cos(cameraYaw) * localZ);
      const base =
        document.floors.find((floor) => floor.source.id === floorId)?.source.heightOffset ?? 0;
      safeCamera(
        focus,
        candidate,
        obstacles,
        base + originY,
        safe,
        samplePoint,
        runtime.path.legs[runtime.leg]?.connector?.portalId,
      );
      desired.set(...safe);
      if (first) {
        const yaw = cameraYaw;
        const dx = ahead[0] - position[0],
          dz = ahead[2] - position[2];
        const headYaw = Math.hypot(dx, dz) > 0.05 ? Math.atan2(-dx, -dz) : runtime.yaw;
        const blend =
          Math.atan2(Math.sin(headYaw - runtime.yaw), Math.cos(headYaw - runtime.yaw)) * 0.3;
        look.set(
          desired.x - Math.sin(yaw + blend) * 3,
          desired.y - free.pitch * 3,
          desired.z - Math.cos(yaw + blend) * 3,
        );
      } else {
        look.set(
          position[0] - Math.sin(cameraYaw) * 0.8,
          position[1] + originY + (inElevator ? 1 : -0.4),
          position[2] - Math.cos(cameraYaw) * 0.8,
        );
      }
      matrix.lookAt(desired, look, owned.up);
      q.setFromRotationMatrix(matrix);
    }
    const fov =
      mode === 'overview' ? overview.current.fov : first ? CHARACTER_CONFIG.camera.firstPersonFovDeg : 52;
    const maxAngle =
      CHARACTER_CONFIG.camera.maxAngularRateDegPerSec * Math.PI / 180 * Math.max(0, dt);
    const rotateToward = (target: Quaternion) => {
      const angle = owned.quaternion.angleTo(target);
      if (angle <= maxAngle || angle < 1e-7) {
        owned.quaternion.copy(target);
      } else {
        owned.quaternion.rotateTowards(target, maxAngle);
      }
    };
    if (transition.t < 1) {
      owned.position.lerpVectors(source.position, desired, transition.t);
      if (mode !== 'overview') {
        owned.position.y += Math.sin(Math.PI * transition.t) * 2.5;
      }
      transitionedQ.copy(source.quaternion).slerp(q, transition.t);
      rotateToward(transitionedQ);
      owned.fov = source.fov + (fov - source.fov) * transition.t;
    } else {
      const halfLife = CHARACTER_CONFIG.camera.smoothingHalfLifeSeconds;
      owned.position.lerp(desired, 1 - Math.exp(-Math.LN2 * Math.max(0, dt) / halfLife));
      rotateToward(q);
      owned.fov = fov;
    }
    if (mode !== 'overview') {
      candidate[0] = owned.position.x;
      candidate[1] = owned.position.y;
      candidate[2] = owned.position.z;
      const floorY =
        document.floors.find((floor) => floor.source.id === floorId)?.source.heightOffset ?? 0;
      safeCamera(
        focus,
        candidate,
        obstacles,
        floorY + originY,
        safe,
        samplePoint,
        runtime.path.legs[runtime.leg]?.connector?.portalId,
      );
      owned.position.set(...safe);
    }
    if (projectedFov.current !== owned.fov) {
      owned.updateProjectionMatrix();
      projectedFov.current = owned.fov;
    }
    if (
      transition.t < 1 ||
      owned.position.distanceToSquared(desired) > 0.000001 ||
      owned.quaternion.angleTo(q) > 0.001
    ) {
      invalidate();
    }
  });
  return null;
}
