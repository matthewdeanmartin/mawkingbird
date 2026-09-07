import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Api } from '../api';
import { Status } from '../models';
import { AnonymousProviderRef } from './anonymous/anonymous-mastodon-provider';
import { BlueskyApi } from './bluesky/bluesky-api';
import { BskyRef } from './bluesky/bluesky-types';

/**
 * The id the origin server knows this status by.
 *
 * `adaptAnonymousStatus` namespaces ids as `anonymous-mastodon:<host>:<rawId>` so
 * several sources can share one feed without colliding. That prefix is a client-side
 * construction — sending it back produces a 404 for a status id the server has never
 * heard of. The raw id is kept on `providerRef.statusId` for exactly this.
 *
 * Same accessor as `Profile.nativeStatusId` and the equivalents in the thread and tag
 * pages; those unwrap for navigation, this one for writes.
 */
function nativeId(status: Status): string {
  const ref = status.providerRef as Partial<AnonymousProviderRef> | undefined;
  return status.provider === 'anonymous-mastodon' && typeof ref?.statusId === 'string'
    ? ref.statusId
    : status.id;
}

/**
 * Routes favourite/boost toggles to the network a status came from, so
 * StatusCard needs no provider knowledge. Mastodon statuses go through `Api`
 * exactly as before; Bluesky ones create/delete like and repost records
 * (keeping the record uri in `providerRef` so the toggle can be undone).
 * RSS never gets here — its capabilities hide the buttons.
 */
@Injectable({ providedIn: 'root' })
export class StatusActions {
  private api = inject(Api);
  private bsky = inject(BlueskyApi);

  toggleFavourite(status: Status): Observable<Status> {
    if (status.provider === 'bluesky') {
      const ref = status.providerRef as BskyRef;
      if (status.favourited && ref.likeUri) {
        return this.bsky.deleteRecord(ref.likeUri).pipe(
          map(() => ({
            ...status,
            favourited: false,
            favourites_count: Math.max(0, status.favourites_count - 1),
            providerRef: { ...ref, likeUri: null },
          })),
        );
      }
      return this.bsky.like(ref.uri, ref.cid).pipe(
        map((created) => ({
          ...status,
          favourited: true,
          favourites_count: status.favourites_count + 1,
          providerRef: { ...ref, likeUri: created.uri },
        })),
      );
    }
    const id = nativeId(status);
    return status.favourited ? this.api.unfavourite(id) : this.api.favourite(id);
  }

  toggleReblog(status: Status): Observable<Status> {
    if (status.provider === 'bluesky') {
      const ref = status.providerRef as BskyRef;
      if (status.reblogged && ref.repostUri) {
        return this.bsky.deleteRecord(ref.repostUri).pipe(
          map(() => ({
            ...status,
            reblogged: false,
            reblogs_count: Math.max(0, status.reblogs_count - 1),
            providerRef: { ...ref, repostUri: null },
          })),
        );
      }
      return this.bsky.repost(ref.uri, ref.cid).pipe(
        map((created) => ({
          ...status,
          reblogged: true,
          reblogs_count: status.reblogs_count + 1,
          providerRef: { ...ref, repostUri: created.uri },
        })),
      );
    }
    const id = nativeId(status);
    return status.reblogged ? this.api.unreblog(id) : this.api.reblog(id);
  }
}
