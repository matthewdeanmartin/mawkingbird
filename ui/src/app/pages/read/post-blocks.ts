import { Status } from '../../models';

/**
 * Breaking the posts of a document into the units a page is built from.
 *
 * ## Why a post is not the unit
 *
 * The first attempt paginated the chain post by post, which works for a
 * tweetstorm and does nothing at all for the case the reader is named after: a
 * single long tweet. One post is one unit, so it lands on one page, and that
 * page is as tall as the post — which on a 2,000-character post is several
 * screens. Reported by the operator: *"I don't see page splitting for one long
 * tweet."*
 *
 * So the unit is a **block**: a paragraph, a heading, a list, an image. That is
 * the same unit `article-pages.ts` splits markdown into and the same one
 * highlight anchors index, so a document has one idea of what a block is
 * whatever it was made of.
 *
 * ## Why `<br>` runs are split too
 *
 * A post written as one paragraph with line breaks is extremely common — a
 * changelog, a list of links, a numbered thread written by hand. It arrives as
 * a single `<p>` holding a dozen `<br>`-separated lines, which is one block by
 * every structural measure and several screens tall by the only one that
 * matters. The operator's example
 * (`mastodon.social/api/v1/statuses/117136053979504519`) is exactly this: 14
 * paragraphs, two of which carry nine and eight `<br>`s and 1,454 characters.
 *
 * So a paragraph with line breaks is split at them, into one block per line.
 * The lines were already separate things — the author put the breaks there —
 * and a page boundary between two of them is a seam that already existed.
 *
 * ## Why the HTML is re-emitted rather than sliced
 *
 * A post's content is already-sanitised HTML from the server. Splitting it into
 * blocks means handing back several strings instead of one, and each of those
 * has to be safe on its own. They are, because each is the `outerHTML` of an
 * element that was already in the parsed tree — nothing is concatenated,
 * rewritten, or built from text. A block is a subtree of the document the
 * server sent, serialised back out.
 */

/** One renderable piece of a document, and which post it came from. */
export interface PostBlock {
  /** Index of the post in the chain, so media can stay with its post. */
  post: number;
  /** Safe HTML for this block — the `outerHTML` of an element already parsed. */
  html: string;
  /** A piece of one oversized paragraph, rendered inline with its neighbours. */
  fragment?: boolean;
  /** The last piece, after which normal paragraph spacing resumes. */
  fragmentEnd?: boolean;
}

/**
 * Keep prose units comfortably below even a short reading viewport. Real
 * layout still decides page boundaries; this only prevents one uninterrupted
 * paragraph from becoming an indivisible multi-screen "page".
 */
const PROSE_FRAGMENT_CHARS = 280;

/**
 * Split one post's HTML into top-level blocks.
 *
 * A post whose content has no element children (bare text, which some servers
 * send) comes back as a single block wrapped in a paragraph, so the caller
 * never has to special-case it.
 */
export function splitPostHtml(html: string): string[] {
  if (typeof document === 'undefined') {
    return html.trim() ? [html] : [];
  }
  const holder = document.createElement('div');
  holder.innerHTML = html;

  const blocks: string[] = [];
  let looseText: string[] = [];

  const flushLoose = (): void => {
    const text = looseText.join('').trim();
    looseText = [];
    if (text) {
      blocks.push(`<p>${text}</p>`);
    }
  };

  for (const node of [...holder.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      // An inline element on its own is not a block; it belongs with the text
      // around it, or a sentence in italics would become a page of its own.
      if (isInline(element)) {
        looseText.push(element.outerHTML);
        continue;
      }
      flushLoose();
      blocks.push(...splitProseElement(element));
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      looseText.push(node.textContent ?? '');
    }
  }
  flushLoose();

  return blocks.length ? blocks : html.trim() ? [html] : [];
}

/** Split at authored line breaks first, then split oversized prose at words. */
function splitProseElement(element: Element): string[] {
  const lines = splitOnLineBreaks(element);
  return lines.flatMap((line) => {
    const holder = document.createElement('div');
    holder.innerHTML = line;
    const parsed = holder.firstElementChild;
    return parsed ? splitLongProse(parsed) : [line];
  });
}

