import { firstExternalLink } from '../../external-link';
import { Status } from '../../models';

/**
 * Mastodon bookmarks as a browser bookmark file.
 *
 * Three ways to export, because a bookmarked post is usually one of two things:
 * the post itself is the point, or it was a wrapper around a link.
 *
 * - `posts`: every bookmark links to the post.
 * - `unwrapped`: a bookmark whose post shares a link becomes that link; the
 *   rest stay posts. The rule is the one Raindrop's "unwrap" uses
 *   ({@link firstExternalLink}), with the post's preview card as a fallback.
 * - `links`: only the bookmarks that share a link, as that link.
 */
export type ExportMode = 'posts' | 'unwrapped' | 'links';

export interface ExportEntry {
  url: string;
  title: string;
  description: string;
  /** Seconds since the epoch: when the post was written. Mastodon does not say when it was bookmarked. */
  addDate: number;
  tags: string[];
}

const TITLE_LENGTH = 100;

/** The link a bookmarked post shares, if any. */
export function sharedLink(status: Status, instanceUrl: string): string | null {
  const post = status.reblog ?? status;
  const link = firstExternalLink(post.content, instanceUrl);
  if (link) return link;
  const card = post.card?.url;
  return card && /^https?:\/\//i.test(card) ? card : null;
}

export function exportEntries(
  statuses: readonly Status[],
  mode: ExportMode,
  instanceUrl: string,
): ExportEntry[] {
  const entries: ExportEntry[] = [];
  for (const status of statuses) {
    const post = status.reblog ?? status;
    const postUrl = post.url ?? post.uri ?? null;
    const text = plainText(
      post.spoiler_text ? `${post.spoiler_text}: ${post.content}` : post.content,
    );
    const author = `@${post.account.acct}`;
    const link = mode === 'posts' ? null : sharedLink(status, instanceUrl);
    const tags = ['mastodon', ...(post.tags ?? []).map((tag) => tag.name.toLowerCase())];
    const addDate = Math.floor(Date.parse(post.created_at) / 1000) || 0;

    if (link) {
      const cardTitle = post.card?.url === link ? post.card.title?.trim() : '';
      entries.push({
        url: link,
        title: cardTitle || shorten(text) || link,
        description: `Shared by ${author}: ${text}${postUrl ? ` (${postUrl})` : ''}`,
        addDate,
        tags,
      });
    } else if (mode !== 'links' && postUrl) {
      entries.push({
        url: postUrl,
        title: `${author}: ${shorten(text) || 'post'}`,
        description: text,
        addDate,
        tags,
      });
    }
  }
  return entries;
}

/**
 * The Netscape bookmark file every browser and bookmark service imports:
 * one folder, one `<DT><A>` per bookmark, its text in `<DD>`.
 */
export function bookmarkFileHtml(entries: readonly ExportEntry[], folder: string): string {
  const items = entries.map((entry) => {
    const attrs = [
      `HREF="${escapeHtml(entry.url)}"`,
      entry.addDate ? `ADD_DATE="${entry.addDate}"` : '',
      entry.tags.length ? `TAGS="${escapeHtml(entry.tags.join(','))}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const line = `        <DT><A ${attrs}>${escapeHtml(entry.title)}</A>`;
    return entry.description ? `${line}\n        <DD>${escapeHtml(entry.description)}` : line;
  });
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3>${escapeHtml(folder)}</H3>`,
    '    <DL><p>',
    ...items,
    '    </DL><p>',
    '</DL><p>',
    '',
  ].join('\n');
}

function plainText(html: string): string {
  // Paragraphs and line breaks would otherwise run their words together.
  const spaced = html.replace(/<br\s*\/?>|<\/p>/gi, ' ');
  const text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

function shorten(text: string): string {
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
