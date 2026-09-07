import { Status } from '../../models';

/**
 * Which link in a post, if any, is the article the reader means.
 *
 * ## Why "exactly one" rather than "the first"
 *
 * A post with several outbound links has no obvious article — picking the first
 * would silently expand a footnote or a "via" credit while the reader watched.
 * Guessing wrong here is expensive: it spends a fetch, it spends quota, and it
 * fills the reader with the wrong document. So ambiguity means no button, and
 * the reader still has the ordinary links in the post text.
 *
 * RSS items are the exception and the main case: the item *is* an article, and
 * its `url` is unambiguous by construction.
 */

/** Hosts whose links are navigation within the fediverse, not articles. */
const SOCIAL_LINK_PATTERN =
  /^(x\.com|twitter\.com|nitter\.|bsky\.app|mastodon\.|.*\.social|.*\.town|threads\.net)/i;

/** Whether this href is a mention, hashtag, or other in-app navigation. */
function isSocialNavigation(anchor: HTMLAnchorElement, url: URL): boolean {
  const classes = anchor.getAttribute('class') ?? '';
  if (/\b(mention|hashtag|u-url)\b/.test(classes)) {
    return true;
  }
  // Do not infer a social link from the path alone. `/@author/article` is also
  // a normal publishing shape, and even a link to an unfamiliar Fediverse host
  // may be exactly what the reader asked to fetch. Known social hosts and links
  // Mastodon explicitly classed as mentions/hashtags are enough evidence;
  // rejecting every unknown host with an `/@` path made the fetch control
  // silently disappear for perfectly usable links.
  return SOCIAL_LINK_PATTERN.test(url.hostname);
}

/** Every outbound article-ish link in a post's rendered HTML, deduplicated. */
export function outboundLinks(contentHtml: string): string[] {
  const doc = new DOMParser().parseFromString(contentHtml, 'text/html');
  const seen = new Set<string>();
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href')?.trim();
    if (!href) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      continue;
    }
    if (isSocialNavigation(anchor as HTMLAnchorElement, url)) {
      continue;
    }
    seen.add(url.toString());
  }
  return [...seen];
}

/**
 * The URL to expand for a post, or `null` when there is nothing left to fetch.
 *
 * For an RSS item this is the item's own link — the item *is* the article, and
 * the whole point of the feature is bringing that article into the reader.
 * But only when the feed did NOT already publish the full body: `content` for
 * a full-content item (`rssFullContent: true`) already *is* the article, so
 * expanding would spend a fetch and quota to re-download the same text the
 * reader is already looking at. `null` here suppresses the button entirely for
 * those items; a teaser-only item still resolves to its link, and the caller
 * is expected to label that control "fetch rest of article" rather than
 * "fetch article" — there IS more, just not here yet.
 *
 * For everything else it is the single outbound link, when there is exactly
 * one.
 */
export function articleTarget(post: Status): string | null {
  if (post.provider === 'rss') {
    return post.rssFullContent ? null : (post.url ?? null);
  }
  const links = outboundLinks(post.content ?? '');
  return links.length === 1 ? links[0] : null;
}
