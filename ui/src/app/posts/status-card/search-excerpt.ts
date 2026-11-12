/**
 * Compact excerpts of very long posts in search results.
 *
 * Full-text search favours long posts: the more words a post has, the more
 * likely it contains all of the query's, so a few "mega posts" can fill a page
 * of results. Above {@link EXCERPT_THRESHOLD} characters a result shows its
 * opening plus the passages that actually matched, and the reader expands it
 * in place.
 *
 * Works on plain text and returns plain-text parts, never HTML: the excerpt is
 * rendered as text with `<mark>` around matches, so nothing here needs to be
 * trusted as markup.
 */

/** Posts longer than this (plain text) are compacted. */
export const EXCERPT_THRESHOLD = 600;
/** Length of the opening kept from a compacted post. */
export const EXCERPT_HEAD = 400;
/** Width of one matching passage. */
export const EXCERPT_PASSAGE = 160;
/** Matching passages shown at most. */
export const EXCERPT_MAX_PASSAGES = 3;

/** A run of text, marked when it is one of the query's terms. */
export interface ExcerptPart {
  text: string;
  match: boolean;
}

export interface SearchExcerpt {
  /** The opening, ending in an ellipsis. */
  head: ExcerptPart[];
  /** Matching passages after the opening, each already wrapped in ellipses. */
  passages: ExcerptPart[][];
  /** Plain-text length of the whole post, for the "show full" label. */
  length: number;
}

/**
 * The words worth finding in a result, from the query as typed.
 *
 * Quoted phrases stay whole. Excluded words (`-word`) and operators
 * (`from:`, `has:`, `before:` …) are dropped, since they never appear as text
 * in a match. A leading `#` or `@` is removed so `#cats` finds "cats".
 */
export function excerptTermsFor(query: string): string[] {
  const terms: string[] = [];
  const re = /(-?)"([^"]+)"|(\S+)/g;
  for (const m of query.matchAll(re)) {
    if (m[2] !== undefined) {
      if (!m[1]) terms.push(m[2].trim());
      continue;
    }
    const token = m[3];
    if (token.startsWith('-') || token.includes(':')) continue;
    const word = token.replace(/^[#@]+/, '').replace(/[.,;!?]+$/, '');
    if (word.length >= 2) terms.push(word);
  }
  return [...new Set(terms.map((t) => t.toLowerCase()).filter(Boolean))];
}

/** Post HTML as readable plain text, keeping paragraph and line breaks as spaces. */
export function plainText(html: string): string {
  const spaced = html.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/blockquote>/gi, '$& ');
  const doc = new DOMParser().parseFromString(spaced, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Cut at a word boundary at or before `max`, so the head never ends mid-word. */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const space = text.lastIndexOf(' ', max);
  return text.slice(0, space > max * 0.6 ? space : max);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termPattern(terms: readonly string[]): RegExp | null {
  const usable = [...terms].filter((t) => t.length > 0).sort((a, b) => b.length - a.length);
  return usable.length ? new RegExp(usable.map(escapeRegExp).join('|'), 'gi') : null;
}

/** Split text into marked and unmarked runs. */
export function markTerms(text: string, pattern: RegExp | null): ExcerptPart[] {
  if (!pattern) return [{ text, match: false }];
  const parts: ExcerptPart[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), match: false });
    parts.push({ text: m[0], match: true });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

/**
 * The compact form of a long post, or null when it is short enough to show whole.
 *
 * Passages come from matches after the opening (matches inside the opening are
 * already visible). Overlapping windows merge, so two nearby hits make one
 * passage rather than two that repeat each other.
 */
export function searchExcerpt(html: string, terms: readonly string[]): SearchExcerpt | null {
  const text = plainText(html);
  if (text.length <= EXCERPT_THRESHOLD) return null;
  const head = cutAtWord(text, EXCERPT_HEAD);
  const pattern = termPattern(terms);

  const windows: [number, number][] = [];
  if (pattern) {
    for (const m of text.matchAll(pattern)) {
      const at = m.index ?? 0;
      if (at < head.length) continue;
      const half = Math.floor((EXCERPT_PASSAGE - m[0].length) / 2);
      let start = Math.max(head.length, at - Math.max(half, 0));
      let end = Math.min(text.length, start + EXCERPT_PASSAGE);
      start = Math.max(head.length, end - EXCERPT_PASSAGE);
      // Widen to word boundaries so a passage does not start or end mid-word.
      const prevSpace = text.lastIndexOf(' ', start);
      if (prevSpace >= head.length && start - prevSpace < 20) start = prevSpace + 1;
      const nextSpace = text.indexOf(' ', end);
      if (nextSpace !== -1 && nextSpace - end < 20) end = nextSpace;
      const previous = windows.at(-1);
      if (previous && start <= previous[1]) {
        previous[1] = Math.max(previous[1], end);
      } else {
        if (windows.length === EXCERPT_MAX_PASSAGES) break;
        windows.push([start, end]);
      }
    }
  }

  return {
    head: markTerms(`${head}…`, pattern),
    passages: windows.map(([start, end]) =>
      markTerms(`…${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`, pattern),
    ),
    length: text.length,
  };
}
