import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { Api } from '../api';
import { Account, Status } from '../models';
import { MAX_BUNDLE_TAGS } from './tag-bundles';

/** How many statuses to pull per member when synthesizing a merged feed. */
export const FEED_PER_MEMBER = 20;
/** Cap on the merged feed length. */
export const FEED_MAX = 40;
/** Cap on how many members we fan out to (real mastodon.social latency guard —
 *  see the forkJoin latency note in sprint/lists-0-overview.md). */
export const MERGE_MEMBER_CAP = 12;

/** Result of a client-side member-timeline merge. */
export interface MergedFeed {
  statuses: Status[];
  /** True when we capped the member fan-out and only merged the first N. */
  capped: boolean;
  cappedFrom: number;
}

/**
 * Turns member accounts into one reverse-chronological feed by fetching each
 * member's recent statuses and merging them. This is the client-side synthesis
 * that `CollectionPage` used to inline; it is shared here so collections and
 * endorsed-account lists (and any future account-backed source) use one code
 * path. The API has no collection/endorsement timeline endpoint, so this is the
 * only honest way to build the feed (see sprint/lists-0-overview.md).
 */
@Injectable({ providedIn: 'root' })
export class ListFeedResolver {
  private api = inject(Api);

  /**
   * Merge each account's recent statuses into one feed.
   * Fans out to at most {@link MERGE_MEMBER_CAP} accounts; per-account failures
   * degrade to an empty contribution rather than failing the whole merge.
   */
  /**
   * Resolve `username@host` handles to accounts on this server.
   *
   * Client lists store handles rather than ids ({@link ClientLists}), so a feed needs
   * this step first. Lookups run in parallel and a handle that cannot be resolved drops
   * out rather than failing the list — an account can be suspended, or on an instance
   * this server cannot see, and one dead member must not take a whole list with it.
   */
  resolveHandles(handles: string[]): Observable<Account[]> {
    if (!handles.length) {
      return of([]);
    }
    return forkJoin(
      handles
        .slice(0, MERGE_MEMBER_CAP)
        .map((handle) => this.api.lookupAccount(handle).pipe(catchError(() => of(null)))),
    ).pipe(map((accounts) => accounts.filter((account): account is Account => !!account)));
  }

  /**
   * Merge several tag timelines into one reverse-chronological feed.
   *
   * One request per tag — which is exactly why {@link MAX_BUNDLE_TAGS} exists — fanned
   * out in parallel and interleaved by recency. A tag that fails contributes nothing
   * rather than failing the bundle: a typo'd or empty tag must not cost the reader the
   * other nine.
   *
   * Posts are deduplicated by id, because one post carrying two tags in the same bundle
   * would otherwise appear twice. That is the common case for a well-chosen bundle, not
   * an edge: someone posting about `#rust` and `#webassembly` tags both.
   */
  mergeTagTimelines(tags: string[]): Observable<MergedFeed> {
    const capped = tags.length > MAX_BUNDLE_TAGS;
    const names = tags.slice(0, MAX_BUNDLE_TAGS);
    if (!names.length) {
      return of({ statuses: [], capped: false, cappedFrom: 0 });
    }
    return forkJoin(
      names.map((tag) =>
        this.api
          .tagTimeline(tag, undefined, FEED_PER_MEMBER)
          .pipe(catchError(() => of([] as Status[]))),
      ),
    ).pipe(
      map((lists) => {
        const seen = new Set<string>();
        const statuses: Status[] = [];
        for (const status of lists.flat()) {
          if (!seen.has(status.id)) {
            seen.add(status.id);
            statuses.push(status);
          }
        }
        return {
          statuses: statuses
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, FEED_MAX),
          capped,
          cappedFrom: tags.length,
        };
      }),
    );
  }

  mergeMemberTimelines(accountIds: string[]): Observable<MergedFeed> {
    const capped = accountIds.length > MERGE_MEMBER_CAP;
    const ids = accountIds.slice(0, MERGE_MEMBER_CAP);
    if (!ids.length) {
      return of({ statuses: [], capped: false, cappedFrom: 0 });
    }
    return forkJoin(
      ids.map((id) =>
        this.api
          .getAccountStatuses(id, { excludeReplies: true, limit: FEED_PER_MEMBER })
          .pipe(catchError(() => of([] as Status[]))),
      ),
    ).pipe(
      map((lists) => ({
        statuses: lists
          .flat()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, FEED_MAX),
        capped,
        cappedFrom: accountIds.length,
      })),
    );
  }
}
