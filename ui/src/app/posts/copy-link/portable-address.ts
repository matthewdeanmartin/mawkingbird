import { effect, EffectRef, inject, Signal, untracked } from '@angular/core';
import { Location } from '@angular/common';
import { Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { DEEP_LINK_ORIGIN, postDeepLink } from './deep-links';

/** A Mastodon id as the home server issued it: nothing else is server-local. */
const LOCAL_ID = /^[A-Za-z0-9]+$/;

/** The query flag that sends a resolved deep link to the reader, not the thread. */
export const READ_PARAM = 'read';

/**
 * Keep the address bar copyable while a server-local post is on screen.
 *
 * `/statuses/<id>` only means something on the server that issued `<id>`: copied
 * from the address bar and opened anywhere else it found nothing, or a
 * different post. Once the post has loaded, the address bar is swapped (no
 * navigation, no history entry) for the same portable form Copy link produces,
 * `/<server>/@<acct>/<id>`. The server in it is the reader's own, so a reload
 * or Back resolves it with no request at all; a recipient on another server
 * gets the deep-link resolver's usual lookup.
 *
 * Bluesky, Twitter and anonymous public refs are already portable and are left
 * alone. Call in an injection context.
 */
export function keepPortableAddress(
  routeId: Signal<string>,
  status: Signal<Status | null>,
  view: 'thread' | 'reader' | 'lite',
): EffectRef {
  const location = inject(Location);
  const server = inject(Server);
  return effect(() => {
    const id = routeId();
    const post = status();
    if (!post || !LOCAL_ID.test(id) || post.id !== id) return;
    if ((post.provider ?? 'mastodon') !== 'mastodon') return;
    const link = untracked(() => postDeepLink(post, server.baseUrl()));
    if (!link?.startsWith(DEEP_LINK_ORIGIN)) return;
    const query = new URLSearchParams(globalThis.location?.search ?? '');
    if (view === 'reader') query.set(READ_PARAM, '1');
    // A Lite page's link opens in Lite, as the person sharing it saw it.
    const prefix = view === 'lite' ? '/m' : '';
    location.replaceState(prefix + link.slice(DEEP_LINK_ORIGIN.length), query.toString());
  });
}
