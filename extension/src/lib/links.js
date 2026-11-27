/**
 * Mawkingbird URLs the extension opens. Pure functions: no `browser.*`, so the
 * tests run in plain Node.
 *
 * Every URL here is a route the web app already has. The deep-link shapes
 * mirror the route matchers in ui/src/app/posts/copy-link/deep-links.ts; keep
 * the two in step. A page the app could not resolve gets null, and callers fall
 * back to "Posts about this link".
 */

/** The deployments a reader can point the extension at. */
export const MAWKINGBIRD_BASES = Object.freeze({
  production: 'https://mawkingbird.com/',
  canary: 'https://mawkingbird.com/canary/',
  test: 'https://mawkingbird.com/test/',
});

export const DEFAULT_BASE = MAWKINGBIRD_BASES.production;

/**
 * A usable base URL ending in `/`, or null. Only https, or http on a loopback
 * host (for `ng serve`), so a typo cannot point the sidebar at an arbitrary
 * plain-http site.
 */
export function normalizeBase(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
  if (url.username || url.password) return null;
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** `path` (no leading slash) under `base`, with query parameters. */
export function appUrl(base, path, params = {}) {
  const url = new URL(path, normalizeBase(base) ?? DEFAULT_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.href;
}

/** Only web pages are worth sharing; `about:`, `moz-extension:` and files are not. */
export function isShareablePageUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** `/share`: the app parks title/text/url in an unsent draft and opens Home's composer. */
export function shareUrl(base, { title, text, url } = {}) {
  return appUrl(base, 'share', {
    title: clean(title),
    text: clean(text),
    url: isShareablePageUrl(url) ? url : undefined,
  });
}

/** The selection as a quotation, ready for `/share`'s `text`. */
export function quotedText(selection) {
  const body = clean(selection);
  return body ? `“${body}”` : '';
}

/** `/link?url=`: posts sharing this link (Mastodon 4.3+ link timeline). */
export function postsAboutUrl(base, pageUrl) {
  return appUrl(base, 'link', { url: pageUrl });
}

/**
 * `/rss/add?url=`: the RSS page with Paste a link filled in. Takes a feed or a
 * plain page: Paste a link finds a site's feed itself. Nothing is subscribed
 * until the reader presses Continue there.
 */
export function subscribeUrl(base, feedOrPageUrl) {
  return isShareablePageUrl(feedOrPageUrl) ? appUrl(base, 'rss/add', { url: feedOrPageUrl }) : null;
}

/**
 * `user@host` from what a page offers as a fediverse handle (`@user@host`,
 * `user@host`, any case), or null. Same shape the app's `/@user@host` accepts.
 */
export function normalizeHandle(value) {
  const handle = String(value ?? '').trim().replace(/^@/, '');
  if (!QUALIFIED_HANDLE.test(handle)) return null;
  const at = handle.lastIndexOf('@');
  return `${handle.slice(0, at)}@${handle.slice(at + 1).toLowerCase()}`;
}

/** `/@user@host`: that account in Mawkingbird, where the Follow button is. */
export function accountUrl(base, handle) {
  const normalized = normalizeHandle(handle);
  return normalized ? appUrl(base, `@${normalized}`) : null;
}

/** Lite (`/m/`). */
export function liteUrl(base) {
  return appUrl(base, 'm/');
}

/**
 * `/panel?url=&title=`: the sidebar's content, Mawkingbird about the page
 * beside it. A non-web page gets the bare panel, which says to open one.
 */
export function panelUrl(base, { url, title } = {}) {
  if (!isShareablePageUrl(url)) return appUrl(base, 'panel');
  return appUrl(base, 'panel', { url: withoutHash(url), title: clean(title, 300) });
}

/**
 * Whether `url` is Mawkingbird itself (the configured deployment). The sidebar
 * keeps the page it was showing rather than a panel about Mawkingbird, so
 * opening Watch from the panel leaves the video's panel in place.
 */
export function isMawkingbirdPage(base, url) {
  const root = normalizeBase(base);
  if (!root) return false;
  try {
    const page = new URL(url);
    const home = new URL(root);
    return page.origin === home.origin && page.pathname.startsWith(home.pathname);
  } catch {
    return false;
  }
}

/** The page address the sidebar follows: a #fragment is the same page. */
export function withoutHash(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

// --- Deep links ---------------------------------------------------------------
// Copied from deep-links.ts so a URL built here passes the app's matchers.

const HOSTNAME =
  /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?$/i;
const QUALIFIED_HANDLE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const MASTODON_ID = /^[A-Za-z0-9]+$/;
const BARE_USERNAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const TWITTER_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const TWITTER_ID = /^\d{1,25}$/;
const BSKY_ACTOR = /^(?:did:[a-z]+:[A-Za-z0-9._:%-]+|[A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;
const BSKY_RKEY = /^[A-Za-z0-9._~:-]{1,512}$/;

const BLUESKY_HOSTS = new Set(['bsky.app', 'www.bsky.app']);
const TWITTER_HOSTS = new Set([
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'x.com',
  'www.x.com',
  'mobile.x.com',
]);

/** First path segments on Twitter that are pages, not people. */
const TWITTER_RESERVED = new Set([
  'compose', 'explore', 'hashtag', 'home', 'i', 'intent', 'login', 'logout',
  'messages', 'notifications', 'privacy', 'search', 'settings', 'share',
  'signup', 'tos',
]);

/**
 * The Mawkingbird deep link for a Mastodon, Bluesky or Twitter post or profile
 * URL, or null when the URL is none of those.
 *
 * Mastodon is recognised by shape only (any host): `/@user/<id>`,
 * `/@user@host/<id>`, `/users/<user>/statuses/<id>`, `/@user`, `/users/<user>`.
 * The post's id belongs to the host it was read on, which is what the app's
 * `/<server>/@<acct>/<id>` expects.
 */
export function deepLinkFor(base, pageUrl) {
  const path = deepLinkPath(pageUrl);
  return path ? appUrl(base, path) : null;
}

/** The app path (no leading slash) for {@link deepLinkFor}. Exported for tests. */
export function deepLinkPath(pageUrl) {
  let url;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.host.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean).map(safeDecode);
  if (segments.some((s) => s === null)) return null;

  if (BLUESKY_HOSTS.has(host)) return blueskyPath(segments);
  if (TWITTER_HOSTS.has(host)) return twitterPath(segments);
  if (!HOSTNAME.test(host)) return null;
  return mastodonPath(host, segments);
}

function mastodonPath(host, segments) {
  let acct = null;
  let id = null;
  if (segments[0]?.startsWith('@') && segments.length <= 2) {
    acct = segments[0].slice(1);
    id = segments[1] ?? null;
  } else if (segments[0] === 'users' && segments[1]) {
    if (segments.length === 2) acct = segments[1];
    else if (segments.length === 4 && segments[2] === 'statuses') [, acct, , id] = segments;
  }
  if (!acct) return null;
  const qualified = QUALIFIED_HANDLE.test(acct);
  if (!qualified && !BARE_USERNAME.test(acct)) return null;

  // `/@alice/media`, `/@alice/following`: a profile tab, not a post. Post ids
  // (Mastodon snowflakes, Pleroma flakes) always contain a digit.
  if (id !== null && !/\d/.test(id)) id = null;
  if (id !== null) {
    if (!MASTODON_ID.test(id)) return null;
    return `${host}/@${acct}/${id}`;
  }
  const handle = qualified ? acct : `${acct}@${host}`;
  return QUALIFIED_HANDLE.test(handle) ? `@${handle}` : null;
}

function blueskyPath(segments) {
  if (segments[0] !== 'profile' || !BSKY_ACTOR.test(segments[1] ?? '')) return null;
  const actor = encodeURIComponent(segments[1]).replace(/%3A/gi, ':');
  if (segments.length === 2) return `bsky/profile/${actor}`;
  if (segments.length === 4 && segments[2] === 'post' && BSKY_RKEY.test(segments[3])) {
    return `bsky/profile/${actor}/post/${encodeURIComponent(segments[3])}`;
  }
  return null;
}

function twitterPath(segments) {
  const [user, kind, id] = segments;
  if (!user || !TWITTER_HANDLE.test(user) || TWITTER_RESERVED.has(user.toLowerCase())) return null;
  if (segments.length === 1) return `twitter/${user}`;
  if (segments.length >= 3 && kind === 'status' && TWITTER_ID.test(id)) {
    return `twitter/${user}/status/${id}`;
  }
  return null;
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Trimmed text, or undefined when empty. Long selections are capped. */
function clean(value, max = 5000) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
