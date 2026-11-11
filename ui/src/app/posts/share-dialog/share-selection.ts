/**
 * Capturing "the bit I highlighted" for a share.
 *
 * ## Why this is a module and not three lines inline
 *
 * Two traps, both silent when you get them wrong.
 *
 * 1. **The selection must be read before the dialog opens.** Opening a modal and
 *    moving focus into it collapses the selection, so by the time the dialog
 *    could ask, there is nothing to ask for. The read happens in the click
 *    handler, and the string is passed in.
 * 2. **A selection anywhere on the page is not a selection in *this* post.**
 *    Highlighting text in one card and pressing Share on another would quote the
 *    wrong thing, attributed to the wrong source, with nothing on screen to
 *    suggest it had happened.
 */

/**
 * How much selected text becomes a quote.
 *
 * Sized against the tightest destination rather than the roomiest: Bluesky's
 * limit is 300 characters and the link and title have to fit alongside. A quote
 * longer than this is not a quote, and truncating at share time beats letting a
 * destination truncate mid-word later.
 */
export const MAX_QUOTE_LENGTH = 180;

/**
 * The selected text inside `container`, or empty when there is none worth using.
 *
 * `root` defaults to the live document selection; passed explicitly in tests,
 * where jsdom has no real one.
 */
export function selectionWithin(
  container: Element | null | undefined,
  selection: Selection | null = typeof window === 'undefined' ? null : window.getSelection(),
): string {
  if (!container || !selection || selection.isCollapsed || !selection.rangeCount) {
    return '';
  }

  // Every range must sit inside the element being shared. `containsNode` with
  // partial containment would accept a selection that merely overlaps this card,
  // which is the cross-post leak this check exists to stop.
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    if (!container.contains(range.commonAncestorContainer)) {
      return '';
    }
  }

  return truncateQuote(selection.toString());
}

/** Normalise whitespace and cap the length. */
export function truncateQuote(text: string, maximum = MAX_QUOTE_LENGTH): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(flattened);
  if (characters.length <= maximum) {
    return flattened;
  }
  // Prefer breaking at a word boundary, but only when one is close enough that
  // the quote does not lose a visible chunk to tidiness.
  const clipped = characters.slice(0, maximum).join('');
  const lastSpace = clipped.lastIndexOf(' ');
  const body = lastSpace > maximum * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.trimEnd()}…`;
}

/**
 * The body of a share: an optional quote, then the thing being shared.
 *
 * Kept separate from the destination-specific builders because every
 * destination that accepts text wants this same shape, and the ones that do not
 * (Reddit, LinkedIn, Hacker News take a URL and a title) simply never call it.
 */
export function shareBody(options: { quote?: string; title: string; url: string }): string {
  const quote = options.quote?.trim();
  const attribution = [options.title, options.url].filter(Boolean).join(' — ');
  return quote ? `> ${quote}\n\n${attribution}` : attribution;
}
