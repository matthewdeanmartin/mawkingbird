import { ConnectionSample, ConnectionVerdict, VERDICT_RANK } from './connection-quality';

/**
 * A day of connection history at one-minute resolution, small enough to keep in
 * localStorage and rewrite every few seconds.
 *
 * The point of keeping it at all: by the time someone notices the app is
 * failing, the evidence of it getting worse (slowing replies, a rising failure
 * rate) has already happened. A reload, a crash or closing the tab must not
 * throw that away, or all the diagnostics page can say is "offline".
 *
 * Only minutes with activity are stored, so a quiet day costs almost nothing.
 * Nothing here identifies what was read or where the person was: counts, timing
 * bins and the browser's online/offline changes only.
 */

export const HISTORY_BUCKET_MS = 60_000;
export const HISTORY_SPAN_MS = 24 * 60 * 60_000;
/** Upper edges (ms) of the latency bins; the last bin is everything above. */
export const LATENCY_BIN_EDGES: readonly number[] = [250, 500, 1_000, 2_500, 5_000];
export const LATENCY_BIN_COUNT = LATENCY_BIN_EDGES.length + 1;
/** Online/offline changes kept; a day of a flapping connection is still bounded. */
export const MAX_TRANSITIONS = 400;

export interface MinuteBucket {
  /** Bucket start, epoch ms (a multiple of {@link HISTORY_BUCKET_MS}). */
  t: number;
  /** Requests that settled or were abandoned in this minute. */
  n: number;
  /** Of those, how many never got an answer. */
  fail: number;
  /** Latency histogram of ordinary reads ({@link LATENCY_BIN_EDGES}). */
  lat: number[];
  /** Response bytes and the time they took, for throughput when sizes are known. */
  bytes: number;
  xferMs: number;
  /** The worst verdict reached during this minute. */
  worst: ConnectionVerdict;
}

export interface Transition {
  at: number;
  online: boolean;
}

export interface ConnectionHistory {
  buckets: MinuteBucket[];
  transitions: Transition[];
}

export function emptyHistory(): ConnectionHistory {
  return { buckets: [], transitions: [] };
}

export function latencyBin(ms: number): number {
  const index = LATENCY_BIN_EDGES.findIndex((edge) => ms < edge);
  return index === -1 ? LATENCY_BIN_EDGES.length : index;
}

function bucketAt(history: ConnectionHistory, at: number): MinuteBucket {
  const t = Math.floor(at / HISTORY_BUCKET_MS) * HISTORY_BUCKET_MS;
  const last = history.buckets.at(-1);
  if (last && last.t === t) {
    return last;
  }
  const fresh: MinuteBucket = {
    t,
    n: 0,
    fail: 0,
    lat: new Array(LATENCY_BIN_COUNT).fill(0),
    bytes: 0,
    xferMs: 0,
    worst: 'unknown',
  };
  // Samples arrive in settle order, which is close to time order; a sample
  // for an older minute (a long request finishing late) is folded into the
  // newest bucket rather than reordering the array.
  if (last && last.t > t) {
    return last;
  }
  history.buckets.push(fresh);
  return fresh;
}

export function addSample(history: ConnectionHistory, sample: ConnectionSample): void {
  const bucket = bucketAt(history, sample.at);
  bucket.n++;
  if (sample.outcome === 'unreachable' || sample.outcome === 'abandoned') {
    bucket.fail++;
  }
  if (sample.latency && sample.outcome !== 'unreachable') {
    bucket.lat[latencyBin(sample.ms)]++;
  }
  if (sample.bytes && sample.outcome === 'ok') {
    bucket.bytes += sample.bytes;
    bucket.xferMs += sample.ms;
  }
}

/** Raise this minute's worst verdict; `unknown` never lowers anything. */
export function noteVerdict(
  history: ConnectionHistory,
  at: number,
  verdict: ConnectionVerdict,
): void {
  if (verdict === 'unknown') {
    return;
  }
  const bucket = bucketAt(history, at);
  if (VERDICT_RANK[verdict] > VERDICT_RANK[bucket.worst]) {
    bucket.worst = verdict;
  }
}

export function noteTransition(history: ConnectionHistory, at: number, online: boolean): void {
  if (history.transitions.at(-1)?.online === online) {
    return;
  }
  history.transitions.push({ at, online });
  if (history.transitions.length > MAX_TRANSITIONS) {
    history.transitions.splice(0, history.transitions.length - MAX_TRANSITIONS);
  }
}

export function prune(history: ConnectionHistory, now: number): void {
  const cutoff = now - HISTORY_SPAN_MS;
  history.buckets = history.buckets.filter((b) => b.t >= cutoff);
  // Keep the last transition before the cutoff: it says what state the window opened in.
  const firstInside = history.transitions.findIndex((t) => t.at >= cutoff);
  if (firstInside > 1) {
    history.transitions.splice(0, firstInside - 1);
  } else if (firstInside === -1 && history.transitions.length > 1) {
    history.transitions.splice(0, history.transitions.length - 1);
  }
}

