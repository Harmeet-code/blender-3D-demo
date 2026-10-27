import { describe, expect, test } from 'bun:test';
import { builderLoadingVisible } from './BuilderLoading.tsx';

describe('builder loading gate', () => {
  test('waits for the delay before showing progress and keeps the first-frame gate', () => {
    const loading = {
      loading: true,
      phase: 'assets' as const,
      progress: 0.4,
      stableHighQualityFrame: false,
    };
    expect(builderLoadingVisible(loading, false)).toBe(false);
    expect(builderLoadingVisible(loading, true)).toBe(true);
    expect(
      builderLoadingVisible({ ...loading, loading: false, stableHighQualityFrame: false }, true),
    ).toBe(true);
    expect(
      builderLoadingVisible({ ...loading, loading: false, stableHighQualityFrame: true }, true),
    ).toBe(false);
  });

  test('shows a retryable error only after the delay', () => {
    const failure = {
      loading: false,
      phase: 'floor' as const,
      stableHighQualityFrame: false,
      error: 'Asset load failed',
    };
    expect(builderLoadingVisible(failure, false)).toBe(false);
    expect(builderLoadingVisible(failure, true)).toBe(true);
  });
});
