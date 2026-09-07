import { Account } from './models';

/**
 * A fully-qualified `user@host` handle for an account, or null when one cannot
 * be derived.
 *
 * Mastodon returns `acct` as a bare username for accounts local to whichever
 * server answered ("alice") and as a qualified handle for everyone else
 * ("alice@other.social"). The bare form is only meaningful next to the server
 * that produced it — ask a different server about "alice" and you get a
 * different person, or nobody.
 *
 * Anything that has to survive leaving its origin server therefore wants this
 * rather than `acct`: the account's profile URL supplies the missing host, and
 * the result is the one identifier that means the same thing everywhere. Used
 * for the `?handle=` recovery hint on profile links, where the whole point is
 * that the id in the URL may be worthless on arrival.
 *
 * Returns null rather than guessing when there is no URL to take a host from —
 * a wrong handle would send a lookup to the wrong person, which is worse than
 * no hint at all.
 */
export function qualifiedHandle(account: Account): string | null {
  const acct = account.acct?.replace(/^@/, '').trim();
  if (!acct) {
    return null;
  }
  if (acct.includes('@')) {
    return acct;
  }
  try {
    const host = new URL(account.url).host;
    return host ? `${acct}@${host}` : null;
  } catch {
    return null;
  }
}
