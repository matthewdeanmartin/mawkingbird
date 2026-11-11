/**
 * The first ordinary web link in a post: what "unwrap" saves in place of the
 * post itself (Raindrop bookmarks, the Mastodon bookmark exporter).
 *
 * Skips hashtags, tag-page URLs and links back to the viewer's own instance
 * (mentions, other posts), because none of those are what the post is sharing.
 */
export function firstExternalLink(content: string, instanceUrl: string): string | null {
  const instanceOrigin = safeOrigin(instanceUrl || location.origin);
  const doc = new DOMParser().parseFromString(content, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = anchor.getAttribute('href');
    if (!href || anchor.classList.contains('hashtag')) continue;
    try {
      const url = new URL(href, instanceOrigin ?? location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (/^\/tags?\/[^/?#]+\/?$/i.test(url.pathname)) continue;
      if (instanceOrigin && url.origin === instanceOrigin) continue;
      return url.toString();
    } catch {
      // Malformed links are not bookmark targets.
    }
  }
  return null;
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
