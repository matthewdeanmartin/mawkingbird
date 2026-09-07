import { Status } from '../../models';
import {
  AnonymousPublicRef,
  anonymousStatusRouteRef,
} from '../../providers/anonymous/anonymous-route-ref';
import { AnonymousProviderRef } from '../../providers/anonymous/anonymous-mastodon-provider';

/**
 * The id that addresses a post in a URL, which is not always `Status.id`.
 *
 * ## Why these are two different strings
 *
 * Most providers namespace their ids (`rss:<feed>::<guid>`, `twitter:<id>`,
 * `bsky:<uri>`) and the route reuses them verbatim. Anonymously-read Mastodon
 * posts cannot: the feed's id is `anonymous-mastodon:<host>:<rawId>`, which
 * names the host but drops the *scheme* and the original URL, so it is not
 * enough to fetch the post again from a cold start. The route therefore carries
 * a base64 blob of `{server, id, originalUrl}` — see `anonymous-route-ref.ts`.
 *
 * Both forms existed before the reader; nothing linked one to the other because
 * only `status-card.ts` ever built a link, and it had the `providerRef` in hand
 * at the time. The library does not: it stores an id and expects to be able to
 * navigate back to it later. Storing the feed id there produced a link that
 * 404s, which is exactly the bug this exists to stop.
 *
 * ## The name is about the post, not the reader
 *
 * "anonymous" here means *this post was read from a server we have no account
 * on*, and it is true whether or not the person reading is signed in — a
 * logged-in user browsing a remote instance's public timeline gets these. The
 * provider id is a long-standing misnomer (`anonymous-mastodon-provider.ts`
 * says so itself); it is not a claim about the session.
 */
export function readerRouteId(status: Status): string {
  if (status.provider !== 'anonymous-mastodon') {
    return status.id;
  }
  const ref = status.providerRef as AnonymousProviderRef | undefined;
  if (!ref?.server || !ref.statusId) {
    // Nothing better to offer. The feed id at least identifies the post inside
    // this session, and a link that fails is no worse than no entry at all.
    return status.id;
  }
  const publicRef: AnonymousPublicRef = {
    server: ref.server,
    id: ref.statusId,
    ...(status.url ? { originalUrl: status.url } : {}),
  };
  try {
    return anonymousStatusRouteRef(publicRef);
  } catch {
    return status.id;
  }
}
