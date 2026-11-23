import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { describeError } from './bulk-actions';
import {
  DECAY_NOTIFICATION_TYPES,
  DecayEvent,
  DecayPost,
  DecayResult,
  classifyNotification,
  computeDecay,
} from './interaction-decay';
import { EngagedAccumulator, EngagedSummary } from './engaged-audience';

/** Mastodon caps notification pages at 80. */
export const DECAY_PAGE_SIZE = 80;

/**
 * Most pages one run reads (60 × 80 = 4,800 notifications).
 *
 * Enough to reach back past 40 posts for nearly every account. A very busy
 * account hits it first, and the result then says it did not reach the
 * oldest post.
 */
export const DECAY_MAX_PAGES = 60;

/**
 * How far back to read when there are no posts old enough for a decay curve.
 * The engaged-audience figures still want a window, and 30 days matches the
 * rest of the analytics page.
 */
export const FALLBACK_WINDOW_MS = 30 * 86_400_000;

/** Why the walk stopped. */
export type DecayStop = 'reachedOldest' | 'serverEnd' | 'pageCap' | 'cancelled';

export interface DecayScanState {
  phase: 'scanning' | 'done' | 'cancelled' | 'failed';
  /** The account the run belongs to, so a different account's page ignores it. */
  accountId: string;
  /** Requests made. */
  pages: number;
  /** Notifications read (all types requested). */
  read: number;
  /** Interactions on target posts found so far. */
  matched: number;
  /** Oldest notification time read, epoch ms; null before the first page. */
  reachedBack: number | null;
  /** Oldest target post's time, epoch ms. */
  oldestPost: number;
  stop?: DecayStop;
  result?: DecayResult;
  /** Target posts left out because the notifications read don't reach them. */
  excluded?: number;
  /** When people who interact are around and what they write in. */
  engaged?: EngagedSummary;
  error?: string;
}

/**
 * The posts the notifications read fully cover.
 *
 * When the walk did not get back past the oldest post, a post older than the
 * oldest notification read would show only its late interactions, which is a
 * worse curve than none, so it is left out. A post is covered when it was
 * made at or after the oldest notification read.
 */
export function coveredPosts(
  posts: DecayPost[],
  stop: DecayStop,
  reachedBack: number | null,
): DecayPost[] {
  if (stop === 'reachedOldest') {
    return posts;
  }
  if (reachedBack === null) {
    return [];
  }
  return posts.filter((p) => p.createdAt >= reachedBack);
}

/**
 * Pages the signed-in account's like, boost and mention notifications back to
 * the oldest target post, and builds the decay curves from them.
 *
 * A root service, like {@link AudienceScan}, so a run survives leaving the tab.
 * The same pages also feed {@link EngagedAccumulator}, so one read answers both
 * "when are my posts done?" and "when is my audience around?".
 * Only the interactions on target posts are kept; the notifications themselves
 * are dropped page by page. Stopping keeps what was read: a curve built from
 * the newer posts is still a curve, and the panel says the run stopped early.
 */
@Injectable({ providedIn: 'root' })
export class InteractionDecayScan {
  private readonly api = inject(Api);

  readonly state = signal<DecayScanState | null>(null);
  readonly running = computed(() => this.state()?.phase === 'scanning');

  private cancelRequested = false;

  cancel(): void {
    this.cancelRequested = true;
  }

  /**
   * Run a read. With no target posts, the walk still runs over the last
   * {@link FALLBACK_WINDOW_MS} for the engaged-audience figures.
   */
  async start(accountId: string, posts: DecayPost[]): Promise<void> {
    if (this.running()) {
      return;
    }
    this.cancelRequested = false;
    const oldestPost = posts.length
      ? Math.min(...posts.map((p) => p.createdAt))
      : Date.now() - FALLBACK_WINDOW_MS;
    const postIds = new Set(posts.map((p) => p.id));
    const events: DecayEvent[] = [];
    const engaged = new EngagedAccumulator();
    this.state.set({
      phase: 'scanning',
      accountId,
      pages: 0,
      read: 0,
      matched: 0,
      reachedBack: null,
      oldestPost,
    });

    let stop: DecayStop = 'pageCap';
    try {
      let maxId: string | undefined;
      for (let page = 0; page < DECAY_MAX_PAGES; page++) {
        if (this.cancelRequested) {
          stop = 'cancelled';
          break;
        }
        const batch = await firstValueFrom(
          this.api.notifications(maxId, {
            types: [...DECAY_NOTIFICATION_TYPES],
            limit: DECAY_PAGE_SIZE,
          }),
        );
        let oldest: number | null = null;
        for (const notification of batch) {
          const event = classifyNotification(notification, postIds);
          if (event) {
            events.push(event);
          }
          engaged.add(notification);
          const at = Date.parse(notification.created_at);
          if (!Number.isNaN(at)) {
            oldest = oldest === null ? at : Math.min(oldest, at);
          }
        }
        this.patch((s) => ({
          ...s,
          pages: s.pages + 1,
          read: s.read + batch.length,
          matched: events.length,
          reachedBack: oldest === null ? s.reachedBack : Math.min(s.reachedBack ?? oldest, oldest),
        }));
        if (oldest !== null && oldest < oldestPost) {
          stop = 'reachedOldest';
          break;
        }
        const last = batch.at(-1);
        if (!last || batch.length < DECAY_PAGE_SIZE || last.id === maxId) {
          stop = 'serverEnd';
          break;
        }
        maxId = last.id;
      }
      // A cancel that lands during the last request still counts as a stop.
      if (this.cancelRequested && stop === 'pageCap') {
        stop = 'cancelled';
      }
      const reachedBack = this.state()?.reachedBack ?? null;
      const covered = coveredPosts(posts, stop, reachedBack);
      const result = computeDecay(covered, events);
      this.patch((s) => ({
        ...s,
        phase: stop === 'cancelled' ? 'cancelled' : 'done',
        stop,
        result,
        excluded: posts.length - covered.length,
        engaged: engaged.summary(),
      }));
    } catch (error) {
      this.patch((s) => ({ ...s, phase: 'failed', error: describeError(error) }));
    }
  }

  /** Clear a finished run. Refuses while one is running. */
  dismiss(): void {
    if (!this.running()) {
      this.state.set(null);
    }
  }

  private patch(update: (state: DecayScanState) => DecayScanState): void {
    this.state.update((s) => (s ? update(s) : s));
  }
}
