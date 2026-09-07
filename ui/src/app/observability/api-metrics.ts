import { Injectable, computed, inject, signal } from '@angular/core';
import { Server } from '../server';
import { documentedTemplate } from './api-docs';
import {
  BUCKET_COUNT,
  addSample,
  emptyHistogram,
  histogramCount,
  mergeHistograms,
  percentile,
} from './latency-histogram';

/**
 * Persisted per-endpoint call metrics + a compact time series + an error ring,
 * for the Observability page.
 *
 * ## Why this shape
 *
 * localStorage is a small, synchronous, shared budget (a few MB for the whole
 * origin). Storing one record per API call would blow through it in a busy
 * session, so nothing here grows with call *count*:
 *
 *  - **Per-endpoint aggregates** — one row per endpoint template (path with ids
 *    collapsed, query dropped). Each row holds count / total / min / max /
 *    sum-of-squares (for stddev) / error count / last status. O(endpoints).
 *  - **Time buckets** — call + error counts bucketed per {@link BUCKET_MS},
 *    kept as a bounded ring ({@link MAX_BUCKETS}). Fixed size regardless of
 *    traffic; enough to chart the recent past.
 *  - **Error ring** — the last {@link MAX_ERRORS} failing calls, trimmed.
 *  - **Client-error groups** — JS exceptions folded by (type, normalized
 *    message) into a bounded set of counters. Same reasoning as the endpoint
 *    rows: one bad render loop can throw thousands of times, so we count
 *    occurrences instead of storing them. O(distinct bugs), capped anyway.
 *
 * Writes are debounced (see {@link scheduleFlush}) so a burst of calls costs one
 * serialize, not one per call. Everything stays in the browser.
 */

/**
 * Which latency series a call belongs to.
 *
 * The chart splits these because averaging them together produces a line that
 * describes nothing: search and media upload are hundreds of milliseconds by
 * nature, while a cached timeline read is single digits, and a session that
 * happens to search twice would drag the "typical" line somewhere no call
 * actually lives.
 */
export type LatencyFamily = 'fast' | 'slow';

/**
 * Endpoint templates that are slow *by design* rather than by accident.
 *
 * Classification is by endpoint shape, not by measured duration, and that is
 * the deliberate choice: a threshold on observed time would reclassify an
 * endpoint the moment it regressed, moving the regression from the "fast" line
 * (where it is visible as a spike) into the "slow" line (where it is
 * camouflaged). The chart exists to show regressions, so the buckets must not
 * move when one happens.
 *
 * Matched against the normalized template, so ids are already collapsed.
 */
const SLOW_ENDPOINTS: readonly RegExp[] = [
  // Full-text and account search: fans out across the index.
  /\/search$/,
  // Media upload and processing: bounded by bytes on the wire, not by the API.
  /\/media(\/|$)/,
  // Suggestion and directory generation: computed, not read.
  /\/suggestions$/,
  /\/directory$/,
  // Federated fetches: the instance goes and talks to another server.
  /\/statuses\/:id\/(context|reblogged_by|favourited_by)$/,
];

/** Which latency series an endpoint key ("GET /api/v2/search") belongs to. */
export function latencyFamily(key: string): LatencyFamily {
  const endpoint = key.slice(key.indexOf(' ') + 1);
  return SLOW_ENDPOINTS.some((re) => re.test(endpoint)) ? 'slow' : 'fast';
}

/** Aggregate stats for one endpoint template (method + normalized path). */
export interface EndpointStat {
  /** e.g. "GET /api/v1/accounts/:id/followers". */
  key: string;
  count: number;
  errors: number;
  /** Total, min, max response time in ms (for mean / best / worst). */
  totalMs: number;
  minMs: number;
  maxMs: number;
  /** Σ(ms²), so stddev is derivable without keeping every sample. */
  sumSqMs: number;
  /** The most recent HTTP status seen (0 = network failure). */
  lastStatus: number;
  /** Epoch ms of the most recent call. */
  lastAt: number;
}

/** One failing call, kept in the bounded error ring. */
export interface ApiError {
  at: number;
  method: string;
  /** Normalized endpoint template (no args). */
  endpoint: string;
  status: number;
  /** Short, size-capped message. */
  message: string;
}

/** Where a client error was caught. Mirrors {@link ErrorLog}'s sources. */
export type ClientErrorSource = 'angular' | 'window-error' | 'unhandled-rejection';

