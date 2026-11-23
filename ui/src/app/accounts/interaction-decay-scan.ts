import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { MastodonNotification } from '../platform/api/models';
import { Auth } from '../platform/session/auth';
import { NATIVE_ANALYTICS, NATIVE_NOTIFICATION_COLLECT } from '../platform/session/platform-login';
import { archiveDays, archiveNotifications } from './archive-reactions';
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
import { ReactionLog, ReactionLogBuilder } from './reaction-log';

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

/**
 * How long the native app waits for a check for new notifications before
 * reading the archive as it stands. The check carries on in the background.
 */
export const COLLECT_WAIT_MS = 10_000;

/** Why the walk stopped. */
export type DecayStop = 'reachedOldest' | 'serverEnd' | 'pageCap' | 'cancelled' | 'archiveStart';

export interface DecayScanState {
  phase: 'scanning' | 'done' | 'cancelled' | 'failed';
  /** The account the run belongs to, so a different account's page ignores it. */
  accountId: string;
  /** Where the notifications come from. */
  source?: 'server' | 'archive';
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
  /** Every timed reaction read: the discovery rate and top boosters. */
  log?: ReactionLog;
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

/** Everything one read collects, whichever source feeds it. */
class Collected {
  readonly events: DecayEvent[] = [];
  private readonly engaged = new EngagedAccumulator();
  private readonly log: ReactionLogBuilder;
  private readonly seen = new Set<string>();
  private readonly postIds: ReadonlySet<string>;

  constructor(
    accountId: string,
    private readonly posts: DecayPost[],
  ) {
    this.log = new ReactionLogBuilder(accountId);
    this.postIds = new Set(posts.map((p) => p.id));
  }

  /** Count a batch; returns only the notifications not counted before. */
  add(batch: MastodonNotification[]): MastodonNotification[] {
    const fresh = batch.filter((n) => !this.seen.has(n.id));
    for (const notification of fresh) {
      this.seen.add(notification.id);
      const event = classifyNotification(notification, this.postIds);
      if (event) {
        this.events.push(event);
      }
      this.engaged.add(notification);
      this.log.add(notification);
    }
    return fresh;
  }

  finish(
    stop: DecayStop,
    reachedBack: number | null,
  ): Pick<DecayScanState, 'stop' | 'result' | 'excluded' | 'engaged' | 'log'> {
    const covered = coveredPosts(this.posts, stop, reachedBack);
    return {
      stop,
      result: computeDecay(covered, this.events),
      excluded: this.posts.length - covered.length,
      engaged: this.engaged.summary(),
      log: this.log.build(),
    };
  }
}

/**
 * Pages the signed-in account's like, boost, mention and follow notifications
 * back to the oldest target post, and builds the decay curves from them.
 *
 * The native app reads its archive instead, which reaches past what the server
 * keeps. Until the archive has joined new notifications to older ones, it
 * could have gaps, so the server is read as on the web.
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
  private readonly injector = inject(Injector);
  private readonly native = inject(NATIVE_ANALYTICS);
  private readonly collect = inject(NATIVE_NOTIFICATION_COLLECT);

  readonly state = signal<DecayScanState | null>(null);
  readonly running = computed(() => this.state()?.phase === 'scanning');

  private cancelRequested = false;

  cancel(): void {
    this.cancelRequested = true;
    this.endWait?.();
  }

  private endWait: (() => void) | null = null;

  /** The archive credential for this account, in the native app only. */
  private archiveHandle(accountId: string): string | null {
    if (!this.native) {
      return null;
    }
    const auth = this.injector.get(Auth);
    const handle = auth.token();
    return handle?.startsWith('native-mastodon:') && auth.account()?.id === accountId
      ? handle
      : null;
  }

  /** Whether a run for this account starts with the archive on this device. */
  usesArchive(accountId: string): boolean {
    return this.archiveHandle(accountId) !== null;
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
    const archive = this.archiveHandle(accountId);
    this.state.set({
      phase: 'scanning',
      accountId,
      source: archive ? 'archive' : 'server',
      pages: 0,
      read: 0,
      matched: 0,
      reachedBack: null,
      oldestPost,
    });
    try {
      if (archive && (await this.readArchive(archive, accountId, posts, oldestPost))) {
        return;
      }
      if (this.cancelRequested) {
        this.patch((s) => ({ ...s, phase: 'cancelled', stop: 'cancelled' }));
        return;
      }
      this.patch((s) => ({ ...s, source: 'server' }));
      await this.readServer(accountId, posts, oldestPost);
    } catch (error) {
      this.patch((s) => ({ ...s, phase: 'failed', error: describeError(error) }));
    }
  }

  /** Read the archive. False when it can't answer yet, so the server should. */
  private async readArchive(
    handle: string,
    accountId: string,
    posts: DecayPost[],
    oldestPost: number,
  ): Promise<boolean> {
    if (this.collect) {
      // Its failure (offline, busy) only means the archive is a little older.
      await Promise.race([
        this.collect(handle).catch(() => undefined),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, COLLECT_WAIT_MS);
          this.endWait = () => {
            clearTimeout(timer);
            resolve();
          };
        }),
      ]);
      this.endWait?.();
      this.endWait = null;
    }
    const rows = await this.native!.reactions(handle, archiveDays(oldestPost)).catch(() => null);
    const reachedBack = rows?.coveredSince ? Date.parse(rows.coveredSince) : NaN;
    if (!rows?.connected || Number.isNaN(reachedBack)) {
      return false;
    }
    const collected = new Collected(accountId, posts);
    const fresh = collected.add(archiveNotifications(rows));
    this.patch((s) => ({
      ...s,
      phase: 'done',
      read: fresh.length,
      matched: collected.events.length,
      reachedBack,
      ...collected.finish(
        reachedBack <= oldestPost ? 'reachedOldest' : 'archiveStart',
        reachedBack,
      ),
    }));
    return true;
  }

  private async readServer(
    accountId: string,
    posts: DecayPost[],
    oldestPost: number,
  ): Promise<void> {
    const collected = new Collected(accountId, posts);
    let stop: DecayStop = 'pageCap';
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
      const fresh = collected.add(batch);
      let oldest: number | null = null;
      for (const notification of fresh) {
        const at = Date.parse(notification.created_at);
        if (!Number.isNaN(at)) {
          oldest = oldest === null ? at : Math.min(oldest, at);
        }
      }
      this.patch((s) => ({
        ...s,
        pages: s.pages + 1,
        read: s.read + fresh.length,
        matched: collected.events.length,
        reachedBack: oldest === null ? s.reachedBack : Math.min(s.reachedBack ?? oldest, oldest),
      }));
      if (oldest !== null && oldest < oldestPost) {
        stop = 'reachedOldest';
        break;
      }
      // A short page is not the end: servers may cap pages lower than the
      // limit asked for, or drop rows after counting them. Only a page with
      // nothing new is.
      const last = fresh.at(-1);
      if (!last) {
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
    this.patch((s) => ({
      ...s,
      phase: stop === 'cancelled' ? 'cancelled' : 'done',
      ...collected.finish(stop, reachedBack),
    }));
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
