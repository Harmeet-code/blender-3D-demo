import { OrthographicCamera, PerspectiveCamera, type Vector3 } from 'three';

export type CameraViewport = 'builder' | 'preview';
export interface ViewportCameraSnapshot {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  up: [number, number, number];
  target: [number, number, number];
  zoom: number;
  fov: number;
  near: number;
  far: number;
  projection: 'perspective' | 'orthographic';
  aspect?: number;
  frustum?: [number, number, number, number];
}

export type ViewportCamera = PerspectiveCamera | OrthographicCamera;

const STORAGE_KEY = 'floor-plan-builder.viewport-cameras.v1';
type SnapshotMap = Record<string, ViewportCameraSnapshot>;
const snapshots: SnapshotMap = {};
let loaded = false;
let persistTimer: number | null = null;
let pageHideSubscribed = false;

export function viewportCameraKey(viewport: CameraViewport, floorId: string): string {
  return `${viewport}:${encodeURIComponent(floorId)}`;
}

function isSnapshot(value: unknown): value is ViewportCameraSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<ViewportCameraSnapshot>;
  return (
    Array.isArray(item.position) &&
    item.position.length === 3 &&
    item.position.every(Number.isFinite) &&
    Array.isArray(item.quaternion) &&
    item.quaternion.length === 4 &&
    item.quaternion.every(Number.isFinite) &&
    Array.isArray(item.up) &&
    item.up.length === 3 &&
    item.up.every(Number.isFinite) &&
    Array.isArray(item.target) &&
    item.target.length === 3 &&
    item.target.every(Number.isFinite) &&
    Number.isFinite(item.zoom) &&
    Number.isFinite(item.fov) &&
    Number.isFinite(item.near) &&
    Number.isFinite(item.far) &&
    (item.aspect === undefined || Number.isFinite(item.aspect)) &&
    (item.frustum === undefined ||
      (Array.isArray(item.frustum) &&
        item.frustum.length === 4 &&
        item.frustum.every(Number.isFinite))) &&
    (item.projection === 'perspective' || item.projection === 'orthographic')
  );
}

export function captureViewportCameraSnapshot(
  camera: ViewportCamera,
  target: Vector3,
): ViewportCameraSnapshot {
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    up: camera.up.toArray(),
    target: target.toArray(),
    zoom: camera.zoom,
    fov: camera instanceof PerspectiveCamera ? camera.fov : 45,
    near: camera.near,
    far: camera.far,
    projection: camera instanceof OrthographicCamera ? 'orthographic' : 'perspective',
    ...(camera instanceof PerspectiveCamera ? { aspect: camera.aspect } : {}),
    ...(camera instanceof OrthographicCamera
      ? {
          frustum: [camera.left, camera.right, camera.top, camera.bottom] as [
            number,
            number,
            number,
            number,
          ],
        }
      : {}),
  };
}

export function restoreViewportCameraSnapshot(
  camera: ViewportCamera,
  controls: { target: Vector3; update: () => void },
  snapshot: ViewportCameraSnapshot,
) {
  camera.position.fromArray(snapshot.position);
  camera.quaternion.fromArray(snapshot.quaternion);
  camera.up.fromArray(snapshot.up);
  camera.zoom = snapshot.zoom;
  camera.near = snapshot.near;
  camera.far = snapshot.far;
  if (camera instanceof PerspectiveCamera) {
    camera.fov = snapshot.fov;
    if (snapshot.aspect !== undefined) {
      camera.aspect = snapshot.aspect;
    }
  }
  if (camera instanceof OrthographicCamera && snapshot.frustum) {
    [camera.left, camera.right, camera.top, camera.bottom] = snapshot.frustum;
  }
  camera.updateProjectionMatrix();
  controls.target.fromArray(snapshot.target);
  controls.update();
  // OrbitControls synchronizes its internal spherical state in update(); restore the exact pose.
  camera.position.fromArray(snapshot.position);
  camera.quaternion.fromArray(snapshot.quaternion);
  camera.up.fromArray(snapshot.up);
}

function load() {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (isSnapshot(value)) {
        snapshots[key] = value;
      }
    }
  } catch {
    // Storage can be unavailable in private browsing or when quota is exhausted.
  }
}

function queuePersist() {
  if (typeof window === 'undefined' || persistTimer !== null) {
    return;
  }
  if (!pageHideSubscribed) {
    window.addEventListener('pagehide', persistNow);
    pageHideSubscribed = true;
  }
  // OrbitControls can emit many changes per gesture; serialize after input settles.
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    } catch {
      // The live session still retains its in-memory snapshots.
    }
  }, 250);
}

function persistNow() {
  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // The in-memory snapshot remains available for the current session.
  }
}

export function readViewportCameraSnapshot(
  viewport: CameraViewport,
  floorId: string,
): ViewportCameraSnapshot | null {
  load();
  return snapshots[viewportCameraKey(viewport, floorId)] ?? null;
}

export function saveViewportCameraSnapshot(
  viewport: CameraViewport,
  floorId: string,
  snapshot: ViewportCameraSnapshot,
) {
  if (!isSnapshot(snapshot)) {
    return;
  }
  load();
  snapshots[viewportCameraKey(viewport, floorId)] = snapshot;
  queuePersist();
}

export function clearViewportCameraSnapshots() {
  for (const key of Object.keys(snapshots)) {
    delete snapshots[key];
  }
  loaded = true;
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Clearing in-memory state is sufficient if storage is unavailable.
  }
}

// Test-only reset avoids leaking module state between independent storage cases.
export function resetViewportCameraSnapshotsForTests() {
  clearViewportCameraSnapshots();
  loaded = false;
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
  }
  persistTimer = null;
}
