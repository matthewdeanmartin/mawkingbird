import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { sanitizePath } from '../analytics-tracker';

/**
 * Per-route visit counts and time-on-page — analytics for an audience of one.
 *
 * GoatCounter (see {@link AnalyticsTracker}) answers "which pages do people
 * visit" for *me*, in aggregate, and only if the user hasn't opted out. This
 * answers "where do **I** spend my time in this app" for the user, and never
 * leaves the browser: no request, no opt-in needed, no aggregation with anyone
 * else. It is the same idea as the API metrics next to it — count, don't store.
 *
 * ## What's recorded
 *
 * One row per *sanitized* route. Paths go through {@link sanitizePath}, which
 * strips the query string and collapses id segments, so this records that you
 * opened 40 profiles, not whose. That's the interesting number anyway, and it
 * keeps the row set bounded by the size of the route table rather than by how
 * much you browse.
 *
 * ## Dwell time
 *
 * Measured between navigations, with two corrections that matter for a number
 * anyone is going to look at:
 *
 *  - **Hidden tabs don't count.** Leaving the app open in a background tab
 *    overnight would otherwise report ten hours on whatever route you left up.
 *    The clock pauses on `visibilitychange` and resumes when you come back.
 *  - **A single stretch is capped** at {@link MAX_DWELL_MS}, for the case
 *    visibility can't catch — the tab is foreground but the machine slept.
 *
 * Time still accrues while you sit and read, which is the point; this is
 * attention, not clicks.
 */

/** One route's accumulated usage. */
export interface RouteStat {
  /** Sanitized route path, e.g. `/accounts/:id`. */
  path: string;
  visits: number;
  /** Total time spent on the route, ms. */
  totalMs: number;
  /** Epoch ms of the most recent visit. */
  lastAt: number;
}

/** Persisted shape: `[path, visits, totalMs, lastAt][]` under a version tag. */
interface StoredRoutes {
  v: 1;
  r: [string, number, number, number][];
}

const STORAGE_KEY = 'mockingbird_route_log';
/**
 * Plenty for a route table this size — sanitized paths are route *shapes*, not
 * URLs — while still bounding a pathological case (a route that leaks an id
 * past the sanitizer would otherwise grow without limit).
 */
const MAX_ROUTES = 100;
/** Longest single uninterrupted stretch credited to one route: 30 minutes. */
const MAX_DWELL_MS = 30 * 60_000;
/** Debounce window for persisting, matching the API metrics' approach. */
const FLUSH_DEBOUNCE_MS = 1_500;

@Injectable({ providedIn: 'root' })
export class RouteLog {
  private readonly router = inject(Router);
  private readonly routes = new Map<string, RouteStat>();
  private readonly version = signal(0);

  /** The route currently being timed, and when its current stretch started. */
  private current: string | null = null;
  private since = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor() {
    this.load();
  }

  /**
   * Begin recording. Called once from {@link App}, alongside the analytics
   * tracker, so navigations are counted from the first one — including the
   * initial load, which arrives as a NavigationEnd like any other.
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.enter(sanitizePath(e.urlAfterRedirects)));

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          // Bank what's been earned and stop the clock.
          this.settle();
          this.flushNow();
        } else {
          this.since = Date.now();
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        this.settle();
        this.flushNow();
      });
    }
  }

  /** Record a navigation: close out the previous route, start timing this one. */
  private enter(path: string): void {
    this.settle();
    this.current = path;
    this.since = Date.now();
    const prev = this.routes.get(path);
    if (prev) {
      prev.visits++;
      prev.lastAt = Date.now();
    } else {
      this.routes.set(path, { path, visits: 1, totalMs: 0, lastAt: Date.now() });
      this.evict();
    }
    this.version.update((v) => v + 1);
    this.scheduleFlush();
  }

  /**
   * Credit the elapsed stretch to the current route and reset the clock. Safe to
   * call repeatedly: with `since` reset each time, nothing is double-counted.
   */
  private settle(): void {
    if (this.current === null || this.since === 0) {
      return;
    }
    const stat = this.routes.get(this.current);
    const elapsed = Math.min(Math.max(0, Date.now() - this.since), MAX_DWELL_MS);
    this.since = Date.now();
    if (stat && elapsed > 0) {
      stat.totalMs += elapsed;
      this.version.update((v) => v + 1);
      this.scheduleFlush();
    }
  }

  /** Drop the least-recently-visited routes once over the cap. */
  private evict(): void {
    if (this.routes.size <= MAX_ROUTES) {
      return;
    }
    const byAge = [...this.routes.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt);
    for (const [key] of byAge.slice(0, this.routes.size - MAX_ROUTES)) {
      this.routes.delete(key);
    }
  }

  // ------------------------------------------------------------------- views

  /**
   * All routes, most-visited first. The current route's total excludes the
   * seconds since you landed on it until something settles the clock — a
   * navigation, the tab hiding, or {@link refresh}. (A computed can't do it
   * itself: banking time is a signal write, and those are illegal mid-read.)
   */
  readonly stats = computed<RouteStat[]>(() => {
    this.version();
    return [...this.routes.values()].sort((a, b) => b.visits - a.visits);
  });

  readonly totals = computed(() => {
    this.version();
    let visits = 0;
    let totalMs = 0;
    for (const s of this.routes.values()) {
      visits += s.visits;
      totalMs += s.totalMs;
    }
    return { visits, totalMs, routes: this.routes.size };
  });

  /** Bring the current route's running total up to date (page refresh button). */
  refresh(): void {
    this.settle();
    this.version.update((v) => v + 1);
  }

  reset(): void {
    this.routes.clear();
    this.since = Date.now();
    this.version.update((v) => v + 1);
    this.flushNow();
  }

  // ---------------------------------------------------------------- persist

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => this.flushNow(), FLUSH_DEBOUNCE_MS);
  }

  private flushNow(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const blob: StoredRoutes = {
      v: 1,
      r: [...this.routes.values()].map((s) => [s.path, s.visits, Math.round(s.totalMs), s.lastAt]),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    } catch {
      // Quota exceeded or storage disabled; usage stats are never worth a throw.
    }
  }

  private load(): void {
    let blob: StoredRoutes | null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      blob = raw ? (JSON.parse(raw) as StoredRoutes) : null;
    } catch {
      blob = null;
    }
    if (!blob || blob.v !== 1) {
      return;
    }
    for (const [path, visits, totalMs, lastAt] of blob.r ?? []) {
      this.routes.set(path, { path, visits, totalMs, lastAt });
    }
  }
}

/** Compact duration for display: `4s`, `2m 10s`, `1h 04m`. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${String(totalSeconds % 60).padStart(2, '0')}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
