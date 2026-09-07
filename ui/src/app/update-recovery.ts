import { Injectable, signal } from '@angular/core';

/**
 * Recovers the app after a deployment happened while the tab was open.
 *
 * When a new version deploys, the hashed chunk filenames change. A tab still
 * running the old bundle then asks for a chunk that no longer exists, and the
 * browser reports "error loading dynamically imported module" (or a Chromium /
 * Angular variant). Left alone the app just breaks — which is exactly the
 * silent, message-less failure that motivated this. The fix is to reload once
 * so the browser fetches the fresh `index.html` and its new chunk references.
 *
 * The guard is deliberately conservative: reload at most once per recovery
 * window, and if the reloaded app *also* fails (a half-finished deploy, an
 * inconsistent CDN), stop and hand the decision to the user instead of spinning
 * in a reload loop.
 *
 * Unlike the reference design this exposes signals ({@link updating},
 * {@link failed}) so the app can render a themed "updating" overlay and a
 * recovery-failed panel, rather than blanking the page with raw DOM.
 */

interface RecoveryAttempt {
  attemptedAt: number;
}

/** Message fragments (lowercased) that identify a failed chunk / module load. */
const CHUNK_ERROR_FRAGMENTS = [
  'error loading dynamically imported module',
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'chunkloaderror',
  'loading chunk',
  'failed to load module script',
];

@Injectable({ providedIn: 'root' })
export class UpdateRecovery {
  private readonly storageKey = 'mockingbird.update-recovery';
  private readonly recoveryWindowMs = 60_000;
  private readonly stabilizationPeriodMs = 30_000;

  private recoveryStarted = false;

  /** True once a reload has been triggered — drives the "Updating…" overlay. */
  readonly updating = signal(false);
  /** True when recovery already ran recently and failed again — show the panel. */
  readonly failed = signal(false);

  /**
   * Call once the Angular app has successfully started. The guard is *not*
   * cleared immediately: a broken deploy can let the reloaded app boot and then
   * fail on the next chunk it needs. Only clear it after the app has run
   * cleanly for a stabilization period.
   */
  markApplicationStableAfterDelay(): void {
    window.setTimeout(() => this.clearRecoveryAttempt(), this.stabilizationPeriodMs);
  }

  /** True when `error` looks like a failed JS module / Angular chunk load. */
  isChunkLoadError(error: unknown): boolean {
    const message = this.extractErrorText(error).toLowerCase();
    return (
      CHUNK_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment)) ||
      (message.includes('module') && message.includes('mime type'))
    );
  }

  /**
   * Handle a suspected chunk-load failure. Returns true when this was a chunk
   * error we took responsibility for (so the caller should stop logging it as a
   * crash). Reloads once; on a repeat failure within the window, shows the
   * recovery-failed panel instead of reloading again.
   */
  recover(error: unknown): boolean {
    if (!this.isChunkLoadError(error)) {
      return false;
    }

    // Several browser error channels report the same failure (a sync error and
    // an unhandledrejection). Collapse them so we navigate only once.
    if (this.recoveryStarted) {
      return true;
    }
    this.recoveryStarted = true;

    const previousAttempt = this.readRecoveryAttempt();
    const now = Date.now();

    if (previousAttempt !== null && now - previousAttempt.attemptedAt < this.recoveryWindowMs) {
      // We already reloaded and it failed again — don't loop. Let the user decide.
      this.failed.set(true);
      return true;
    }

    this.writeRecoveryAttempt({ attemptedAt: now });
    this.updating.set(true);
    // Give the overlay a paint before the browser navigates away.
    window.setTimeout(() => window.location.reload(), 400);
    return true;
  }

  /** Clear the guard and reload — the user's explicit "try again". */
  retry(): void {
    this.clearRecoveryAttempt();
    this.failed.set(false);
    this.updating.set(true);
    window.location.reload();
  }

  private extractErrorText(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
    }
    if (this.isRecord(error)) {
      const parts: string[] = [];
      if (typeof error['name'] === 'string') {
        parts.push(error['name']);
      }
      if (typeof error['message'] === 'string') {
        parts.push(error['message']);
      }
      // PromiseRejectionEvent and Angular wrappers stash the original elsewhere.
      for (const key of ['reason', 'rejection', 'error']) {
        if (key in error) {
          parts.push(this.extractErrorText(error[key]));
        }
      }
      if (parts.length > 0) {
        return parts.join('\n');
      }
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
    return String(error);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readRecoveryAttempt(): RecoveryAttempt | null {
    try {
      const serialized = sessionStorage.getItem(this.storageKey);
      if (serialized === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(serialized);
      if (this.isRecord(parsed) && typeof parsed['attemptedAt'] === 'number') {
        return { attemptedAt: parsed['attemptedAt'] };
      }
    } catch {
      // Storage can be unavailable (hardened / private modes). Recovery still
      // works; it just can't persist the loop guard.
    }
    return null;
  }

  private writeRecoveryAttempt(attempt: RecoveryAttempt): void {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(attempt));
    } catch {
      // Don't block recovery just because storage is unavailable.
    }
  }

  private clearRecoveryAttempt(): void {
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      // Nothing else to do.
    }
  }
}
