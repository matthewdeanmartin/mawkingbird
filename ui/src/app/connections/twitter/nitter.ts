/**
 * Rewrites x.com links to a privacy-respecting front-end.
 *
 * ## Why the app steers away from x.com
 *
 * Sending a reader to x.com undoes much of the point of reading X here. That
 * page carries trackers and a login wall, it is increasingly hostile to logged-
 * out visitors, and clicking through is exactly the habit someone using this
 * connector is trying to break. Mawkingbird cannot host the content itself, but
 * it can point at a front-end that does not do those things.
 *
 * ## Why the instance is configurable, and why the default is soft
 *
 * The public mirror ecosystem is unstable and has been since X closed guest
 * access; instances appear and vanish on a scale of months — nitter.space, the
 * previous default, is itself gone. That is the same reason
 * `sprint/roadmap-providers.md` decided to treat these as "just an RSS URL the
 * user supplies" rather than build one in.
 *
 * So this ships a default that works today, and lets the user replace it in one
 * field when it stops working. A hardcoded host would turn a dead instance into
 * a dead feature with no recourse; a required setting would make every reader
 * research mirrors before their first click.
 *
 * ## Why the path is rewritten too, not just the host
 *
 * Nitter mirrored Twitter's URL shape exactly, so this used to carry the path
 * over untouched. Sotwe does not: a profile is `/user` as before, but a tweet
 * is `/tweet/<id>` — the author is dropped from the path entirely. Swapping
 * only the host would have produced a dead link for every single tweet, which
 * is worse than not rewriting at all. So each known mirror declares how it
 * spells a status, and an unknown host falls back to Nitter's shape, which is
 * what every remaining Nitter fork uses.
 */

const NITTER_HOST_KEY = 'mockingbird_nitter_host';

/**
 * The instance used when the user has not chosen one.
 *
 * Not a promise that it is up — see the note above. It is the most reliable
 * public mirror at the time of writing, and the settings field exists precisely
 * because that sentence has a shelf life.
 */
export const DEFAULT_NITTER_HOST = 'www.sotwe.com';

/** Hosts whose links are worth rewriting. */
const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

/**
 * How a mirror spells a single tweet, keyed by host.
 *
 * Only the status path differs between the mirrors we know about; profiles are
 * `/<user>` everywhere. A host absent from this map keeps Twitter's own shape.
 */
const STATUS_PATH: Record<string, (user: string, id: string) => string> = {
  // Sotwe drops the author: /tweet/<id>.
  'sotwe.com': (_user, id) => `/tweet/${id}`,
  'www.sotwe.com': (_user, id) => `/tweet/${id}`,
};

/** `/user/status/123` → the user and id, or null when the path is not a status. */
function parseStatusPath(pathname: string): { user: string; id: string } | null {
  const match = /^\/([^/]+)\/status(?:es)?\/(\d+)/.exec(pathname);
  return match ? { user: match[1], id: match[2] } : null;
}

/** The configured instance host, without scheme or trailing slash. */
export function nitterHost(): string {
  try {
    const stored = localStorage.getItem(NITTER_HOST_KEY)?.trim();
    return stored ? normalizeHost(stored) : DEFAULT_NITTER_HOST;
  } catch {
    return DEFAULT_NITTER_HOST;
  }
}

/** Choose an instance. An empty value restores the default. */
export function setNitterHost(host: string): void {
  const trimmed = host.trim();
  try {
    if (trimmed) {
      localStorage.setItem(NITTER_HOST_KEY, normalizeHost(trimmed));
    } else {
      localStorage.removeItem(NITTER_HOST_KEY);
    }
  } catch {
    // Not persisted; the default applies. Nothing here is worth failing over.
  }
}

/** Strip a scheme, path and trailing slash so only the host survives. */
function normalizeHost(value: string): string {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Rewrite an x.com URL onto the configured mirror.
 *
 * Returns the original URL unchanged when it is not an X link or cannot be
 * parsed — this is a convenience, and a link that fails to rewrite should still
 * work rather than break.
 */
export function toNitterUrl(url: string | null | undefined, host = nitterHost()): string | null {
  if (!url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!X_HOSTS.has(parsed.hostname.toLowerCase())) {
    return url;
  }
  const status = parseStatusPath(parsed.pathname);
  const spell = STATUS_PATH[host.toLowerCase()];
  if (status && spell) {
    // A mirror with its own status shape: query and fragment are Twitter's and
    // mean nothing there, so they are dropped rather than carried over.
    return `https://${host}${spell(status.user, status.id)}`;
  }
  // Nitter's shape, and the shape of a profile link on every mirror: the path
  // carries over untouched.
  return `https://${host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}
