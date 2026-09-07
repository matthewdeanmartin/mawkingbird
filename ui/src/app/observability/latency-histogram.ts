/**
 * Approximate latency percentiles from fixed histogram buckets.
 *
 * ## Why a histogram and not mean ± stddev
 *
 * {@link EndpointStat} already keeps Σms and Σms², which makes mean and standard
 * deviation free. For response times that pairing is actively misleading: the
 * distribution is right-skewed — a long tail of search and cold-cache calls
 * dragging a mean that no individual call is near — so `mean − sd` routinely
 * lands below zero, implying latencies that cannot exist. A band drawn from it
 * would be a band around a number the user never experiences.
 *
 * A histogram gives order statistics instead. The median is what a call
 * *typically* costs and p95 is what the bad ones cost, and neither moves when
 * one 30-second timeout lands in the sample.
 *
 * ## Why these bucket edges
 *
 * Log-spaced, roughly 1.6× apart from 1 ms to 32 s, then an overflow bucket.
 * Latency is perceived multiplicatively — the difference between 10 ms and
 * 20 ms matters as much as between 1 s and 2 s — so equal-ratio buckets put
 * resolution where it is read. {@link BUCKET_COUNT} edges cost one small-int
 * array per day per series, which is why a day of samples costs the same as a
 * single call.
 *
 * The resulting percentile is exact to within one bucket width, i.e. within
 * ~30% of the true value at any magnitude. That is far better than the chart
 * can draw, and the honest alternative — keeping every sample — is the thing
 * the whole storage scheme exists to avoid.
 */

/** Upper edge (inclusive, ms) of each histogram bucket. */
export const BUCKET_EDGES: readonly number[] = buildEdges();

/** Number of buckets, including the final overflow bucket. */
export const BUCKET_COUNT = BUCKET_EDGES.length;

function buildEdges(): number[] {
  const edges: number[] = [];
  let edge = 1;
  while (edge < 32_768) {
    edges.push(Math.round(edge));
    edge *= 1.6;
  }
  // Overflow: anything slower than the last finite edge lands here.
  edges.push(Infinity);
  return edges;
}

/** The bucket index a duration falls in. Never out of range. */
export function bucketFor(ms: number): number {
  const v = Math.max(0, ms);
  for (let i = 0; i < BUCKET_EDGES.length; i++) {
    if (v <= BUCKET_EDGES[i]) {
      return i;
    }
  }
  return BUCKET_EDGES.length - 1;
}

/** Add one sample to a histogram, in place. */
export function addSample(hist: number[], ms: number): void {
  hist[bucketFor(ms)]++;
}

/** A zeroed histogram. */
export function emptyHistogram(): number[] {
  return new Array<number>(BUCKET_COUNT).fill(0);
}

/** Total samples in a histogram. */
export function histogramCount(hist: readonly number[]): number {
  let n = 0;
  for (const c of hist) {
    n += c;
  }
  return n;
}

/** Sum two histograms into a new one (for merging days or servers). */
export function mergeHistograms(a: readonly number[], b: readonly number[]): number[] {
  const out = emptyHistogram();
  for (let i = 0; i < BUCKET_COUNT; i++) {
    out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return out;
}

/**
 * The value at `q` (0–1) in milliseconds, or null if the histogram is empty.
 *
 * Reports the bucket's *representative* value rather than its upper edge —
 * the geometric mean of the bucket's bounds, which is the centre of a
 * log-spaced bucket the same way the arithmetic mean is for a linear one.
 * Using the upper edge would bias every reported percentile upward by most of
 * a bucket width.
 */
export function percentile(hist: readonly number[], q: number): number | null {
  const total = histogramCount(hist);
  if (total === 0) {
    return null;
  }
  // Strictly greater, not `>=`: at an exact boundary — p95 of 100 samples
  // where the fastest 95 are identical — `>=` would return the fast bucket and
  // report a p95 that excludes the entire slow tail, which is the one thing a
  // p95 exists to show. Tipping into the next bucket keeps the tail visible.
  const target = q * total;
  let seen = 0;
  for (let i = 0; i < BUCKET_COUNT; i++) {
    seen += hist[i] ?? 0;
    if (seen > target) {
      return representative(i);
    }
  }
  return representative(BUCKET_COUNT - 1);
}

/** The millisecond value a bucket index stands for. */
export function representative(index: number): number {
  const upper = BUCKET_EDGES[index];
  const lower = index === 0 ? 0 : BUCKET_EDGES[index - 1];
  if (!Number.isFinite(upper)) {
    // Overflow bucket: report its lower edge; anything else invents a number.
    return lower;
  }
  if (lower === 0) {
    return upper / 2;
  }
  return Math.round(Math.sqrt(lower * upper));
}
