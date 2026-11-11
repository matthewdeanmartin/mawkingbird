import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { RssFetch } from './rss-fetch';
import { RssSubscriptions } from './rss-subscriptions';

/** Result of a successful add: whether the fetch had to go through a feed's proxy. */
export interface AddFeedResult {
  title: string;
  itemCount: number;
}

/**
 * Validate-by-fetching, then subscribe.
 *
 * Shared by the Settings → RSS page and the "Add a feed" dialog on `/rss`: both
 * need the exact same behaviour (fetch proves reachability, CORS and
 * parseability, and captures the title before anything is persisted), and
 * having it in two places is how they'd quietly drift — one gaining a retry
 * path the other never got, say.
 */
@Injectable({ providedIn: 'root' })
export class RssAddFeed {
  private fetch = inject(RssFetch);
  private subs = inject(RssSubscriptions);

  /**
   * Fetch `url` and subscribe if it parses.
   *
   * Throws (via the observable's error channel) on an unreachable/unparsable
   * feed or on hitting the subscription limit — callers already have distinct
   * copy for "couldn't fetch" vs. "you're at your limit" vs. "already
   * subscribed", so this doesn't collapse those into one message.
   *
   * `folder` files the new subscription as it is created, which is how a starter
   * kit lands pre-organised. Absent for the manual add paths: a feed someone
   * typed in themselves is unfiled until they say otherwise.
   */
  add(url: string, useProxy: boolean, folder?: string): Observable<AddFeedResult> {
    if (this.subs.has(url)) {
      return throwError(() => new Error("You're already subscribed to that feed."));
    }
    return this.fetch.fetchFeed(url, { useProxy }).pipe(
      map((feed) => {
        const limitError = this.subs.add(url, feed.title, useProxy, feed.items.length, folder);
        if (limitError) {
          throw new Error(limitError);
        }
        return { title: feed.title, itemCount: feed.items.length };
      }),
    );
  }
}
