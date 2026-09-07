import { Injectable } from '@angular/core';
import { isCalmHidden } from './sentiment';
import { Status } from './models';

/**
 * Calm mode's verdict on a post, decided once and then held.
 *
 * ## The bug this exists to fix
 *
 * `isCalmHidden` is a function of the post's engagement counts — `isRatioed`
 * compares `replies_count` against `favourites_count + reblogs_count`. Those
 * counts change while you are looking at the feed, and the most common reason
 * they change is that *you* changed them.
 *
 * So: Calm mode on, a post sits just over the ratio line and is hidden. You
 * like something else nearby. The status card emits its update, the feed's
 * `visible()` computed re-runs, the filter re-decides — and a post that wasn't
 * there a moment ago appears mid-list, shoving everything below it down. Or the
 * reverse: you like a ratioed post, its favourite count ticks up, the ratio
 * flips, and the post you were reading vanishes from under your thumb.
 *
 * Either way the feed moves in response to a click that had nothing to do with
 * layout, which is disorienting in exactly the way an infinite feed must never
 * be.
 *
 * ## The fix, and its limit
 *
 * Decide once per post id, remember the answer, reuse it. A post's category is
 * fixed for as long as it is on screen; only a genuine reload re-asks.
 *
 * This deliberately does **not** change *what* Calm hides on first read — the
 * predicate is untouched. It changes only whether a post can silently switch
 * sides while being looked at. A post whose ratio genuinely changes (because
 * other people replied) gets re-categorised the next time the feed is loaded,
 * which is soon enough for a filter about tone.
 *
 * Keyed by status id and held in memory only: a persisted verdict would outlive
 * the conversation that justified it, and "this was heated last Tuesday" is not
 * a claim worth storing.
 */
@Injectable({ providedIn: 'root' })
export class CalmVerdicts {
  private verdicts = new Map<string, boolean>();

  /**
   * Whether Calm mode hides this post — the first answer given for this id,
   * not necessarily the answer its current counts would produce.
   */
  hidden(status: Status): boolean {
    const cached = this.verdicts.get(status.id);
    if (cached !== undefined) {
      return cached;
    }
    const verdict = isCalmHidden(status);
    this.verdicts.set(status.id, verdict);
    return verdict;
  }

  /**
   * Forget everything, so the next read re-decides.
   *
   * Called on a real feed reload — route change, pull-to-refresh — and
   * deliberately *not* on every recompute, which is the whole point.
   */
  reset(): void {
    this.verdicts.clear();
  }
}
