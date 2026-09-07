import { PreviewCard } from '../../models';

/**
 * Page metadata → {@link PreviewCard}.
 *
 * ## Why this is the load-bearing half of article expansion
 *
 * Article extraction fails on a large share of the web — paywalls, bot checks,
 * consent walls, JS-only pages. Metadata extraction fails on far less of it,
 * because the same publishers who hide the article work hard to make the *link*
 * look good on social media. A paywalled news page almost always carries a
 * clean `og:title`, `og:description` and `og:image`.
 *
 * So this runs unconditionally on every fetch, independent of whether body
 * extraction succeeds, and its output is what the reader falls back to. That is
 * what keeps the failure path from being a dead end.
 *
 * ## Source precedence
 *
 * OpenGraph, then Twitter cards, then JSON-LD, then plain HTML. OpenGraph
 * first because it is the most widely and most deliberately set — a publisher
 * editing one thing edits `og:`. Plain `<title>` last because it is the most
 * likely to carry site-name boilerplate ("Post title | My Blog | WordPress").
 */

/** Read a `<meta>` value by property or name, whichever the page used. */
function metaContent(doc: Document, key: string): string | null {
  // Both spellings are in the wild for both vocabularies: the OG spec says
  // `property`, Twitter's says `name`, and real pages mix them freely.
  const el = doc.querySelector(`meta[property="${key}" i], meta[name="${key}" i]`);
  const value = el?.getAttribute('content')?.trim();
  return value ? value : null;
}

/** First non-empty value among several meta keys. */
function firstMeta(doc: Document, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = metaContent(doc, key);
    if (value) {
      return value;
    }
  }
  return null;
}

/**
 * Every JSON-LD block on the page, parsed, with `@graph` flattened.
 *
 * Failures are swallowed per-block: one malformed script must not cost us the
 * metadata in the next one, and malformed JSON-LD is extremely common.
 */
export function jsonLdNodes(doc: Document): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json" i]'))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') {
        continue;
      }
      const record = node as Record<string, unknown>;
      const graph = record['@graph'];
      if (Array.isArray(graph)) {
        queue.push(...graph);
      }
      nodes.push(record);
    }
  }
  return nodes;
}

/** Whether a JSON-LD node describes an article-ish thing. */
function isArticleNode(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && /article|blogposting|newsarticle/i.test(t));
}

/** The first article-ish JSON-LD node, if any. */
export function jsonLdArticle(doc: Document): Record<string, unknown> | null {
  return jsonLdNodes(doc).find(isArticleNode) ?? null;
}

/**
 * A publisher's own declaration that a page is not free to read.
 *
 * The single best paywall signal there is, because it is machine-readable and
 * set deliberately — Google requires it of publishers who want paywalled
 * content indexed. Far more reliable than sniffing for `class="paywall"`.
 */
export function declaredPaywalled(doc: Document): boolean {
  for (const node of jsonLdNodes(doc)) {
    const free = node['isAccessibleForFree'];
    // Real pages spell this as a boolean *and* as the strings "False"/"false".
    if (free === false || (typeof free === 'string' && /^false$/i.test(free))) {
      return true;
    }
  }
  const tier = metaContent(doc, 'article:content_tier');
  return tier !== null && /locked|paid|premium|subscri/i.test(tier);
}

/** A JSON-LD author, which may be a string, an object, or a list of either. */
function jsonLdAuthor(node: Record<string, unknown> | null): string | null {
  if (!node) {
    return null;
  }
  const author = node['author'];
  const first = Array.isArray(author) ? author[0] : author;
  if (typeof first === 'string') {
    return first.trim() || null;
  }
  if (first && typeof first === 'object') {
    const name = (first as Record<string, unknown>)['name'];
    if (typeof name === 'string') {
      return name.trim() || null;
    }
  }
  return null;
}

/** Resolve a possibly-relative URL, dropping anything that is not http(s). */
export function absoluteHttpUrl(raw: string | null, base: string): string | null {
  if (!raw) {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  // `javascript:` and `data:` are the reason this is a check rather than a
  // `new URL()` call: both parse fine and neither belongs in a card.
  return resolved.protocol === 'http:' || resolved.protocol === 'https:'
    ? resolved.toString()
    : null;
}

/**
 * Strip a trailing site name from a title.
 *
 * `<title>` is very often "Real Title | Site Name" or "Real Title — Site Name".
 * When we independently know the site name, removing it makes the card title
 * match what the page actually calls the article.
 *
 * Deliberately conservative: only a *trailing* segment, only when the remainder
 * is still substantial. A title that is genuinely mostly the site name is left
 * alone rather than reduced to a fragment.
 */
export function trimSiteSuffix(title: string, siteName: string | null): string {
  if (!siteName) {
    return title;
  }
  const match = /^(.*?)\s*[|–—·-]\s*([^|–—·-]+)$/.exec(title);
  if (!match) {
    return title;
  }
  const [, head, tail] = match;
  if (tail.trim().toLowerCase() !== siteName.trim().toLowerCase()) {
    return title;
  }
  return head.trim().length >= 8 ? head.trim() : title;
}

/** The site's own name for itself. */
export function extractSiteName(doc: Document, base: string): string | null {
  const declared = firstMeta(doc, ['og:site_name', 'application-name', 'twitter:site']);
  if (declared) {
    // `twitter:site` is an @handle; strip the sigil so it reads as a name.
    return declared.replace(/^@/, '');
  }
  try {
    return new URL(base).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Build a preview card from whatever the page declares about itself.
 *
 * Returns `null` only when there is no title at all from any source — at which
 * point there is nothing to show and the caller falls back to a bare link.
 * Everything else degrades: a card with a title and a host is still useful.
 */
export function extractMetadata(doc: Document, finalUrl: string): PreviewCard | null {
  const article = jsonLdArticle(doc);

  const siteName = extractSiteName(doc, finalUrl);

  const rawTitle =
    firstMeta(doc, ['og:title', 'twitter:title']) ??
    (typeof article?.['headline'] === 'string' ? (article['headline'] as string).trim() : null) ??
    doc.querySelector('title')?.textContent?.trim() ??
    doc.querySelector('h1')?.textContent?.trim() ??
    null;

  if (!rawTitle) {
    return null;
  }

  const description =
    firstMeta(doc, ['og:description', 'twitter:description', 'description']) ??
    (typeof article?.['description'] === 'string'
      ? (article['description'] as string).trim()
      : null) ??
    '';

  const image = absoluteHttpUrl(
    firstMeta(doc, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']),
    finalUrl,
  );

  const author =
    firstMeta(doc, ['article:author', 'author', 'twitter:creator']) ?? jsonLdAuthor(article);

  return {
    url: finalUrl,
    title: trimSiteSuffix(rawTitle, siteName),
    description,
    type: 'link',
    author_name: author ?? undefined,
    provider_name: siteName ?? '',
    image,
  };
}
