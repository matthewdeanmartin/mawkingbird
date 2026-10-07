import { Injectable, signal } from '@angular/core';
import { ReplaySubject } from 'rxjs';
import { Status } from './models';
import type { FeedBounds } from './feed-doctor';
import type { FeedSourceState } from './providers/feed-aggregator';

export interface HomeFeedSnapshot {
  scope: string;
  at: number;
  posts: Status[];
  bounds: FeedBounds;
  sources: FeedSourceState[];
}

/** Shares each freshly loaded home-timeline page with timeline-derived widgets. */
@Injectable({ providedIn: 'root' })
export class HomeTimelineFeed {
  readonly loaded = new ReplaySubject<Status[]>(1);
  /** The settled Home session, retained so the Doctor can explain that session. */
  readonly snapshot = signal<HomeFeedSnapshot | null>(null);

  publish(statuses: Status[]): void {
    this.loaded.next(statuses);
  }
}
