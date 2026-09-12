import { inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, forkJoin, map, Observable, of, switchMap, timeout } from 'rxjs';
import { accountScopeSuffix } from '../account-scope';
import { PrivateFollows } from '../private-follows';
import { Status } from '../models';
import { byNewestFirst } from '../status-sort';
import { AnonymousFollow } from './anonymous/anonymous-follows';
import { AnonymousPublicApi } from './anonymous/anonymous-public-api';
import { canonicalStatusKey } from './anonymous/anonymous-feed-corpus';
import { AnonymousProviderRef } from './anonymous/anonymous-mastodon-provider';
import { BlueskyApi } from './bluesky/bluesky-api';
import { adaptFeedItem } from './bluesky/bluesky-adapter';
import { FeedProvider } from './provider';

interface Cursor {
  follow: AnonymousFollow;
  next: string | null;
  exhausted: boolean;
}

/** Public author reads reuse the anonymous API adapters and never issue relationship writes. */
@Injectable({ providedIn: 'root' })
export class PrivateFollowFeeds {
  private follows = inject(PrivateFollows);
  private mastodon = inject(AnonymousPublicApi);
  private bluesky = inject(BlueskyApi);

  sources(): FeedProvider[] {
    const store = this.follows.current();
    if (!store) return [];
    const scope = accountScopeSuffix();
    return (['mastodon', 'bluesky'] as const).flatMap((network) => {
      const follows = store.follows().filter((follow) => follow.network === network);
      if (!follows.length) return [];
      return [new PrivateAuthorFeed(network, follows, scope, (cursor) => this.fetch(cursor))];
    });
  }

  private fetch(cursor: Cursor): Observable<Status[]> {
    const follow = cursor.follow;
    const previous = cursor.next;
    if (follow.network === 'bluesky') {
      return this.bluesky
        .getAuthorFeed(follow.readRef.accountId, previous, 'posts_and_author_threads', true)
        .pipe(
          map((page) => {
            cursor.next = page.cursor ?? null;
            cursor.exhausted = !cursor.next || cursor.next === previous || !page.feed?.length;
            return (page.feed ?? []).map((item) => adaptFeedItem(item));
          }),
        );
    }
    return this.mastodon
      .getAccountStatuses(
        { server: follow.readRef.server, id: follow.readRef.accountId },
        { excludeReplies: true, maxId: previous ?? undefined, limit: 20 },
      )
      .pipe(
        map((posts) => {
          cursor.next =
            (posts.at(-1)?.providerRef as AnonymousProviderRef | undefined)?.statusId ?? null;
          cursor.exhausted = posts.length < 20 || !cursor.next || cursor.next === previous;
          return posts;
        }),
      );
  }
}

/** Four concurrent reads, rotating authors so a prolific account cannot starve the others. */
class PrivateAuthorFeed implements FeedProvider {
  readonly label = 'Private follows';
  readonly badge = 'Private';
  readonly linked = signal(true);
  readonly errors = signal<string[]>([]);
  readonly unorderedPages = true;
  private queue: Cursor[] = [];
  private seen = new Set<string>();

  constructor(
    readonly id: 'mastodon' | 'bluesky',
    private follows: AnonymousFollow[],
    private scope: string,
    private fetchAuthor: (cursor: Cursor) => Observable<Status[]>,
  ) {}

  reset(): void {
    this.errors.set([]);
    this.seen.clear();
    this.queue = this.follows.map((follow) => ({ follow, next: null, exhausted: false }));
  }

  fetchPage(): Observable<Status[]> {
    if (accountScopeSuffix() !== this.scope) return of([]);
    const batch = this.queue.splice(0, 4);
    if (!batch.length) return of([]);
    const before = batch.map((cursor) => ({ ...cursor }));
    let completed = false;
    return forkJoin(
      batch.map((cursor) =>
        this.fetchAuthor(cursor).pipe(
          timeout(8_000),
          catchError(() => {
            cursor.exhausted = true;
            this.errors.update((errors) => [...errors, 'A private follow could not be read.']);
            return of<Status[]>([]);
          }),
        ),
      ),
    ).pipe(
      switchMap((pages) => {
        completed = true;
        if (accountScopeSuffix() !== this.scope) return of([]);
        this.queue.push(...batch.filter((cursor) => !cursor.exhausted));
        const posts = pages
          .flat()
          .filter((status) => {
            const key = canonicalStatusKey(status);
            if (this.seen.has(key)) return false;
            this.seen.add(key);
            return true;
          })
          .map((status) => ({ ...status, privateFollow: true }));
        // An empty batch is not the end if other followed accounts still have posts.
        return posts.length ? of(posts.sort(byNewestFirst)) : this.fetchPage();
      }),
      finalize(() => {
        // A round timeout must not silently consume partially read author pages.
        if (!completed) {
          batch.forEach((cursor, i) => Object.assign(cursor, before[i]));
          this.queue.unshift(...batch);
        }
      }),
    );
  }
}

/** Prefer normal timeline copies, whose ids and viewer relationship fields are authoritative. */
export function withoutPrivateFollowDuplicates(statuses: Status[]): Status[] {
  const key = canonicalStatusKey;
  const publicKeys = new Set(statuses.filter((status) => !status.privateFollow).map(key));
  const privateKeys = new Set<string>();
  return statuses.filter((status) => {
    if (!status.privateFollow) return true;
    const identity = key(status);
    if (publicKeys.has(identity) || privateKeys.has(identity)) return false;
    privateKeys.add(identity);
    return true;
  });
}
