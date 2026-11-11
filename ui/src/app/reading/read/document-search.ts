/**
 * Finding a passage inside the document being read.
 *
 * ## Why this searches the markdown and not the page
 *
 * The rendered DOM holds **one page**. Searching it would find matches on the
 * page you are already looking at and silently miss the other eleven — a bug
 * wearing a feature's clothes, and the exact thing the browser's own Ctrl+F
 * does here, which is why the reader intercepts it.
 *
 * The source markdown is the whole document, and `paginateMarkdown` already
 * slices it into the same pages the reader turns. So searching the markdown and
 * then asking which slice a match fell into makes a match's page number a
 * **lookup** rather than a measurement: no geometry, no scroll positions, and
 * it survives re-pagination when the type size changes.
 */

/** One hit, with enough around it to recognise which one it is. */
export interface SearchMatch {
  /** 1-based, matching what the pager displays. */
  page: number;
  /** Offset of the match within that page's markdown. */
  offset: number;
  /** The matched text as it appears in the document, in its original case. */
  text: string;
  /** A line of context with the match inside it. */
  context: string;
  /** Where the match sits within {@link context}, for marking it. */
  contextOffset: number;
}

/** How much text either side of a match goes into its context line. */
const CONTEXT_RADIUS = 44;

/** No more than this many matches; a query like "e" is not a search. */
export const MAX_MATCHES = 200;

/**
 * Every occurrence of `query` across `pages`, in document order.
 *
 * Case-insensitive **substring**, not a regex. A reader typing `(` wants the
 * paren, and handing their keystrokes to a regex engine turns a search box into
 * a syntax-error box — and, with a pathological pattern, into a hang.
 *
 * Whitespace in the query is collapsed against whitespace in the text, so a
 * phrase still matches when the markdown wrapped it across two lines.
 */
export function findInPages(
  pages: readonly string[],
  query: string,
  continuous = false,
): SearchMatch[] {
  // Native columns may break inside a word or phrase. Search the continuous
  // text and map each hit back to the page on which it begins.
  if (continuous && pages.length > 1) {
    const starts: number[] = [];
    let offset = 0;
    for (const page of pages) {
      starts.push(offset);
      offset += page.length;
    }
    return findInPages([pages.join('')], query).map((match) => {
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= match.offset) index++;
      return { ...match, page: index + 1, offset: match.offset - starts[index] };
    });
  }
  const needle = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (needle.length < 2) {
    // One character matches most of the document and helps nobody.
    return [];
  }

  const matches: SearchMatch[] = [];
  for (const [index, page] of pages.entries()) {
    // The page's text with runs of whitespace collapsed, plus a map back to the
    // original offsets — so a match found in the flattened text can still be
    // reported (and later marked) at its true position.
    const { flat, offsets } = flatten(page);
    let from = 0;
    for (;;) {
      const at = flat.indexOf(needle, from);
      if (at === -1) {
        break;
      }
      const start = offsets[at];
      // One *past* the last matched character, not the origin of the next one —
      // those differ by the whitespace that was collapsed away, and using the
      // latter drags a trailing space into the reported match.
      const end = offsets[at + needle.length - 1] + 1;
      matches.push({
        page: index + 1,
        offset: start,
        text: page.slice(start, end),
        ...contextAround(page, start, end),
      });
      if (matches.length >= MAX_MATCHES) {
        return matches;
      }
      from = at + needle.length;
    }
  }
  return matches;
}

/**
 * Lower-cased text with whitespace runs collapsed to one space, and an index
 * from each flattened character back to its offset in the original.
 */
function flatten(text: string): { flat: string; offsets: number[] } {
  let flat = '';
  const offsets: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) {
      pendingSpace = flat.length > 0;
      continue;
    }
    if (pendingSpace) {
      flat += ' ';
      offsets.push(i);
      pendingSpace = false;
    }
    flat += char.toLowerCase();
    offsets.push(i);
  }
  offsets.push(text.length);
  return { flat, offsets };
}

/** A readable line around a match, with where the match sits inside it. */
function contextAround(
  page: string,
  start: number,
  end: number,
): { context: string; contextOffset: number } {
  const from = Math.max(0, start - CONTEXT_RADIUS);
  const to = Math.min(page.length, end + CONTEXT_RADIUS);
  const lead = from > 0 ? '…' : '';
  const tail = to < page.length ? '…' : '';
  // Collapsed for display only: a context line is one line, whatever the
  // markdown did with newlines.
  const before = page.slice(from, start).replace(/\s+/g, ' ');
  const match = page.slice(start, end).replace(/\s+/g, ' ');
  const after = page.slice(end, to).replace(/\s+/g, ' ');
  return {
    context: `${lead}${before}${match}${after}${tail}`,
    contextOffset: lead.length + before.length,
  };
}
