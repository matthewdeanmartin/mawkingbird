import { HomeAlgoSettings, ALGO_FACTORY, AlgoOptions } from './home-algo-settings';
import { effect, inject, Injectable, Injector, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { Account, Status, Tag } from './models';
import { AnonymousAccount } from './providers/anonymous/anonymous-account';
import { AnonymousAlgoSource } from './providers/anonymous/anonymous-algo-source';
import { AnonymousFollows } from './providers/anonymous/anonymous-follows';

/** Which bucket found the post — shown as the "why you're seeing this" line. */
export type AlgoSource = 'mutual' | 'boost' | 'original' | 'hashtag' | 'rss';

export interface AlgoPost {
  status: Status;
  source: AlgoSource;
  /** True when the author (or booster) is someone the user follows. */
  friend: boolean;
  /** Smoothed engagement of the boost target — see {@link engagementScore}. */
  score: number;
}

/** Factory call budget; each build obeys the account’s configured maximum. */
export const ALGO_MAX_CALLS = ALGO_FACTORY.maxCalls;
/**
 * Stop gathering once this many candidate posts are in the pool. Oversized on
 * purpose (~40% above what the page comfortably shows): the client-side calm /
 * audience / tags filters thin the pool afterwards — calm mode alone can hide
 * ~30% — and an over-full pool is what keeps the filtered feed from going
 * anemic.
 */
export const ALGO_TARGET_POSTS = ALGO_FACTORY.targetPosts;

/** A metered fetch: counts against the build's call budget, never throws. */
type BudgetFetch = <T>(fallback: T, fetch: () => Observable<T>) => Observable<T>;

/**
 * Smoothed engagement: (favs+1) × (boosts+1) × √(replies+1).
 *
 * Replies are square-rooted on purpose: reply pile-ons are how anger shows up
 * in the metrics (a "ratio" is exactly many replies over few likes), so a
 * full-weight reply factor pushes fights to the top of the ranking — and past
 * the {@link ALGO_TARGET_POSTS} cutoff at the expense of genuinely liked
 * posts. Favs and boosts are endorsements; replies are merely attention.
 */
export function engagementScore(status: Status, options: AlgoOptions = ALGO_FACTORY): number {
  const target = status.reblog ?? status;
  return (
    Math.pow(target.favourites_count + 1, options.likeWeight) *
    Math.pow(target.reblogs_count + 1, options.boostWeight) *
    Math.pow(target.replies_count + 1, options.replyWeight) *
    (options.recencyHalfLife > 0
      ? Math.pow(
          0.5,
          Math.max(0, Date.now() - Date.parse(target.created_at)) /
            (options.recencyHalfLife * 3600000),
        )
      : 1)
  );
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds the ✨ Algo feed: the consumer-centric algorithmic timeline.
 *
 * Sources only content the user already asked for — mutuals' top posts, top
 * boosts and originals from the recent home feed, and one randomly chosen
 * followed hashtag — ranked by smoothed engagement. Deliberately NOT
 * network-focused: no trending injection, ever.
 *
 * The build costs up to {@link ALGO_MAX_CALLS} API calls, so the result is
 * cached in this root service: navigating away and back is free, and only the
 * explicit refresh button rebuilds. Every fetch is individually error-tolerant
 * (a dead bucket just contributes nothing).
 */
@Injectable({ providedIn: 'root' })
export class AlgoFeed {
  private settings = inject(HomeAlgoSettings);
  private get options(): AlgoOptions {
    return this.settings.value().algo;
  }
  private api = inject(Api);
  private auth = inject(Auth);
  private injector = inject(Injector);

  readonly posts = signal<AlgoPost[]>([]);
  readonly loading = signal(false);
  /** Could not build at all (no account); partial bucket failures are tolerated. */
  readonly error = signal(false);
  /** Wall-clock time of the last successful build; null = never built. */
  readonly builtAt = signal<number | null>(null);
  readonly callsUsed = signal(0);
  /** The followed hashtag sampled for this build, if any. */
  readonly hashtag = signal<string | null>(null);

  /** A build was requested before verify_credentials resolved the account. */
  private pendingBuild = signal(false);

  constructor() {
    // Landing directly on /algo races the account fetch: hold the build until
    // the account arrives instead of failing.
    effect(() => {
      if (this.pendingBuild() && this.auth.account()) {
        this.pendingBuild.set(false);
        this.refresh();
      }
    });
  }

  /** Build on first visit; later visits reuse the cached feed. */
  ensureBuilt(): void {
    if (this.builtAt() === null && !this.loading()) {
      this.refresh();
    }
  }

  refresh(): void {
    const me = this.auth.account();
    if (!me) {
      // Behind the auth guard an account is coming; show loading, build then.
      this.loading.set(true);
      this.pendingBuild.set(true);
      return;
    }
    this.loading.set(true);
    this.error.set(false);

    if (this.auth.isAnonymous) {
      this.refreshAnonymous();
      return;
    }

    let calls = 0;
    // Published as it climbs, not just at the end: a build is a dozen-odd
    // sequential requests behind one "Gathering the good stuff…", which looks
    // identical to a hung page unless something visibly moves. Every fetch in
    // the build funnels through here, so this is the one place that sees them.
    this.callsUsed.set(0);
    const budget: BudgetFetch = (fallback, fetch) => {
      if (calls >= this.options.maxCalls) {
        return of(fallback);
      }
      calls++;
      this.callsUsed.set(calls);
      return fetch().pipe(catchError(() => of(fallback)));
    };

    forkJoin({
      following: budget<Account[]>([], () => this.api.accountFollowing(me.id)),
      followers: budget<Account[]>([], () => this.api.accountFollowers(me.id)),
    })
      .pipe(
        switchMap(({ following, followers }) => {
          const followerIds = new Set(followers.map((a) => a.id));
          const mutuals = this.options.mutual ? following.filter((a) => followerIds.has(a.id)) : [];
          return this.fetchPages(this.options.homePages, budget, (maxId) =>
            this.api.homeTimeline(maxId),
          ).pipe(map((home) => ({ following, mutuals, home })));
        }),
        switchMap(({ following, mutuals, home }) => {
          // Reserve calls for the hashtag bucket; sample what the budget allows.
          const room = Math.max(0, this.options.maxCalls - calls - this.options.hashtagReserve);
          const sample =
            home.length >= this.options.targetPosts
              ? []
              : shuffle(mutuals).slice(0, Math.min(this.options.mutualSample, room));
          const mutual$ = sample.length
            ? forkJoin(
                sample.map((a) =>
                  budget<Status[]>([], () =>
                    this.api.getAccountStatuses(a.id, {
                      excludeReplies: this.options.excludeReplies,
                      limit: this.options.mutualStatusLimit,
                    }),
                  ),
                ),
              )
            : of([] as Status[][]);
          return mutual$.pipe(map((pages) => ({ following, home, mutualStatuses: pages.flat() })));
        }),
        switchMap(({ following, home, mutualStatuses }) => {
          const done = {
            following,
            home,
            mutualStatuses,
            tagName: null as string | null,
            tagStatuses: [] as Status[],
          };
          if (
            !this.options.hashtag ||
            home.length + mutualStatuses.length >= this.options.targetPosts
          ) {
            return of(done);
          }
          return budget<Tag[]>([], () => this.api.followedTags()).pipe(
            switchMap((tags) => {
              if (!tags.length) {
                return of(done);
              }
              const selected =
                this.options.hashtagCount === 1
                  ? [tags[Math.floor(Math.random() * tags.length)]]
                  : shuffle(tags).slice(0, this.options.hashtagCount);
              return forkJoin(
                selected.map((tag) =>
                  this.fetchPages(this.options.hashtagPages, budget, (maxId) =>
                    this.api.tagTimeline(tag.name, maxId),
                  ),
                ),
              ).pipe(
                map((pages) => ({
                  ...done,
                  tagName: selected.map((tag) => tag.name).join(', '),
                  tagStatuses: pages.flat(),
                })),
              );
            }),
          );
        }),
      )
      .subscribe(({ following, home, mutualStatuses, tagName, tagStatuses }) => {
        this.assemble(me.id, following, home, mutualStatuses, tagStatuses);
        this.hashtag.set(tagName);
        this.callsUsed.set(calls);
        this.builtAt.set(Date.now());
        this.loading.set(false);
      });
  }

  /** Re-deal the cached feed in random order — same posts, fresh sequence. */
  shufflePosts(): void {
    this.posts.update((list) => shuffle(list));
  }

  /** Reflect an interaction (fav/boost/edit) back into the cached feed. */
  updateStatus(original: Status, updated: Status): void {
    this.posts.update((list) =>
      list.map((p) => (p.status === original ? { ...p, status: updated } : p)),
    );
  }

  removeStatus(id: string): void {
    this.posts.update((list) => list.filter((p) => p.status.id !== id));
  }

  private refreshAnonymous(): void {
    const source = this.injector.get(AnonymousAlgoSource);
    source.refresh().subscribe(({ statuses, acquired }) => {
      this.assembleAnonymous(statuses);
      this.hashtag.set(null);
      this.callsUsed.set(acquired ? 1 : 0);
      this.builtAt.set(Date.now());
      this.loading.set(false);
    });
  }

  private assembleAnonymous(statuses: Status[]): void {
    const follows = this.injector.get(AnonymousFollows);
    const anonymous = this.injector.get(AnonymousAccount);
    const pool = new Map<string, AlgoPost>();
    for (const status of statuses) {
      const target = status.reblog ?? status;
      const key = target.url || `${target.provider ?? 'mastodon'}:${target.id}`;
      if (pool.has(key)) continue;
      const friend = follows.isFollowing(target.account, anonymous.server());
      const source: AlgoSource =
        target.provider === 'rss'
          ? 'rss'
          : status.reblog
            ? 'boost'
            : friend
              ? 'original'
              : 'hashtag';
      if (!this.options[source]) continue;
      pool.set(key, { status, source, friend, score: this.score(status, source) });
    }
    this.posts.set(
      [...pool.values()]
        .sort(
          (a, b) =>
            b.score - a.score || Date.parse(b.status.created_at) - Date.parse(a.status.created_at),
        )
        .slice(0, this.options.targetPosts),
    );
  }

  private score(status: Status, source: AlgoSource): number {
    const weights = {
      mutual: this.options.mutualWeight,
      boost: this.options.boostSourceWeight,
      original: this.options.originalWeight,
      hashtag: this.options.hashtagWeight,
      rss: this.options.rssWeight,
    };
    return engagementScore(status, this.options) * weights[source];
  }

  /** Up to `remaining` consecutive pages, chained on max_id, budget permitting. */
  private fetchPages(
    remaining: number,
    budget: BudgetFetch,
    fetch: (maxId?: string) => Observable<Status[]>,
    maxId?: string,
  ): Observable<Status[]> {
    if (remaining <= 0) {
      return of([]);
    }
    return budget<Status[]>([], () => fetch(maxId)).pipe(
      switchMap((page) => {
        const last = page.at(-1);
        // A short page means the timeline is exhausted.
        if (!last || page.length < 20 || remaining === 1) {
          return of(page);
        }
        return this.fetchPages(remaining - 1, budget, fetch, last.id).pipe(
          map((rest) => [...page, ...rest]),
        );
      }),
    );
  }

  private assemble(
    myId: string,
    following: Account[],
    home: Status[],
    mutualStatuses: Status[],
    tagStatuses: Status[],
  ): void {
    const followingIds = new Set(following.map((a) => a.id));
    // Dedupe on the boost target so a post never appears twice under two wrappers.
    const pool = new Map<string, AlgoPost>();
    const add = (status: Status, source: AlgoSource, friend: boolean): void => {
      const target = status.reblog ?? status;
      // This is the good stuff: no likes, no entry.
      if (
        (this.options.requireLikes && target.favourites_count < 1) ||
        !this.options[source] ||
        (this.options.excludeReplies && target.in_reply_to_id !== null)
      ) {
        return;
      }
      if (!pool.has(target.id)) {
        pool.set(target.id, { status, source, friend, score: this.score(status, source) });
      }
    };

    // Most specific source first — a mutual's post found twice stays "mutual".
    for (const s of mutualStatuses) {
      if (!s.reblog && (!this.options.excludeOwn || s.account.id !== myId)) {
        add(s, 'mutual', true);
      }
    }
    for (const s of home) {
      if (this.options.excludeOwn && s.account.id === myId) {
        continue; // my own posts aren't "the good stuff"
      }
      if (s.reblog) {
        add(s, 'boost', true);
      } else if (!this.options.excludeReplies || !s.in_reply_to_id) {
        add(s, 'original', true);
      }
    }
    for (const s of tagStatuses) {
      if (!s.reblog && (!this.options.excludeOwn || s.account.id !== myId)) {
        add(s, 'hashtag', followingIds.has(s.account.id));
      }
    }

    const ranked = [...pool.values()]
      .sort(
        (a, b) =>
          b.score - a.score || Date.parse(b.status.created_at) - Date.parse(a.status.created_at),
      )
      .slice(0, this.options.targetPosts);
    this.posts.set(ranked);
  }
}
