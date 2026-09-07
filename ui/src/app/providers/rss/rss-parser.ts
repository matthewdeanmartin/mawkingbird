// RSS 2.0 / Atom parsing via the browser's DOMParser. No dependencies.

export interface ParsedItem {
  /** Stable id within the feed (guid / atom:id, falling back to link or content hash). */
  guid: string;
  title: string;
  link: string | null;
  /** ISO 8601, or null when the item has no (parseable) date. */
  publishedAt: string | null;
  /** Raw item HTML (content:encoded / description / atom:content) — NOT yet sanitized. */
  html: string;
  /**
   * Whether `html` came from a full-content field (RSS `content:encoded`, Atom
   * `<content>`) rather than a summary field (`<description>`, Atom
   * `<summary>`). Feeds are not required to publish full content — many
   * publish only a teaser and expect the reader to click through — so this is
   * what lets the reader tell "the whole piece is already here" from "there is
   * more on the original page" instead of assuming one or the other for every
   * RSS item alike.
   */
  isFullContent: boolean;
  /** Enclosure/media URLs with their MIME type when declared. */
  enclosures: { url: string; type: string | null }[];
  /** Category/tag labels (RSS <category>, Atom <category term>). */
  categories: string[];
  /** Author name (dc:creator, RSS <author>, or Atom <author><name>), when present. */
  author: string | null;
  /**
   * URL of a secondary feed carrying this item's comments, when the publisher
   * declares one — WordPress's `wfw:commentRss` or Atom RFC 4685 `rel="replies"`.
   * The one comment-consumption path feed readers ever really supported.
   */
  commentsFeedUrl: string | null;
  /** Declared comment count (slash:comments / Atom thr:total), or null. */
  commentCount: number | null;
}

export interface ParsedFeed {
  title: string;
  /** The feed's homepage link, when declared. */
  link: string | null;
  items: ParsedItem[];
}

/** Direct children of `parent` with the given local name (namespace-agnostic). */
function children(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((el) => el.localName === localName);
}

function childText(parent: Element, localName: string): string {
  return children(parent, localName)[0]?.textContent?.trim() ?? '';
}

function toIso(raw: string): string | null {
  if (!raw) {
    return null;
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Tiny non-cryptographic hash for guid-less items (djb2). */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Atom `<link>`: prefer rel="alternate" (or no rel), which is the human page. */
function atomLink(parent: Element): string | null {
  const links = children(parent, 'link');
  const alternate = links.find(
    (l) => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate',
  );
  return (alternate ?? links[0])?.getAttribute('href')?.trim() || null;
}

/** The first Atom `<link rel="replies">` href (RFC 4685 threading), or null. */
function atomRepliesLink(parent: Element): string | null {
  const replies = children(parent, 'link').find((l) => l.getAttribute('rel') === 'replies');
  return replies?.getAttribute('href')?.trim() || null;
}

/** Parse a `<category>` list: RSS uses text content, Atom uses a `term` attribute. */
function categories(parent: Element): string[] {
  return children(parent, 'category')
    .map((c) => (c.getAttribute('term') || c.textContent || '').trim())
    .filter((c) => c.length > 0);
}

function toCount(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/** RSS item author: dc:creator (common in comment feeds) or the plain <author>. */
function rssAuthor(item: Element): string | null {
  return childText(item, 'creator') || childText(item, 'author') || null;
}

/** Atom entry author: the <author><name>. */
function atomAuthor(entry: Element): string | null {
  const author = children(entry, 'author')[0];
  return (author && childText(author, 'name')) || null;
}

/**
 * The `slash:comments` count. RSS 2.0's core `<comments>` (a URL to the HTML
 * comments page) and the slash module's `<slash:comments>` (an integer count)
 * share a local name, so match on the `slash` prefix to read the right one.
 */
function slashCommentCount(item: Element): number | null {
  const el = children(item, 'comments').find((c) => c.prefix === 'slash');
  return el ? toCount(el.textContent?.trim() ?? '') : null;
}

function parseRssItem(item: Element): ParsedItem {
  const title = childText(item, 'title');
  const link = childText(item, 'link') || null;
  // content:encoded (full HTML) beats description (often a summary).
  const encoded = childText(item, 'encoded');
  const html = encoded || childText(item, 'description');
  // Mastodon profile feeds use Media RSS <media:content>, while many classic
  // feeds use <enclosure>. Treat both as attachments.
  const enclosures = [...children(item, 'enclosure'), ...children(item, 'content')]
    .map((e) => ({ url: e.getAttribute('url') ?? '', type: e.getAttribute('type') }))
    .filter((e) => e.url);
  return {
    guid: childText(item, 'guid') || link || hash(title + html),
    title,
    link,
    publishedAt: toIso(childText(item, 'pubDate')) ?? toIso(childText(item, 'date')),
    html,
    isFullContent: encoded !== '',
    enclosures,
    categories: categories(item),
    author: rssAuthor(item),
    // wfw:commentRss / wfw:commentRSS — WordPress's per-post comment feed.
    commentsFeedUrl: childText(item, 'commentRss') || childText(item, 'commentRSS') || null,
    commentCount: slashCommentCount(item),
  };
}

function parseAtomEntry(entry: Element): ParsedItem {
  const title = childText(entry, 'title');
  const link = atomLink(entry);
  const content = childText(entry, 'content');
  const html = content || childText(entry, 'summary');
  return {
    guid: childText(entry, 'id') || link || hash(title + html),
    title,
    link,
    publishedAt: toIso(childText(entry, 'published')) ?? toIso(childText(entry, 'updated')),
    html,
    isFullContent: content !== '',
    enclosures: [],
    categories: categories(entry),
    author: atomAuthor(entry),
    commentsFeedUrl: atomRepliesLink(entry),
    // Atom threading (RFC 4685) exposes the reply count as thr:total.
    commentCount: toCount(childText(entry, 'total')),
  };
}

/**
 * Parse an RSS 2.0 or Atom document. Throws with a human-readable message when
 * the text isn't a recognizable feed (shown verbatim in the add-feed form).
 */
export function parseFeed(xml: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Not valid XML — is this really a feed URL?');
  }
  const root = doc.documentElement;

  if (root.localName === 'rss' || root.localName === 'RDF') {
    const channel = children(root, 'channel')[0];
    if (!channel) {
      throw new Error('RSS document has no <channel>.');
    }
    // RSS 1.0 (RDF) keeps items outside <channel>; RSS 2.0 inside. Accept both.
    const items = [...children(channel, 'item'), ...children(root, 'item')];
    return {
      title: childText(channel, 'title') || 'Untitled feed',
      link: childText(channel, 'link') || null,
      items: items.map(parseRssItem),
    };
  }

  if (root.localName === 'feed') {
    return {
      title: childText(root, 'title') || 'Untitled feed',
      link: atomLink(root),
      items: children(root, 'entry').map(parseAtomEntry),
    };
  }

  throw new Error(`Unrecognized feed format (root element <${root.localName}>).`);
}
