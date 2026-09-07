/**
 * Serializes the same `PostSearchCriteria` the Mastodon serializer consumes into
 * a *web* search query, for handing off to Google/Bing/DuckDuckGo/Kagi.
 *
 * Why this exists: anonymous post search is off on nearly every instance (see
 * `search-capability.ts` — the `empty` and `tags-only` signatures), and no choice
 * of search server fixes that for everyone. But the posts are public HTML, and
 * the general web indexes crawl them. So when the fediverse can't answer, a
 * `site:` query on a real search engine often can.
 *
 * This is a sibling of `mastodon-query-serializer.ts`, not a replacement: same
 * canonical rich object in, a different dialect out. The dialects overlap far
 * less than they look. Web engines have no notion of a reply, a content warning,
 * an attachment, or a post language, so those criteria cannot be expressed and
 * are *dropped* — never silently approximated, because an approximation would
 * quietly return the wrong set. Everything dropped is reported back in
 * {@link WebQuery.dropped} so the UI can tell the user what the web search will
 * not honor.
 *
 * The one real asymmetry: `site:` restricts results to a single host's pages. A
 * fediverse post is mirrored on every instance that federated it, but only the
 * author's home instance serves it at a canonical, indexed URL — so scoping to
 * the browsing host finds posts *by people on that host*, not every post about
 * the topic. That is a narrower search than the Mastodon one, and the caller is
 * expected to say so rather than pretend the two are equivalent.
 */

import { PostSearchCriteria } from './mawkingbird-search';

/** A web search engine we can hand a query off to. */
export type WebEngine = 'google' | 'bing' | 'duckduckgo' | 'kagi';

export interface WebEngineDef {
  id: WebEngine;
  /** Shown in the search-type dropdown. */
  label: string;
  /** Base URL; the query is appended as the `q` parameter. */
  base: string;
}

/** The engines offered, in dropdown order. */
export const WEB_ENGINES: WebEngineDef[] = [
  { id: 'google', label: 'Google', base: 'https://www.google.com/search' },
  { id: 'bing', label: 'Bing', base: 'https://www.bing.com/search' },
  { id: 'duckduckgo', label: 'DuckDuckGo', base: 'https://duckduckgo.com/' },
  { id: 'kagi', label: 'Kagi', base: 'https://kagi.com/search' },
];

export function webEngineDef(id: WebEngine): WebEngineDef | undefined {
  return WEB_ENGINES.find((e) => e.id === id);
}

/** True when `value` names one of the engines (used to read the dropdown). */
export function isWebEngine(value: string): value is WebEngine {
  return WEB_ENGINES.some((e) => e.id === value);
}

/**
 * A criterion the web serializer could not express, identified by a stable code
 * rather than English prose — the caller renders each one through a translation
 * key (`pages.search.webDropped.<code>`) so the "can't filter by…" note is not
 * English baked into data. `date`/`language`/`contentType` carry the value that
 * varies; the rest are fixed phrases with no parameter.
 */
export type WebDroppedItem =
  | { code: 'after'; value: string }
  | { code: 'before'; value: string }
  | { code: 'language'; value: string }
  | { code: 'contentType'; value: string }
  | { code: 'repliesOnly' | 'noReplies' | 'sensitiveOnly' | 'noSensitivePosts' | 'libraryOnly' };

export interface WebQuery {
  /** The query string to send to the engine. */
  query: string;
  /**
   * Criteria that have no web equivalent and were left out. Empty when the
   * translation was lossless. See {@link WebDroppedItem}.
   */
  dropped: WebDroppedItem[];
}

/** Split a free-text field into individual tokens on whitespace. */
function tokens(value: string | undefined): string[] {
  return (value ?? '').trim().split(/\s+/u).filter(Boolean);
}

/** Strip embedded quotes so a phrase can be wrapped in them safely. */
function quotePhrase(phrase: string): string {
  const cleaned = phrase.replace(/"/g, '').trim().replace(/\s+/gu, ' ');
  return cleaned ? `"${cleaned}"` : '';
}

/**
 * An author becomes a bare handle term, not an operator.
 *
 * `from:` means "posted by" to Mastodon and "from this site" to several web
 * engines — emitting it would silently mean something else. The handle appears
 * in the byline of the rendered page, so a plain quoted term is both correct and
 * effective. The domain half is dropped: `@user@host` as one token matches
 * poorly, and the host is usually already covered by the `site:` scope.
 */
function authorTerm(author: string): string {
  const trimmed = author.trim().replace(/\s+/g, '').replace(/^@/, '');
  if (!trimmed) {
    return '';
  }
  const [user] = trimmed.split('@');
  return user ? `"@${user}"` : '';
}

/**
 * Build a web search query from post criteria.
 *
 * @param criteria The same object the Mastodon serializer reads.
 * @param host     Instance host to scope with `site:`, e.g. `mastodon.social`.
 *                 Omit to search the open web unscoped.
 */
export function serializeWebQuery(criteria: PostSearchCriteria, host?: string): WebQuery {
  const parts: string[] = [];
  const dropped: WebDroppedItem[] = [];

  // Scope to the instance's own pages. Bare host — no scheme, no trailing slash.
  const site = (host ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (site) {
    parts.push(`site:${site}`);
  }

  // Free text. Web engines already AND their terms, so there is no `+` prefix
  // to add — the Mastodon serializer's `+word` would be a literal here.
  for (const word of tokens(criteria.words)) {
    parts.push(word);
  }

  if (criteria.exactPhrase) {
    const phrase = quotePhrase(criteria.exactPhrase);
    if (phrase) {
      parts.push(phrase);
    }
  }

  // Exclusion is the one operator that survives translation unchanged: every
  // engine here reads a leading `-` as NOT.
  for (const word of tokens(criteria.excludeWords)) {
    parts.push(`-${word}`);
  }

  if (criteria.author) {
    const term = authorTerm(criteria.author);
    if (term) {
      parts.push(term);
    }
  }

  // --- Everything below has no web equivalent. Report, don't approximate. ---

  // Dates: engines expose recency as a UI filter (tbs/df), not a query operator,
  // and the crawl date is the page's, not the post's. A date-shaped operator
  // would look honest and filter on the wrong field.
  if (criteria.dates?.after) {
    dropped.push({ code: 'after', value: criteria.dates.after });
  }
  if (criteria.dates?.before) {
    dropped.push({ code: 'before', value: criteria.dates.before });
  }

  if (criteria.language) {
    dropped.push({ code: 'language', value: criteria.language });
  }

  if (criteria.contentType && criteria.contentType !== 'any') {
    dropped.push({ code: 'contentType', value: criteria.contentType });
  }

  if (criteria.replies === 'only') {
    dropped.push({ code: 'repliesOnly' });
  } else if (criteria.replies === 'exclude') {
    dropped.push({ code: 'noReplies' });
  }

  if (criteria.sensitive === 'only') {
    dropped.push({ code: 'sensitiveOnly' });
  } else if (criteria.sensitive === 'exclude') {
    dropped.push({ code: 'noSensitivePosts' });
  }

  if (criteria.scope === 'library') {
    dropped.push({ code: 'libraryOnly' });
  }

  return { query: parts.join(' ').trim(), dropped };
}

/** The full URL to open for a web search of `query` on `engine`. */
export function webSearchUrl(engine: WebEngine, query: string): string {
  const def = webEngineDef(engine);
  if (!def) {
    return '';
  }
  return `${def.base}?q=${encodeURIComponent(query)}`;
}
