import { CustomEmoji } from '../models';

/**
 * Client-side approximation of the HTML a Mastodon server renders for a
 * status body, used by the composer's live preview. Links, @mentions,
 * #hashtags and :custom_emoji: shortcodes come out looking like they will in
 * the feed; everything else is escaped verbatim.
 */
export function renderStatusText(text: string, emojis: CustomEmoji[] = []): string {
  const emojiByCode = new Map(emojis.map((e) => [e.shortcode, e]));

  // One pass over the raw text with a combined matcher, escaping the literal
  // stretches between matches (escaping first would shift URL offsets).
  const token =
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])|(@[A-Za-z0-9_]+(?:@[A-Za-z0-9_.-]+[A-Za-z0-9])?)|(#[\p{L}\p{N}_]+)|(:([a-zA-Z0-9_]+):)/gu;

  let html = '';
  let last = 0;
  for (const m of text.matchAll(token)) {
    html += escapeHtml(text.slice(last, m.index));
    const [whole, url, mention, hashtag, emoji, shortcode] = m;
    if (url) {
      html += renderLink(url);
    } else if (mention) {
      html += `<span class="h-card"><a class="u-url mention">${escapeHtml(mention)}</a></span>`;
    } else if (hashtag) {
      const name = hashtag.slice(1);
      html += `<a class="mention hashtag" href="/tags/${encodeURIComponent(name)}">#${escapeHtml(name)}</a>`;
    } else if (emoji && emojiByCode.has(shortcode)) {
      const e = emojiByCode.get(shortcode)!;
      const code = escapeHtml(`:${shortcode}:`);
      html += `<img class="custom-emoji" src="${escapeHtml(e.static_url || e.url)}" alt="${code}" title="${code}" />`;
    } else {
      html += escapeHtml(whole);
    }
    last = m.index + whole.length;
  }
  html += escapeHtml(text.slice(last));

  // Paragraphs on blank lines, <br> on single newlines — like the server does.
  return html
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p.replaceAll('\n', '<br />')}</p>`)
    .join('');
}

/** Mastodon-style link: protocol dimmed away, long tails ellipsised. */
function renderLink(url: string): string {
  const display = url.replace(/^https?:\/\//, '');
  const shown = display.length > 30 ? display.slice(0, 30) : display;
  const invisible = display.length > 30 ? '<span class="ellipsis">…</span>' : '';
  return (
    `<a href="${escapeHtml(url)}" rel="nofollow noopener noreferrer" target="_blank">` +
    `<span>${escapeHtml(shown)}</span>${invisible}</a>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
