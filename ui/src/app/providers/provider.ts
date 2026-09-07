import { Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ProviderId, Status } from '../models';

/** What a viewer can do to a post, by provider. Everything else is Mastodon-only. */
export interface ProviderCapabilities {
  reply: boolean;
  favourite: boolean;
  reblog: boolean;
}

/**
 * Baseline capabilities per provider.
 *
 * `anonymous-mastodon` is a misleading name kept for now: it is the provider for
 * *unauthenticated reads of a Mastodon-compatible server*, and those servers fall
 * into two very different groups.
 *
 *  - A textboard like mawkingbird_server, targeted directly, where the viewer holds
 *    a durable session identity (the disposable-account/correlation-credential
 *    pattern). That identity owns its posts and can reply, like, boost, and follow —
 *    exactly like any other logged-in session. Writes work.
 *  - Some other instance (mastodon.social, fosstodon) read over `externalFetch()`
 *    with no token at all. Writes cannot work there and never could.
 *
 * The old flat `false` here assumed the second case for both, which made likes and
 * boosts unreachable against our own server: `StatusCard.toggleFavourite` returns
 * early on `!caps.favourite`, so the click produced no request and no error.
 *
 * So the baseline is now permissive and the *unauthenticated* case is narrowed per
 * status by {@link capabilitiesFor}, which is the only thing that can tell the two
 * apart — it needs the status, not just its provider id.
 */
export const PROVIDER_CAPS: Record<ProviderId, ProviderCapabilities> = {
  mastodon: { reply: true, favourite: true, reblog: true },
  'anonymous-mastodon': { reply: true, favourite: true, reblog: true },
  bluesky: { reply: true, favourite: true, reblog: true },
  rss: { reply: false, favourite: false, reblog: false },
  paste: { reply: false, favourite: false, reblog: false },
  blog: { reply: false, favourite: false, reblog: false },
  // Read-only by construction, not by omission. Every write on Twitter needs an
  // authenticated Twitter account, which this app deliberately never asks for — no
  // password, no session cookie, no `auth_token`. Cards show "Open on Twitter ↗"
  // where reply/boost/favourite would be, exactly like RSS.
  twitter: { reply: false, favourite: false, reblog: false },
};

const NO_WRITES: ProviderCapabilities = { reply: false, favourite: false, reblog: false };

/**
 * Providers whose status ids name nothing the home server has ever seen.
 *
 * Deliberately not "everything that isn't Mastodon". `anonymous-mastodon`
 * statuses are real posts on a Mastodon-compatible server, reachable once the
 * namespace prefix is stripped, and Bluesky ones federate. An X, RSS or paste
 * id, by contrast, is a client-side construction — sending one to
 * `/api/v1/statuses/{id}/…` can only 404.
 */
const CLIENT_SIDE_ONLY: ReadonlySet<ProviderId> = new Set<ProviderId>([
  'twitter',
  'rss',
  'paste',
  'blog',
]);

/**
 * Whether the home server could act on this post's id at all.
 *
 * The question behind several UI decisions — where a bookmark goes, which
 * translate button to show — and the one the code kept getting wrong by asking
 * "am I signed in" instead. Those coincide for Mastodon posts and diverge for
 * every provider listed above:
 *
 * - Bookmarking a tweet while signed in POSTed `twitter:2083…` to
 *   `/api/v1/statuses/{id}/bookmark`, which 404s and loses the bookmark, while
 *   an anonymous reader bookmarking the same post got a working local one.
 * - Translation is worse: the server button needs `canUseServerActions` and the
 *   AI button needed anonymous mode, so a signed-in reader got *neither* and
 *   translate disappeared. For these providers translate means "ask the
 *   autorouter", which works from the post text already in hand.
 */
export function serverKnowsStatus(provider: ProviderId | undefined): boolean {
  return !CLIENT_SIDE_ONLY.has(provider ?? 'mastodon');
}

/**
 * Providers where a like can be *recorded* even though it cannot be *sent*.
 *
 * A deliberate inversion of the rule above, and worth reading carefully because
 * it looks like a contradiction. `PROVIDER_CAPS.rss.favourite` is false and must
 * stay false: that flag means "the network accepts a like", it is what
 * `StatusActions` consults to decide which request to make, and flipping it
 * would POST an `rss:` id to `/api/v1/statuses/{id}/favourite`, which can only
 * 404.
 *
 * But POSSE changed the premise. Liking an RSS item cannot notify the author
 * *through the feed* — there is no endpoint in a feed — and it can still be
 * recorded on the reader's own site. More than that: if the item's page carries
 * a webmention endpoint, the record can genuinely be delivered, which produced
 * the irony this exists to fix — the one provider where webmentions actually
 * work was the one provider where you could not click like.
 *
 * Excludes `paste` and `blog`: those are the user's *own* content, and
 * recording that you liked your own writing is not a thing worth a commit.
 */
const POSSE_ONLY: ReadonlySet<ProviderId> = new Set<ProviderId>(['rss', 'twitter']);

/**
 * Whether this provider supports record-only interactions.
 *
 * The caller must additionally check that POSSE is switched on: with it off,
 * these buttons would record nowhere, which is a button that does nothing.
 */
export function canPosseOnly(provider: ProviderId | undefined): boolean {
  return POSSE_ONLY.has(provider ?? 'mastodon');
}

/**
 * Capabilities for one status, given whether this browser holds a token.
 *
 * The token is what makes the difference, not the provider. With one, an
 * `anonymous-mastodon` status is writable like any other: the token belongs to
 * the server the status came from, because that is the server the session was
 * opened against. Without one we are in Anonymous mode — every read went out
 * through `externalFetch()` and every write would be a 401 — so the buttons come
 * off for every provider, including a status left tagged `mastodon` or carrying
 * no provider at all (an older cache entry). Narrowing this to
 * `anonymous-mastodon` alone let those slip through with live-looking reply,
 * boost, and favourite buttons that could only ever fail.
 *
 * Restrictions the *server* imposes (a `no_interactions` moderation restriction, a
 * read-only identity) are deliberately not modelled here. The server is the only
 * thing that knows, discovering it costs a request per card, and the 403 it returns
 * carries a message the card already renders under the actions row.
 */
export function capabilitiesFor(
  provider: ProviderId | undefined,
  authenticated: boolean,
): ProviderCapabilities {
  if (!authenticated) {
    return NO_WRITES;
  }
  return PROVIDER_CAPS[provider ?? 'mastodon'] ?? PROVIDER_CAPS.mastodon;
}

/**
 * A non-Mastodon content source that contributes to the home timeline.
 *
 * Providers adapt their native content into Mastodon-shaped `Status` objects
 * (tagged with `provider` and namespaced ids) so nothing outside `providers/`
 * ever learns another protocol exists. The `FeedAggregator` drives paging:
 * `reset()` then repeated `fetchPage()` until `[]` (exhausted).
 */
export interface FeedProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Short badge shown on status cards and filter chips, e.g. "📡 RSS". */
  readonly badge: string;
  /** True when the user has linked/configured this provider. */
  readonly linked: Signal<boolean>;
  /** Human-readable problems from the last fetch (bad feed, CORS, …). */
  readonly errors: Signal<string[]>;
  /** Start over from the newest content. */
  reset(): void;
  /** The next (older) page of home content; `[]` means exhausted. */
  fetchPage(): Observable<Status[]>;
}
