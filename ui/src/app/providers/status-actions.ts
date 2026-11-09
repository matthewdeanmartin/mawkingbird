import { inject, Injectable } from '@angular/core';
import { concat, last, map, Observable, of } from 'rxjs';
import { Api } from '../api';
import { Status } from '../models';
import { AnonymousProviderRef } from './anonymous/anonymous-mastodon-provider';
import { BlueskyApi } from './bluesky/bluesky-api';
import { BskyRef } from './bluesky/bluesky-types';
import { MisskeyApi } from './misskey/misskey-api';
import type { MisskeyRef } from './misskey/misskey-adapter';
import { StatusReaction } from '../models';

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
  private misskey = inject(MisskeyApi);

  /**
   * React to a Misskey note with `reaction` (a Unicode emoji or `:name:` for a
   * custom emoji of the reader's server), replacing any earlier reaction:
   * Misskey allows one per person, so changing it is unreact-then-react.
   * Pass null to remove the reaction. Returns the note as it now stands.
   */
  react(status: Status, reaction: string | null): Observable<Status> {
    const ref = status.providerRef as MisskeyRef;
    const mine = status.reactions?.find((r) => r.me) ?? null;
    const clear$ = mine || status.favourited ? this.misskey.unreact(ref.noteId) : of(undefined);
    const add$ = reaction ? this.misskey.react(ref.noteId, reaction) : of(undefined);
    return concat(clear$, add$).pipe(
      last(),
      map(() => withReaction(status, mine, reaction)),
    );
  }

  toggleFavourite(status: Status): Observable<Status> {
    if (status.provider === 'misskey') {
      // The heart is the server's default reaction (❤, Misskey's own fallback).
      return this.react(status, status.favourited ? null : MISSKEY_LIKE);
    }
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
    if (status.provider === 'misskey') {
      const ref = status.providerRef as MisskeyRef;
      // Misskey does not say whether the reader renoted, so the flag is only
      // known for renotes made here; unrenote removes any of the reader's.
      if (status.reblogged) {
        return this.misskey.unrenote(ref.noteId).pipe(
          map(() => ({
            ...status,
            reblogged: false,
            reblogs_count: Math.max(0, status.reblogs_count - 1),
          })),
        );
      }
      return this.misskey
        .createNote({ renoteId: ref.noteId })
        .pipe(map(() => ({ ...status, reblogged: true, reblogs_count: status.reblogs_count + 1 })));
    }
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

/** The reaction the heart sends on Misskey: the server's own default. */
export const MISSKEY_LIKE = '\u2764';

/** The note after the reader's reaction moved from `before` to `after`. */
export function withReaction(
  status: Status,
  before: StatusReaction | null,
  after: string | null,
): Status {
  let reactions = (status.reactions ?? []).map((r) =>
    r === before ? { ...r, count: r.count - 1, me: false } : r,
  );
  if (after) {
    const name = after;
    const existing = reactions.find((r) => r.name === name || r.key === name);
    reactions = existing
      ? reactions.map((r) => (r === existing ? { ...r, count: r.count + 1, me: true } : r))
      : [...reactions, { name, key: name, count: 1, url: null, me: true }];
  }
  reactions = reactions.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const delta = (after ? 1 : 0) - (before || status.favourited ? 1 : 0);
  return {
    ...status,
    reactions,
    favourited: !!after,
    favourites_count: Math.max(0, status.favourites_count + delta),
  };
}
