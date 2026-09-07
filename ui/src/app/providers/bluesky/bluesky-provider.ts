import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { Status } from '../../models';
import { FeedProvider } from '../provider';
import { adaptFeedItem } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';
import { BlueskySession } from './bluesky-session';

/**
 * Bluesky as a home-timeline source: pages `app.bsky.feed.getTimeline` with its
 * cursor and adapts each item to a Mastodon-shaped Status. A fetch failure
 * (expired refresh token, network) surfaces in `errors` and ends paging rather
 * than breaking the merged feed.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyProvider implements FeedProvider {
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);

  readonly id = 'bluesky' as const;
  readonly label = 'Bluesky';
  readonly badge = '🦋 Bsky';
  readonly linked = this.session.linked;
  readonly errors = signal<string[]>([]);

  private cursor: string | null = null;
  private exhausted = false;

  reset(): void {
    this.cursor = null;
    this.exhausted = false;
    this.errors.set([]);
  }

  fetchPage(): Observable<Status[]> {
    if (this.exhausted) {
      return of([]);
    }
    return this.api.getTimeline(this.cursor).pipe(
      map((timeline) => {
        this.cursor = timeline.cursor ?? null;
        if (!this.cursor || !timeline.feed.length) {
          this.exhausted = true;
        }
        return timeline.feed.map(adaptFeedItem);
      }),
      catchError((err: unknown) => {
        this.exhausted = true;
        this.errors.set([err instanceof Error ? err.message : 'Bluesky timeline unavailable.']);
        return of<Status[]>([]);
      }),
    );
  }
}
