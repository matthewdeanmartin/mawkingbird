import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { MastodonNotification, Status } from '../../models';
import { BlueskyApi } from './bluesky-api';
import {
  adaptNotification,
  chunkUris,
  postsByUri,
  subjectUris,
} from './bluesky-notification-adapter';

export interface BlueskyNotificationPage {
  notifications: MastodonNotification[];
  /** Null once the history is exhausted. */
  cursor: string | null;
}

/**
 * Notifications as Mastodon-shaped rows.
 *
 * Two calls per page at most: the page itself, then one batched `getPosts` for
 * the posts that were liked or reposted. Replies, mentions and quotes carry
 * their post inline and cost nothing extra, so a page of only those makes no
 * second call at all.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyNotifications {
  private api = inject(BlueskyApi);

  page(cursor: string | null): Observable<BlueskyNotificationPage> {
    return this.api.listNotifications(cursor).pipe(
      switchMap((page) => {
        const uris = subjectUris(page.notifications);
        return this.hydrate(uris).pipe(
          map((subjects) => ({
            notifications: page.notifications.map((n) => adaptNotification(n, subjects)),
            // An absent cursor is the end. A repeated one would page forever,
            // so treat it as the end too.
            cursor: page.cursor && page.cursor !== cursor ? page.cursor : null,
          })),
        );
      }),
    );
  }

  /** Posts for a page's like/repost subjects, keyed by uri. */
  private hydrate(uris: string[]): Observable<Map<string, Status>> {
    if (!uris.length) {
      return of(new Map<string, Status>());
    }
    const batches = chunkUris(uris).map((batch) =>
      this.api.getPosts(batch).pipe(map(({ posts }) => posts)),
    );
    return forkJoin(batches).pipe(map((results) => postsByUri(results.flat())));
  }

  /** Unread count for the tab badge. */
  unreadCount(): Observable<number> {
    return this.api.getUnreadCount().pipe(map(({ count }) => count));
  }

  markSeen(): Observable<unknown> {
    return this.api.updateSeen();
  }
}
