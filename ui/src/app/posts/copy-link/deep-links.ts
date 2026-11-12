import { UrlMatchResult, UrlSegment } from '@angular/router';
import { Account, Status } from '../../platform/api/models';

/**
 * Copyable mawkingbird.com links to a post or an account, that open for
 * whoever receives them — not just for someone signed in to the same server.
 *
 * Mastodon ids are per-server, so a bare `/statuses/<id>` names a different
 * post (or nothing) on the recipient's server. The Mastodon shape is Elk's:
 * `/<server>/@<acct>/<id>`, where `<server>` is the server that issued `<id>`.
 * `https://<server>/@<acct>/<id>` is that server's own page for the post, which
 * any other server can resolve through `search?resolve=true`. Accounts need no
 * server at all: `@user@host` resolves anywhere.
 *
 * Bluesky and Twitter have no "issuing server": their ids are global, so their
 * links mirror the networks' own URL shapes (`bsky.app/profile/<did>/post/<rkey>`,
 * `twitter.com/<user>/status/<id>`) and someone can rewrite one by hand.
 */

/** Always the production site: a link copied from canary or test is still shared. */
export const DEEP_LINK_ORIGIN = 'https://mawkingbird.com';

const BSKY_POST_ID =
  /^bsky:at:\/\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9._~:-]+)$/;
const BSKY_ACCOUNT_ID = /^bsky:(did:[a-z]+:[A-Za-z0-9._:%-]+)$/;
const TWITTER_POST_ID = /^twitter:(\d+)$/;
const TWITTER_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const HOSTNAME =
  /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?$/i;
const QUALIFIED_HANDLE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const MASTODON_ID = /^[A-Za-z0-9]+$/;

/** The host of a server base URL, or of an already-bare host. Null when unusable. */
export function serverHost(server: string | null | undefined): string | null {
  if (!server) return null;
  try {
    const host = new URL(server.includes('://') ? server : `https://${server}`).host;
    return HOSTNAME.test(host) ? host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** `alice` on `home.example` → `alice@home.example`; already-qualified handles pass through. */
export function qualifiedAcct(acct: string | null | undefined, home: string | null): string | null {
  const bare = (acct ?? '').replace(/^@/, '');
  if (QUALIFIED_HANDLE.test(bare)) return bare;
  return home && bare && !bare.includes('@') ? `${bare}@${home}` : null;
}

/**
 * Where a post's id and author handle come from: the anonymous provider reads
 * another server's public API, so its ids belong to that server, not the
 * viewer's configured one.
 */
export function homeServerFor(status: Status, viewerServer: string): string | null {
  if (status.provider === 'anonymous-mastodon') {
    const ref = status.providerRef as { server?: unknown } | undefined;
    return typeof ref?.server === 'string' ? serverHost(ref.server) : null;
  }
  return serverHost(viewerServer);
}

function anonymousStatusId(status: Status): string | null {
  const ref = status.providerRef as { statusId?: unknown } | undefined;
  return typeof ref?.statusId === 'string' ? ref.statusId : null;
}

/** A shareable mawkingbird.com link to a post, or null when the post has none. */
export function postDeepLink(status: Status, viewerServer: string): string | null {
  const provider = status.provider ?? 'mastodon';
  switch (provider) {
    case 'mastodon':
    case 'anonymous-mastodon': {
      const home = homeServerFor(status, viewerServer);
      const id = provider === 'mastodon' ? status.id : anonymousStatusId(status);
      const acct = qualifiedAcct(status.account.acct, home);
      if (!home || !id || !MASTODON_ID.test(id) || !acct) return null;
      return `${DEEP_LINK_ORIGIN}/${home}/@${acct}/${id}`;
    }
    case 'bluesky': {
      const match = BSKY_POST_ID.exec(status.id);
      return match ? `${DEEP_LINK_ORIGIN}/bsky/profile/${match[1]}/post/${match[2]}` : null;
    }
    case 'twitter': {
      const match = TWITTER_POST_ID.exec(status.id);
      const user = twitterHandle(status.account);
      return match && user ? `${DEEP_LINK_ORIGIN}/twitter/${user}/status/${match[1]}` : null;
    }
    default:
      // Misskey note ids, RSS items and local practice posts have no public
      // address another reader could resolve.
      return null;
  }
}

/**
 * A shareable mawkingbird.com link to an account. `provider` and `home` are
 * those of the post (or profile) the account was read from.
 */
export function accountDeepLink(
  account: Account,
  provider: Status['provider'],
  home: string | null,
): string | null {
  switch (provider ?? 'mastodon') {
    case 'bluesky': {
      const match = BSKY_ACCOUNT_ID.exec(account.id ?? '');
      return match ? `${DEEP_LINK_ORIGIN}/bsky/profile/${match[1]}` : null;
    }
    case 'twitter': {
      const user = twitterHandle(account);
      return user ? `${DEEP_LINK_ORIGIN}/twitter/${user}` : null;
    }
    case 'mastodon':
    case 'anonymous-mastodon':
    case 'misskey': {
      const acct = qualifiedAcct(account.acct, home);
      return acct ? `${DEEP_LINK_ORIGIN}/@${acct}` : null;
    }
    default:
      return null;
  }
}

/**
 * The account link for a profile page, where there is no post to say which
 * network the account came from: the id's namespace says it instead, and a
 * local Mastodon handle takes its host from the profile URL.
 */
export function profileDeepLink(account: Account): string | null {
  const id = account.id ?? '';
  if (id.startsWith('bsky:')) return accountDeepLink(account, 'bluesky', null);
  if (id.startsWith('twitter:')) return accountDeepLink(account, 'twitter', null);
  return accountDeepLink(account, 'mastodon', serverHost(account.url));
}

function twitterHandle(account: Account): string | null {
  const id = account.id ?? '';
  const fromId = id.startsWith('twitter:@') ? id.slice('twitter:@'.length) : '';
  const handle = fromId || (account.acct ?? '').replace(/^@/, '');
  return TWITTER_HANDLE.test(handle) ? handle : null;
}

// --- Route matchers -----------------------------------------------------------

/** `/<server>/@<acct>/<id>`: the first segment must look like a hostname, so no app route collides. */
export function mastodonPostLinkMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 3) return null;
  const [server, acct, id] = segments;
  if (!HOSTNAME.test(server.path)) return null;
  if (!acct.path.startsWith('@') || !QUALIFIED_HANDLE.test(acct.path.slice(1))) return null;
  if (!MASTODON_ID.test(id.path)) return null;
  return {
    consumed: segments,
    posParams: {
      server: server,
      acct: new UrlSegment(acct.path.slice(1), {}),
      id: id,
    },
  };
}

/** `/@user@host`: a fully qualified handle as the only segment. */
export function accountHandleLinkMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 1) return null;
  const [only] = segments;
  if (!only.path.startsWith('@') || !QUALIFIED_HANDLE.test(only.path.slice(1))) return null;
  return { consumed: segments, posParams: { acct: new UrlSegment(only.path.slice(1), {}) } };
}

/** True for a Twitter handle a `/twitter/<user>` link may carry. */
export function isTwitterHandle(value: string): boolean {
  return TWITTER_HANDLE.test(value);
}
