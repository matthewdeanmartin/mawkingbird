import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { serverRole } from './server-role';

/**
 * What actually went wrong, kept so the fail whale can *show* it.
 *
 * There is no SRE team reading logs on the user's behalf — the person staring
 * at the whale is the one who has to work out whether it's their wifi, a
 * corporate proxy, or the instance genuinely being down. Everything here exists
 * to make that diagnosis possible without opening devtools.
 */
export interface HealthFailure {
  /** HTTP status, or 0 for "the request never got an answer". */
  status: number;
  /** The request that failed, path only — enough to place it, no query secrets. */
  url: string;
  /** Angular's message, or the server's own if it sent one. */
  message: string;
  /** When it happened, for "is this stale?" and for pasting into a bug report. */
  at: Date;
  /** navigator.onLine at failure time — separates "my network" from "their server". */
  online: boolean;
}

/**
 * How many status-0 failures on the home server before the whale appears.
 *
 * **One is not evidence.** Status 0 is the browser declining to say what went
 * wrong, and it is produced by things that are not outages at all: a Wi-Fi
 * handover, a laptop waking, a rate limiter closing a connection, an extension
 * cancelling a request, a tab throttled in the background. A real outage produces
 * these continuously; a blip produces one. Requiring two inside
 * {@link FAILURE_WINDOW_MS} removes almost every false whale while delaying a
 * genuine one by the length of a single retry.
 */
export const FAILURES_BEFORE_DOWN = 2;

/** Failures older than this stop counting toward the threshold. */
export const FAILURE_WINDOW_MS = 15_000;

/**
 * Tracks whether the *home* server appears to be unreachable.
 *
 * "Down" means the browsing instance never answered (status 0) — repeatedly, and
 * for a request the app actually needed. It is not an auth problem (401/403 means
 * "log in"), not a 5xx (the server answered, so it is reachable), and not a
 * failure of some *other* server: search, hashtag and peer instances have their
 * own roles and degrade in place. See `server-role.ts`.
 *
 * When down, the app shows a full-screen fail whale; recovery is on demand (the
 * user clicks "Try again"), never a timer.
 */
@Injectable({ providedIn: 'root' })
export class ServerHealth {
  private http = inject(HttpClient);

  /** True while the server is considered unreachable. */
  readonly down = signal(false);
  /** True while a manual health re-check is in flight. */
  readonly checking = signal(false);
  /** Details of the failure that raised the whale, for the diagnostics box. */
  readonly failure = signal<HealthFailure | null>(null);

  /** Timestamps of recent qualifying failures, newest last. */
  private recentFailures: number[] = [];

  /**
   * Record a home-server failure, raising the whale only once there are enough
   * of them close together (see {@link FAILURES_BEFORE_DOWN}).
   *
   * The *first* failure in a burst is the one kept for display. A dead server
   * produces a flurry of these as every in-flight request gives up, and the
   * earliest is closest to what the user was actually doing; the rest is wreckage.
   */
  markDown(err?: HttpErrorResponse, now: number = Date.now()): void {
    this.recentFailures = [...this.recentFailures, now].filter(
      (at) => now - at < FAILURE_WINDOW_MS,
    );

    if (err && !this.failure()) {
      this.failure.set({
        status: err.status,
        url: pathOf(err.url),
        message: describe(err),
        at: new Date(now),
        online: navigator.onLine,
      });
    }

    // Offline is not a guess — the browser is telling us directly, so there is
    // nothing to corroborate and no reason to make the user wait for a second
    // failure to be told what they already suspect.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline || this.recentFailures.length >= FAILURES_BEFORE_DOWN) {
      this.down.set(true);
    }
  }

  /**
   * Clear the down state (called when a home-server request succeeds).
   *
   * Also resets the failure counter: a success proves the earlier failures were
   * not the start of an outage, so they must not be allowed to combine with an
   * unrelated blip ten seconds later to raise a whale neither of them earned.
   */
  markUp(): void {
    this.recentFailures = [];
    if (this.down()) {
      this.down.set(false);
    }
    if (this.failure()) {
      this.failure.set(null);
    }
  }

  /**
   * Ping a lightweight, unauthenticated endpoint once to see if the server is
   * back. On success the fail whale dismisses; on failure it stays. This is the
   * only place we poll, and only in response to a user action.
   */
  recheck(): void {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    // Explicitly the home role even though the URL is a background endpoint
    // elsewhere: here it is being used as a liveness probe for the home server,
    // which is exactly the question the user just asked.
    this.http.get('/api/v2/instance', { context: serverRole('home') }).subscribe({
      next: () => {
        this.down.set(false);
        this.checking.set(false);
      },
      error: (err) => {
        // Still down — leave the whale up, but refresh the evidence so the box
        // describes *this* attempt rather than the one from ten minutes ago.
        //
        // Hysteresis is deliberately bypassed here: the user asked this exact
        // question and got a direct answer, so there is nothing to corroborate.
        this.failure.set(null);
        this.markDown(err);
        this.down.set(true);
        this.checking.set(false);
      },
    });
  }
}

/**
 * Path (and query) of a failed request, with the origin dropped.
 *
 * The host is already shown separately as "which server", so repeating it in
 * every line is noise; the path is the part that says *what* was being asked
 * for. A relative or unparseable URL is passed through unchanged.
 */
function pathOf(url: string | null): string {
  if (!url) {
    return '(unknown request)';
  }
  try {
    const parsed = new URL(url, location.origin);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/** The most human sentence available for this failure. */
function describe(err: HttpErrorResponse): string {
  const detail = String(err.error?.error ?? err.error?.message ?? '').trim();
  if (detail) {
    return detail;
  }
  if (err.status === 0) {
    // Status 0 is the browser refusing to tell us more: DNS failure, TLS
    // rejection, CORS block and "wifi is off" are indistinguishable from here.
    return 'The request never completed — no response reached the browser. This is usually a network, DNS, TLS or CORS problem rather than an error from the server.';
  }
  return err.message || `HTTP ${err.status}`;
}
