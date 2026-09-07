import { Account } from './models';

export interface HomeServerLink {
  /** The canonical profile URL, on the server that actually hosts the account. */
  url: string;
  /** The bare hostname, for menu copy: "Open on mastodon.social". */
  host: string;
}

/**
 * Where to send someone who wants this profile on its *own* server.
 *
 * Mawkingbird shows a federated copy: the posts your server happens to know
 * about, with the follower counts and pinned posts it last cached. The home
 * server has the real thing, and that is where you go to do anything this app
 * does not do — read the full history, use the server's own moderation tools,
 * or just check that a suspicious account is what it claims.
 *
 * Derived from `account.url` rather than from the handle, because `url` is what
 * the origin server says its own canonical profile URL is. A handle-built guess
 * gets this wrong for every server whose web host differs from its handle
 * domain, which is exactly the setup where a broken link is hardest to notice.
 *
 * Returns null when there is nothing safe to open — no URL, a relative one, or
 * a non-HTTP scheme. Local mock accounts and the browser-local Anonymous
 * account have no home server at all, so the caller hides the affordance.
 */
export function homeServerLink(account: Account | null): HomeServerLink | null {
  if (!account?.url) {
    return null;
  }
  try {
    const url = new URL(account.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return { url: url.toString(), host: url.host };
  } catch {
    // A relative or malformed URL is not somewhere we can send a new tab.
    return null;
  }
}
