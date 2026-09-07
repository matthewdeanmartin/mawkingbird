/**
 * Minimal markdown for status content: **bold**, *italic*, `code`, and
 * #-headers. Modeled on Elk's approach — parse the (already-sanitized-by-
 * Angular-later) HTML, transform *text nodes only*, never touch tags or
 * attributes — so a `*` inside a URL or attribute can't be mangled.
 *
 * Anything weird turns markdown off: fenced code blocks, markdown links and
 * images are constructs we don't render, so their presence returns the input
 * unchanged rather than half-rendering it. Unpaired markers simply stay
 * literal — each construct only matches a complete pair on one line.
 */

/** Constructs we don't support — seeing one disables markdown for the post. */
const WEIRD = [
  /```|~~~/, // fenced code blocks
  /!?\[[^\]]*\]\([^)]*\)/, // markdown links / images
];

/** Inline pairs, tried earliest-match-wins; content must not touch the markers. */
const INLINE: [RegExp, string[]][] = [
  [/\*\*\*(\S|\S[^*]*?\S)\*\*\*/, ['strong', 'em']],
  [/\*\*(\S|\S[^*]*?\S)\*\*/, ['strong']],
  [/\*(\S|\S[^*]*?\S)\*/, ['em']],
  [/`([^`\n]+)`/, ['code']],
];

/** Tags whose text must never be reinterpreted (URLs, existing code, etc.). */
const SKIP_TAGS = new Set(['A', 'CODE', 'PRE']);

const HEADER = /^(#{1,6})\s+(.*)$/;

function transformTextNode(doc: Document, node: Text): void {
  const text = node.data;
  let earliest: { index: number; match: RegExpExecArray; tags: string[] } | null = null;
  for (const [re, tags] of INLINE) {
    const match = re.exec(text);
    if (match && (earliest === null || match.index < earliest.index)) {
      earliest = { index: match.index, match, tags };
    }
  }
  if (!earliest) {
    return;
  }
  const { match, tags } = earliest;
  const frag = doc.createDocumentFragment();
  frag.append(doc.createTextNode(text.slice(0, match.index)));
  const el = doc.createElement(tags[0]);
  let leaf = el;
  for (const tag of tags.slice(1)) {
    const inner = doc.createElement(tag);
    leaf.append(inner);
    leaf = inner;
  }
  leaf.textContent = match[1];
  frag.append(el);
  const rest = doc.createTextNode(text.slice(match.index + match[0].length));
  frag.append(rest);
  node.replaceWith(frag);
  transformTextNode(doc, rest);
}

function walk(doc: Document, node: Element): void {
  for (const child of [...node.childNodes]) {
    if (child instanceof Text) {
      transformTextNode(doc, child);
    } else if (child instanceof Element && !SKIP_TAGS.has(child.tagName)) {
      walk(doc, child);
    }
  }
}

/**
 * Split one <p> at its <br>s and rebuild: lines starting with `# ` … `###### `
 * become headers, runs of ordinary lines regroup into paragraphs.
 */
function transformParagraph(doc: Document, p: Element): void {
  // Fast path: no header marker anywhere in the paragraph's text.
  // (<br> contributes nothing to textContent, so this is a loose pre-check.)
  if (!/#{1,6}\s/.test(p.textContent ?? '')) {
    return;
  }
  // Segment the child nodes on <br> boundaries.
  const segments: ChildNode[][] = [[]];
  for (const child of [...p.childNodes]) {
    if (child instanceof Element && child.tagName === 'BR') {
      segments.push([]);
    } else {
      segments[segments.length - 1].push(child);
    }
  }
  const blocks: Element[] = [];
  let paragraph: Element | null = null;
  for (const segment of segments) {
    const first = segment[0];
    const header = first instanceof Text ? HEADER.exec(first.data) : null;
    // Only a pure-text line can be a header (links/emoji in headers: weird → off).
    if (header && segment.length === 1 && header[2].trim()) {
      const h = doc.createElement(`h${header[1].length}`);
      h.textContent = header[2];
      blocks.push(h);
      paragraph = null;
    } else {
      if (paragraph === null) {
        paragraph = doc.createElement('p');
        blocks.push(paragraph);
      } else {
        paragraph.append(doc.createElement('br'));
      }
      paragraph.append(...segment);
    }
  }
  p.replaceWith(...blocks);
}

/**
 * Render minimal markdown inside a status's HTML. Returns the input unchanged
 * when it contains constructs outside the supported subset.
 */
export function applyMinimalMarkdown(html: string): string {
  if (!html || WEIRD.some((re) => re.test(html))) {
    return html;
  }
  if (!/[*`]|#{1,6}\s/.test(html)) {
    return html; // nothing markdown-ish at all
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const p of [...doc.body.querySelectorAll('p')]) {
    transformParagraph(doc, p);
  }
  walk(doc, doc.body);
  return doc.body.innerHTML;
}
