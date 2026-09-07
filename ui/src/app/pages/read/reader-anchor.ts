import { Anchor, anchorMatches } from '../../providers/read/reader-annotations';
import { blocks } from '../rss/article-pages';

/**
 * Turning a selection on screen into an offset in the markdown, and back.
 *
 * ## Why the anchor indexes blocks of the *document*
 *
 * Not of the page. A page is a presentation choice that changes when the reader
 * changes the type size, and an anchor that moved every time someone pressed
 * `A+` would be worthless. The block list of the whole document is stable as
 * long as the document is, and `article-pages.ts` slices *that same list* into
 * pages — so "which page is this highlight on" is a lookup, exactly as it is
 * for search matches.
 *
 * ## Why the round trip goes through plain text
 *
 * The reader selects rendered HTML; the anchor stores offsets into the block's
 * markdown-stripped plain text. Going via plain text means the anchor survives
 * a change in *rendering* (a renderer that starts emitting `<em>` where it used
 * to emit `<i>`, say) and it is the only representation the two ends can agree
 * on: `Selection` gives text, and the block gives markdown.
 */

/** A document split the way both pagination and anchors see it. */
export interface DocumentBlocks {
  /** Raw markdown per block. */
  markdown: string[];
  /** The same blocks as plain text, which is what offsets are into. */
  text: string[];
}

/**
 * Strip the markdown a reader never sees, leaving what they selected.
 *
 * Deliberately small and deliberately *not* a markdown parser: it removes the
 * marks that wrap text (emphasis, code, link syntax) and leaves everything
 * else, because an anchor only has to agree with itself. A construct handled
 * imperfectly here costs an offset that is consistently wrong in the same way
 * at both ends, and the quote check catches the rest.
 */
export function blockPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1');
}

/** Split a document once, for both anchoring and lookup. */
export function documentBlocks(markdown: string): DocumentBlocks {
  const list = blocks(markdown);
  return { markdown: list, text: list.map(blockPlainText) };
}

/**
 * Where a quote sits in the document, or null when it is not found.
 *
 * Matching is whitespace-insensitive, because the selection comes from rendered
 * HTML where line wrapping and indentation are the browser's business, not the
 * markdown's. The first block that contains the quote wins; a phrase repeated
 * verbatim in two places anchors to the first, which is a wrong-but-harmless
 * outcome the quote check cannot distinguish from a right one.
 */
export function anchorForQuote(document: DocumentBlocks, quote: string): Anchor | null {
  const needle = normalize(quote);
  if (!needle) {
    return null;
  }
  for (const [index, text] of document.text.entries()) {
    const found = findNormalized(text, needle);
    if (found) {
      return {
        block: index,
        start: found.start,
        end: found.end,
        quote: text.slice(found.start, found.end),
      };
    }
  }
  return null;
}

/**
 * Whether an anchor still points at its quote.
 *
 * Re-exported through here so callers deal with one module rather than
 * reaching into the store for a predicate about text.
 */
export function anchorIsIntact(document: DocumentBlocks, anchor: Anchor): boolean {
  return anchorMatches(anchor, document.text[anchor.block]);
}

/**
 * Which 1-based page a block falls on, given the paginated markdown.
 *
 * Pages are contiguous runs of blocks, so this walks the page list counting
 * blocks — no text comparison, no geometry. Returns 1 when the block index is
 * past the end, which can only happen for an anchor whose quote check has
 * already failed.
 */
export function pageOfBlock(pages: readonly string[], blockIndex: number): number {
  let seen = 0;
  for (const [index, page] of pages.entries()) {
    seen += blocks(page).length;
    if (blockIndex < seen) {
      return index + 1;
    }
  }
  return Math.max(1, pages.length);
}

/** Trim and collapse, the one normalisation both ends of the round trip use. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Find `needle` in `text` ignoring whitespace differences, reporting the offsets
 * in the *original* text so an anchor can point back into it.
 */
function findNormalized(text: string, needle: string): { start: number; end: number } | null {
  // Walk the original, building the collapsed form and remembering where each
  // collapsed character came from — the same technique `document-search.ts`
  // uses, for the same reason.
  let flat = '';
  const offsets: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      pendingSpace = flat.length > 0;
      continue;
    }
    if (pendingSpace) {
      flat += ' ';
      offsets.push(i);
      pendingSpace = false;
    }
    flat += text[i];
    offsets.push(i);
  }
  offsets.push(text.length);

  const at = flat.indexOf(needle);
  if (at === -1) {
    return null;
  }
  // One *past* the last matched character, not the origin of the next one —
  // those differ by exactly the whitespace that was collapsed away, and using
  // the latter drags a trailing space into the quote.
  const lastCharacter = offsets[at + needle.length - 1];
  return { start: offsets[at], end: lastCharacter + 1 };
}
