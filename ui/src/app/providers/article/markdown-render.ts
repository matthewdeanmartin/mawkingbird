/**
 * Article markdown → HTML, for the reader.
 *
 * ## Why not `markdown.ts`
 *
 * `src/app/markdown.ts` is a deliberately minimal *inline* transform for status
 * text. It disables itself entirely when it sees a link, an image or a fenced
 * code block, on the reasoning that half-rendering an unsupported construct is
 * worse than leaving the markers literal. That rule is right for a status and
 * exactly wrong for an article, where links, images and code are the point.
 *
 * The two must therefore stay separate. Extending `markdown.ts` to cover both
 * would mean giving it a mode switch, and the first bug would be a status
 * rendered under article rules.
 *
 * ## This is the security boundary
 *
 * The reader renders this output through `[innerHTML]`, so what this emits is
 * what lands in the DOM. It is safe not because the input is trusted — it is
 * not — but because **this renderer can only emit tags from its own vocabulary**.
 * There is no path from input text to a `<script>`, an event handler, or an
 * attribute other than a scheme-checked `href`/`src`. Input is escaped before
 * any tag is produced.
 */

/** Escape text so it can never contribute markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Whether a URL may be emitted as a destination.
 *
 * The check that keeps `javascript:` and `data:` out of the rendered document.
 * Applied to every `href` and `src` without exception.
 */
function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Inline markdown → HTML. Input arrives unescaped; output is fully escaped. */
export function renderInline(text: string): string {
  let out = '';
  let i = 0;

  const literal = (count: number): void => {
    out += escapeHtml(text.slice(i, i + count));
    i += count;
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // Backslash escape: the next character is literal.
    const escaped = /^\\([\\`*_[\]#+\-.!])/.exec(rest);
    if (escaped) {
      out += escapeHtml(escaped[1]);
      i += escaped[0].length;
      continue;
    }

    // Code spans first: their content is never interpreted further.
    const code = /^(`+)([\s\S]*?)\1/.exec(rest);
    if (code) {
      out += `<code>${escapeHtml(code[2])}</code>`;
      i += code[0].length;
      continue;
    }

    // Image before link — the syntax differs only by the leading `!`.
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (image) {
      const url = safeUrl(image[2]);
      if (url) {
        out += `<img src="${escapeHtml(url)}" alt="${escapeHtml(image[1])}" loading="lazy">`;
        i += image[0].length;
        continue;
      }
      // An image we will not emit keeps its alt text rather than vanishing.
      out += escapeHtml(image[1]);
      i += image[0].length;
      continue;
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const url = safeUrl(link[2]);
      if (url) {
        // `noopener` because the reader opens links in a new tab, and
        // `noreferrer` because an article the user is reading privately should
        // not announce where it was read from.
        out +=
          `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">` +
          `${renderInline(link[1])}</a>`;
      } else {
        out += renderInline(link[1]);
      }
      i += link[0].length;
      continue;
    }

    const strong = /^\*\*(\S[\s\S]*?\S|\S)\*\*/.exec(rest);
    if (strong) {
      out += `<strong>${renderInline(strong[1])}</strong>`;
      i += strong[0].length;
      continue;
    }

    const strike = /^~~(\S[\s\S]*?\S|\S)~~/.exec(rest);
    if (strike) {
      out += `<del>${renderInline(strike[1])}</del>`;
      i += strike[0].length;
      continue;
    }

    const em = /^\*(\S[\s\S]*?\S|\S)\*/.exec(rest);
    if (em) {
      out += `<em>${renderInline(em[1])}</em>`;
      i += em[0].length;
      continue;
    }

    // Hard break: two trailing spaces before a newline.
    if (rest.startsWith('  \n')) {
      out += '<br>';
      i += 3;
      continue;
    }

    literal(1);
  }

  return out;
}

/** One list being accumulated by the block renderer. */
interface ListState {
  ordered: boolean;
  items: string[];
}

function flushList(state: ListState | null, out: string[]): void {
  if (!state) {
    return;
  }
  const tag = state.ordered ? 'ol' : 'ul';
  out.push(`<${tag}>${state.items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`);
}

/**
 * Article markdown → HTML.
 *
 * Line-oriented rather than a full CommonMark parser, because the input is our
 * own converter's output rather than arbitrary user markdown — the constructs
 * that appear are the ones `html-to-markdown.ts` emits.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let list: ListState | null = null;
  let paragraph: string[] = [];
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
      paragraph = [];
    }
  };
  const flushQuote = (): void => {
    if (quote.length) {
      out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = (): void => {
    flushParagraph();
    flushQuote();
    flushList(list, out);
    list = null;
  };

  for (const line of lines) {
    // Fenced code: everything inside is literal until the closing fence.
    if (/^```/.test(line.trim())) {
      if (code === null) {
        flushAll();
        code = [];
      } else {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      // Article headings start at h2: the reader's own title is the h1, and
      // two h1s on a page is an outline bug for anyone using a screen reader.
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      flushAll();
      out.push('<hr>');
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList(list, out);
      list = null;
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();

    const bullet = /^\s*[-+*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = numbered !== null;
      const content = (bullet ?? numbered)![1];
      if (!list || list.ordered !== ordered) {
        flushList(list, out);
        list = { ordered, items: [] };
      }
      list.items.push(renderInline(content));
      continue;
    }

    // A continuation line inside a list item.
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${renderInline(line.trim())}`;
      continue;
    }

    flushList(list, out);
    list = null;
    paragraph.push(line);
  }

  if (code !== null) {
    // An unterminated fence still renders its content rather than losing it.
    out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  }
  flushAll();

  return out.join('\n');
}
