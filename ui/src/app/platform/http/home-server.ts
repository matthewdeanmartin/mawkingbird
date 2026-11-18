import { normalizeHostUrl } from './host-url';

/**
 * The one server a deployment of Mawkingbird belongs to, if it belongs to one.
 *
 * A copy served next to a self-hosted Mastodon instance (ops/MASTODON_INSTANCE.md)
 * names that instance in `index.html`:
 *
 *     <meta name="mawkingbird:home-server" content="https://example.social" />
 *
 * Then sign-in opens on it, anonymous browsing reads it, and the fallbacks that
 * would otherwise pick mastodon.social pick it. Readers can still choose any
 * other server. Empty (mawkingbird.com and ordinary self-hosts) changes nothing.
 *
 * A meta tag rather than a config file: it is read synchronously at startup,
 * before the first request decides which server to talk to, with no extra
 * fetch. A deployer can set it after building, without a rebuild.
 */
export const HOME_SERVER_META = 'mawkingbird:home-server';

/** The general-purpose fallback when a deployment names no home server. */
export const FALLBACK_SERVER = 'https://mastodon.social';

/**
 * The configured home server's base URL, or null. Only HTTPS, or plain HTTP to
 * `localhost` for development: a sign-in default must not be downgradeable.
 */
export function homeServer(doc: Document | undefined = globalThis.document): string | null {
  const raw = doc?.querySelector(`meta[name="${HOME_SERVER_META}"]`)?.getAttribute('content');
  const value = normalizeHostUrl(raw?.trim() ?? '');
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'https:' || (local && url.protocol === 'http:') ? url.origin : null;
  } catch {
    return null;
  }
}

/** Where to go when nothing else has chosen a server: the home server, else mastodon.social. */
export function defaultServer(doc?: Document): string {
  return homeServer(doc) ?? FALLBACK_SERVER;
}
