import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { AnonymousPublicApi } from './providers/anonymous/anonymous-public-api';
import { AnonymousPublicRef } from './providers/anonymous/anonymous-route-ref';
import { describeError } from './bulk-actions';
import {
  AudienceEstimate,
  AudienceTally,
  estimateAudience,
  mergeTally,
  tallyAudience,
} from './effective-audience';
import { Account } from './models';

/**
 * Walks an account's follower and following lists to work out how much of the
 * audience is actually alive — the read half of "effective friends/followers".
 *
 * ## Why this is a service
 *
 * Same reason as {@link ./bulk-actions}: the job is minutes long on a large
 * account and it must survive the dialog. Scoring is free (every signal is
 * already on the account objects the list endpoints return), so the entire cost
 * is pagination: {@link PAGE_SIZE} accounts per request, which makes a
 * 5,000-follower account about 63 calls per direction.
 *
 * That is expensive enough to need consent and a stop button, and cheap enough
 * to be worth offering — which is the whole shape of this feature. Nothing is
 * written, so stopping is always safe and needs no confirmation.
 *
 * ## Stopping early is a first-class outcome, not a failure
 *
 * Unlike a bulk *write*, a partial read here still answers the question: the
 * rates measured over the first 1,800 followers extrapolate to the other 3,200
 * perfectly well. So cancelling keeps the tally and marks it as a sample, rather
 * than discarding it the way {@link BulkActions.preview} has to.
 *
 * The one thing that would make that dishonest is pretending a sample is a
 * census, so {@link AudienceEstimate.complete} and `coverage` ride along with
 * every result and the UI states them.
 *
 * ## Sampling bias, stated plainly
 *
 * Mastodon returns followers newest-first, so a partial scan is biased toward
 * *recent* followers. Recent followers skew active, which means an early stop
 * tends to **overstate** the effective count. That is a real limitation of the
 * cheap version; it is surfaced in the dialog rather than hidden, and it is why
 * the scan runs to completion by default instead of sampling by default.
 */

/** Mastodon caps follower/following pages at 80. */
const PAGE_SIZE = 80;

/**
 * Hard ceiling on pages per direction (80 × 200 = 16,000 accounts).
 *
 * A guard against a server that keeps handing out cursors, not a product limit
 * — it sits far past any audience a user of this app is likely to have, and the
 * result says `complete: false` if it is ever hit, so the number stays honest.
 */
const MAX_PAGES = 200;

/** Which side of the relationship is being measured. */
export type AudienceSide = 'followers' | 'following';

/** Live progress of one direction's walk, for the dialog's progress bar. */
export interface SideProgress {
  side: AudienceSide;
  /** Accounts read so far. */
  scanned: number;
  /** What the server says the total is — the denominator for the bar. */
  total: number;
  /** Requests issued for this side. */
  apiCalls: number;
  /** True once this side has stopped, whether finished, capped or cancelled. */
  done: boolean;
}

/** Everything the dialog renders while a scan is in flight or finished. */
export interface AudienceScanState {
  phase: 'scanning' | 'done' | 'cancelled' | 'failed';
  /** Which sides were requested, in the order they run. */
  sides: AudienceSide[];
  progress: Record<AudienceSide, SideProgress | null>;
  results: Partial<Record<AudienceSide, AudienceEstimate>>;
  error?: string;
}

/** What to measure, and what the server claims the totals are. */
export interface AudienceScanRequest {
  accountId: string;
  followersTotal: number;
  followingTotal: number;
  sides: AudienceSide[];
  /** Present when reading an anonymous public profile (read-only API). */
  publicRef?: AnonymousPublicRef | null;
}

@Injectable({ providedIn: 'root' })
export class AudienceScan {
  private readonly api = inject(Api);
  private readonly anonymous = inject(AnonymousPublicApi);

  /** The current or most recent scan; null before anything has run. */
  readonly state = signal<AudienceScanState | null>(null);

  private cancelRequested = false;

  readonly running = computed(() => this.state()?.phase === 'scanning');