/** Totals and a combined histogram over the buckets that start at or after `since`. */
export interface HistorySummary {
  requests: number;
  failures: number;
  lat: number[];
  bytes: number;
  xferMs: number;
  worst: ConnectionVerdict;
  /** Time spent with the browser reporting offline. */
  offlineMs: number;
}

export function summarize(history: ConnectionHistory, since: number, now: number): HistorySummary {
  const summary: HistorySummary = {
    requests: 0,
    failures: 0,
    lat: new Array(LATENCY_BIN_COUNT).fill(0),
    bytes: 0,
    xferMs: 0,
    worst: 'unknown',
    offlineMs: offlineTime(history.transitions, since, now),
  };
  for (const b of history.buckets) {
    if (b.t + HISTORY_BUCKET_MS <= since) continue;
    summary.requests += b.n;
    summary.failures += b.fail;
    b.lat.forEach((count, i) => (summary.lat[i] += count));
    summary.bytes += b.bytes;
    summary.xferMs += b.xferMs;
    if (VERDICT_RANK[b.worst] > VERDICT_RANK[summary.worst]) summary.worst = b.worst;
  }
  return summary;
}

/** Milliseconds between `since` and `now` that the browser reported being offline. */
export function offlineTime(
  transitions: readonly Transition[],
  since: number,
  now: number,
): number {
  let total = 0;
  let offlineFrom: number | null = null;
  for (const t of transitions) {
    if (!t.online && offlineFrom === null) {
      offlineFrom = t.at;
    } else if (t.online && offlineFrom !== null) {
      total += Math.max(0, Math.min(t.at, now) - Math.max(offlineFrom, since));
      offlineFrom = null;
    }
  }
  if (offlineFrom !== null) {
    total += Math.max(0, now - Math.max(offlineFrom, since));
  }
  return total;
}

/**
 * The latency bin holding the median, as an index into
 * {@link LATENCY_BIN_EDGES}, or null for an empty histogram. Bins rather than a
 * number because a bin is all a day of minute buckets can honestly report.
 */
export function medianBin(lat: readonly number[]): number | null {
  const total = lat.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let seen = 0;
  for (let i = 0; i < lat.length; i++) {
    seen += lat[i];
    if (seen * 2 >= total) return i;
  }
  return lat.length - 1;
}

/** "under 250 ms", "1–2.5 s", "over 5 s": what one latency bin honestly says. */
export function binLabel(bin: number | null): string {
  if (bin === null) return '—';
  const edges = LATENCY_BIN_EDGES;
  const fmt = (ms: number) => (ms < 1000 ? `${ms} ms` : `${ms / 1000} s`);
  if (bin === 0) return `< ${fmt(edges[0])}`;
  if (bin >= edges.length) return `> ${fmt(edges[edges.length - 1])}`;
  return `${fmt(edges[bin - 1])}–${fmt(edges[bin])}`;
}

// ------------------------------------------------------------------- storage

const VERDICT_CODES: readonly ConnectionVerdict[] = ['unknown', 'good', 'slow', 'flaky', 'offline'];

/** Version 1: `b` = [minute, n, fail, ...lat, bytes, xferMs, worst], `o` = [at, 0|1]. */
interface StoredHistory {
  v: 1;
  b: number[][];
  o: [number, number][];
}

export function serialize(history: ConnectionHistory): string {
  const stored: StoredHistory = {
    v: 1,
    b: history.buckets.map((b) => [
      b.t / HISTORY_BUCKET_MS,
      b.n,
      b.fail,
      ...b.lat,
      b.bytes,
      Math.round(b.xferMs),
      VERDICT_CODES.indexOf(b.worst),
    ]),
    o: history.transitions.map((t) => [t.at, t.online ? 1 : 0]),
  };
  return JSON.stringify(stored);
}

/** Parse a stored blob; anything malformed gives an empty history, never an error. */
export function deserialize(raw: string | null): ConnectionHistory {
  if (!raw) return emptyHistory();
  try {
    const stored = JSON.parse(raw) as Partial<StoredHistory>;
    if (stored?.v !== 1 || !Array.isArray(stored.b) || !Array.isArray(stored.o)) {
      return emptyHistory();
    }
    const width = 3 + LATENCY_BIN_COUNT + 3;
    const buckets: MinuteBucket[] = stored.b
      .filter((row) => Array.isArray(row) && row.length === width && row.every(Number.isFinite))
      .map((row) => ({
        t: row[0] * HISTORY_BUCKET_MS,
        n: row[1],
        fail: row[2],
        lat: row.slice(3, 3 + LATENCY_BIN_COUNT),
        bytes: row[3 + LATENCY_BIN_COUNT],
        xferMs: row[4 + LATENCY_BIN_COUNT],
        worst: VERDICT_CODES[row[5 + LATENCY_BIN_COUNT]] ?? 'unknown',
      }))
      .sort((a, b) => a.t - b.t);
    const transitions: Transition[] = stored.o
      .filter((row) => Array.isArray(row) && Number.isFinite(row[0]))
      .map(([at, online]) => ({ at, online: online === 1 }));
    return { buckets, transitions };
  } catch {
    return emptyHistory();
  }
}
