import { afterEach, describe, expect, test } from 'bun:test';
import { blankDocument } from '../../model/adapter.ts';
import type { RouteResult } from '../model/route-schema.ts';
import { usePlaybackStore } from './playback-store.ts';

afterEach(() => usePlaybackStore.getState().exit());

describe('walkthrough playback camera mode', () => {
  test('starts in automatic first-person mode and exits the session cleanly', () => {
    const document = blankDocument('camera-test');
    const route: RouteResult = {
      waypoints: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      segments: [
        {
          kind: 'walk' as const,
          floorId: document.floors[0]!.source.id,
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          lengthM: 1,
          seconds: 1,
        },
      ],
      lengthM: 1,
      secondsEta: 1,
      instructions: ['Walk to the destination.'],
      option: 'shortest' as const,
      snapped: { start: false, dest: false },
      warnings: [],
    };
    usePlaybackStore.getState().setMode('overview');
    usePlaybackStore.getState().begin(route, document, document.floors[0]!.source.id);
    expect(usePlaybackStore.getState().session).not.toBeNull();
    expect(usePlaybackStore.getState().mode).toBe('first');

    usePlaybackStore.getState().exit();
    expect(usePlaybackStore.getState().session).toBeNull();
    expect(usePlaybackStore.getState().status).toBe('idle');
  });
});
