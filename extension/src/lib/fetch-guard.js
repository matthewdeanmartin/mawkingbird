/**
 * What the bridge may fetch for mawkingbird.com, decided before any request is
 * made (and again for where a redirect ended). Pure: no `browser.*`.
 *
 * The bridge is a credential-free reader of public pages. It must never become
 * a way for a web page to reach the reader's own network (router, NAS, printer)
 * or to send their cookies anywhere, so:
 *
 * - http(s) only, no user:password in the URL;
 * - no loopback, private, link-local or carrier-grade NAT addresses, and no
 *   names that only resolve inside a network (`localhost`, `.local`,
 *   `.internal`, `.home.arpa`, `.lan`, single-label hosts);
 * - one of a few purposes, each with the content types it may return.
 *
 * Per-site permission is checked separately (the reader grants each site).
 * Known residual risk: a granted public hostname whose DNS later points at a
 * private address; host permissions are by name. See spec/firefox-extension.md.
 */

export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 20_000;

/** Content types each purpose may return (by prefix, lower case). */
export const PURPOSES = Object.freeze({
  feed: [
    'application/rss+xml',
    'application/atom+xml',
    'application/rdf+xml',
    'application/feed+json',
    'application/xml',
    'text/xml',
    'application/json',
    // Many feeds are served as plain text or HTML by misconfigured hosts; the
    // app's parser decides whether it is really a feed.
    'text/plain',
    'text/html',
  ],
  article: ['text/html', 'application/xhtml+xml', 'text/plain'],
  json: ['application/json', 'application/feed+json', 'application/activity+json', 'application/ld+json'],
});

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.intranet', '.corp'];

/**
 * @returns {{ ok: true, url: string, origin: string } | { ok: false, error: 'refused', detail: string }}
 */
export function checkTarget(value, purpose) {
  if (!Object.hasOwn(PURPOSES, purpose)) return refuse('Unknown purpose.');
  let url;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return refuse('Not a URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return refuse('Only web addresses.');
  if (url.username || url.password) return refuse('No credentials in addresses.');
  const reason = privateHostReason(url.hostname);
  if (reason) return refuse(reason);
  url.hash = '';
  return { ok: true, url: url.href, origin: url.origin };
}

/** Whether `contentType` is one `purpose` may return. A missing type is allowed. */
export function allowedType(purpose, contentType) {
  const type = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!type) return true;
  return (PURPOSES[purpose] ?? []).some((allowed) => type === allowed);
}

/** Why a hostname is off limits, or '' when it is a public name or address. */
export function privateHostReason(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  if (!host) return 'No host.';
  if (host.startsWith('[')) return isPrivateIPv6(host.slice(1, -1)) ? 'Private address.' : '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIPv4(host) ? 'Private address.' : '';
  // Other numeric spellings (`0x7f.1`, `2130706433`) are normalised by URL;
  // anything still all digits and dots is not a name.
  if (/^[\d.]+$/.test(host)) return 'Unusual address.';
  if (host === 'localhost' || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return 'Local network name.';
  }
  if (!host.includes('.')) return 'Local network name.';
  return '';
}

export function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIPv6(address) {
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // IPv4-mapped (::ffff:a.b.c.d, or the hex form URL produces).
  const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(lower);
  if (mapped) {
    if (mapped[1]) return isPrivateIPv4(mapped[1]);
    const hi = parseInt(mapped[2], 16);
    const lo = parseInt(mapped[3], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(lower.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 // multicast
  );
}

function refuse(detail) {
  return { ok: false, error: 'refused', detail };
}
