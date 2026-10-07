import { describe, expect, test } from 'bun:test';
import { useAssetStatus } from '../src/frontend/entities/asset/model/asset-status.ts';

describe('asset status state', () => {
  test('tracks failed URLs immutably and clears them when retrying', () => {
    const { revision } = useAssetStatus.getState();
    const state = useAssetStatus.getState();
    state.markFailedUrl('/assets/broken.glb');
    state.markFailedUrl('/assets/broken.glb');
    state.setStatus('asset-1', { kind: 'error', message: 'Asset failed' });

    expect(useAssetStatus.getState().failedUrls).toEqual(['/assets/broken.glb']);

    useAssetStatus.getState().retry();
    expect(useAssetStatus.getState()).toMatchObject({
      failedUrls: [],
      statuses: {},
      revision: revision + 1,
    });
  });
});
