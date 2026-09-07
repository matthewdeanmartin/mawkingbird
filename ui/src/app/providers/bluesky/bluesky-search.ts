import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import { Status } from '../../models';
import { adaptPost } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';
import { BlueskyPostSearch } from './bluesky-post-search';

export interface BlueskySearchPage {
  statuses: Status[];
  /** Null once the result set is exhausted (or as exhausted as it will get). */
  cursor: string | null;
  /** Approximate total, when the server offers one. Never exact. */
  hitsTotal?: number;
}

/**
 * Turn a search failure into something a reader can act on.
 *
 * `BadQueryString` is the documented error and it means the query itself is
 * malformed, which is the reader's to fix — quite different from "the network
 * is down". A blank `q` produces `InvalidRequest` with the same practical
 * meaning, so both map to the same advice.
 */
function searchMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const kind = (error.error as { error?: string } | null)?.error;
    if (kind === 'BadQueryString' || kind === 'InvalidRequest') {
      return 'Bluesky could not read that query. Try simpler search terms.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Bluesky post search needs a linked account with a valid session.';
    }
  }
  return error instanceof Error ? error.message : 'Bluesky search failed.';
}

/**
 * Post search against Bluesky.
 *
 * One call per page — no fan-out, no API-call budget. The budget machinery on
 * the Mastodon side exists because anonymous Mastodon has no full-text endpoint
 * and has to spread a query over tag timelines; `searchPosts` has no such
 * problem, so none of that is carried over.
 */
@Injectable({ providedIn: 'root' })
export class BlueskySearch {
  private api = inject(BlueskyApi);

  search(criteria: BlueskyPostSearch, cursor: string | null): Observable<BlueskySearchPage> {
    return this.api.searchPosts(criteria, cursor).pipe(
      map((page) => ({
        statuses: page.posts.map(adaptPost),
        // The lexicon warns the cursor "may not enable complete result set
        // traversal", so an absent or repeated cursor ends paging rather than
        // being treated as an error or looping forever.
        cursor: page.cursor && page.cursor !== cursor ? page.cursor : null,
        hitsTotal: page.hitsTotal,
      })),
      catchError((error: unknown) => throwError(() => new Error(searchMessage(error)))),
    );
  }
}
