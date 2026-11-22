import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CONNECTIVITY_PROBE_PATH } from '../http/platform-http';
import { NetworkSimulator, simulatedDrop } from './network-simulator';
import {
  BrowserHints,
  ConnectionAssessment,
  ConnectionSample,
  WINDOW_MS,
  assess,
  formatReplyTime,
  isBad,
} from './connection-quality';
import {
  ConnectionHistory,
  addSample,
  binLabel,
  deserialize,
  medianBin,
  emptyHistory,
  noteTransition,
  noteVerdict,
  prune,
  serialize,
  summarize,
} from './connection-history';

export const CONNECTION_HISTORY_KEY = 'mockingbird_connection_history';

/** How often the verdict is re-evaluated while there are samples in the window. */
const REEVALUATE_MS = 10_000;
/** Debounce for history writes: a burst of requests costs one serialize. */
const FLUSH_DEBOUNCE_MS = 5_000;
/** Probe delays while the verdict stays bad and nothing else is being sent. */
export const PROBE_BACKOFF_MS: readonly number[] = [10_000, 20_000, 40_000, 80_000, 120_000];
/** A probe that takes longer than this counts as abandoned. */
const PROBE_TIMEOUT_MS = 15_000;
/** How far back the compact reply-time readout looks when the live window is empty. */
const RECENT_REPLY_MS = 15 * 60_000;
/** Samples kept in memory; the verdict only reads the newest window of them. */
const MAX_LIVE_SAMPLES = 120;

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

function connectionInfo(): NetworkInformationLike | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

export function readHints(): BrowserHints {
  const info = connectionInfo();
  return {
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    effectiveType: info?.effectiveType,
    downlinkMbps: info?.downlink,
    rttMs: info?.rtt,
    saveData: info?.saveData,
  };
}

