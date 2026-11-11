/**
 * Finding a page's webmention endpoint.
 *
 * Pure: given the response headers and the HTML body of a target page, where do
 * we send the notification? All the fiddly precedence lives here so it can be
 * table-tested without a network.
 *
 * The spec's order is `Link:` header, then `<link>`, then `<a>`, first match
 * wins. It matters: a site can advertise one endpoint in its headers and carry
 * a stale one in its markup, and the header is the one it can change without a
 * rebuild.
 */

/** The `rel` token we are looking for, in any of the three places. */
const REL = 'webmention';

/**
 * A `rel` attribute is a space-separated *set*, so `rel="webmention noopener"`
 * counts and `rel="webmentions"` does not. Substring matching gets this wrong
 * in both directions.
 */
function relMatches(value: string | null | undefined): boolean {
  return (value ?? '')
    .trim()
    .split(/\s+/)
    .some((token) => token.toLowerCase() === REL);
}

/**
 * Endpoints advertised in `Link:` headers.
 *
 * Format: `<https://example.com/wm>; rel="webmention"`, comma-separated, and a
 * single header may carry several. Parsed by hand rather than by regex over the
 * whole string, because a URL may itself contain a comma.
 */
export function endpointFromLinkHeader(headerValue: string | null | undefined): string | null {
  if (!headerValue) {
    return null;
  }
  // Split on commas that separate entries — i.e. those followed by `<`.
  for (const part of headerValue.split(/,(?=\s*<)/)) {
    const match = /^\s*<([^>]*)>\s*(.*)$/.exec(part);
    if (!match) {
      continue;
    }
    const [, url, params] = match;
    const rel = /rel\s*=\s*("([^"]*)"|'([^']*)'|([^;,\s]+))/i.exec(params);
    const relValue = rel?.[2] ?? rel?.[3] ?? rel?.[4];
    if (relMatches(relValue)) {
      return url.trim();
    }
  }
  return null;
}

/**
 * Endpoints advertised in the markup: `<link rel="webmention">` first, then
 * `<a rel="webmention">`.
 *
 * Parsed with `DOMParser` rather than regexes — the app already relies on it
 * for RSS, and hand-rolling HTML parsing to find one attribute is how you end
 * up matching a URL inside a comment or a `<script>` block.
 */
export function endpointFromHtml(html: string): string | null {
  let document: Document;
  try {
    document = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
  for (const selector of ['link[rel]', 'a[rel]']) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (relMatches(element.getAttribute('rel'))) {
        // An element with no href at all is not an endpoint. An *empty* href
        // is, though, and means "this URL itself" — see resolveEndpoint.
        const href = element.getAttribute('href');
        if (href !== null) {
          return href;
        }
      }
    }
  }
  return null;
}

/**
 * The endpoint for a page, resolved to an absolute URL.
 *
 * `href=""` is legal and means the target page is its own endpoint, which falls
 * out of URL resolution for free — `new URL('', base)` is `base`. Returns null
 * when the page advertises nothing, which is the *normal* outcome: Mastodon,
 * Bluesky, RSS items and tweets all land here.
 */
export function resolveEndpoint(
  targetUrl: string,
  linkHeader: string | null | undefined,
  html: string,
): string | null {
  const raw = endpointFromLinkHeader(linkHeader) ?? endpointFromHtml(html);
  if (raw === null) {
    return null;
  }
  try {
    const resolved = new URL(raw, targetUrl);
    // Only http(s) endpoints are deliverable. A `javascript:` or `data:` rel on
    // a hostile page must not become something we POST to.
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}
