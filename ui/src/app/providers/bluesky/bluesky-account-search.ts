import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';
import { Account, Relationship } from '../../models';
import { adaptProfile, adaptRelationship } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';
import { BlueskyGraph } from './bluesky-graph';
import { BskyProfile } from './bluesky-types';

export interface BlueskyAccountResult {
  account: Account;
  /**
   * The viewer's relationship, or null when it cannot be known — an anonymous
   * search gets no `viewer` block at all. Null means "unknown", **not** "not
   * following": rendering it as the latter would offer a Follow button that
   * silently duplicates an existing follow.
   */
  relationship: Relationship | null;
}

export interface BlueskyAccountPage {
  results: BlueskyAccountResult[];
  cursor: string | null;
}

/** Max actors `getProfiles` accepts in one call. */
const HYDRATE_BATCH = 25;

function searchMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const kind = (error.error as { error?: string } | null)?.error;
    if (kind === 'BadQueryString' || kind === 'InvalidRequest') {
      return 'Bluesky could not read that query. Try simpler search terms.';
    }
  }
  return error instanceof Error ? error.message : 'Bluesky account search failed.';
}

/**
 * Account search against Bluesky.
 *
 * Two calls per page: `searchActors` for the matches, then one `getProfiles` to
 * hydrate their counts. The search endpoint returns `profileView`, which has no
 * follower/following/post counts — without the second call every card would
 * read "0 followers", which is worse than showing nothing.
 *
 * Works signed out. Measured 2026-08-01: `public.api.bsky.app` answers both
 * endpoints anonymously, while the `bsky.social` entryway returns 401
 * `AuthMissing`. So this is the one Bluesky feature available in Anonymous mode
 * — post search is not.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyAccountSearch {
  private api = inject(BlueskyApi);
  private graph = inject(BlueskyGraph);

  search(query: string, cursor: string | null): Observable<BlueskyAccountPage> {
    return this.api.searchActors(query, cursor).pipe(
      switchMap((page) =>
        this.hydrate(page.actors).pipe(
          map((profiles) => ({
            results: profiles.map((profile) => this.toResult(profile)),
            // The cursor may not walk the whole set (lexicon), and a repeated
            // one would page forever; both end the walk.
            cursor: page.cursor && page.cursor !== cursor ? page.cursor : null,
          })),
        ),
      ),
      catchError((error: unknown) => throwError(() => new Error(searchMessage(error)))),
    );
  }

  private toResult(profile: BskyProfile): BlueskyAccountResult {
    if (profile.viewer) {
      // Signed in: remember the follow uri now, so unfollowing from a result
      // card costs no extra lookup.
      this.graph.remember(profile.did, profile.viewer.following);
    }
    return {
      account: adaptProfile(profile),
      relationship: profile.viewer ? adaptRelationship(profile) : null,
    };
  }

  /**
   * Fill in the counts `searchActors` omits.
   *
   * A hydration failure is not a search failure: the results are already in
   * hand and are useful without counts, so the un-hydrated profiles are
   * returned rather than blanking the page.
   */
  private hydrate(actors: BskyProfile[]): Observable<BskyProfile[]> {
    if (!actors.length) {
      return of([]);
    }
    const dids = actors.slice(0, HYDRATE_BATCH).map((a) => a.did);
    return this.api.getProfiles(dids).pipe(
      map(({ profiles }) => {
        // Key by DID rather than trusting order or completeness — the same
        // lesson getPosts taught in Sprint 2.
        const detailed = new Map(profiles.map((p) => [p.did, p]));
        return actors.map((actor) => detailed.get(actor.did) ?? actor);
      }),
      catchError(() => of(actors)),
    );
  }
}
