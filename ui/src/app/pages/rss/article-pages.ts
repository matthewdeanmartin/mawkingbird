/**
 * Split one extracted article into readable pages.
 *
 * Purely a presentation layer over what `ArticleFetch` already returned — the
 * extractor still produces one document, and this decides where a reader is
 * offered a page break. Nothing here touches the extraction pipeline, which is
 * shared with reader mode and must keep behaving identically there.
 *
 * ## Why paginate at all
 *
 * A 4,000-word article inside a split pane is a scroll that loses your place
 * every time you glance at the left rail. Pages give the reader a position they
 * can return to, and they are cheap: the whole document is already in memory, so
 * paging is slicing, not fetching.
 */

/**
 * Roughly how many words belong on one page.
 *
 * ~500 words is two or three minutes of reading and about a screenful and a half
 * in the pane — long enough that paging is not constant, short enough that a
 * page is a unit you can hold. Not a hard cap: a page ends at the first block
 * boundary *after* this, because splitting mid-paragraph to hit a word count
 * exactly would be worse than a slightly long page.
 */
const TARGET_WORDS_PER_PAGE = 500;

/**
 * Below this, don't paginate at all.
 *
 * A two-page article where page two is a paragraph is worse than one page:
 * the reader pays the cost of the control and gets nothing for it. The
 * threshold is 1.5 pages, so the first split only appears once there is a real
 * second page to go to.
 */
const MIN_WORDS_TO_PAGINATE = Math.floor(TARGET_WORDS_PER_PAGE * 1.5);

/** Count words the same cheap way throughout, so the numbers agree. */
function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Split markdown into top-level blocks on blank lines.
 *
 * Exported because highlight anchors index into this same list
 * (`reader-anchor.ts`). Two definitions of "a block" would mean an anchor
 * pointing at a different paragraph than the one pagination put on the page,
 * which is precisely the drift the quote check exists to catch — better not to
 * create it in the first place.
 *
 * Fenced code blocks are kept whole: a blank line inside a fence is part of the
 * code, and breaking a page there would split a listing across pages and — worse
 * — leave an unterminated fence that the markdown renderer would then apply to
 * the rest of the page.
 */
export function blocks(markdown: string): string[] {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const block = current.join('\n').trim();
    if (block) {
      out.push(block);
    }
    current = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      current.push(line);
      continue;
    }
    if (!inFence && line.trim() === '') {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return out;
}

/**
 * Break `markdown` into pages of roughly {@link TARGET_WORDS_PER_PAGE} words.
 *
 * Always returns at least one page, so callers never special-case empty input.
 * A short article comes back as a single page, which the UI renders without any
 * pagination controls at all.
 */
export function paginateMarkdown(markdown: string): string[] {
  const text = markdown.trim();
  if (!text) {
    return [''];
  }
  if (wordCount(text) < MIN_WORDS_TO_PAGINATE) {
    return [text];
  }

  const pages: string[] = [];
  let current: string[] = [];
  let words = 0;

  for (const block of blocks(text)) {
    current.push(block);
    words += wordCount(block);
    if (words >= TARGET_WORDS_PER_PAGE) {
      pages.push(current.join('\n\n'));
      current = [];
      words = 0;
    }
  }

  // Whatever is left over. Folded into the previous page when it is a scrap —
  // a final page holding one sentence reads as a mistake.
  if (current.length) {
    const tail = current.join('\n\n');
    if (pages.length && wordCount(tail) < TARGET_WORDS_PER_PAGE / 4) {
      pages[pages.length - 1] += `\n\n${tail}`;
    } else {
      pages.push(tail);
    }
  }

  return pages.length ? pages : [text];
}