  /**
   * Overall progress across every requested side, 0–1, or null when nothing is
   * known yet. Sides are weighted by their totals rather than counted equally,
   * so scanning 40 friends and 5,000 followers doesn't show 50% after the easy
   * half.
   */
  readonly percent = computed<number | null>(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    let scanned = 0;
    let total = 0;
    for (const side of state.sides) {
      const progress = state.progress[side];
      if (progress) {
        scanned += progress.scanned;
        total += Math.max(progress.total, progress.scanned);
      }
    }
    return total > 0 ? Math.min(1, scanned / total) : null;
  });

  /** Total requests issued so far — the number that keeps moving on a slow scan. */
  readonly apiCalls = computed(() => {
    const state = this.state();
    if (!state) {
      return 0;
    }
    return state.sides.reduce((sum, side) => sum + (state.progress[side]?.apiCalls ?? 0), 0);
  });

  /**
   * Stop the scan.
   *
   * Nothing has been written, so this needs no confirmation — and unlike a
   * cancelled bulk preview, whatever was read is kept and reported as a sample.
   */
  cancel(): void {
    this.cancelRequested = true;
  }

  /** Clear a finished scan. Refuses while one is still running. */
  dismiss(): void {
    if (!this.running()) {
      this.state.set(null);
    }
  }

  /** Run a scan. Resolves when every requested side has finished or stopped. */
  async start(request: AudienceScanRequest): Promise<void> {
    if (this.running()) {
      return;
    }
    this.cancelRequested = false;
    this.state.set({
      phase: 'scanning',
      sides: request.sides,
      progress: { followers: null, following: null },
      results: {},
    });

    try {
      for (const side of request.sides) {
        // A cancel between sides must not start the next one, but everything
        // already measured stays — see the class comment on partial reads.
        if (this.cancelRequested) {
          break;
        }
        const total = side === 'followers' ? request.followersTotal : request.followingTotal;
        const tally = await this.walk(side, request, total);
        this.patch((state) => ({
          ...state,
          results: { ...state.results, [side]: estimateAudience(tally, total) },
        }));
      }
      this.patch((state) => ({
        ...state,
        phase: this.cancelRequested ? 'cancelled' : 'done',
      }));
    } catch (error) {
      this.patch((state) => ({ ...state, phase: 'failed', error: describeError(error) }));
    }
  }

  /**
   * Page one side, tallying each batch as it lands.
   *
   * Accounts are scored per-page and discarded rather than accumulated: a
   * 16,000-account list would otherwise sit in memory for the whole scan to
   * produce five integers. `now` is pinned once per side so a scan that takes
   * three minutes doesn't judge its last page against a different "today" than
   * its first.
   */
  private async walk(
    side: AudienceSide,
    request: AudienceScanRequest,
    total: number,
  ): Promise<AudienceTally> {
    const now = Date.now();
    let tally: AudienceTally = { scanned: 0, active: 0, dormant: 0, lowCadence: 0, zombies: 0 };
    let maxId: string | undefined;
    /**
     * Ids already counted.
     *
     * A belt to the Link-header braces: any cursor bug — ours, or a server
     * echoing the same page — shows up as re-reading accounts, and counting
     * them twice produces the nonsense this guard exists to prevent ("9,040 of
     * 3,109 read"). Also correct on its own terms: a list that shifts under a
     * long walk can legitimately repeat an account across pages.
     */
    const seen = new Set<string>();

    this.setProgress(side, { side, scanned: 0, total, apiCalls: 0, done: false });

    for (let page = 0; page < MAX_PAGES; page++) {
      if (this.cancelRequested) {
        break;
      }
      const { accounts, nextMaxId } = await this.fetchPage(side, request, maxId);
      const fresh = accounts.filter((a) => !seen.has(a.id));
      for (const account of fresh) {
        seen.add(account.id);
      }
      tally = mergeTally(tally, tallyAudience(fresh, now));
      this.bumpProgress(side, fresh.length);

      // Nothing new on a full page means the cursor is not advancing; stop
      // rather than spend the rest of MAX_PAGES re-reading the same accounts.
      if (!fresh.length) {
        break;
      }
      // No `rel="next"` is the end of the list. A short page means the same on
      // every server we have seen, and is the fallback when a server (our mock
      // included) answers without a Link header at all.
      if (!nextMaxId || accounts.length < PAGE_SIZE) {
        break;
      }
      maxId = nextMaxId;
    }

    this.setProgressPatch(side, { done: true });
    return tally;
  }

  /**
   * One page, with the server's own next cursor.
   *
   * The cursor must come from the `Link` header: `/followers` and `/following`
   * paginate by an internal relationship id that is absent from the account
   * objects, so `max_id = last account's id` silently re-reads page one.
   */
  private async fetchPage(
    side: AudienceSide,
    request: AudienceScanRequest,
    maxId: string | undefined,
  ): Promise<{ accounts: Account[]; nextMaxId: string | null }> {
    const ref = request.publicRef;
    const id = ref?.id ?? request.accountId;
    if (ref) {
      // The anonymous helper returns a bare array and pins `limit=80` itself, so
      // there is no header to read. The walk falls back to its short-page test
      // and the dedupe guard, which together terminate correctly — one wasted
      // request at the end at worst.
      const accounts = await firstValueFrom(
        side === 'followers'
          ? this.anonymous.getAccountFollowers({ ...ref, id }, maxId)
          : this.anonymous.getAccountFollowing({ ...ref, id }, maxId),
      );
      return { accounts, nextMaxId: accounts.length ? (accounts.at(-1)?.id ?? null) : null };
    }
    return firstValueFrom(
      side === 'followers'
        ? this.api.accountFollowersPage(id, maxId, PAGE_SIZE)
        : this.api.accountFollowingPage(id, maxId, PAGE_SIZE),
    );
  }

  private patch(update: (state: AudienceScanState) => AudienceScanState): void {
    this.state.update((state) => (state ? update(state) : state));
  }

  private setProgress(side: AudienceSide, progress: SideProgress): void {
    this.patch((state) => ({ ...state, progress: { ...state.progress, [side]: progress } }));
  }

  private setProgressPatch(side: AudienceSide, changes: Partial<SideProgress>): void {
    this.patch((state) => {
      const current = state.progress[side];
      return current
        ? { ...state, progress: { ...state.progress, [side]: { ...current, ...changes } } }
        : state;
    });
  }

  private bumpProgress(side: AudienceSide, read: number): void {
    this.patch((state) => {
      const current = state.progress[side];
      if (!current) {
        return state;
      }
      return {
        ...state,
        progress: {
          ...state.progress,
          [side]: {
            ...current,
            scanned: current.scanned + read,
            apiCalls: current.apiCalls + 1,
          },
        },
      };
    });
  }
}
