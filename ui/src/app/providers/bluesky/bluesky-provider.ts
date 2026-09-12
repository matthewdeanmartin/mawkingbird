import { inject, Injectable, signal } from '@angular/core';
import { catchError, defer, map, Observable, of, throwError } from 'rxjs';
import { HomeDiagnostics } from '../../home-diagnostics';
import { Status } from '../../models';
import { FeedProvider } from '../provider';
import { adaptFeedItem } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';
import { BlueskySession } from './bluesky-session';

/**
 * Bluesky as a home-timeline source: pages `app.bsky.feed.getTimeline` with its
 * cursor and adapts each item to a Mastodon-shaped Status. A fetch failure
 * (expired refresh token, network) surfaces in `errors` and propagates to the
 * aggregator, which logs it and preserves the other networks' posts.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyProvider implements FeedProvider {
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);
  private diagnostics = inject(HomeDiagnostics);

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
    this.diagnostics.info('bluesky:page-start', {
      primary: this.session.isPrimaryIdentity,
      linked: this.session.linked(),
      authMethod: this.session.session()?.authMethod ?? 'app-password',
      hasCursor: this.cursor !== null,
    });
    return defer(() => this.api.getTimeline(this.cursor)).pipe(
      map((timeline) => {
        const previousCursor = this.cursor;
        this.cursor = timeline.cursor ?? null;
        if (!this.cursor || this.cursor === previousCursor || !timeline.feed.length) {
          this.exhausted = true;
        }
        this.diagnostics.info('bluesky:page-success', {
          posts: timeline.feed.length,
          hasCursor: this.cursor !== null,
          exhausted: this.exhausted,
        });
        return timeline.feed.map(adaptFeedItem);
      }),
      catchError((err: unknown) => {
        this.exhausted = true;
        this.errors.set([err instanceof Error ? err.message : 'Bluesky timeline unavailable.']);
        // Let the aggregator isolate and log the failure instead of reporting
        // a successful empty timeline. Keep errors for Home's recovery message.
        return throwError(() => err);
      }),
    );
  }
}
