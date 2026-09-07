import { inject, Injectable } from '@angular/core';
import { map, Observable, of, switchMap } from 'rxjs';
import { Relationship } from '../../models';
import { adaptRelationship } from './bluesky-adapter';
import { BlueskyApi } from './bluesky-api';

/**
 * A relationship reporting one changed dimension.
 *
 * Every write here learns exactly one fact — a follow response cannot say
 * whether they follow *you*, and a mute says nothing about blocking. Callers
 * merge this onto the relationship they already hold rather than replacing it,
 * so the other dimensions survive.
 */
function changed(did: string, patch: Partial<Relationship>): Relationship {
  return {
    id: `bsky:${did}`,
    following: false,
    followed_by: false,
    requested: false,
    blocking: false,
    muting: false,
    ...patch,
  };
}

const following = (did: string, value: boolean): Relationship => changed(did, { following: value });
const blocked = (did: string, value: boolean): Relationship => changed(did, { blocking: value });
const muted = (did: string, value: boolean): Relationship => changed(did, { muting: value });

/**
 * Follow and unfollow on Bluesky, in Mastodon's shape.
 *
 * Exists because AT Protocol has no unfollow verb. Following creates a
 * `app.bsky.graph.follow` record and unfollowing deletes it — by its at-uri, which
 * the create call returns and nothing else remembers. So this service caches
 * did → follow-record uri for the lifetime of the tab, and falls back to
 * `getProfile().viewer.following` when the cache is cold (a reload, or a profile
 * followed in another client). That fallback is what makes an unfollow work on a
 * freshly loaded page rather than silently no-op'ing.
 *
 * Everything returns a `Relationship` so callers can treat it like `Api.follow`.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyGraph {
  private api = inject(BlueskyApi);

  /** did → at-uri of the viewer's follow record, for follows made this session. */
  private followUris = new Map<string, string>();
  /** The same, for block records — blocks are records too, so undoing needs the uri. */
  private blockUris = new Map<string, string>();

  /** Seed the cache from a profile fetch, so a later unfollow needs no extra call. */
  remember(did: string, followUri: string | undefined): void {
    if (followUri) {
      this.followUris.set(did, followUri);
    } else {
      this.followUris.delete(did);
    }
  }

  follow(did: string): Observable<Relationship> {
    return this.api.follow(did).pipe(
      map(({ uri }) => {
        this.followUris.set(did, uri);
        return following(did, true);
      }),
    );
  }

  /**
   * Delete the follow record. The uri comes from the cache, or from a fresh
   * profile read when this tab never saw the follow being made.
   */
  unfollow(did: string): Observable<Relationship> {
    const cached = this.followUris.get(did);
    const uri: Observable<string | undefined> = cached
      ? of(cached)
      : this.api.getProfile(did).pipe(map((profile) => profile.viewer?.following));
    return uri.pipe(
      switchMap((followUri) => {
        this.followUris.delete(did);
        // Already not following (deleted elsewhere, or never followed): report the
        // end state rather than failing, since that is what the caller wanted.
        if (!followUri) {
          return of(undefined);
        }
        return this.api.deleteRecord(followUri);
      }),
      map(() => following(did, false)),
    );
  }

  /**
   * Block an actor.
   *
   * A record like a follow, so unblocking means deleting it — and the uri is
   * cached for the same reason, with `viewer.blocking` as the cold fallback.
   */
  block(did: string): Observable<Relationship> {
    return this.api.block(did).pipe(
      map(({ uri }) => {
        this.blockUris.set(did, uri);
        return blocked(did, true);
      }),
    );
  }

  unblock(did: string): Observable<Relationship> {
    const cached = this.blockUris.get(did);
    const uri: Observable<string | undefined> = cached
      ? of(cached)
      : this.api.getProfile(did).pipe(map((profile) => profile.viewer?.blocking));
    return uri.pipe(
      switchMap((blockUri) => {
        this.blockUris.delete(did);
        return blockUri ? this.api.deleteRecord(blockUri) : of(undefined);
      }),
      map(() => blocked(did, false)),
    );
  }

  /**
   * Mute an actor.
   *
   * Unlike follow and block this is a procedure, not a record — there is no uri
   * to keep, so unmuting needs only the DID.
   */
  mute(did: string): Observable<Relationship> {
    return this.api.muteActor(did).pipe(map(() => muted(did, true)));
  }

  unmute(did: string): Observable<Relationship> {
    return this.api.unmuteActor(did).pipe(map(() => muted(did, false)));
  }

  /** The viewer's current relationship to an actor, straight from the server. */
  relationship(did: string): Observable<Relationship> {
    return this.api.getProfile(did).pipe(
      map((profile) => {
        this.remember(profile.did, profile.viewer?.following);
        return adaptRelationship(profile);
      }),
    );
  }
}
