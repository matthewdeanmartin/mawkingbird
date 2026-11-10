// MFM (Misskey Flavored Markdown) → the HTML a status card renders.
//
// Parsing is `mfm-js`, Misskey's own MIT parser, so the syntax is never
// re-guessed here. This file only decides what each node becomes, and it
// builds every tag itself from escaped text: nothing a note author writes
// reaches the output as markup.
//
// Choices, each deliberate:
//
// - Custom emoji stay as `:shortcode:` text. The card's `customEmoji` pipe
//   already swaps those for images from `Status.emojis`, exactly as it does
//   for Mastodon, so Misskey needs no second emoji renderer.
// - `$[ruby 漢字 かんじ]` becomes a real `<ruby>`. Readings matter to the
//   language learners this client is built for.
// - Every other `$[fn …]` effect (x2, spin, flip, blur, rainbow…) renders its
//   text without the effect. Animated text is decoration; the words are kept.
// - Hashtags link to `<server>/tags/x`, which the status card routes to the
//   in-app tag page; for a Misskey account that route is the Misskey tag page
//   (M3). Mentions link to `<server>/@user@host`, which the card routes to the
//   in-app Misskey profile for Misskey notes. Opened outside the app (a new
//   tab, a copied link), both still work on the server.

import { parse, type MfmNode } from 'mfm-js';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) URLs become links; anything else (javascript:, data:…) is text. */
export function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export interface MfmContext {
  /** Origin of the server the reader is signed in to, e.g. `https://misskey.io`. */
  server: string;
  /** Host of the note author, for resolving a bare `@user` written on that server. */
  authorHost: string | null;
}

const BLOCK_TYPES = new Set<MfmNode['type']>([
  'quote',
  'blockCode',
  'mathBlock',
  'center',
  'search',
]);

function link(href: string, inner: string): string {
  return `<a href="${escapeHtml(href)}" rel="nofollow noopener noreferrer" target="_blank">${inner}</a>`;
}

function textWithBreaks(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

function mentionHref(node: Extract<MfmNode, { type: 'mention' }>, ctx: MfmContext): string {
  const host = node.props.host ?? ctx.authorHost;
  const handle = host ? `@${node.props.username}@${host}` : `@${node.props.username}`;
  return `${ctx.server}/${handle}`;
}

function ruby(children: MfmNode[], ctx: MfmContext): string {
  // `$[ruby base reading]`: one text child, split at the first space. Anything
  // fancier (nested MFM in the base) falls back to plain rendering.
  if (children.length === 1 && children[0].type === 'text') {
    const raw = children[0].props.text.trim();
    const space = raw.search(/\s/);
    if (space > 0) {
      const base = raw.slice(0, space);
      const reading = raw.slice(space).trim();
      if (reading) {
        return `<ruby>${escapeHtml(base)}<rp>(</rp><rt>${escapeHtml(reading)}</rt><rp>)</rp></ruby>`;
      }
    }
  }
  return inline(children, ctx);
}

function inline(nodes: MfmNode[], ctx: MfmContext): string {
  return nodes.map((node) => inlineNode(node, ctx)).join('');
}

function inlineNode(node: MfmNode, ctx: MfmContext): string {
  switch (node.type) {
    case 'text':
      return textWithBreaks(node.props.text);
    case 'plain':
      return inline(node.children, ctx);
    case 'bold':
      return `<strong>${inline(node.children, ctx)}</strong>`;
    case 'italic':
      return `<em>${inline(node.children, ctx)}</em>`;
    case 'strike':
      return `<del>${inline(node.children, ctx)}</del>`;
    case 'small':
      return `<small>${inline(node.children, ctx)}</small>`;
    case 'inlineCode':
      return `<code>${escapeHtml(node.props.code)}</code>`;
    case 'mathInline':
      return `<code>${escapeHtml(node.props.formula)}</code>`;
    case 'unicodeEmoji':
      return escapeHtml(node.props.emoji);
    case 'emojiCode':
      return `:${escapeHtml(node.props.name)}:`;
    case 'mention':
      return link(mentionHref(node, ctx), escapeHtml(node.props.acct));
    case 'hashtag': {
      const href = `${ctx.server}/tags/${encodeURIComponent(node.props.hashtag)}`;
      return link(href, `#${escapeHtml(node.props.hashtag)}`);
    }
    case 'url': {
      const href = safeHttpUrl(node.props.url);
      return href ? link(href, escapeHtml(node.props.url)) : escapeHtml(node.props.url);
    }
    case 'link': {
      const href = safeHttpUrl(node.props.url);
      const inner = inline(node.children, ctx);
      return href ? link(href, inner) : inner;
    }
    case 'fn':
      return node.props.name === 'ruby' ? ruby(node.children, ctx) : inline(node.children, ctx);
    // Blocks reached inline (nested inside another block) degrade to text.
    case 'quote':
    case 'center':
      return inline(node.children, ctx);
    case 'blockCode':
      return `<code>${escapeHtml(node.props.code)}</code>`;
    case 'mathBlock':
      return `<code>${escapeHtml(node.props.formula)}</code>`;
    case 'search':
      return escapeHtml(node.props.content);
  }
}

function blockNode(node: MfmNode, ctx: MfmContext): string {
  switch (node.type) {
    case 'quote':
      return `<blockquote>${render(node.children, ctx)}</blockquote>`;
    case 'center':
      return `<p>${inline(node.children, ctx)}</p>`;
    case 'blockCode':
      return `<pre><code>${escapeHtml(node.props.code)}</code></pre>`;
    case 'mathBlock':
      return `<pre><code>${escapeHtml(node.props.formula)}</code></pre>`;
    case 'search':
      return `<p>${escapeHtml(node.props.content)}</p>`;
    default:
      return inlineNode(node, ctx);
  }
}

/** Trim the line breaks MFM leaves around block elements. */
function paragraph(html: string): string {
  const trimmed = html.replace(/^(<br>)+|(<br>)+$/g, '');
  return trimmed ? `<p>${trimmed.replace(/(<br>){2,}/g, '</p><p>')}</p>` : '';
}

function render(nodes: MfmNode[], ctx: MfmContext): string {
  let html = '';
  let buffer = '';
  for (const node of nodes) {
    if (BLOCK_TYPES.has(node.type)) {
      html += paragraph(buffer);
      buffer = '';
      html += blockNode(node, ctx);
    } else {
      buffer += inlineNode(node, ctx);
    }
  }
  return html + paragraph(buffer);
}

/** Render a note's MFM text as card HTML. Empty or null text gives `''`. */
export function mfmToHtml(text: string | null | undefined, ctx: MfmContext): string {
  if (!text) return '';
  let nodes: MfmNode[];
  try {
    nodes = parse(text);
  } catch {
    // The parser is total in practice; this keeps a pathological note readable.
    return paragraph(textWithBreaks(text));
  }
  return render(nodes, ctx);
}
