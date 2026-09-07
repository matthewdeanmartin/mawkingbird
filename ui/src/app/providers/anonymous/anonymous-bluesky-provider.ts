/**
 * Bluesky as a home-feed source for a visitor with **no account on any network**.
 *
 * ## Why this exists separately from `BlueskyProvider`
 *
 * `BlueskyProvider` pages `app.bsky.feed.getTimeline` — the *following* feed,
 * which is server-side, personalised, and requires a session. An anonymous
 * visitor has no session and therefore no server-side following list, so there
 * is no timeline to fetch.
 *
 * What they do have is a **browser-local follow list** (`AnonymousFollows`), and
 * `app.bsky.feed.getAuthorFeed` answers 200 unauthenticated on the public
 * AppView (measured 2026-08-13). So the anonymous Bluesky feed is assembled the
 * same way the anonymous *Mastodon* feed is: fan out over the accounts the user
 * chose, page each one, merge. This is the exact shape of
 * `AnonymousMastodonProvider`, pointed at a different network.
 *
 * ## One anonymous experience, not two
 *
 * This provider and `AnonymousMastodonProvider` read the **same follow list**,
 * filtered by `network`. That is deliberate: someone who will not log into
 * either service should still be able to follow people on both and get one
 * merged feed with two chips in it — not a Mastodon-flavoured anonymous mode and
 * a Bluesky-flavoured one. See the note on `AnonymousFollowNetwork`.
 */

import { inject, Injectable, computed, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { FeedProvider } from '../provider';
import { adaptFeedItem } from '../bluesky/bluesky-adapter';
import { BlueskyApi } from '../bluesky/bluesky-api';
import { BlueskySession } from '../bluesky/bluesky-session';
import { AnonymousFollows } from './anonymous-follows';

/** Paging state for one followed account. */
interface AuthorCursor {
  did: string;
  handle: string;
  cursor: string | null;
  exhausted: boolean;
}

/** How many followed accounts are paged in one round. */
const FAN_OUT = 8;

@Injectable({ providedIn: 'root' })
export class AnonymousBlueskyProvider implements FeedProvider {
  private api = inject(BlueskyApi);
  private auth = inject(Auth);
  private followStore = inject(AnonymousFollows);
  private session = inject(BlueskySession);

  /**
   * `bluesky`, **not** a new provider id — deliberately.
   *
   * The aggregator stamps `status.provider = provider.id`, and that id is what
   * `PROVIDER_CAPS`, `serverKnowsStatus` and the status card all read. A post
   * fetched anonymously from the public AppView is a real Bluesky post: it
   * federates, it has a real at-uri, and once the visitor links an account they
   * can reply to and like the very same post. Minting `anonymous-bluesky` would
   * have declared all of that unknown territory and quietly stripped the
   * capabilities off every card.
   *
   * The write buttons still disappear while anonymous — `AnonymousCapabilities`
   * takes them away for *every* provider when no token is held, which is the
   * correct place for that rule and already handles this.
   */
  readonly id = 'bluesky' as const;
  readonly label = 'Bluesky';
  readonly badge = '🦋 Bsky';

  /** The Bluesky half of the anonymous follow list. */
  private bskyFollows = computed(() =>
    this.followStore.follows().filter((follow) => follow.network === 'bluesky'),
  );

  /**
   * Only for a genuinely anonymous session with no Bluesky account linked, and
   * only once something is followed.
   *
   * The `!session.linked()` half is load-bearing, not belt-and-braces: an
   * anonymous visitor **can** link a Bluesky app password
   * (`AnonymousCapabilities.canUseBluesky`), and once they have,
   * `BlueskyProvider` serves their real following timeline. Both providers share
   * the id `bluesky`, so without this the same posts would arrive twice — once
   * from the timeline and once from the author-feed fan-out — and the aggregator
   * dedupes within a provider, not across two that claim the same name.
   */
  readonly linked = computed(
    () => this.auth.isAnonymousIdentity && !this.session.linked() && this.bskyFollows().length > 0,
  );

  readonly errors = signal<string[]>([]);

  private cursors: AuthorCursor[] = [];
  private seen = new Set<string>();

  reset(): void {
    this.errors.set([]);
    this.seen.clear();
    this.cursors = this.bskyFollows().map((follow) => ({
      did: follow.readRef.accountId,
      handle: follow.handle,
      cursor: null,
      exhausted: false,
    }));
  }

  fetchPage(): Observable<Status[]> {
    const active = this.cursors.filter((c) => !c.exhausted).slice(0, FAN_OUT);
    if (!active.length) {
      return of([]);
    }
    return forkJoin(active.map((cursor) => this.fetchAuthor(cursor))).pipe(
      map((pages) => {
        const merged = pages.flat();
        // Dedupe across authors: a reply or a repost can legitimately arrive
        // from two of the accounts being paged in the same round.
        const fresh = merged.filter((status) => {
          if (this.seen.has(status.id)) {
            return false;
          }
          this.seen.add(status.id);
          return true;
        });
        return fresh.sort((a, b) => b.created_at.localeCompare(a.created_at));
      }),
    );
  }

  private fetchAuthor(cursor: AuthorCursor): Observable<Status[]> {
    return this.api.getAuthorFeed(cursor.did, cursor.cursor).pipe(
      map((timeline) => {
        cursor.cursor = timeline.cursor ?? null;
        // No cursor, or an empty page, means this author has no more history.
        cursor.exhausted = !timeline.cursor || !timeline.feed?.length;
        return (timeline.feed ?? []).map((item) => adaptFeedItem(item));
      }),
      catchError(() => {
        // One unreadable account must not take the round down — the same rule
        // the Mastodon side follows. Marked exhausted so it is not retried on
        // every page, and reported once for `/feed-doctor`.
        cursor.exhausted = true;
        this.errors.update((list) =>
          list.includes(cursor.handle) ? list : [...list, cursor.handle],
        );
        return of([] as Status[]);
      }),
    );
  }
}
