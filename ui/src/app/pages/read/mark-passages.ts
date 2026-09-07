/**
 * Drawing highlights and search hits onto already-rendered article HTML.
 *
 * ## The security rule this module exists to obey
 *
 * `html-to-markdown.ts` says it plainly: the markdown renderer is the choke
 * point, and its output is safe because its vocabulary has no script, no event
 * handler and no attribute beyond a scheme-checked `href`/`src`. Marking a
 * passage must not weaken that.
 *
 * So this **never builds HTML from user text**. It walks the rendered DOM,
 * finds the run of text nodes covering a quote, and wraps them with
 * `surroundContents` / `insertNode` — DOM operations on nodes that already
 * exist. The reader's own words never pass through a string that becomes
 * markup, which is what makes an XSS impossible here rather than merely
 * unlikely: there is no injection point to get wrong.
 *
 * It also runs on a **detached** document, so a half-marked tree is never on
 * screen and a failure leaves the original HTML untouched.
 */

/** Class put on a highlighted run. Styled by `reader-core.css`. */
export const HIGHLIGHT_CLASS = 'reader-highlight';

/** Class put on the current search hit. */
export const SEARCH_HIT_CLASS = 'reader-search-hit';

/**
 * Wrap every occurrence of `quotes` in `html`, plus one search hit.
 *
 * Returns the original HTML unchanged when there is nothing to mark or when
 * anything goes wrong — an unmarked passage is a cosmetic loss, while a
 * mangled article is the reading surface breaking.
 */
export function markPassages(html: string, quotes: readonly string[], searchHit = ''): string {
  if (!html || (!quotes.length && !searchHit)) {
    return html;
  }
  if (typeof document === 'undefined') {
    return html;
  }
  try {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    for (const quote of quotes) {
      markOne(holder, quote, HIGHLIGHT_CLASS);
    }
    if (searchHit) {
      markOne(holder, searchHit, SEARCH_HIT_CLASS);
    }
    return holder.innerHTML;
  } catch {
    return html;
  }
}

/** Wrap the first run of text matching `needle`, ignoring whitespace runs. */
function markOne(root: HTMLElement, needle: string, className: string): void {
  const wanted = normalize(needle);
  if (!wanted) {
    return;
  }

  // Every text node, in document order, with a running offset into the
  // whitespace-collapsed text of the whole fragment. Nodes already inside a
  // mark are skipped so overlapping quotes cannot nest wrappers indefinitely.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; from: number; to: number }[] = [];
  let flat = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (isInsideMark(text)) {
      continue;
    }
    const from = flat.length;
    flat += text.data;
    nodes.push({ node: text, from, to: flat.length });
  }

  const { collapsed, offsets } = collapse(flat);
  const at = collapsed.indexOf(wanted);
  if (at === -1) {
    return;
  }
  const start = offsets[at];
  const end = offsets[at + wanted.length - 1] + 1;

  const from = locate(nodes, start);
  const to = locate(nodes, end - 1);
  if (!from || !to) {
    return;
  }

  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset + 1);

  const mark = document.createElement('mark');
  mark.className = className;
  try {
    // The fast path: the range sits inside one element.
    range.surroundContents(mark);
  } catch {
    // It straddles element boundaries (a quote crossing a `<em>`, say).
    // `extractContents` moves the existing nodes into the mark — still no
    // string ever becomes markup.
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }
}

function isInsideMark(node: Node): boolean {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'MARK') {
      return true;
    }
  }
  return false;
}

/** Which node holds the character at `offset`, and where inside it. */
function locate(
  nodes: readonly { node: Text; from: number; to: number }[],
  offset: number,
): { node: Text; offset: number } | null {
  for (const entry of nodes) {
    if (offset >= entry.from && offset < entry.to) {
      return { node: entry.node, offset: offset - entry.from };
    }
  }
  return null;
}

/** Collapsed text plus a map from each collapsed character to its origin. */
function collapse(text: string): { collapsed: string; offsets: number[] } {
  let collapsed = '';
  const offsets: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      pendingSpace = collapsed.length > 0;
      continue;
    }
    if (pendingSpace) {
      collapsed += ' ';
      offsets.push(i);
      pendingSpace = false;
    }
    collapsed += text[i];
    offsets.push(i);
  }
  offsets.push(text.length);
  return { collapsed, offsets };
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
