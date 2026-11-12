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

/** A handle on either network, as typed into a tool page. */
export type ParsedPerson =
  | { network: 'mastodon'; handle: FediverseHandle; label: string }
  | { network: 'bluesky'; actor: string; label: string };

const BSKY_HANDLE =
  /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const DID = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;

/**
 * `@alice@mastodon.social` (or a Mastodon profile URL) is Mastodon;
 * `alice.bsky.social`, `@alice.bsky.social`, a DID or a bsky.app profile URL is
 * Bluesky. Anything else is null.
 */
export function parsePerson(input: string): ParsedPerson | null {
  const value = input.trim();
  const bskyUrl = /^https?:\/\/bsky\.app\/profile\/([^/?#]+)\/?$/i.exec(value);
  if (bskyUrl) return bluesky(decodeURIComponent(bskyUrl[1]));
  const fedi = parseFediverseHandle(value);
  if (fedi) return { network: 'mastodon', handle: fedi, label: `@${fedi.user}@${fedi.host}` };
  return bluesky(value.replace(/^@/, ''));
}

function bluesky(actor: string): ParsedPerson | null {
  if (DID.test(actor)) return { network: 'bluesky', actor, label: actor };
  const handle = actor.toLowerCase();
  return BSKY_HANDLE.test(handle)
    ? { network: 'bluesky', actor: handle, label: `@${handle}` }
    : null;
}

/** True for a Bluesky DID such as `did:plc:abc123`. */
export function isDid(value: string): boolean {
  return DID.test(value);
}
