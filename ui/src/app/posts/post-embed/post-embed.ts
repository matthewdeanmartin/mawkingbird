import { CustomEmoji, MediaAttachment, Status } from '../../platform/api/models';

/**
 * Portable HTML for a post: a self-contained `<blockquote>` someone can paste
 * into a blog or web page. It carries attribution, a link back to the original,
 * the content warning, media with their descriptions, and poll results.
 *
 * No scripts, no styles and no remote embed iframe: the output must keep
 * working (and stay safe) wherever it is pasted. Post content comes from the
 * author's server, so it is rebuilt from an allow-list rather than copied.
 */

/** Tags Mastodon emits in post content that are safe to keep. */
const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DEL',
  'EM',
  'I',
  'LI',
  'OL',
  'P',
  'PRE',
  'S',
  'STRONG',
  'U',
  'UL',
]);

/** Elements removed together with their text. */
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT']);

/** Quotes nest; past this depth the inner post is linked rather than embedded. */
const MAX_QUOTE_DEPTH = 2;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only web and mail links survive; anything else (javascript:, data:) is dropped. */
function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function emojify(escaped: string, emojis: readonly CustomEmoji[] | undefined): string {
  if (!emojis?.length) return escaped;
  const byCode = new Map(emojis.map((e) => [e.shortcode, e]));
  return escaped.replace(/:([\w+-]+):/g, (match, code: string) => {
    const emoji = byCode.get(code);
    const src = safeUrl(emoji?.static_url || emoji?.url);
    if (!src) return match;
    return `<img src="${escapeHtml(src)}" alt=":${escapeHtml(code)}:" title=":${escapeHtml(code)}:" width="20" height="20" />`;
  });
}

/** Rebuild server HTML from the allow-list, keeping only `href` on links. */
export function cleanContent(html: string, emojis?: readonly CustomEmoji[]): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return emojify(escapeHtml(node.textContent ?? ''), emojis);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    // Never carry executable or styling payloads, not even as escaped text.
    if (DROPPED_TAGS.has(el.tagName)) return '';
    // Mastodon hides URL scheme and overflow in `invisible` spans; drop them as
    // the web UI visually does, so the pasted text reads the same.
    if (el.classList.contains('invisible')) return '';
    const inner = Array.from(el.childNodes).map(walk).join('');
    const tag = el.tagName;
    if (!ALLOWED_TAGS.has(tag)) return inner;
    const name = tag.toLowerCase();
    if (tag === 'BR') return '<br />';
    if (tag === 'A') {
      const href = safeUrl(el.getAttribute('href'));
      return href
        ? `<a href="${escapeHtml(href)}" rel="nofollow noopener noreferrer">${inner}</a>`
        : inner;
    }
    return `<${name}>${inner}</${name}>`;
  };
  return Array.from(doc.body.childNodes).map(walk).join('');
}

function dimensions(media: MediaAttachment): string {
  const size = media.meta?.small ?? media.meta?.original;
  return size?.width && size?.height ? ` width="${size.width}" height="${size.height}"` : '';
}

function mediaHtml(media: MediaAttachment): string {
  const source = safeUrl(media.remote_url || media.url);
  const preview = safeUrl(media.preview_url) ?? source;
  const description = media.description?.trim() ?? '';
  const alt = escapeHtml(description);
  const caption = description ? `<figcaption>${alt}</figcaption>` : '';
  switch (media.type) {
    case 'image':
      return preview
        ? `<figure><img src="${escapeHtml(preview)}"${dimensions(media)} alt="${alt}" loading="lazy" /></figure>`
        : '';
    case 'gifv':
    case 'video':
      return source
        ? `<figure><video src="${escapeHtml(source)}"${dimensions(media)} controls preload="none"${preview ? ` poster="${escapeHtml(preview)}"` : ''}></video>${caption}</figure>`
        : '';
    case 'audio':
      return source
        ? `<figure><audio src="${escapeHtml(source)}" controls preload="none"></audio>${caption}</figure>`
        : '';
    default:
      return source
        ? `<figure><a href="${escapeHtml(source)}" rel="nofollow noopener noreferrer">📄 ${alt || escapeHtml(source)}</a></figure>`
        : '';
  }
}

function pollHtml(status: Status): string {
  const options = status.poll?.options ?? [];
  if (!options.length) return '';
  const items = options
    .map((o) => `<li>${emojify(escapeHtml(o.title), status.emojis)} (${o.votes_count ?? 0})</li>`)
    .join('');
  return `<p>📊</p><ul>${items}</ul>`;
}

function postHtml(status: Status, locale: string | undefined, depth: number): string {
  const quoted = status.quote?.quoted_status;
  const quoteHtml = quoted && depth < MAX_QUOTE_DEPTH ? postHtml(quoted, locale, depth + 1) : '';
  const body =
    cleanContent(status.content, status.emojis) +
    quoteHtml +
    pollHtml(status) +
    status.media_attachments.map(mediaHtml).join('');
  const spoiler = status.spoiler_text?.trim();
  const main = spoiler
    ? `<details><summary>${emojify(escapeHtml(spoiler), status.emojis)}</summary>${body}</details>`
    : body;
  const account = status.account;
  const name = emojify(escapeHtml(account.display_name || account.username), account.emojis);
  const profile = safeUrl(account.url);
  const author = profile
    ? `<a href="${escapeHtml(profile)}" rel="nofollow noopener noreferrer">${name}</a>`
    : name;
  const url = safeUrl(status.url ?? status.uri);
  const created = new Date(status.created_at);
  const time = Number.isNaN(created.getTime())
    ? ''
    : `<time datetime="${created.toISOString()}">${escapeHtml(created.toLocaleString(locale))}</time>`;
  const stamp = time && url ? ` <a href="${escapeHtml(url)}">${time}</a>` : time ? ` ${time}` : '';
  const lang = status.language ? ` lang="${escapeHtml(status.language)}"` : '';
  const cite = url ? ` cite="${escapeHtml(url)}"` : '';
  return `<blockquote${lang}${cite} data-source="fediverse">${main}<footer>— ${author} (@${escapeHtml(account.acct)})${stamp}</footer></blockquote>`;
}

/** Portable HTML for `status` (pass the original, not the boost wrapper). */
export function buildPostEmbedHtml(status: Status, locale?: string): string {
  return prettify(postHtml(status, locale, 0));
}

/** Break the one-line output at block boundaries so the copied code is readable. */
function prettify(html: string): string {
  return html
    .replace(/(<(?:blockquote|details|ul|ol|figure|footer)\b[^>]*>)/g, '\n$1\n')
    .replace(/(<\/(?:blockquote|details|summary|p|li|ul|ol|figure|footer)>)/g, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Mastodon posts that are meant to be seen outside the app: public or unlisted. */
export function canEmbedPost(status: Status): boolean {
  return (
    (!status.provider ||
      status.provider === 'mastodon' ||
      status.provider === 'anonymous-mastodon') &&
    (status.visibility === 'public' || status.visibility === 'unlisted') &&
    !!safeUrl(status.url ?? status.uri)
  );
}
