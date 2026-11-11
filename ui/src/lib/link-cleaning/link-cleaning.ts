/**
 * Remove known tracking parameters from links, without breaking the links.
 *
 * Only parameters on the tracking list are removed. Everything else is kept
 * byte for byte: unknown parameters, their encoding, fragments, and signed URLs
 * (which a single changed byte would invalidate). Redirects are never followed.
 *
 * Callers can protect links they made on purpose: their own short domains, a
 * campaign tag they chose to add, or anything a predicate recognises.
 */

const TRACKING =
  /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|igsh|yclid|twclid|ttclid|gbraid|wbraid)$/i;

const SIGNED = /signature|^sig$|^x-amz-|^x-goog-/i;

/** Links to leave exactly as written. */
export interface LinkCleaningOptions {
  /** Hosts whose links are never changed. Each also covers its subdomains. */
  keepHosts?: readonly string[];
  /** Parameter names never removed, even if they look like tracking. Case-insensitive. */
  keepParams?: readonly string[];
  /** Any other link to leave alone, such as one your own tool tagged on purpose. */
  keep?: (url: URL) => boolean;
}

/** One link that cleaning changed. Offsets are UTF-16 indexes into the original text. */
export interface LinkEdit {
  start: number;
  end: number;
  original: string;
  replacement: string;
}

function protectedHost(host: string, keepHosts: readonly string[]): boolean {
  const name = host.toLowerCase();
  return keepHosts.some((kept) => {
    const k = kept.toLowerCase().replace(/^\.+|\.+$/g, '');
    return !!k && (name === k || name.endsWith('.' + k));
  });
}

/** One URL with its tracking parameters removed, or unchanged when it is protected or not http(s). */
export function cleanUrl(value: string, options: LinkCleaningOptions = {}): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return value;
    if ([...url.searchParams.keys()].some((key) => SIGNED.test(key))) return value;
    if (options.keepHosts && protectedHost(url.hostname, options.keepHosts)) return value;
    if (options.keep?.(url)) return value;
    const keepParams = new Set((options.keepParams ?? []).map((p) => p.toLowerCase()));
    const hashAt = value.indexOf('#');
    const body = hashAt < 0 ? value : value.slice(0, hashAt);
    const queryAt = body.indexOf('?');
    if (queryAt < 0) return value;
    const parts = body.slice(queryAt + 1).split('&');
    const kept = parts.filter((part) => {
      const key = decodeURIComponent(part.split('=')[0].replace(/\+/g, ' '));
      return keepParams.has(key.toLowerCase()) || !TRACKING.test(key);
    });
    if (kept.length === parts.length) return value;
    return (
      body.slice(0, queryAt) +
      (kept.length ? '?' + kept.join('&') : '') +
      (hashAt < 0 ? '' : value.slice(hashAt))
    );
  } catch {
    return value;
  }
}

/**
 * Clean every http(s) link in a piece of text. Trailing sentence punctuation is
 * not treated as part of a link. Returns the new text and where each change was,
 * so callers that index into the text (rich-text facets) can shift their offsets.
 */
export function cleanLinks(
  text: string,
  options: LinkCleaningOptions = {},
): { text: string; edits: LinkEdit[] } {
  const edits: LinkEdit[] = [];
  const cleaned = text.replace(/https?:\/\/[^\s<>"']+/gi, (match: string, offset: number) => {
    const trailing = match.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
    const original = match.slice(0, match.length - trailing.length);
    const replacement = cleanUrl(original, options);
    if (replacement !== original)
      edits.push({ start: offset, end: offset + original.length, original, replacement });
    return replacement + trailing;
  });
  return { text: cleaned, edits };
}
