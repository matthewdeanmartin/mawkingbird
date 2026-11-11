import { Injectable, signal } from '@angular/core';
import { readOnboardingAccount, writeOnboardingAccount } from './onboarding-store';

/**
 * How the wizard was opened.
 *
 * - `auto`: first Home visit of a brand-new account. Resumes where it left off.
 * - `menu`: the … menu. Resumes if anything is unanswered, else a full rerun.
 */
export type OnboardingOpenMode = 'auto' | 'menu';

/** Paths the auto-start waits for. Never over login, callbacks or starter kits. */
function isHome(url: string): boolean {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return path === '/home' || path === '';
}

/**
 * Whether the onboarding card is open, and why.
 *
 * The only onboarding class the shell holds eagerly. The card itself is loaded
 * with `@defer` once {@link open} turns true, so the questions, controls and
 * their dependencies never reach the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingLauncher {
  readonly mode = signal<OnboardingOpenMode | null>(null);

  /** Open from the … menu. */
  openFromMenu(): void {
    this.mode.set('menu');
  }

  /**
   * Open automatically if this account is pending and the reader is on Home.
   *
   * Clears `pending` on the way: auto-start is a one-time offer. Quitting halfway
   * leaves the rest reachable from the menu, not re-armed for the next visit.
   */
  maybeAutoOpen(url: string, blocked: boolean): void {
    if (blocked || this.mode() || !isHome(url)) return;
    const record = readOnboardingAccount();
    if (!record?.pending) return;
    writeOnboardingAccount({ ...record, pending: false });
    this.mode.set('auto');
  }

  close(): void {
    this.mode.set(null);
  }
}
