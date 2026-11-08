import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { Auth } from '../auth';

/** Per-tab record of the account this tab last acted as. sessionStorage, so per tab. */
export const TAB_ACCOUNT_KEY = 'mockingbird_tab_account';

/** Why this tab may not post, like or follow until the reader decides. */
export interface AccountTabConflict {
  /**
   * `other-tab`: another tab switched accounts and this one still holds the old
   * one in memory. `restored`: this tab reloaded (a phone discarding it in the
   * background, a deploy, a manual reload) and came back as a different account
   * than the one it was showing.
   */
  reason: 'other-tab' | 'restored';
  /** Handle the tab was showing, when known. */
  loadedAs: string | null;
  /** Handle storage names now, when known. */
  activeAs: string | null;
}

interface TabAccountRecord {
  key: string;
  handle: string | null;
}

function readRecord(): TabAccountRecord | null {
  try {
    const raw = sessionStorage.getItem(TAB_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TabAccountRecord>;
    return typeof parsed.key === 'string'
      ? { key: parsed.key, handle: typeof parsed.handle === 'string' ? parsed.handle : null }
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether this page load brought a tab back rather than opening a page fresh.
 * An OAuth return or a typed URL is a fresh navigation and may well be a new
 * account on purpose; a reload or a discarded tab coming back is not.
 */
export function wasRestoredLoad(): boolean {
  try {
    if ((document as Document & { wasDiscarded?: boolean }).wasDiscarded) return true;
    const entry = performance.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry?.type === 'reload' || entry?.type === 'back_forward';
  } catch {
    return false;
  }
}

/**
 * Keeps a tab from acting as an account the reader did not see it load as.
 *
 * The failure it prevents: a feed opened as a personal account, a second tab
 * switched to a work account, and then a like, boost or reply from the first
 * tab landing on the work account. Each tab holds its identity in memory, but
 * they share storage, and a tab that reloads (phones discard background tabs
 * routinely) comes back as whoever storage names.
 *
 * Authenticated writes check {@link allowWrite} in the auth interceptor; reads
 * are never blocked. The shell shows {@link conflict} with a way out.
 */
@Injectable({ providedIn: 'root' })
export class AccountTabGuard {
  private auth = inject(Auth);
  readonly conflict = signal<AccountTabConflict | null>(null);
  /** Set when this load came back as a different account; cleared by the reader. */
  private restoredFrom: TabAccountRecord | null = null;
  /** Set while this tab reloads at the reader's request: nothing more to record. */
  private reloading = false;

  constructor() {
    const previous = readRecord();
    if (previous && previous.key !== this.auth.identityKey() && wasRestoredLoad()) {
      this.restoredFrom = previous;
      this.conflict.set({
        reason: 'restored',
        loadedAs: previous.handle,
        activeAs: this.auth.account()?.acct ?? null,
      });
    }
    // Kept current while the tab acts as its own account, so a discarded tab
    // remembers who it was showing.
    effect(() => {
      const record = { key: this.auth.identityKey(), handle: this.auth.account()?.acct ?? null };
      if (!this.restoredFrom && !this.reloading) this.write(record);
    });
    // On the way out (including this tab's own account switch, which reloads),
    // record the identity in memory; storage may already name another account.
    const onPageHide = () => {
      if (!this.restoredFrom && !this.reloading) {
        this.write({ key: this.auth.identityKey(), handle: this.auth.account()?.acct ?? null });
      }
    };
    // Tell the reader as soon as another tab switches, not only when they act.
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage) this.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.refresh();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /**
   * Whether an authenticated write may go out from this tab now. When it may
   * not, {@link conflict} is set so the shell explains why.
   */
  allowWrite(): boolean {
    if (this.restoredFrom) return false;
    if (this.auth.matchesStoredAccount()) return true;
    this.raiseOtherTab();
    return false;
  }

  /** Re-check storage, e.g. when the tab comes back into view. */
  refresh(): void {
    if (this.restoredFrom) return;
    if (this.auth.matchesStoredAccount()) {
      if (this.conflict()?.reason === 'other-tab') this.conflict.set(null);
    } else {
      this.raiseOtherTab();
    }
  }

  /** The reader saw the restored tab's account and wants to carry on as it. */
  continueAsActive(): void {
    this.restoredFrom = null;
    this.conflict.set(null);
    this.write({ key: this.auth.identityKey(), handle: this.auth.account()?.acct ?? null });
  }

  /** Reload so the whole tab, feed included, belongs to the account now active. */
  reload(): void {
    // The reload is the reader's choice: forget this tab's old account so the
    // next load is not reported as a restore.
    this.reloading = true;
    try {
      sessionStorage.removeItem(TAB_ACCOUNT_KEY);
    } catch {
      // Nothing recorded is the same as nothing to compare.
    }
    location.reload();
  }

  private raiseOtherTab(): void {
    this.conflict.set({
      reason: 'other-tab',
      loadedAs: this.auth.account()?.acct ?? null,
      activeAs: this.auth.storedAccountHandle(),
    });
  }

  private write(record: TabAccountRecord): void {
    try {
      sessionStorage.setItem(TAB_ACCOUNT_KEY, JSON.stringify(record));
    } catch {
      // A tab that cannot remember still blocks other-tab writes; it only
      // loses the reload warning.
    }
  }
}
