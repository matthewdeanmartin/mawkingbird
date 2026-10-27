import { directAudioUrl, locItemIds } from '../../audio-embeds/linked-audio';
import { externalMedia } from '../../audio-embeds/providers';
import { Status } from '../../models';

/** Lines such as `3. Title` or `3) Title` number distinct playlist entries. */
const NUMBERED = /^\s*\d{1,3}[.)]\s+/;

/** Whether a link can name a recording: a playable file, an LoC item or an audio player. */
export function audioLink(href: string): boolean {
  return (
    !!directAudioUrl(href) || locItemIds(href).length > 0 || externalMedia(href)?.type === 'audio'
  );
}

/** Text lines of a post, each with the links it contains. */
function lines(post: Status): { text: string; links: string[] }[] {
  const html = (post.content ?? '').replace(/<br\s*\/?>|<\/p>/gi, '\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result: { text: string; links: string[] }[] = [{ text: '', links: [] }];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent ?? '').split('\n');
      parts.forEach((part, index) => {
        if (index) result.push({ text: '', links: [] });
        result.at(-1)!.text += part;
      });
    } else if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute('href');
      if (href) result.at(-1)!.links.push(href);
      result.at(-1)!.text += node.textContent ?? '';
    } else node.childNodes.forEach(walk);
  };
  doc.body.childNodes.forEach(walk);
  return result;
}

/**
 * Distinct recordings in one post. Each audio attachment is one. Links are
 * usually alternatives for the same song (Spotify, Apple, Bandcamp…), so all
 * the post's audio links count once — unless they sit on numbered lines, the
 * shape of a written playlist, where each numbered line is its own entry.
 */
export function postRecordings(post: Status): string[] {
  const own = post.reblog ?? post;
  const keys = own.media_attachments
    .filter((media) => media.type === 'audio')
    .map((media) => `media:${media.url || media.id}`);
  const loose: string[] = [];
  // `3. Title` alone on a line claims the link on the line after it.
  let numbered = false;
  for (const line of lines(own)) {
    const audio = line.links.filter(audioLink);
    const isNumbered = NUMBERED.test(line.text);
    if (!audio.length) {
      if (line.text.trim()) numbered = isNumbered;
      continue;
    }
    if (isNumbered || numbered) keys.push(`link:${audio[0]}`);
    else loose.push(...audio);
    numbered = false;
  }
  // The preview card repeats one of the post's links; it never adds an entry.
  if (loose.length) keys.push(`link:${[...loose].sort()[0]}`);
  else if (!keys.length && own.card?.url && audioLink(own.card.url))
    keys.push(`link:${own.card.url}`);
  return keys;
}

export interface PlaylistThread {
  root: Status;
  posts: Status[];
  recordings: number;
}

/**
 * Group an account's own posts into self-reply threads and keep those holding
 * at least two distinct recordings: no hashtag or marker is required.
 */
export function playlistThreads(statuses: readonly Status[], accountId: string): PlaylistThread[] {
  const own = statuses.filter((post) => !post.reblog && post.account.id === accountId);
  const byId = new Map(own.map((post) => [post.id, post]));
  const children = new Map<string, Status[]>();
  for (const post of own) {
    const parent = post.in_reply_to_id;
    if (parent && post.in_reply_to_account_id === accountId && byId.has(parent))
      children.set(parent, [...(children.get(parent) ?? []), post]);
  }
  const threads: PlaylistThread[] = [];
  for (const root of own) {
    if (root.in_reply_to_id && byId.has(root.in_reply_to_id)) continue;
    if (root.in_reply_to_id && root.in_reply_to_account_id !== accountId) continue;
    const posts = [root];
    for (const post of posts)
      posts.push(
        ...(children.get(post.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      );
    const recordings = new Set(posts.flatMap(postRecordings)).size;
    if (recordings >= 2) threads.push({ root, posts, recordings });
  }
  return threads;
}

/** Root post text for a published playlist. Plain text: the server links nothing else. */
export function rootText(name: string, description: string, count: number, label: string): string {
  return [name.trim(), description.trim(), label.replace('{{count}}', String(count))]
    .filter(Boolean)
    .join('\n\n');
}

/** One reply per entry: a numbered title line, then the link. */
export function entryText(index: number, title: string, url: string): string {
  const name = title.replace(/\s+/g, ' ').trim().slice(0, 200);
  return `${index + 1}. ${name || url}\n${url}`;
}