/**
 * Always measuring, never asking: how well is the network carrying this app's
 * requests right now, and how has that gone over the last day?
 *
 * Fed passively by `connectionMeterInterceptor` from requests the app makes
 * anyway, so a good connection costs no extra data. The one exception is
 * {@link probe}: when the verdict is flaky or offline *and* the app has gone
 * quiet, nothing else would ever notice the connection coming back, so a tiny
 * same-origin file is fetched on a backoff schedule while the tab is visible.
 *
 * See spec/low-bandwidth-offline.md for the model and the thresholds.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionMeter {
  private samples: ConnectionSample[] = [];
  private history: ConnectionHistory = emptyHistory();
  /** Bumped on every change so computed views refresh. */
  private readonly version = signal(0);
  readonly hints = signal<BrowserHints>(readHints());
  private readonly simulator = inject(NetworkSimulator);

  readonly assessment = computed<ConnectionAssessment>(() => {
    this.version();
    return assess(this.samples, this.hints(), Date.now());
  });
  readonly verdict = computed(() => this.assessment().verdict);
  readonly bad = computed(() => isBad(this.verdict()));
  /**
   * A short "how fast is it" for compact places (the More menu, the
   * Observability card): the live median when there is one, otherwise the
   * typical bin from the last 15 minutes, otherwise null.
   */
  readonly typicalReply = computed<string | null>(() => {
    const live = formatReplyTime(this.assessment().medianMs);
    if (live) return live;
    const now = Date.now();
    const bin = medianBin(summarize(this.history, now - RECENT_REPLY_MS, now).lat);
    return bin === null ? null : binLabel(bin);
  });
  /** When the last probe finished, for the diagnostics page. */
  readonly lastProbe = signal<ConnectionSample | null>(null);

  private reevaluateTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private probeAttempt = 0;
  private probing = false;

  constructor() {
    this.history = load();
    if (typeof window === 'undefined') return;
    const onOnline = () => this.onBrowserNetworkChange(true);
    const onOffline = () => this.onBrowserNetworkChange(false);
    const onHints = () => this.hints.set(readHints());
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.scheduleProbe(true);
    };
    const onHide = () => this.flush();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisible);
    connectionInfo()?.addEventListener?.('change', onHints);
    // Record the state the session opened in, so the history shows a reload
    // that happened while offline.
    noteTransition(this.history, Date.now(), this.hints().online);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisible);
      connectionInfo()?.removeEventListener?.('change', onHints);
      this.stopTimers();
      this.flush();
    });
  }

  /** Record one finished (or abandoned) request. */
  record(sample: ConnectionSample): void {
    this.samples.push(sample);
    if (this.samples.length > MAX_LIVE_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_LIVE_SAMPLES);
    }
    addSample(this.history, sample);
    if (sample.outcome === 'ok' || sample.outcome === 'answered-error') {
      // Something got through: the probe schedule starts over next time.
      this.probeAttempt = 0;
    }
    this.changed();
  }

  /** The persisted day of history, for the diagnostics page. Read-only by contract. */
  historySnapshot(): ConnectionHistory {
    this.version();
    return this.history;
  }

  /** Forget the stored history (the diagnostics page's Clear button). */
  clearHistory(): void {
    this.history = emptyHistory();
    noteTransition(this.history, Date.now(), this.hints().online);
    this.changed();
  }

  /**
   * Fetch the probe file once now, regardless of the schedule. Used when the
   * browser says it is back online and by the page's "Test now" button.
   */
  async probe(): Promise<ConnectionSample | null> {
    const path = CONNECTIVITY_PROBE_PATH;
    if (!path || this.probing || typeof fetch === 'undefined') return null;
    this.probing = true;
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let sample: ConnectionSample;
    try {
      const simulated = this.simulator.profile();
      if (simulated.id !== 'off') {
        // Dev profiles must fool the probe too, or "offline" would look like
        // a server outage the moment the probe sailed through.
        await new Promise((resolve) => setTimeout(resolve, simulated.latencyMs));
        if (simulatedDrop(simulated, Date.now(), Math.random())) throw new Error('simulated');
      }
      const url = new URL(path, document.baseURI);
      url.searchParams.set('t', String(Date.now()));
      await fetch(url.href, { cache: 'no-store', signal: controller.signal });
      sample = this.probeSample('ok', started);
    } catch {
      sample = this.probeSample(controller.signal.aborted ? 'abandoned' : 'unreachable', started);
    } finally {
      clearTimeout(timer);
      this.probing = false;
    }
    this.lastProbe.set(sample);
    this.record(sample);
    return sample;
  }

  private probeSample(outcome: ConnectionSample['outcome'], started: number): ConnectionSample {
    return {
      at: Date.now(),
      ms: performance.now() - started,
      outcome,
      latency: false,
      home: false,
    };
  }

  private onBrowserNetworkChange(online: boolean): void {
    this.hints.set(readHints());
    noteTransition(this.history, Date.now(), online);
    this.probeAttempt = 0;
    this.changed();
    if (online) {
      // "Online" only means an interface came up; confirm something gets through.
      void this.probe();
    }
  }

  private changed(): void {
    this.version.update((v) => v + 1);
    const now = Date.now();
    noteVerdict(this.history, now, this.verdict());
    this.scheduleFlush();
    this.armReevaluation();
    this.scheduleProbe(false);
  }

  /**
   * Samples age out of the window with no new event to say so; re-read the
   * verdict on a slow tick while any are still inside it, then stop.
   */
  private armReevaluation(): void {
    if (this.reevaluateTimer !== null) return;
    this.reevaluateTimer = setInterval(() => {
      const newest = this.samples.at(-1)?.at ?? 0;
      this.version.update((v) => v + 1);
      noteVerdict(this.history, Date.now(), this.verdict());
      if (Date.now() - newest > WINDOW_MS && this.reevaluateTimer !== null) {
        clearInterval(this.reevaluateTimer);
        this.reevaluateTimer = null;
      }
      this.scheduleProbe(false);
    }, REEVALUATE_MS);
  }

  private scheduleProbe(resetBackoff: boolean): void {
    if (resetBackoff) this.probeAttempt = 0;
    const verdict = this.verdict();
    const wanted =
      CONNECTIVITY_PROBE_PATH !== null &&
      (verdict === 'flaky' || verdict === 'offline') &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible';
    if (!wanted) {
      if (this.probeTimer !== null) {
        clearTimeout(this.probeTimer);
        this.probeTimer = null;
      }
      return;
    }
    if (this.probeTimer !== null) return;
    const delay = PROBE_BACKOFF_MS[Math.min(this.probeAttempt, PROBE_BACKOFF_MS.length - 1)];
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      // Real traffic since the timer was set already answered the question.
      const newest = this.samples.at(-1)?.at ?? 0;
      if (Date.now() - newest < delay) {
        this.scheduleProbe(false);
        return;
      }
      this.probeAttempt++;
      void this.probe();
    }, delay);
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  private flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    prune(this.history, Date.now());
    try {
      localStorage.setItem(CONNECTION_HISTORY_KEY, serialize(this.history));
    } catch {
      // Storage full or disabled: the history is a diagnostic, never a reason to fail.
    }
  }

  private stopTimers(): void {
    if (this.reevaluateTimer !== null) clearInterval(this.reevaluateTimer);
    if (this.probeTimer !== null) clearTimeout(this.probeTimer);
    this.reevaluateTimer = null;
    this.probeTimer = null;
  }
}

function load(): ConnectionHistory {
  try {
    const history = deserialize(localStorage.getItem(CONNECTION_HISTORY_KEY));
    prune(history, Date.now());
    return history;
  } catch {
    return emptyHistory();
  }
}
