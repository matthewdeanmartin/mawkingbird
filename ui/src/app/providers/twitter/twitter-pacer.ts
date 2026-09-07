import { Injectable, signal } from '@angular/core';
import { TwitterApiError } from './twitter-errors';

/**
 * How fast a batch may issue requests, discovered rather than assumed.
 *
 * ## Why this is not a constant
 *
 * It was. The import loop waited a flat 5.2 seconds between requests because
 * TwitterAPI.io's free tier says so in its own error body:
 *
 *   {"error":"Too Many Requests","message":"For free-tier users, the QPS limit
 *    is one request every 5 seconds."}
 *
 * Note "for free-tier users". Measured 2026-08-01 on a paid balance: twenty
 * back-to-back requests all returned 200. A hardcoded 5.2s would have made a
 * 200-account import take seventeen minutes when the account it is running on
 * can finish it in well under one — the limit is a property of the plan, and
 * the plan changes.
 *
 * ## What it does instead
 *
 * Starts optimistic and backs off only on evidence:
 *
 * - Begin at {@link FAST_DELAY_MS}, fast enough to be pleasant and slow enough
 *   not to look like an attack.
 * - On a rate-limit error, obey `Retry-After` when the service sends one. That
 *   is the service telling us the answer, and guessing over it is never right.
 * - With no `Retry-After`, double the delay up to {@link MAX_DELAY_MS}. This is
 *   the case that matters in practice, because this service sends no
 *   rate-limit headers at all — not on success, and not on a 429 — so its pace
 *   is only discoverable by being refused.
 * - After a run of successes at the current pace, ease back down, so one blip
 *   does not leave a paid account crawling for the rest of the import.
 *
 * ## Why not read rate-limit headers
 *
 * Because there are none to read. Measured across success and failure
 * responses: no `X-RateLimit-*`, no `RateLimit-*`, no `X-QPS-*`. `Retry-After`
 * appears only sometimes. This class is written to *use* those headers the
 * moment they exist ({@link noteSuccess} takes them) while not depending on
 * them, which is the only honest way to pace an API that documents its limit in
 * prose and enforces it silently.
 */

/** Opening pace: brisk, and polite enough for a shared free proxy. */
export const FAST_DELAY_MS = 250;

/** Never wait longer than this between requests, however often we are refused. */
export const MAX_DELAY_MS = 10_000;

/** Consecutive successes before trying a faster pace again. */
export const SPEEDUP_AFTER = 5;

@Injectable({ providedIn: 'root' })
export class TwitterPacer {
  /** Current gap between requests, in ms. Exposed so a UI can explain a slowdown. */
  readonly delayMs = signal(FAST_DELAY_MS);
  /** True once the service has refused us at least once this run. */
  readonly throttled = signal(false);

  private streak = 0;

  /** Begin a new batch at full speed, forgetting anything learned earlier. */
  reset(): void {
    this.delayMs.set(FAST_DELAY_MS);
    this.throttled.set(false);
    this.streak = 0;
  }

  /**
   * Record a success, easing the pace back up after a clean streak.
   *
   * `headers` is accepted for the day this service starts sending rate-limit
   * headers; when it does, a remaining-quota reading belongs here rather than
   * in another guess. Today it is always absent.
   */
  noteSuccess(headers?: { remaining?: number; resetSeconds?: number }): void {
    if (typeof headers?.remaining === 'number' && headers.remaining <= 1) {
      // The service says we are at the edge; wait for the window rather than
      // discovering the limit by being refused.
      this.delayMs.set(Math.min(MAX_DELAY_MS, (headers.resetSeconds ?? 1) * 1000));
      return;
    }
    this.streak++;
    if (this.streak >= SPEEDUP_AFTER && this.delayMs() > FAST_DELAY_MS) {
      this.streak = 0;
      // Halve rather than snap back: if we were genuinely throttled, returning
      // straight to full speed just earns another refusal.
      this.delayMs.update((ms) => Math.max(FAST_DELAY_MS, Math.round(ms / 2)));
    }
  }

  /**
   * Record a failure, slowing down when it was a rate limit.
   *
   * Returns true when the caller should retry this same item rather than moving
   * on: a refused request did no work, so skipping it would silently drop an
   * account from an import.
   */
  noteFailure(error: unknown): boolean {
    const rateLimited =
      error instanceof TwitterApiError &&
      (error.code === 'RATE_LIMITED' || error.httpStatus === 429);
    if (!rateLimited) {
      return false;
    }
    this.throttled.set(true);
    this.streak = 0;
    const retryAfter = error instanceof TwitterApiError ? error.retryAfterMs : undefined;
    this.delayMs.set(
      retryAfter
        ? // The service told us how long to wait. Guessing over that is never right.
          Math.min(MAX_DELAY_MS, retryAfter)
        : Math.min(MAX_DELAY_MS, Math.max(FAST_DELAY_MS * 2, this.delayMs() * 2)),
    );
    return true;
  }

  /** Wait the current interval. */
  wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs()));
  }
}
