import { absoluteHttpUrl } from './article-metadata';

/**
 * Article DOM → markdown.
 *
 * ## Why markdown at all
 *
 * It is a normalization step that **discards layout**, which is the feature.
 * The publisher's floats, columns and inline styles cannot survive the round
 * trip, so the reader's own typography always wins.
 *
 * It is also the security choke point, and the reason a hostile page is not
 * much of a threat here: markdown has no way to express a script, an event
 * handler, or an attribute we did not choose to emit. Whatever the source
 * contained, what comes out is headings, paragraphs, emphasis, links, images,
 * lists, quotes and code — because that is this converter's entire vocabulary.
 *
 * ## Scope
 *
 * Deliberately small, matching what the reader renders. Tables become their
 * text; unknown elements are unwrapped rather than dropped, so no prose is lost
 * to an element nobody anticipated.
 */

/** Characters that would otherwise be read as markdown syntax. */
function escapeText(text: string): string {
  // Only the markers that can start a construct at a position where they would
  // be ambiguous. Over-escaping makes ordinary prose look like source code.
  return text
    .replace(/([\\`*_[\]])/g, '\\$1')
    .replace(/^(\s*)(#{1,6}\s)/gm, '$1\\$2')
    .replace(/^(\s*)([-+*]\s)/gm, '$1\\$2')
    .replace(/^(\s*)(\d+)\.\s/gm, '$1$2\\. ');
}

/** Collapse runs of whitespace, preserving single spaces. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

interface Context {
  /** Absolute base for resolving `href` and `src`. */
  baseUrl: string;
  /** Images found, in document order. */
  images: string[];
}

/** Inline content of an element, as markdown. */
function inline(node: Node, ctx: Context): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(collapse(node.nodeValue ?? ''));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const children = () =>
    Array.from(el.childNodes)
      .map((child) => inline(child, ctx))
      .join('');

  switch (el.localName) {
    case 'br':
      return '  \n';
    case 'strong':
    case 'b': {
      const text = children().trim();
      return text ? `**${text}**` : '';
    }
    case 'em':
    case 'i': {
      const text = children().trim();
      return text ? `*${text}*` : '';
    }
    case 'del':
    case 's':
    case 'strike': {
      const text = children().trim();
      return text ? `~~${text}~~` : '';
    }
    case 'code': {
      const text = collapse(el.textContent ?? '').trim();
      // Backticks inside code are fenced by a longer run, per CommonMark.
      if (!text) {
        return '';
      }
      const longest = (text.match(/`+/g) ?? []).reduce((a, b) => (b.length > a.length ? b : a), '');
      const fence = '`'.repeat(longest.length + 1);
      return `${fence}${text}${fence}`;
    }
    case 'a': {
      const text = children().trim();
      if (!text) {
        return '';
      }
      // The scheme check that keeps `javascript:` out of rendered output. A
      // link we cannot vouch for keeps its text and loses its destination.
      const href = absoluteHttpUrl(el.getAttribute('href'), ctx.baseUrl);
      return href ? `[${text}](${href})` : text;
    }
    case 'img': {
      const src = absoluteHttpUrl(el.getAttribute('src'), ctx.baseUrl);
      if (!src) {
        return '';
      }
      ctx.images.push(src);
      const alt = collapse(el.getAttribute('alt') ?? '').trim();
      return `![${escapeText(alt)}](${src})`;
    }
    default:
      return children();
  }
}

/** Whether an element is laid out as a block. */
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'table',
  'tr',
  'figure',
  'figcaption',
]);

/** Block-level content of a node, as markdown. */
function block(node: Node, ctx: Context, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = collapse(node.nodeValue ?? '');
    return text.trim() ? escapeText(text) : '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const tag = el.localName;

  const blockChildren = (): string =>
    Array.from(el.childNodes)
      .map((child) => block(child, ctx, depth))
      .filter((part) => part.trim().length > 0)
      .join('\n\n');

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = inline(el, ctx).trim();
      return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : '';
    }
    case 'p':
    case 'figcaption': {
      const text = inline(el, ctx).trim();
      return text;
    }
    case 'hr':
      return '---';
    case 'pre': {
      // Code blocks keep their text verbatim — escaping inside a fence would
      // corrupt the code, which is the one place literal characters matter.
      const text = (el.textContent ?? '').replace(/\n+$/, '');
      return text.trim() ? `\`\`\`\n${text}\n\`\`\`` : '';
    }
    case 'blockquote': {
      const inner = blockChildren();
      return inner
        ? inner
            .split('\n')
            .map((line) => (line ? `> ${line}` : '>'))
            .join('\n')
        : '';
    }
    case 'ul':
    case 'ol': {
      const ordered = tag === 'ol';
      const items = Array.from(el.children).filter((child) => child.localName === 'li');
      const lines = items.map((item, index) => {
        const marker = ordered ? `${index + 1}. ` : '- ';
        const inner = block(item, ctx, depth + 1).trim();
        if (!inner) {
          return '';
        }
        // Continuation lines align under the marker so nested blocks stay in
        // the item rather than closing the list.
        const pad = ' '.repeat(marker.length);
        const [first, ...rest] = inner.split('\n');
        return [`${marker}${first}`, ...rest.map((line) => (line ? `${pad}${line}` : ''))].join(
          '\n',
        );
      });
      return lines.filter(Boolean).join('\n');
    }
    case 'li': {
      const hasBlockChild = Array.from(el.children).some((child) =>
        BLOCK_TAGS.has(child.localName),
      );
      return hasBlockChild ? blockChildren() : inline(el, ctx).trim();
    }
    case 'table': {
      // Tables are rendered as their rows' text. A real markdown table needs a
      // consistent column count that arbitrary HTML does not supply, and a
      // broken table is worse than plain lines.
      return Array.from(el.querySelectorAll('tr'))
        .map((row) =>
          Array.from(row.children)
            .map((cell) => inline(cell, ctx).trim())
            .filter(Boolean)
            .join(' — '),
        )
        .filter(Boolean)
        .join('\n\n');
    }
    default: {
      if (BLOCK_TAGS.has(tag)) {
        return blockChildren();
      }
      // An inline element sitting at block level: render it inline rather than
      // losing it.
      const text = inline(el, ctx).trim();
      if (text) {
        return text;
      }
      return blockChildren();
    }
  }
}

/** What a conversion produced. */
export interface MarkdownResult {
  markdown: string;
  /** Absolute http(s) image URLs, in document order. */
  images: string[];
}

/**
 * Convert an article root element to markdown.
 *
 * `baseUrl` must be the URL the content actually came from — the end of any
 * redirect chain. Resolving relative links against the requested URL instead
 * breaks every image on a redirected page.
 */
export function htmlToMarkdown(root: Element, baseUrl: string): MarkdownResult {
  const ctx: Context = { baseUrl, images: [] };
  const markdown = block(root, ctx, 0)
    // Blank-line runs collapse to a single paragraph break.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { markdown, images: ctx.images };
}
