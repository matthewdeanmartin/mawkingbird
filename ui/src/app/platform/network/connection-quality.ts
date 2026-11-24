/**
 * The connection-quality model: a pure function from recent request samples
 * and browser hints to a verdict the UI can act on.
 *
 * Kept free of Angular and of storage so every rule can be unit-tested with
 * hand-built samples. The thresholds are a first guess written down in
 * spec/low-bandwidth-offline.md; tune them against field data, not against a
 * single bad afternoon.
 *
 * ## What counts as evidence
 *
 * - **Unreachable** (status 0) is evidence against the *network*: no response
 *   arrived at all.
 * - **Answered** (any status, 4xx/5xx included) is evidence *for* the network,
 *   even when the call failed: the bytes made the round trip.
 * - **Abandoned** is a request its caller gave up on after
 *   {@link ABANDON_MIN_MS}. Callers time out with their own `timeout(...)`, which
 *   the interceptor chain sees only as an unsubscribe, so a long unanswered wait
 *   would otherwise vanish from the record. Quick cancellations are navigation,
 *   not weather, and are dropped before they get here.
 */

export type ConnectionVerdict = 'unknown' | 'good' | 'slow' | 'flaky' | 'offline';

export type SampleOutcome = 'ok' | 'answered-error' | 'unreachable' | 'abandoned';

export interface ConnectionSample {
  /** Epoch ms when the request settled (or was abandoned). */
  at: number;
  /** Elapsed time, ms. */
  ms: number;
  outcome: SampleOutcome;
  /**
   * Whether this sample may count toward the latency median: an ordinary read
   * (GET of an endpoint that is fast by design). Search, uploads and federated
   * fetches are slow on any network and would make a good connection look bad.
   */
  latency: boolean;
  /** Whether it went to the home server (as opposed to a peer, proxy or this site). */
  home: boolean;
  /** Response size from `Content-Length`, when the server exposed one. */
  bytes?: number;
}

export interface BrowserHints {
  /** `navigator.onLine`. False is reliable; true only means "has some network". */
  online: boolean;
  /** Network Information API `effectiveType` (Chromium only). */
  effectiveType?: string;
  /** Estimated downlink, Mbit/s (Chromium only). */
  downlinkMbps?: number;
  /** Estimated round trip, ms (Chromium only). */
  rttMs?: number;
  /** The user asked the browser to save data. */
  saveData?: boolean;
}

export type VerdictReason =
  | 'too-few-samples'
  | 'browser-offline'
  | 'nothing-gets-through'
  | 'many-failures'
  | 'slow-responses'
  | 'browser-reports-slow'
  | 'normal';

export interface ConnectionAssessment {
  verdict: ConnectionVerdict;
  reason: VerdictReason;
  /**
   * Who appears to be at fault when requests fail: the user's `connection`,
   * the home `server` (it fails while other hosts answer), or null when nothing
   * is failing or there is no way to tell.
   */
  blame: 'connection' | 'server' | null;
  /** Samples considered. */
  samples: number;
  /** Median latency of ordinary reads, or null with too few of them. */
  medianMs: number | null;
  /** Share of considered samples that never got an answer, or null with too few. */
  failureShare: number | null;
}

/** How far back the verdict looks. */
export const WINDOW_MS = 120_000;
/** At most this many of the newest samples are considered. */
export const WINDOW_MAX_SAMPLES = 30;
/** Below this many samples (and no browser signal) the verdict is `unknown`. */
export const MIN_SAMPLES = 3;
/** Shortest wait that counts as an abandoned request rather than a navigation. */
export const ABANDON_MIN_MS = 5_000;
/** Median ordinary-read latency at or above which the connection is `slow`. */
export const SLOW_MEDIAN_MS = 1_500;
/** Latency samples needed before the median is trusted. */
export const MIN_LATENCY_SAMPLES = 4;
/** Failure share at or above which the connection is `flaky`. */
export const FLAKY_FAILURE_SHARE = 0.2;
/** Samples needed before the failure share is trusted. */
export const MIN_FAILURE_SAMPLES = 5;
/** One lost request is an accident, not a pattern, however few others there were. */
export const FLAKY_MIN_FAILURES = 2;
/** Trailing unreachable requests that, with no recent answer, mean `offline`. */
export const OFFLINE_TRAILING_FAILURES = 3;
/** "No recent answer" for the offline rule. */
export const OFFLINE_QUIET_MS = 30_000;

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

