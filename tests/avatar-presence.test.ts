import { beforeEach, describe, expect, test } from 'bun:test';
import { interpolateAvatar } from '../src/frontend/entities/viewer/model/interpolate-avatar.ts';
import { useWorldStore } from '../src/frontend/entities/viewer/model/viewer-store.ts';
import type { AvatarState } from '../src/frontend/entities/building/model/building-schema.ts';

function snapshot(overrides: Partial<AvatarState> = {}): AvatarState {
  return {
    id: 'peer-1',
    position: [0, 1.2, 6],
    rotationY: 0,
    floorId: 'F1',
    animationState: 'idle',
    ...overrides,
  };
}

describe('interpolateAvatar', () => {
  test('blends position linearly at the midpoint', () => {
    const from = snapshot({ position: [0, 0, 0] });
    const to = snapshot({ position: [2, 4, 6] });
    expect(interpolateAvatar(from, to, 0.5).position).toEqual([1, 2, 3]);
  });

  test('clamps t to the snapshot endpoints', () => {
    const from = snapshot({ position: [0, 0, 0] });
    const to = snapshot({ position: [2, 4, 6] });
    expect(interpolateAvatar(from, to, 0).position).toEqual([0, 0, 0]);
    expect(interpolateAvatar(from, to, 1).position).toEqual([2, 4, 6]);
    expect(interpolateAvatar(from, to, 99).position).toEqual([2, 4, 6]);
  });

  test('takes the shortest yaw path across ±π', () => {
    const from = snapshot({ rotationY: 3 });
    const to = snapshot({ rotationY: -3 });
    const mid = interpolateAvatar(from, to, 0.5).rotationY;
    expect(Math.abs(mid)).toBeGreaterThan(Math.PI - 0.01);
  });

  test('follows the target floor, id, and animation state', () => {
    const from = snapshot({ id: 'peer-1', floorId: 'F1', animationState: 'idle' });
    const to = snapshot({ id: 'peer-1', floorId: 'B1', animationState: 'walk' });
    const blended = interpolateAvatar(from, to, 0.5);
    expect(blended.floorId).toBe('B1');
    expect(blended.animationState).toBe('walk');
  });
});

describe('remote avatar lifecycle', () => {
  beforeEach(() => {
    useWorldStore.getState().clearRemoteAvatars();
  });

  test('upserts and removes individual peers', () => {
    const store = useWorldStore.getState();
    store.upsertRemoteAvatar(snapshot({ id: 'peer-1' }));
    store.upsertRemoteAvatar(snapshot({ id: 'peer-2' }));
    expect(useWorldStore.getState().remoteAvatars.size).toBe(2);
    useWorldStore.getState().removeRemoteAvatar('peer-1');
    expect(useWorldStore.getState().remoteAvatars.has('peer-1')).toBe(false);
    expect(useWorldStore.getState().remoteAvatars.has('peer-2')).toBe(true);
  });

  test('clearing removes every peer without touching the local avatar', () => {
    const before = useWorldStore.getState().localAvatar;
    useWorldStore.getState().upsertRemoteAvatar(snapshot({ id: 'peer-1' }));
    useWorldStore.getState().clearRemoteAvatars();
    expect(useWorldStore.getState().remoteAvatars.size).toBe(0);
    expect(useWorldStore.getState().localAvatar).toEqual(before);
  });

  test('local avatar updates never enter the remote map', () => {
    useWorldStore.getState().moveLocalAvatar({ floorId: 'B1' });
    expect(useWorldStore.getState().remoteAvatars.size).toBe(0);
    useWorldStore.getState().moveLocalAvatar({ floorId: 'F1' });
  });
});