/**
 * One *kind* of client-side error, with a count rather than a list of
 * occurrences.
 *
 * JavaScript has a shallow error hierarchy — `Error` plus a handful of built-in
 * subclasses (`TypeError`, `RangeError`, `SyntaxError`…), with libraries and
 * Angular adding their own (`HttpErrorResponse`, `ChunkLoadError`). What you
 * actually get at the catch site is `error.name` and `error.message`, and
 * nothing else is reliably present — so those two, with the message normalized
 * ({@link normalizeErrorMessage}), are the grouping key.
 */
export interface ClientErrorGroup {
  /** `error.name` (`TypeError`), or a best-effort label for a thrown non-Error. */
  type: string;
  /** The message with ids, numbers and URLs blanked, so one bug is one row. */
  message: string;
  /** Where the most recent occurrence was caught. */
  source: ClientErrorSource;
  count: number;
  firstAt: number;
  lastAt: number;
  /** First stack frame of the most recent occurrence, if there was one. */
  where: string;
}

/**
 * One day of traffic: call counts plus a latency histogram per family.
 *
 * The daily tier exists because the minute tier answers a different question.
 * 120 one-minute buckets cover two hours, which shows *what the app is doing
 * right now* — and charted over a session it is mostly noise, since a page load
 * fires a dozen calls into one bucket and leaves the next four empty. "Is the
 * app getting slower this week" needs a bucket wide enough that a burst is a
 * rounding error, and 90 of them still cost less than one day of per-call
 * records would.
 *
 * Latency lives here rather than on {@link EndpointStat} because the endpoint
 * rows are lifetime totals with no notion of *when*: they can say search is
 * slow, but not that search *became* slow on Tuesday.
 */
export interface DayBucket {
  /** Day start, epoch ms floored to local midnight. */
  t: number;
  count: number;
  errors: number;
  /**
   * Latency histograms, one per {@link LatencyFamily}. Errors are deliberately
   * excluded — a connection that failed after 30 s and one that was refused in
   * 2 ms are both "no answer", and letting either into the distribution
   * describes the network rather than the API.
   */
  fast: number[];
  slow: number[];
}

/** One day's latency summary for one family, as the chart consumes it. */
export interface LatencyPoint {
  /** Day start, matching the {@link DayBucket} it came from. */
  t: number;
  /** Samples behind this point. Drives the suppression rules below. */
  n: number;
  /** Median ms, or null when there were too few samples to say. */
  median: number | null;
  /** Band edges, or null when there were too few samples for a spread. */
  p25: number | null;
  p95: number | null;
}

/** One time bucket: total + failed calls in a fixed window. */
export interface TimeBucket {
  /** Bucket start, epoch ms floored to BUCKET_MS. */
  t: number;
  count: number;
  errors: number;
}

/** Snapshot persisted to localStorage (compact keys keep the blob small). */
interface StoredMetrics {
  /** version */
  v: 1 | 2;
  /** endpoints: [key, count, errors, total, min, max, sumSq, lastStatus, lastAt][] */
  e: [string, number, number, number, number, number, number, number, number][];
  /** buckets: [t, count, errors][] */
  b: [number, number, number][];
  /** errors: [at, method, endpoint, status, message][] */
  x: [number, string, string, number, string][];
  /** client errors: [type, message, source, count, firstAt, lastAt, where][] */
  c?: [string, string, string, number, number, number, string][];
  /**
   * day buckets: [t, count, errors, fastHist, slowHist][] (v2+).
   *
   * The histograms are run-length encoded by {@link packHistogram}: they are
   * mostly zeroes, and a day with 40 calls spread over 3 buckets should not
   * cost 26 numbers.
   */
  d?: [number, number, number, number[], number[]][];
}

const LEGACY_STORAGE_KEY = 'mockingbird_api_metrics';
const STORAGE_PREFIX = 'mockingbird_api_metrics:';
/** One minute per time bucket. */
export const BUCKET_MS = 60_000;
/** Keep two hours of buckets (120 × 1 min). */
const MAX_BUCKETS = 120;
/** One day per daily bucket, in local time (see {@link dayStart}). */
export const DAY_MS = 86_400_000;
/** Keep a quarter of a year of daily buckets. */
const MAX_DAYS = 90;
/**
 * Samples a day needs before its median is drawn at all, and before the
 * variance band is drawn on top of it. See {@link ApiMetrics.latencySeries}.
 */
const MIN_MEDIAN_SAMPLES = 5;
const MIN_BAND_SAMPLES = 20;
/** Keep the last 50 errors. */
const MAX_ERRORS = 50;
/** Cap a stored error message so one giant blob can't dominate the budget. */
const MAX_MSG_LEN = 300;
/** Distinct client-error groups kept; least-recently-seen is evicted first. */
const MAX_CLIENT_ERROR_GROUPS = 40;
/** Cap on a grouped client-error message (shorter: these are display labels). */
const MAX_CLIENT_MSG_LEN = 200;
/** Debounce window for persisting after activity. */
const FLUSH_DEBOUNCE_MS = 1_500;

