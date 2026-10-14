export function frameStatistics(samples: readonly number[], targetMs: number) {
  const sorted = samples
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? Infinity;
  const elapsed = sorted.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: sorted.length,
    averageFps: elapsed > 0 ? (sorted.length * 1000) / elapsed : 0,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    passed: sorted.length > 0 && percentile(0.95) <= targetMs,
  };
}
