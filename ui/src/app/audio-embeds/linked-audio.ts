import { MediaAttachment, Status } from '../models';

/** File extensions browsers commonly play in an audio element. */
export const AUDIO_FILE = /\.(mp3|ogg|oga|wav|m4a|flac|opus|aac)$/i;
const LINK_LIMIT = 50;

// Queues recompute often; a post object's content does not change underneath it.
const parsed = new WeakMap<Status, string[]>();

/** Every link a post offers: its preview card and anchors in its text. */
export function postLinks(status: Status): string[] {
  const post = status.reblog ?? status;
  const cached = parsed.get(post);
  if (cached) return cached;
  const links = post.card?.url ? [post.card.url] : [];
  if (post.content?.includes('<a')) {
    const doc = new DOMParser().parseFromString(post.content, 'text/html');
    for (const anchor of Array.from(doc.querySelectorAll('a[href]')))
      links.push(anchor.getAttribute('href') ?? '');
  }
  const result = [...new Set(links)].slice(0, LINK_LIMIT);
  parsed.set(post, result);
  return result;
}

function httpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

/**
 * The playable https file behind a link, without any request. Wikimedia file
 * pages use Special:FilePath, a redirect to upload.wikimedia.org; Internet
 * Archive file pages map to their /download/ address. Audio elements need no
 * CORS, so playback never involves a proxy.
 */
export function directAudioUrl(raw: string): string | null {
  const url = httpsUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const wikiHost =
    host === 'commons.wikimedia.org' || /^[a-z0-9-]+\.(m\.)?wikipedia\.org$/.test(host);
  // Wiki articles and categories are pages, whatever their titles end with.
  if (wikiHost && url.pathname.startsWith('/wiki/')) {
    const wiki = /^\/wiki\/(?:File|Media|Image):(.+)$/.exec(url.pathname);
    if (!wiki) return null;
    let name: string;
    try {
      name = decodeURIComponent(wiki[1]);
    } catch {
      return null;
    }
    return AUDIO_FILE.test(name) && !name.includes('/')
      ? `https://${host.replace('.m.', '.')}/wiki/Special:FilePath/${encodeURIComponent(name.replaceAll(' ', '_'))}`
      : null;
  }
  if (['archive.org', 'www.archive.org'].includes(host)) {
    const item = /^\/(?:details|download)\/([\w.-]+)\/(.+)$/.exec(url.pathname);
    return item && !['.', '..'].includes(item[1]) && AUDIO_FILE.test(item[2])
      ? `https://archive.org/download/${item[1]}/${item[2]}`
      : null;
  }
  return AUDIO_FILE.test(url.pathname) ? `https://${host}${url.pathname}${url.search}` : null;
}

/** A synthetic attachment for a linked file, keyed by its playable address. */
export function linkedAttachment(
  url: string,
  description = '',
  id = `link:${url}`,
): MediaAttachment {
  return { id, type: 'audio', url, preview_url: '', description } as MediaAttachment;
}

/** Directly playable audio files linked from a post, excluding its own attachments. */
export function linkedAudio(status: Status): { link: string; media: MediaAttachment }[] {
  const post = status.reblog ?? status;
  const own = new Set(post.media_attachments.map((media) => media.url));
  const found = new Map<string, { link: string; media: MediaAttachment }>();
  for (const link of postLinks(post)) {
    const url = directAudioUrl(link);
    if (url && !own.has(url) && !found.has(url))
      found.set(url, { link, media: linkedAttachment(url) });
  }
  return [...found.values()];
}

/** Library of Congress item identifiers named by one link: an item or a playlist embed. */
export function locItemIds(raw: string): string[] {
  const url = httpsUrl(raw);
  if (!url || !['www.loc.gov', 'loc.gov'].includes(url.hostname.toLowerCase())) return [];
  if (/^\/item\/playlist\/?$/.test(url.pathname))
    return (url.searchParams.get('tracks') ?? '')
      .split('|')
      .slice(0, 20)
      .filter((id) => /^[a-z0-9-]{3,80}$/i.test(id))
      .map((id) => id.toLowerCase());
  const item = /^\/item\/([a-z0-9-]{3,80})\/?$/i.exec(url.pathname);
  return item ? [item[1].toLowerCase()] : [];
}

/**
 * Library of Congress items linked from a post. Resolving one needs the public
 * JSON API (CORS-enabled), so recognition here is only the item identifier.
 */
export function locItems(status: Status): string[] {
  return [...new Set(postLinks(status).flatMap(locItemIds))];
}