interface MetricsState {
  endpoints: Map<string, EndpointStat>;
  buckets: TimeBucket[];
  days: DayBucket[];
  errorRing: ApiError[];
  /** Keyed by `type message`. */
  clientErrors: Map<string, ClientErrorGroup>;
}

function emptyMetrics(): MetricsState {
  return {
    endpoints: new Map<string, EndpointStat>(),
    buckets: [],
    days: [],
    errorRing: [],
    clientErrors: new Map<string, ClientErrorGroup>(),
  };
}

/**
 * The local midnight a timestamp belongs to.
 *
 * Local, not UTC, and that matters more than it looks: the axis is labelled
 * with dates the user recognises, and a UTC boundary would split "yesterday
 * evening" across two columns for most of the world. The cost is that a bucket
 * spans 23 or 25 hours twice a year, which no reader of a volume chart will
 * ever notice.
 */
export function dayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Run-length encode a histogram's zero runs: `[0,0,3,0,0,0,1]` becomes
 * `[-2,3,-3,1]`, where a negative number is a run of that many zeroes.
 *
 * A typical day touches three or four of the {@link BUCKET_COUNT} buckets, so
 * the raw array is ~85% zeroes and the encoded form is a quarter the JSON. The
 * sign carries the discriminator because a count is never negative, which keeps
 * the wire format a flat number array rather than a tagged structure.
 */
export function packHistogram(hist: readonly number[]): number[] {
  const out: number[] = [];
  let zeroes = 0;
  for (const n of hist) {
    if (n === 0) {
      zeroes++;
      continue;
    }
    if (zeroes) {
      out.push(-zeroes);
      zeroes = 0;
    }
    out.push(n);
  }
  // A trailing zero run is dropped: unpacking pads to BUCKET_COUNT anyway.
  return out;
}

/** Inverse of {@link packHistogram}. Tolerates truncated or overlong input. */
export function unpackHistogram(packed: readonly number[] | undefined): number[] {
  const out = emptyHistogram();
  if (!packed) {
    return out;
  }
  let i = 0;
  for (const n of packed) {
    if (i >= BUCKET_COUNT) {
      break;
    }
    if (n < 0) {
      i += -n;
    } else {
      out[i++] = n;
    }
  }
  return out;
}

