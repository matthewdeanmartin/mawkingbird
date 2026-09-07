import { describe, expect, it } from 'vitest';
import {
  BUCKET_COUNT,
  addSample,
  bucketFor,
  emptyHistogram,
  histogramCount,
  mergeHistograms,
  percentile,
  representative,
} from './latency-histogram';

/** A histogram holding `n` copies of each listed duration. */
function histOf(samples: number[]): number[] {
  const h = emptyHistogram();
  for (const s of samples) {
    addSample(h, s);
  }
  return h;
}

describe('bucketFor', () => {
  it('puts faster calls in lower buckets, monotonically', () => {
    const durations = [0, 1, 5, 25, 100, 800, 5_000, 30_000];
    const indices = durations.map(bucketFor);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
    }
  });

  it('lands anything absurdly slow in the overflow bucket rather than out of range', () => {
    expect(bucketFor(10 ** 9)).toBe(BUCKET_COUNT - 1);
  });

  it('treats a negative duration as zero', () => {
    expect(bucketFor(-5)).toBe(bucketFor(0));
  });
});

describe('percentile', () => {
  it('reports null for an empty histogram rather than a misleading zero', () => {
    expect(percentile(emptyHistogram(), 0.5)).toBeNull();
  });

  it('recovers the median of a uniform sample to within one bucket', () => {
    // 1..200ms, so the true median is ~100ms.
    const samples = Array.from({ length: 200 }, (_, i) => i + 1);
    const median = percentile(histOf(samples), 0.5);
    expect(median).not.toBeNull();
    expect(median!).toBeGreaterThan(60);
    expect(median!).toBeLessThan(160);
  });

  it('is not dragged by a single outlier, which is the whole point', () => {
    const typical = Array.from({ length: 99 }, () => 10);
    const withOutlier = percentile(histOf([...typical, 30_000]), 0.5);
    const without = percentile(histOf(typical), 0.5);
    expect(withOutlier).toBe(without);
  });

  it('puts p95 above the median for a skewed sample', () => {
    const samples = [
      ...Array.from({ length: 95 }, () => 10),
      ...Array.from({ length: 5 }, () => 4_000),
    ];
    const h = histOf(samples);
    expect(percentile(h, 0.95)!).toBeGreaterThan(percentile(h, 0.5)!);
  });
});

describe('mergeHistograms', () => {
  it('sums two histograms without mutating either', () => {
    const a = histOf([10, 10]);
    const b = histOf([10]);
    const merged = mergeHistograms(a, b);
    expect(histogramCount(merged)).toBe(3);
    expect(histogramCount(a)).toBe(2);
    expect(histogramCount(b)).toBe(1);
  });
});

describe('representative', () => {
  it('reports a value inside the bucket, not its upper edge', () => {
    const idx = bucketFor(100);
    expect(representative(idx)).toBeLessThanOrEqual(160);
    expect(representative(idx)).toBeGreaterThan(0);
  });
});
