import { beforeEach, describe, expect, test } from 'bun:test';
import { demoLayout } from '../src/frontend/entities/building/model/building-schema.ts';
import { useLayoutStore } from '../src/frontend/entities/building/model/layout-store.ts';
import { useWorldStore } from '../src/frontend/entities/viewer/model/viewer-store.ts';

describe('teleport and autopilot', () => {
  beforeEach(() => {
    useLayoutStore.getState().update(demoLayout);
    useWorldStore.setState({
      currentFloorId: 'F1',
      autopilot: null,
      localAvatar: {
        id: 'local',
        position: [0, 1.2, 6],
        rotationY: 0,
        floorId: 'F1',
        animationState: 'idle',
      },
    });
  });

  test('teleport moves to the room entrance on its floor', () => {
    expect(useWorldStore.getState().teleportToRoom('room-101')).toBe(true);
    const avatar = useWorldStore.getState().localAvatar;
    expect(avatar.floorId).toBe('F1');
    expect(avatar.position[1]).toBeCloseTo(1.2, 6);
    expect(useWorldStore.getState().autopilot).toBeNull();
  });

  test('teleport rejects unknown rooms without moving', () => {
    const before = useWorldStore.getState().localAvatar.position;
    expect(useWorldStore.getState().teleportToRoom('no-such-room')).toBe(false);
    expect(useWorldStore.getState().localAvatar.position).toEqual(before);
  });

  test('autopilot resolves a route and cancellation clears it', async () => {
    expect(await useWorldStore.getState().startAutopilot('room-101')).toBe(true);
    const autopilot = useWorldStore.getState().autopilot;
    expect(autopilot?.destinationId).toBe('room-101');
    expect(autopilot?.waypoints.length ?? 0).toBeGreaterThan(0);
    const last = autopilot?.waypoints.at(-1);
    expect(last).toBeDefined();
    useWorldStore.getState().cancelAutopilot();
    expect(useWorldStore.getState().autopilot).toBeNull();
    expect(useWorldStore.getState().localAvatar.animationState).toBe('idle');
  });

  test('advancing consumes waypoints and stops at the destination', async () => {
    await useWorldStore.getState().startAutopilot('room-101');
    for (let step = 0; step < 500; step++) {
      const autopilot = useWorldStore.getState().autopilot;
      if (!autopilot) {
        break;
      }
      const position = useWorldStore.getState().localAvatar.position;
      useWorldStore.getState().advanceAutopilot(position, 1);
    }
    expect(useWorldStore.getState().autopilot).toBeNull();
    const [x, , z] = useWorldStore.getState().localAvatar.position;
    expect(Math.hypot(x - 5, z - 0)).toBeLessThan(0.5);
  });

  test('autopilot rejects unknown rooms', async () => {
    expect(await useWorldStore.getState().startAutopilot('no-such-room')).toBe(false);
    expect(useWorldStore.getState().autopilot).toBeNull();
  });
});