/**
 * Break one long paragraph without cutting its inline markup.
 *
 * DOM Ranges clone balanced fragments of links/emphasis even when a boundary
 * falls inside them. Each piece is emitted as an inline span so adjacent pieces
 * on the same fitted page still flow as one paragraph.
 */
function splitLongProse(element: Element): string[] {
  if (element.tagName !== 'P' || (element.textContent ?? '').length <= PROSE_FRAGMENT_CHARS) {
    return [element.outerHTML];
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = '';
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push(node);
    full += node.data;
  }
  if (!nodes.length) {
    return [element.outerHTML];
  }

  const boundaries = proseBoundaries(full);
  if (boundaries.length < 2) {
    return [element.outerHTML];
  }
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const range = document.createRange();
    const from = textPoint(nodes, start);
    const to = textPoint(nodes, end);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const wrapper = document.createElement('span');
    wrapper.appendChild(range.cloneContents());
    return wrapper.outerHTML;
  });
}

/** Global text offsets at word boundaries, including both ends. */
function proseBoundaries(text: string): number[] {
  const points = [0];
  let start = 0;
  while (text.length - start > PROSE_FRAGMENT_CHARS) {
    const limit = start + PROSE_FRAGMENT_CHARS;
    const floor = start + Math.floor(PROSE_FRAGMENT_CHARS * 0.6);
    let end = text.lastIndexOf(' ', limit);
    if (end < floor) {
      end = text.indexOf(' ', limit);
    }
    if (end <= start) {
      end = Math.min(text.length, limit);
    }
    points.push(end);
    start = end;
    while (start < text.length && /\s/.test(text[start])) {
      start++;
    }
    points[points.length - 1] = start;
  }
  points.push(text.length);
  return points;
}

/** Locate a global character offset inside a run of text nodes. */
function textPoint(nodes: readonly Text[], offset: number): { node: Text; offset: number } {
  let seen = 0;
  for (const node of nodes) {
    const end = seen + node.data.length;
    if (offset <= end) {
      return { node, offset: offset - seen };
    }
    seen = end;
  }
  const last = nodes[nodes.length - 1];
  return { node: last, offset: last.data.length };
}

/**
 * A paragraph of `<br>`-separated lines, as one block per line.
 *
 * Returns the element unchanged when it holds no line breaks, which is the
 * common case and costs one property read. Each returned line is built by
 * cloning the original element and moving the nodes for that line into it, so
 * the wrapper keeps its tag and attributes and every child is a node that was
 * already in the parsed tree — the same safety property as the outer split.
 */
function splitOnLineBreaks(element: Element): string[] {
  if (!element.querySelector('br')) {
    return [element.outerHTML];
  }
  // Only direct children: a `<br>` nested inside a list item is that item's
  // business, and splitting there would tear the list apart.
  if (![...element.children].some((child) => child.tagName === 'BR')) {
    return [element.outerHTML];
  }

  const lines: string[] = [];
  let current: Node[] = [];

  const flush = (): void => {
    if (!current.some((node) => (node.textContent ?? '').trim())) {
      current = [];
      return;
    }
    const wrapper = element.cloneNode(false) as Element;
    for (const node of current) {
      wrapper.appendChild(node.cloneNode(true));
    }
    lines.push(wrapper.outerHTML);
    current = [];
  };

  for (const node of [...element.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
      flush();
      continue;
    }
    current.push(node);
  }
  flush();

  return lines.length ? lines : [element.outerHTML];
}

/** Elements that flow with text rather than standing as their own block. */
const INLINE = new Set([
  'A',
  'B',
  'I',
  'EM',
  'STRONG',
  'SPAN',
  'CODE',
  'SMALL',
  'SUB',
  'SUP',
  'ABBR',
  'MARK',
  'S',
  'U',
  'BR',
  'IMG',
  'TIME',
  'Q',
  'CITE',
]);

function isInline(element: Element): boolean {
  return INLINE.has(element.tagName);
}

/** Every block of every post in the chain, in reading order. */
export function chainBlocks(chain: readonly Status[]): PostBlock[] {
  return chain.flatMap((status, post) => {
    const split = splitPostHtml(status.content ?? '');
    return split.map((html, index) => ({
      post,
      html,
      fragment: html.startsWith('<span>'),
      fragmentEnd: html.startsWith('<span>') && !split[index + 1]?.startsWith('<span>'),
    }));
  });
}