function serverScope(baseUrl: string): string {
  if (!baseUrl) return 'this-server';
  try {
    return new URL(baseUrl).origin.toLowerCase();
  } catch {
    return baseUrl.toLowerCase().replace(/\/$/, '') || 'this-server';
  }
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

/**
 * Collapse a request URL into an endpoint template, so every call to one
 * endpoint aggregates into one row.
 *
 * ## Why the API's own shape decides, not the segment's appearance
 *
 * This used to guess: a segment that was all digits, or long and mixed
 * alphanumeric, was an id. That cannot work, because plenty of real identifiers
 * are ordinary words. `/api/v1/tags/SciFi` kept the tag, while
 * `/api/v1/tags/100DaysOfCode` collapsed to `:id` — the *same endpoint*
 * splitting into different rows according to what the person happened to search
 * for. Three things went wrong at once:
 *
 *  - **The row set grew without bound.** Rows are meant to be O(endpoints);
 *    keyed on user-supplied tag and list names they became O(what you browsed),
 *    which is exactly what the count-don't-store scheme exists to prevent.
 *  - **It recorded lookups.** A tag name is a search someone made.
 *    `sanitizePath` has always treated it that way for the route log; this did
 *    not, and wrote them to localStorage.
 *  - **The numbers were wrong.** One endpoint's traffic scattered across dozens
 *    of rows, so "busiest endpoint" and the latency families under-counted it.
 *
 * So a path is matched against the documented templates first
 * ({@link documentedTemplate}), and the winning template says which positions
 * are identifiers regardless of what they contain.
 *
 * {@link isIdSegment} remains as the fallback for paths the docs don't cover —
 * the mock's own `/api/v1/_mock/...` routes, a future endpoint, a
 * provider-scoped id. It is a guess, but it is only reached where there is
 * nothing better, and it errs toward collapsing.
 */
export function normalizeEndpoint(url: string): string {
  // Strip origin and query/hash.
  let path = url;
  const schemeIdx = path.indexOf('://');
  if (schemeIdx !== -1) {
    const slash = path.indexOf('/', schemeIdx + 3);
    path = slash === -1 ? '/' : path.slice(slash);
  }
  path = path.split('?')[0].split('#')[0];

  const documented = documentedTemplate(path);
  if (documented) {
    return documented;
  }

  return (
    path
      .split('/')
      .map((seg) => (isIdSegment(seg) ? ':id' : seg))
      .join('/') || '/'
  );
}

/**
 * True for a path segment that *looks* like an id rather than a route name.
 *
 * Only consulted for paths {@link documentedTemplate} does not cover — see
 * {@link normalizeEndpoint} for why appearance is the wrong test whenever
 * something better is available.
 */
function isIdSegment(seg: string): boolean {
  if (!seg) {
    return false;
  }
  // Pure numbers, snowflake ids.
  if (/^\d+$/.test(seg)) {
    return true;
  }
  // Provider-scoped ids (rss:…, bsky:…) and other colon-bearing composites.
  if (seg.includes(':') || seg.includes('%3A')) {
    return true;
  }
  // Long hex / base32-ish tokens (mixed digits+letters, 12+ chars).
  if (seg.length >= 12 && /\d/.test(seg) && /[a-zA-Z]/.test(seg)) {
    return true;
  }
  return false;
}

/**
 * Blank the varying parts of an error message so repeat occurrences of one bug
 * collapse into a single row.
 *
 * Without this, `Cannot read properties of undefined (reading 'id')` thrown
 * while rendering 30 posts is one group, but anything that quotes a URL, an
 * account id or a timestamp is 30 groups — and the cap then evicts the useful
 * history. The substitutions are deliberately blunt: this is a grouping key,
 * not a diagnostic.
 */
export function normalizeErrorMessage(message: string): string {
  return (
    message
      .replace(/\s+/g, ' ')
      .replace(/https?:\/\/\S+/g, '<url>')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
      // Long mixed-alphanumeric runs: snowflake ids, hashes, base64 fragments.
      .replace(/\b(?=\w*\d)(?=\w*[a-z])\w{12,}\b/gi, '<id>')
      // Leading boundary only, no trailing one: a number is just as variable when
      // a unit is stuck to it ("after 3000ms").
      .replace(/\b\d[\d.]*/g, '<n>')
      .trim()
      .slice(0, MAX_CLIENT_MSG_LEN)
  );
}

/**
 * Re-normalize a stored endpoint key (`"GET /api/v1/tags/SciFi"`).
 *
 * Splits off the method, re-runs the path through {@link normalizeEndpoint},
 * and reassembles. Keys written by the current code are already normalized and
 * pass through unchanged, so this is safe to run on every load.
 */
function renormalizeKey(key: string): string {
  const space = key.indexOf(' ');
  if (space === -1) {
    return key;
  }
  return `${key.slice(0, space)} ${normalizeEndpoint(key.slice(space + 1))}`;
}

/** Type + message + first stack frame for an arbitrary thrown value. */
export function describeError(error: unknown): {
  type: string;
  message: string;
  where: string;
} {
  if (error instanceof Error) {
    // Skip the leading "TypeError: message" line browsers put in .stack.
    const frame = (error.stack ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at ') || l.includes('@'));
    return {
      type: error.name || 'Error',
      message: error.message || String(error),
      where: (frame ?? '').slice(0, MAX_CLIENT_MSG_LEN),
    };
  }
  if (typeof error === 'string') {
    return { type: 'string', message: error, where: '' };
  }
  // A thrown object (Angular sometimes rethrows a wrapper, some libraries throw
  // plain objects). Use its constructor name so at least the shape is visible.
  if (error && typeof error === 'object') {
    const type = error.constructor?.name || 'Object';
    const message =
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : safeStringify(error);
    return { type, message, where: '' };
  }
  return { type: typeof error, message: String(error), where: '' };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The pseudo-scope meaning "every server at once". */
export const ALL_SCOPES = '*';

/**
 * Merge several servers' metrics into one read-only view.
 *
 * Endpoint rows are summed by key, which is the right call even though two
 * servers' `/api/v1/timelines/home` are different machines: the row describes
 * *the endpoint*, and someone asking "how expensive is the home timeline" wants
 * one answer. `minMs`/`maxMs` combine as the true min and max, and `sumSqMs`
 * adds directly — that is the reason the sum-of-squares form was chosen over
 * storing a variance, which cannot be merged without the counts anyway.
 *
 * Day buckets align on {@link dayStart}, so the same local day from two servers
 * is one column. Error and client-error rings are concatenated and re-trimmed;
 * they are already bounded per scope, so the merged result is bounded too.
 */
function mergeStates(states: MetricsState[]): MetricsState {
  if (states.length === 1) {
    return states[0];
  }
  const out = emptyMetrics();
  const days = new Map<number, DayBucket>();
  const minutes = new Map<number, TimeBucket>();
  for (const state of states) {
    for (const s of state.endpoints.values()) {
      const prev = out.endpoints.get(s.key);
      if (!prev) {
        out.endpoints.set(s.key, { ...s });
        continue;
      }
      prev.count += s.count;
      prev.errors += s.errors;
      prev.totalMs += s.totalMs;
      prev.sumSqMs += s.sumSqMs;
      prev.minMs = Math.min(prev.minMs, s.minMs);
      prev.maxMs = Math.max(prev.maxMs, s.maxMs);
      if (s.lastAt > prev.lastAt) {
        prev.lastAt = s.lastAt;
        prev.lastStatus = s.lastStatus;
      }
    }
    for (const d of state.days) {
      const prev = days.get(d.t);
      if (!prev) {
        days.set(d.t, { ...d, fast: [...d.fast], slow: [...d.slow] });
        continue;
      }
      prev.count += d.count;
      prev.errors += d.errors;
      prev.fast = mergeHistograms(prev.fast, d.fast);
      prev.slow = mergeHistograms(prev.slow, d.slow);
    }
    for (const b of state.buckets) {
      const prev = minutes.get(b.t);
      if (prev) {
        prev.count += b.count;
        prev.errors += b.errors;
      } else {
        minutes.set(b.t, { ...b });
      }
    }
    out.errorRing.push(...state.errorRing);
    for (const [key, g] of state.clientErrors) {
      const prev = out.clientErrors.get(key);
      if (!prev) {
        out.clientErrors.set(key, { ...g });
        continue;
      }
      prev.count += g.count;
      prev.firstAt = Math.min(prev.firstAt, g.firstAt);
      if (g.lastAt > prev.lastAt) {
        prev.lastAt = g.lastAt;
        prev.source = g.source;
        prev.where = g.where || prev.where;
      }
    }
  }
  out.days = [...days.values()].sort((a, b) => a.t - b.t).slice(-MAX_DAYS);
  out.buckets = [...minutes.values()].sort((a, b) => a.t - b.t).slice(-MAX_BUCKETS);
  out.errorRing = out.errorRing.sort((a, b) => a.at - b.at).slice(-MAX_ERRORS);
  return out;
}

/** Every server scope with metrics stored in this browser. */
export function storedScopes(): string[] {
  const scopes: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      scopes.push(decodeURIComponent(key.slice(STORAGE_PREFIX.length)));
    }
  }
  return scopes.sort();
}

@Injectable({ providedIn: 'root' })
export class ApiMetrics {
  private server = inject(Server);
  private states = new Map<string, MetricsState>();

  /** Bumped on every mutation so the page's computed views refresh. */
  private readonly version = signal(0);
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFlushes = new Set<string>();

  constructor() {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    // Best-effort final flush when the tab goes away.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flushPending());
    }
  }

  readonly serverLabel = computed(() => serverScope(this.server.baseUrl()));

  // ---------------------------------------------------------------- selection

  /**
   * Which server the *views* describe. Recording is unaffected: a call is
   * always filed under the server it was made against, so switching the picker
   * changes what you are looking at and never what is collected.
   */
  private readonly selected = signal<string>(ALL_SCOPES);

  /** Server scopes with stored metrics, plus any server seen this session. */
  readonly scopes = computed<string[]>(() => {
    this.version();
    const seen = new Set([...storedScopes(), ...this.states.keys(), this.activeScope()]);
    return [...seen].filter(Boolean).sort();
  });

  /** The selected scope, or {@link ALL_SCOPES}. */
  readonly scope = this.selected.asReadonly();

  selectScope(scope: string): void {
    this.selected.set(scope);
    // A scope selected but never loaded has no state yet; touch it so the
    // views below have something to read on the very next computation.
    if (scope !== ALL_SCOPES) {
      this.state(scope);
    }
    this.version.update((v) => v + 1);
  }

  /**
   * The state the views read: one server's, or every server's merged.
   *
   * Deliberately not memoized. It is recomputed inside each view's `computed`,
   * which already caches on {@link version}, so a merge happens once per change
   * rather than once per view — and adding a second cache here would only add a
   * way for the two to disagree.
   */
  private viewState(): MetricsState {
    const scope = this.selected();
    if (scope !== ALL_SCOPES) {
      return this.state(scope);
    }
    const all = this.scopes().map((s) => this.state(s));
    return all.length ? mergeStates(all) : emptyMetrics();
  }

  // ------------------------------------------------------------------ record

  /**
   * Record one completed API call. `status` is the HTTP status (0 for a network
   * failure); `ok` is false for status 0 or ≥ 400.
   */
  record(method: string, url: string, durationMs: number, status: number, ok: boolean): void {
    const scope = this.activeScope();
    const state = this.state(scope);
    const endpoint = normalizeEndpoint(url);
    const key = `${method.toUpperCase()} ${endpoint}`;
    const ms = Math.max(0, Math.round(durationMs));

    const prev = state.endpoints.get(key);
    if (prev) {
      prev.count++;
      prev.totalMs += ms;
      prev.minMs = Math.min(prev.minMs, ms);
      prev.maxMs = Math.max(prev.maxMs, ms);
      prev.sumSqMs += ms * ms;
      prev.lastStatus = status;
      prev.lastAt = Date.now();
      if (!ok) {
        prev.errors++;
      }
    } else {
      state.endpoints.set(key, {
        key,
        count: 1,
        errors: ok ? 0 : 1,
        totalMs: ms,
        minMs: ms,
        maxMs: ms,
        sumSqMs: ms * ms,
        lastStatus: status,
        lastAt: Date.now(),
      });
    }

    this.bumpBucket(state, !ok);
    this.bumpDay(state, key, ms, !ok);
    if (!ok) {
      this.pushError(state, method, endpoint, status, ms);
    }
    this.version.update((v) => v + 1);
    this.scheduleFlush(scope);
  }

  /**
   * Fold one call into today's daily bucket.
   *
   * The latency sample is taken only for a successful call, and only into its
   * endpoint's family. See {@link DayBucket} for why errors are excluded.
   */
  private bumpDay(state: MetricsState, key: string, ms: number, isError: boolean): void {
    const t = dayStart(Date.now());
    let day = state.days[state.days.length - 1];
    if (!day || day.t !== t) {
      day = { t, count: 0, errors: 0, fast: emptyHistogram(), slow: emptyHistogram() };
      state.days.push(day);
      if (state.days.length > MAX_DAYS) {
        state.days = state.days.slice(-MAX_DAYS);
      }
    }
    day.count++;
    if (isError) {
      day.errors++;
      return;
    }
    addSample(latencyFamily(key) === 'slow' ? day.slow : day.fast, ms);
  }

  private bumpBucket(state: MetricsState, isError: boolean): void {
    const t = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const last = state.buckets[state.buckets.length - 1];
    if (last && last.t === t) {
      last.count++;
      if (isError) {
        last.errors++;
      }
    } else {
      state.buckets.push({ t, count: 1, errors: isError ? 1 : 0 });
      if (state.buckets.length > MAX_BUCKETS) {
        state.buckets = state.buckets.slice(-MAX_BUCKETS);
      }
    }
  }

  private pushError(
    state: MetricsState,
    method: string,
    endpoint: string,
    status: number,
    ms: number,
  ): void {
    const message = this.statusMessage(status, ms).slice(0, MAX_MSG_LEN);
    state.errorRing.push({
      at: Date.now(),
      method: method.toUpperCase(),
      endpoint,
      status,
      message,
    });
    if (state.errorRing.length > MAX_ERRORS) {
      state.errorRing = state.errorRing.slice(-MAX_ERRORS);
    }
  }

  /**
   * Fold one client-side exception into the grouped counters.
   *
   * Called from {@link GlobalErrorHandler}, which sees Angular errors and —
   * via `provideBrowserGlobalErrorListeners()` — window `error` and
   * `unhandledrejection` events too. Must never throw: an error handler that
   * fails while handling an error takes the app down with it.
   */
  recordClientError(source: ClientErrorSource, error: unknown): void {
    try {
      const { type, message, where } = describeError(error);
      const normalized = normalizeErrorMessage(message);
      const scope = this.activeScope();
      const state = this.state(scope);
      const key = `${type} ${normalized}`;
      const now = Date.now();
      const prev = state.clientErrors.get(key);
      if (prev) {
        prev.count++;
        prev.lastAt = now;
        prev.source = source;
        if (where) {
          prev.where = where;
        }
      } else {
        state.clientErrors.set(key, {
          type,
          message: normalized,
          source,
          count: 1,
          firstAt: now,
          lastAt: now,
          where,
        });
        this.evictClientErrors(state);
      }
      this.version.update((v) => v + 1);
      this.scheduleFlush(scope);
    } catch {
      // Observability must never break the app — least of all here.
    }
  }

  /**
   * Keep the group set bounded by dropping the least-recently-seen kinds. A bug
   * you have not hit in a while is the one worth forgetting; the loud current
   * one keeps its count.
   */
  private evictClientErrors(state: MetricsState): void {
    if (state.clientErrors.size <= MAX_CLIENT_ERROR_GROUPS) {
      return;
    }
    const byAge = [...state.clientErrors.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt);
    for (const [key] of byAge.slice(0, state.clientErrors.size - MAX_CLIENT_ERROR_GROUPS)) {
      state.clientErrors.delete(key);
    }
  }

  private statusMessage(status: number, ms: number): string {
    if (status === 0) {
      return `Network failure (no response) after ${ms}ms`;
    }
    return `HTTP ${status} after ${ms}ms`;
  }

  // ------------------------------------------------------------------- views

  /** All endpoint rows, busiest first. Recomputed when metrics change. */
  readonly stats = computed<EndpointStat[]>(() => {
    this.version();
    return [...this.viewState().endpoints.values()].sort((a, b) => b.count - a.count);
  });

  readonly errors = computed<ApiError[]>(() => {
    this.version();
    // Newest first for display.
    return [...this.viewState().errorRing].reverse();
  });

  /** Client-error groups, most occurrences first. */
  readonly clientErrors = computed<ClientErrorGroup[]>(() => {
    this.version();
    return [...this.viewState().clientErrors.values()].sort(
      (a, b) => b.count - a.count || b.lastAt - a.lastAt,
    );
  });

  /** Total client-error occurrences and distinct kinds, for the tiles. */
  readonly clientErrorTotals = computed(() => {
    this.version();
    let occurrences = 0;
    for (const g of this.viewState().clientErrors.values()) {
      occurrences += g.count;
    }
    return { occurrences, kinds: this.viewState().clientErrors.size };
  });

  /** Daily traffic buckets, oldest first. */
  readonly daily = computed<DayBucket[]>(() => {
    this.version();
    return [...this.viewState().days];
  });

  /**
   * Per-day latency summary for one family, ready to chart.
   *
   * Suppression is the interesting part. A percentile from three samples is not
   * a percentile, it is one of the three samples wearing a label, and drawing a
   * band around it invites the reader to believe a spread that the data cannot
   * support. So: below {@link MIN_MEDIAN_SAMPLES} the day reports nothing and
   * the line breaks (a gap, never a zero — zero would read as "instant");
   * below {@link MIN_BAND_SAMPLES} it reports a median with no band.
   */
  latencySeries(family: LatencyFamily): LatencyPoint[] {
    return this.daily().map((d) => {
      const hist = family === 'slow' ? d.slow : d.fast;
      const n = histogramCount(hist);
      if (n < MIN_MEDIAN_SAMPLES) {
        return { t: d.t, n, median: null, p25: null, p95: null };
      }
      const band = n >= MIN_BAND_SAMPLES;
      return {
        t: d.t,
        n,
        median: percentile(hist, 0.5),
        p25: band ? percentile(hist, 0.25) : null,
        p95: band ? percentile(hist, 0.95) : null,
      };
    });
  }

  readonly timeline = computed<TimeBucket[]>(() => {
    this.version();
    return [...this.viewState().buckets];
  });

  /** Roll-up totals across every endpoint. */
  readonly totals = computed(() => {
    this.version();
    const state = this.viewState();
    let count = 0;
    let errors = 0;
    let totalMs = 0;
    for (const s of state.endpoints.values()) {
      count += s.count;
      errors += s.errors;
      totalMs += s.totalMs;
    }
    return {
      count,
      errors,
      endpoints: state.endpoints.size,
      avgMs: count ? Math.round(totalMs / count) : 0,
      errorRate: count ? errors / count : 0,
    };
  });

  /** Standard deviation of response time for one endpoint row (ms). */
  static stddev(s: EndpointStat): number {
    if (s.count < 2) {
      return 0;
    }
    const mean = s.totalMs / s.count;
    const variance = Math.max(0, s.sumSqMs / s.count - mean * mean);
    return Math.sqrt(variance);
  }

  static mean(s: EndpointStat): number {
    return s.count ? s.totalMs / s.count : 0;
  }

  // ------------------------------------------------------------------- reset

  /** Clear the selected server's metrics, or every server's when merged. */
  reset(): void {
    const scopes = this.selected() === ALL_SCOPES ? this.scopes() : [this.selected()];
    for (const scope of scopes) {
      this.states.set(scope, emptyMetrics());
      this.flush(scope);
    }
    this.version.update((v) => v + 1);
  }

  // ---------------------------------------------------------------- persist

  private scheduleFlush(scope: string): void {
    this.pendingFlushes.add(scope);
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPending();
    }, FLUSH_DEBOUNCE_MS);
  }

  private flushPending(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const scope of this.pendingFlushes) this.flush(scope);
    this.pendingFlushes.clear();
  }

  private flush(scope: string): void {
    const state = this.state(scope);
    const blob: StoredMetrics = {
      v: 2,
      e: [...state.endpoints.values()].map((s) => [
        s.key,
        s.count,
        s.errors,
        s.totalMs,
        s.minMs,
        s.maxMs,
        s.sumSqMs,
        s.lastStatus,
        s.lastAt,
      ]),
      b: state.buckets.map((b) => [b.t, b.count, b.errors]),
      x: state.errorRing.map((e) => [e.at, e.method, e.endpoint, e.status, e.message]),
      c: [...state.clientErrors.values()].map((g) => [
        g.type,
        g.message,
        g.source,
        g.count,
        g.firstAt,
        g.lastAt,
        g.where,
      ]),
      d: state.days.map((d) => [
        d.t,
        d.count,
        d.errors,
        packHistogram(d.fast),
        packHistogram(d.slow),
      ]),
    };
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(blob));
    } catch {
      // Quota exceeded (or storage disabled): drop the oldest half of the
      // error ring and buckets and try once more; metrics are best-effort.
      state.errorRing = state.errorRing.slice(-Math.floor(MAX_ERRORS / 2));
      state.buckets = state.buckets.slice(-Math.floor(MAX_BUCKETS / 2));
      try {
        // Drop the minute ring and the error log, never the daily buckets: the
        // minute ring is two hours old at worst and the day history is the one
        // thing here that cannot be re-earned by using the app for a moment.
        localStorage.setItem(storageKey(scope), JSON.stringify({ ...blob, b: [], x: [] }));
      } catch {
        // Give up silently; observability must never break the app.
      }
    }
  }

  private activeScope(): string {
    return serverScope(this.server.baseUrl());
  }

  private state(scope: string): MetricsState {
    const existing = this.states.get(scope);
    if (existing) return existing;
    const loaded = this.load(scope);
    this.states.set(scope, loaded);
    return loaded;
  }

  private load(scope: string): MetricsState {
    let blob: StoredMetrics | null;
    try {
      const key = storageKey(scope);
      const raw = localStorage.getItem(key);
      blob = raw ? (JSON.parse(raw) as StoredMetrics) : null;
    } catch {
      blob = null;
    }
    const state = emptyMetrics();
    // v1 had no daily buckets; it loads cleanly and simply starts collecting
    // them, so there is no migration step beyond accepting the older version.
    if (!blob || (blob.v !== 1 && blob.v !== 2)) {
      return state;
    }
    for (const row of blob.e ?? []) {
      const [storedKey, count, errors, totalMs, minMs, maxMs, sumSqMs, lastStatus, lastAt] = row;
      // Re-normalize on the way in. Rows written before `normalizeEndpoint`
      // consulted the documented templates have tag and list *names* baked into
      // their keys, and loading them verbatim would keep those lookups in
      // localStorage — and keep one endpoint split across a row per tag —
      // for as long as the browser held the blob.
      //
      // Merging rather than overwriting, because that is exactly what the old
      // keys need: `…/tags/SciFi` and `…/tags/caturday` both become
      // `…/tags/:id`, and their counts belong together.
      const key = renormalizeKey(storedKey);
      const prev = state.endpoints.get(key);
      if (prev) {
        prev.count += count;
        prev.errors += errors;
        prev.totalMs += totalMs;
        prev.sumSqMs += sumSqMs;
        prev.minMs = Math.min(prev.minMs, minMs);
        prev.maxMs = Math.max(prev.maxMs, maxMs);
        if (lastAt > prev.lastAt) {
          prev.lastAt = lastAt;
          prev.lastStatus = lastStatus;
        }
        continue;
      }
      state.endpoints.set(key, {
        key,
        count,
        errors,
        totalMs,
        minMs,
        maxMs,
        sumSqMs,
        lastStatus,
        lastAt,
      });
    }
    state.buckets = (blob.b ?? []).map(([t, count, errors]) => ({ t, count, errors }));
    state.days = (blob.d ?? []).map(([t, count, errors, fast, slow]) => ({
      t,
      count,
      errors,
      fast: unpackHistogram(fast),
      slow: unpackHistogram(slow),
    }));
    state.errorRing = (blob.x ?? []).map(([at, method, endpoint, status, message]) => ({
      at,
      method,
      // Same reasoning as the endpoint rows above: the ring stored the
      // pre-normalization endpoint, names and all.
      endpoint: normalizeEndpoint(endpoint),
      status,
      message,
    }));
    for (const [type, message, source, count, firstAt, lastAt, where] of blob.c ?? []) {
      state.clientErrors.set(`${type} ${message}`, {
        type,
        message,
        source: source as ClientErrorSource,
        count,
        firstAt,
        lastAt,
        where,
      });
    }
    return state;
  }
}
