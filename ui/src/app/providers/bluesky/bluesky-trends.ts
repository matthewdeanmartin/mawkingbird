/**
 * Bluesky's answer to Mastodon's trending tags — and it is **not** the same
 * object, which is the main thing to get right here.
 *
 * A Mastodon trending tag is `#foo`: a hashtag, linking to a tag timeline, that
 * the app already has a page and a UI for. A Bluesky trend is a *topic* — a
 * phrase like "Games that didn't click for players" — linking to a **generated
 * feed**. Forcing one into the other's UI produces a dead link, so this is a
 * separate service feeding a separate card.
 *
 * ## The two endpoints, and why there are two
 *
 * `getTrends` is the richer one (post counts, `startedAt`, a category) and is
 * preferred. `getTrendingTopics` returns the same topics without the extras and
 * is the fallback. Both verified answering anonymously on 2026-08-12.
 *
 * ## `unspecced` means unstable by name
 *
 * These are not frozen API and may change shape or vanish. Every failure — 400,
 * 404, a shape that does not parse — resolves to an **empty list**, and the card
 * hides itself entirely rather than rendering an error. That follows the
 * precedent already in the rail: `feedCaps.shows('trending-links')` hides the
 * Mastodon trends rows on instances that serve none. A rail widget must never
 * surface an error.
 */

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of, tap } from 'rxjs';
import { externalFetch } from '../external-fetch';
import { PUBLIC_APPVIEW } from './bluesky-api';

/** Where a trend points. Bluesky links are site-relative paths. */
const BSKY_APP = 'https://bsky.app';

/** How many trends the rail card asks for. */
const TREND_LIMIT = 8;

/** One trending topic, normalised across the two endpoints. */
export interface BlueskyTrend {
  /** The phrase, as shown. */
  displayName: string;
  /** One-line summary of what people are posting. Absent on some rows. */
  description?: string;
  /** Absolute URL to the generated feed for this topic. */
  url: string;
  /** Posts counted in the trending window, when the endpoint reports it. */
  postCount?: number;
}

interface TrendsResponse {
  trends?: {
    displayName?: string;
    topic?: string;
    description?: string;
    link?: string;
    postCount?: number;
  }[];
}

interface TrendingTopicsResponse {
  topics?: {
    displayName?: string;
    topic?: string;
    description?: string;
    link?: string;
  }[];
}

/**
 * Resolve a Bluesky link to an absolute URL.
 *
 * The API returns site-relative paths (`/profile/did:plc:…/feed/…`), which would
 * resolve against Mawkingbird's own origin and 404 if used as-is.
 */
function absoluteLink(link: string | undefined): string | null {
  if (!link) {
    return null;
  }
  if (link.startsWith('http://') || link.startsWith('https://')) {
    return link;
  }
  return `${BSKY_APP}${link.startsWith('/') ? '' : '/'}${link}`;
}

@Injectable({ providedIn: 'root' })
export class BlueskyTrends {
  private http = inject(HttpClient);

  /** The trends, or an empty list when unavailable. */
  readonly trends = signal<BlueskyTrend[]>([]);
  /** True once a load has settled, however it settled. */
  readonly loaded = signal(false);

  private started = false;

  /**
   * Load once per session.
   *
   * Trends move on the order of hours and this is a sidebar widget, so a single
   * load is plenty — and it keeps the rail from issuing a request on every
   * navigation, which is the failure mode the Mastodon side needed `feedCaps`
   * caching to avoid.
   */
  ensure(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.load();
  }

  private load(): void {
    // Always the AppView, even when signed in: the entryway answers these 401
    // `AuthMissing` whoever is asking, so routing through `publicGet` would fail
    // for exactly the accounts most likely to want them.
    this.http
      .get<TrendsResponse>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.unspecced.getTrends`, {
        params: { limit: TREND_LIMIT },
        context: externalFetch(),
      })
      .pipe(
        map((res) =>
          (res.trends ?? []).flatMap((row): BlueskyTrend[] => {
            const displayName = row.displayName || row.topic || '';
            const url = absoluteLink(row.link);
            // A row with no phrase or no destination is not renderable. Dropped
            // rather than defaulted: a trend linking nowhere is a dead link.
            if (!displayName || !url) {
              return [];
            }
            return [{ displayName, description: row.description, url, postCount: row.postCount }];
          }),
        ),
        catchError(() => this.loadTopics()),
        catchError(() => of([] as BlueskyTrend[])),
      )
      .subscribe((trends) => {
        this.trends.set(trends);
        this.loaded.set(true);
      });
  }

  /** The thinner endpoint, tried when `getTrends` refuses. */
  private loadTopics() {
    return this.http
      .get<TrendingTopicsResponse>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.unspecced.getTrendingTopics`, {
        params: { limit: TREND_LIMIT },
        context: externalFetch(),
      })
      .pipe(
        map((res) =>
          (res.topics ?? []).flatMap((row): BlueskyTrend[] => {
            const displayName = row.displayName || row.topic || '';
            const url = absoluteLink(row.link);
            if (!displayName || !url) {
              return [];
            }
            return [{ displayName, description: row.description, url }];
          }),
        ),
        tap({
          error: () => {
            // Both endpoints refused. The card hides; nothing is surfaced.
          },
        }),
      );
  }
}
