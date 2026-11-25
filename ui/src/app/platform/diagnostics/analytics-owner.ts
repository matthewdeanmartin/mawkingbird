/**
 * The owner's own visits, kept out of mawkingbird.com's page counts.
 *
 * Counts are only useful as a picture of other people. The owner reads the app
 * all day under several accounts, and on a site this young those visits swamp
 * everyone else's. A browser that has ever held one of these accounts is marked
 * and stops counting for good, including signed out and in Anonymous, because
 * a visit there is still the owner's.
 *
 * The handles are the owner's published alts (pinned on @mistersql), so listing
 * them here reveals nothing new. A browser where the owner never signs in (a
 * phone used only to test the front page) is marked by opening any page with
 * `?count=me-not` once.
 */
const OWNER_ACCOUNTS: readonly string[] = [
  'mistersql@mastodon.social',
  'flyscifiguy@mstdn.social',
  'everybodhi@ohai.social',
  'matthewmartin@dmv.community',
  'mateomartino@esperanto.masto.host',
  'vegdevops@mastodon.online',
];

/** Set once this browser is known to be the owner's. */
export const OWNER_BROWSER_KEY = 'mockingbird_analytics_owner';

/** `user@host` for an account as the session records it: acct plus the server it was signed in on. */
function handle(acct: string, server: string): string {
  const host = (() => {
    try {
      return new URL(server).host;
    } catch {
      return server;
    }
  })();
  const full = acct.includes('@') ? acct : `${acct}@${host}`;
  return full.replace(/^@/, '').toLowerCase();
}

/** Whether any of these saved accounts is the owner's. */
export function includesOwner(
  sessions: readonly { server?: string; account: { acct?: string } | null }[],
): boolean {
  return sessions.some(
    (session) =>
      !!session.account?.acct &&
      OWNER_ACCOUNTS.includes(handle(session.account.acct, session.server ?? '')),
  );
}

/** Whether this browser is the owner's; marks it so, when it has just become clear. */
export function isOwnerBrowser(evidence: { sessions: boolean; query: string }): boolean {
  try {
    if (localStorage.getItem(OWNER_BROWSER_KEY) === '1') return true;
    if (evidence.sessions || new URLSearchParams(evidence.query).get('count') === 'me-not') {
      localStorage.setItem(OWNER_BROWSER_KEY, '1');
      return true;
    }
  } catch {
    // Storage blocked: decide from this visit's evidence alone.
    return evidence.sessions;
  }
  return false;
}
