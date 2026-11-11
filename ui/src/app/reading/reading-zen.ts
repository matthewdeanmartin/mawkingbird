import { computed, Injectable, signal } from '@angular/core';

/**
 * Reading zen: the chrome hidden for as long as a reading surface is open.
 *
 * The third of the three zen states, and the only transient one that leaves the
 * saved preference alone:
 *
 * | | Global zen (`ClientPrefs.zenMode`) | Writing zen | Reading zen (this) |
 * | --- | --- | --- | --- |
 * | Scope | the whole app | the writing surface | the rails, and optionally the chrome |
 * | Lifetime | a persisted preference | this visit | while a reading surface is open |
 * | Hides | the rails | everything | the rails; `full` also hides header and footer |
 *
 * Reader mode wants exactly what global zen does — the rails gone — but it must
 * not *become* global zen. Writing `prefs.setZenMode(true)` on entry and `false`
 * on exit would silently un-set the preference of someone who had zen on
 * already, and persist it, so one visit to an article would reconfigure the app
 * for good. Instead the shell reads "zen if the preference says so **or** a hold
 * is out", and reader mode takes and releases a hold. The preference is never
 * written, so restoring it on exit is not a step that can go wrong: there is
 * nothing to restore.
 *
 * Counted rather than boolean. Two overlapping holders — a reader-mode thread
 * and anything later that wants the same effect — would otherwise have the
 * first one to leave turn the rails back on underneath the second.
 *
 * ## Two depths
 *
 * A `rails` hold is the original behaviour: the rails go, the header and footer
 * stay. The feed reader and anything embedded in a normal page wants this.
 *
 * A `full` hold additionally hides the header and footer, which are shell-owned
 * and live outside the router outlet — so, exactly like {@link WritingZen}, the
 * page cannot hide them by itself. The reader page takes one of these: it is a
 * book, and a book does not have the app's navigation printed across the top of
 * every page.
 *
 * The two are counted separately, so a `rails` holder outliving a `full` holder
 * correctly brings back the chrome while keeping the rails hidden.
 */
@Injectable({ providedIn: 'root' })
export class ReadingZen {
  private readonly railsHolds = signal(0);
  private readonly chromeHolds = signal(0);

  /** Whether anything currently wants the rails hidden for reading. */
  readonly active = computed(() => this.railsHolds() > 0);

  /** Whether anything currently wants the header and footer gone too. */
  readonly chromeHidden = computed(() => this.chromeHolds() > 0);

  /**
   * Take a hold. Returns a release function that is safe to call more than
   * once — a page releasing on both "reader closed" and "component destroyed"
   * is the normal case, not a bug to guard against at the call site.
   *
   * `depth` of `full` also hides the header and footer. A `full` hold is always
   * a rails hold as well; there is no state where the chrome is gone and the
   * rails are not.
   */
  hold(depth: 'rails' | 'full' = 'rails'): () => void {
    this.railsHolds.update((n) => n + 1);
    if (depth === 'full') {
      this.chromeHolds.update((n) => n + 1);
    }
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.railsHolds.update((n) => Math.max(0, n - 1));
      if (depth === 'full') {
        this.chromeHolds.update((n) => Math.max(0, n - 1));
      }
    };
  }

  /** Drop every hold. For tests and for a hard navigation reset. */
  reset(): void {
    this.railsHolds.set(0);
    this.chromeHolds.set(0);
  }
}
