/** A fully qualified fediverse handle, split. Hosts are lower-cased. */
export interface FediverseHandle {
  user: string;
  host: string;
}

const USER = /^[A-Za-z0-9_.-]{1,64}$/;
const HOST = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * `@alice@mastodon.social`, `alice@mastodon.social` or a profile URL
 * (`https://mastodon.social/@alice`) → `{ user, host }`. Null for anything
 * else, including a bare `@alice`: without a server it cannot be looked up.
 */
export function parseFediverseHandle(input: string): FediverseHandle | null {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const match = /^\/@([^/@]+)\/?$/.exec(url.pathname);
      return match ? checked(match[1], url.hostname) : null;
    } catch {
      return null;
    }
  }
  const match = /^@?([^@\s]+)@([^@\s]+)$/.exec(value);
  return match ? checked(match[1], match[2]) : null;
}

function checked(user: string, host: string): FediverseHandle | null {
  const lower = host.toLowerCase();
  return USER.test(user) && HOST.test(lower) ? { user, host: lower } : null;
}
