/**
 * Whether a username exists on a Mastodon server, from the server's public
 * `GET /api/v1/accounts/lookup`, which needs no account and allows any origin.
 *
 * Plain `fetch`, not the app's HttpClient, on purpose: the app's interceptors
 * attach the signed-in token and treat a dead server as an outage, and neither
 * belongs on a request to a stranger's server about a handle.
 *
 * "Free" means only that no account answers to the name. The server may still
 * refuse it at sign-up: deleted accounts keep their names, and admins reserve
 * some. The page says so.
 */
export type Availability = 'free' | 'taken' | 'unknown';

/** Long enough for a slow server, short enough that one cannot stall the list. */
const TIMEOUT_MS = 8000;

export async function checkHandle(
  domain: string,
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Availability> {
  const url = `https://${domain}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`;
  try {
    const response = await fetchImpl(url, {
      credentials: 'omit',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return 'taken';
    if (response.status === 404) return 'free';
    // 410: the account was suspended or deleted, and its name stays reserved.
    if (response.status === 410) return 'taken';
    // 401/403 (limited federation), 429 (rate limit), 5xx: no answer either way.
    return 'unknown';
  } catch {
    // Offline, blocked, timed out or not a Mastodon server.
    return 'unknown';
  }
}

/** A server name a visitor typed or pasted, as a bare domain; '' if it is not one. */
export function normalizeDomain(input: string): string {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^@?[^@\s]*@/, '')
    .split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : '';
}

/** Where a new account is made on a Mastodon server. */
export function signUpUrl(domain: string): string {
  return `https://${domain}/auth/sign_up`;
}
