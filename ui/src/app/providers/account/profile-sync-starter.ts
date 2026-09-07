import { effect, inject, Injectable, Injector } from '@angular/core';
import { SupporterStatus } from './supporter-status';

/**
 * Starts settings sync without dragging it into the initial bundle.
 *
 * ## Why the indirection
 *
 * `App`'s constructor is the natural place to start sync — it is where
 * `ConfigSync.start()` already lives. But `App` is the root component, so a
 * static import of `ProfileSync` would load `ProfileClient` and
 * `MawkingbirdSession` eagerly, for every visitor, including the majority who
 * never sign in and the anonymous github.io deployment where there are no
 * accounts at all.
 *
 * Same reasoning and same shape as `PlusTokenSource` in
 * `plus-token.interceptor.ts`, and the same reason `SupporterStatus` exists as a
 * separate one-boolean service: the account machinery is worth loading when
 * somebody has an account, and worth nothing when they do not.
 *
 * The dynamic import lives behind an injectable so specs can replace it — a
 * bare `import()` inside `App` would fix the bundle and be untestable, since a
 * dynamic import cannot be resolved by draining microtasks and the module's
 * class identity would not match a `TestBed` provider anyway.
 *
 * ## Why it never throws
 *
 * Called from a constructor, where a rejection would be an unhandled promise
 * and, worse, could take out application start for a feature that is optional
 * by design. Sync failing means settings do not follow you between browsers; it
 * must never mean the app does not load.
 */
@Injectable({ providedIn: 'root' })
export class ProfileSyncStarter {
  private injector = inject(Injector);
  private supporter = inject(SupporterStatus);

  constructor() {
    // Tokens are minted twice on a cold load: the first reports `tier: 'free'`
    // before the subscription lookup finishes, the second reports the truth. A
    // `start()` landing in that window reads a manifest saying `readOnly: true`
    // and skips every push thereafter — a paying account told its subscription
    // had lapsed, seen in a real session.
    //
    // Watching the flag here rather than inside `ProfileSync` keeps the module
    // lazy: `SupporterStatus` is one boolean with no imports beyond Angular, so
    // a signed-out visitor pays for this effect and nothing behind it.
    effect(() => {
      if (!this.supporter.isSupporter() || !this.startAttempted) {
        return;
      }
      void this.recheckEntitlement();
    });
  }

  /** Settle sync state, if this browser has an account and sync is on. */
  async start(): Promise<void> {
    try {
      const { ProfileSync } = await import('./profile-sync');
      const sync = this.injector.get(ProfileSync);
      await sync.start();
      // Only now is the persist hook worth arming. `start()` has settled the
      // state from the manifest, so `syncing()` is the real answer rather than
      // whatever this browser last wrote down.
      this.started = sync.syncing();
      // Gates the entitlement effect, and is deliberately *not* `started`:
      // `start()` returns early for an `unasked` browser, leaving `started`
      // false while a manifest has very much been read — under a token that may
      // have said `free`. Keying the recheck on `started` would skip exactly
      // the case this is meant to repair.
      this.startAttempted = true;
    } catch {
      // See the class comment: optional feature, mandatory app start.
    }
  }

  /**
   * Re-read the manifest once entitlement improves.
   *
   * Guarded inside `ProfileSync` so repeated mints of an already-correct token
   * cost a boolean comparison rather than a request.
   */
  async recheckEntitlement(): Promise<void> {
    try {
      const { ProfileSync } = await import('./profile-sync');
      const sync = this.injector.get(ProfileSync);
      await sync.recheckEntitlement();
      this.started = sync.syncing();
    } catch {
      // As above.
    }
  }

  /** Re-check after a tab has been in the background for a while. */
  async recheckOnFocus(): Promise<void> {
    try {
      const { ProfileSync } = await import('./profile-sync');
      await this.injector.get(ProfileSync).recheckOnFocus();
    } catch {
      // As above.
    }
  }

  /**
   * Note that a synced setting changed, so a debounced push is scheduled.
   *
   * ## Why this is cheap enough to call from a persist effect
   *
   * `ClientPrefs.persist()` runs inside an effect and fires on every preference
   * change — including the first, at application start, when the effect settles.
   * So this must not be expensive and must not load anything on its own.
   *
   * It does not: {@link started} stays false until something else has already
   * loaded `ProfileSync`, which only happens once {@link start} has run and
   * found an account with sync switched on. Before that, this is a boolean
   * check. A browser with no account never loads the module and never pays for
   * it, which is the whole point of the indirection.
   */
  noteLocalChange(): void {
    if (!this.started) {
      return;
    }
    void (async () => {
      try {
        const { ProfileSync } = await import('./profile-sync');
        this.injector.get(ProfileSync).noteLocalChange();
      } catch {
        // As above.
      }
    })();
  }

  /**
   * True once `ProfileSync` has been loaded and is worth talking to.
   *
   * Set by {@link start}, and only when sync is actually on — so the persist
   * hook above stays a no-op for everyone who is signed out, on the free tier,
   * or has declined.
   */
  private started = false;

  /**
   * True once {@link start} has read a manifest, whatever it concluded.
   *
   * Distinct from {@link started}, which means "sync is on and worth talking
   * to". See the comment in `start()`.
   */
  private startAttempted = false;
}
