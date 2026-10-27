import { Status } from '../../models';

const TITLE_LIMIT = 80;

/** Shortens to a word boundary so queue rows stay one line. */
function clip(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= TITLE_LIMIT) return line;
  const cut = line.slice(0, TITLE_LIMIT - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

/** The first line of post text that says something besides links, mentions and tags. */
export function postTitle(post: Status): string {
  const html = (post.content ?? '').replace(/<br\s*\/?>|<\/p>/gi, '\n');
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  for (const raw of text.split('\n')) {
    const line = raw
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/(^|\s)[@#][\w.@-]+/g, ' ')
      .trim();
    if (/\p{L}.*\p{L}/u.test(line)) return clip(line);
  }
  return '';
}

/** A readable name from a linked file's address: `Sea_Shanty_(1925).ogg` → `Sea Shanty (1925)`. */
export function fileTitle(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '');
    return clip(name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_+]+/g, ' '));
  } catch {
    return '';
  }
}

/**
 * Title cascade: what the provider or file tags reported, then a native
 * attachment's description, then the post's own words, then a linked file's
 * name, then its author. Server-assigned attachment names are never titles.
 */
export function trackTitle(
  track: {
    post: Status;
    media: { id?: string; url?: string; description?: string | null };
    external?: unknown;
  },
  reported?: string,
): string {
  const description = track.external
    ? ''
    : ((track.media.description ?? '').split('\n').find((line) => line.trim()) ?? '');
  return (
    (reported && clip(reported)) ||
    (description && clip(description)) ||
    postTitle(track.post) ||
    (track.media.id?.startsWith('link:') && track.media.url ? fileTitle(track.media.url) : '') ||
    track.post.account.display_name ||
    track.post.account.acct
  );
}