/** Severity order, worst last; used for "worst verdict this minute". */
export const VERDICT_RANK: Record<ConnectionVerdict, number> = {
  unknown: 0,
  good: 1,
  slow: 2,
  flaky: 3,
  offline: 4,
};

export function isBad(verdict: ConnectionVerdict): boolean {
  return verdict === 'slow' || verdict === 'flaky' || verdict === 'offline';
}

function failed(s: ConnectionSample): boolean {
  return s.outcome === 'unreachable' || s.outcome === 'abandoned';
}

function answered(s: ConnectionSample): boolean {
  return s.outcome === 'ok' || s.outcome === 'answered-error';
}

/** The samples the verdict is computed from, oldest first. */
export function windowOf(samples: readonly ConnectionSample[], now: number): ConnectionSample[] {
  return samples.filter((s) => now - s.at <= WINDOW_MS && s.at <= now).slice(-WINDOW_MAX_SAMPLES);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Judge the connection.
 *
 * Order matters: offline beats flaky beats slow. A connection that loses one
 * request in three is described by its losses, not by how long the survivors took.
 */
export function assess(
  samples: readonly ConnectionSample[],
  hints: BrowserHints,
  now: number,
): ConnectionAssessment {
  let recent = windowOf(samples, now);

  // Is it the home server rather than the connection? If the home server's
  // requests fail while some other host answered recently, the network is
  // demonstrably working. Judge the connection on the other hosts alone and
  // say the server is the problem.
  const homeFailing = recent.some((s) => s.home && failed(s));
  const elsewhereAnswering = recent.some((s) => !s.home && answered(s));
  const homeAnswering = recent.some((s) => s.home && answered(s) && now - s.at <= OFFLINE_QUIET_MS);
  const serverAtFault = homeFailing && elsewhereAnswering && !homeAnswering;
  if (serverAtFault) {
    recent = recent.filter((s) => !s.home);
  }

  const latencies = recent.filter((s) => s.latency && s.outcome !== 'unreachable').map((s) => s.ms);
  const medianMs = latencies.length >= MIN_LATENCY_SAMPLES ? median(latencies) : null;
  const failures = recent.filter(failed).length;
  const failureShare = recent.length >= MIN_FAILURE_SAMPLES ? failures / recent.length : null;
  const base = { samples: recent.length, medianMs, failureShare };
  const blame = serverAtFault ? 'server' : failures > 0 ? 'connection' : null;

  if (!hints.online) {
    return { ...base, verdict: 'offline', reason: 'browser-offline', blame: 'connection' };
  }

  let trailing = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i].outcome === 'unreachable'; i--) {
    trailing++;
  }
  const lastAnswer = Math.max(-Infinity, ...recent.filter(answered).map((s) => s.at));
  if (trailing >= OFFLINE_TRAILING_FAILURES && now - lastAnswer > OFFLINE_QUIET_MS) {
    return { ...base, verdict: 'offline', reason: 'nothing-gets-through', blame: 'connection' };
  }

  if (
    failureShare !== null &&
    failures >= FLAKY_MIN_FAILURES &&
    failureShare >= FLAKY_FAILURE_SHARE
  ) {
    return { ...base, verdict: 'flaky', reason: 'many-failures', blame };
  }

  if (medianMs !== null && medianMs >= SLOW_MEDIAN_MS) {
    return { ...base, verdict: 'slow', reason: 'slow-responses', blame };
  }

  if (hints.effectiveType && SLOW_EFFECTIVE_TYPES.has(hints.effectiveType)) {
    return { ...base, verdict: 'slow', reason: 'browser-reports-slow', blame };
  }

  if (recent.length < MIN_SAMPLES) {
    return { ...base, verdict: 'unknown', reason: 'too-few-samples', blame };
  }

  return { ...base, verdict: 'good', reason: 'normal', blame };
}

/** "240 ms", "1.8 s": a measured reply time for compact display; null passes through. */
export function formatReplyTime(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
