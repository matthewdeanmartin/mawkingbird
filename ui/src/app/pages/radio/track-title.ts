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

/**
 * Title cascade: what the provider reported, then a native attachment's
 * description, then the post's own words, then its author.
 */
export function trackTitle(
  track: { post: Status; media: { description?: string | null }; external?: unknown },
  reported?: string,
): string {
  const description = track.external
    ? ''
    : ((track.media.description ?? '').split('\n').find((line) => line.trim()) ?? '');
  return (
    (reported && clip(reported)) ||
    (description && clip(description)) ||
    postTitle(track.post) ||
    track.post.account.display_name ||
    track.post.account.acct
  );
}
