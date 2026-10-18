import { Injectable, inject } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { AnonymousAccount } from '../anonymous/anonymous-account';
import { AnonymousPublicApi } from '../anonymous/anonymous-public-api';
import { isVideoStatus } from '../../video-player/video-discovery';

/** Hashtag timelines fetched per search: one API call each, so kept small. */
export const VIDEO_SEARCH_TAG_LIMIT = 4;
const PAGE = 40;

/** The query without `site:` operators, for searches that cannot use them. */
export function withoutSiteOperators(query: string): string {
  return query
    .replace(/(^|\s)-?site:\S*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Newest first, once each (a post can match several tags), video only. */
export function videoPostsOnly(pages: Status[][]): Status[] {
  const byKey = new Map<string, Status>();
  for (const status of pages.flat()) {
    const key = (status.reblog ?? status).url || (status.reblog ?? status).id;
    if (!byKey.has(key) && isVideoStatus(status)) byKey.set(key, status);
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * Fediverse video search.
 *
 * Mastodon has no "videos" search, so this asks two questions it can answer
 * and keeps the posts that carry video (an upload, or a link to a recognised
 * video host — {@link isVideoStatus}): the hashtag timeline for each query word,
 * and, when signed in, the server's own post search. Full-text post search is
 * optional on Mastodon and often limited to posts you interacted with, which is
 * why the hashtags carry most of the weight. Anonymous visitors get the hashtag
 * half through their chosen public server. A failing source yields nothing
 * rather than failing the search.
 */
@Injectable({ providedIn: 'root' })
export class VideoSearch {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly anonymous = inject(AnonymousAccount);
  private readonly publicApi = inject(AnonymousPublicApi);

  /** The hashtags a query searches, for saying what was looked at. */
  tagsFor(query: string): string[] {
    return this.publicApi.hashtagsForQuery(withoutSiteOperators(query), VIDEO_SEARCH_TAG_LIMIT);
  }

  posts(query: string): Observable<Status[]> {
    // `site:` is a web-search operator; as a hashtag it would search #site and #com.
    const q = withoutSiteOperators(query);
    if (!q) return of([]);
    if (this.auth.isAnonymous) {
      return this.publicApi
        .searchPostsByHashtags(this.anonymous.server(), q, { maxTags: VIDEO_SEARCH_TAG_LIMIT })
        .pipe(
          map((results) => videoPostsOnly([results.statuses])),
          catchError(() => of([])),
        );
    }
    // Bluesky-primary sessions have no Mastodon token: every call below would
    // fail, and failing quietly to an empty list is the honest outcome.
    const quiet = (request: Observable<Status[]>) => request.pipe(catchError(() => of([])));
    return forkJoin([
      quiet(this.api.search(q, 'statuses', { limit: PAGE }).pipe(map((r) => r.statuses))),
      ...this.tagsFor(q).map((tag) => quiet(this.api.tagTimeline(tag, undefined, PAGE))),
    ]).pipe(map(videoPostsOnly));
  }
}
