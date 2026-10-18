import { CHANNEL_ID, videoFeedUrl } from './video-subscriptions';

/** Canonicalize channel info without allowing pasted URLs to choose another host. */
export function channelInput(input: string): { id: string } | { url: string } | null {
  const value = input.trim();
  if (CHANNEL_ID.test(value)) return { id: value };
  const raw = value.startsWith('@')
    ? `https://www.youtube.com/${value}`
    : /^(?:www\.|m\.)?youtube\.com\//i.test(value)
      ? `https://${value}`
      : /^[A-Za-z0-9_-]+$/.test(value)
        ? `https://www.youtube.com/c/${value}`
        : value;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
    )
      return null;
    if (url.pathname === '/feeds/videos.xml') {
      const id = url.searchParams.get('channel_id') ?? '';
      return CHANNEL_ID.test(id) ? { id } : null;
    }
    const match =
      /^\/(channel|c|user)\/([^/]+)(?:\/(?:videos|shorts|streams|featured|about))?\/?$/.exec(
        url.pathname,
      );
    if (match?.[1] === 'channel') return CHANNEL_ID.test(match[2]) ? { id: match[2] } : null;
    const handle = /^(\/@[^/]+)(?:\/(?:videos|shorts|streams|featured|about))?\/?$/.exec(
      url.pathname,
    );
    const alias = /^\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1];
    const reserved = new Set([
      'watch',
      'playlist',
      'results',
      'shorts',
      'feed',
      'channel',
      'user',
      'c',
    ]);
    const path =
      handle?.[1] ??
      (match
        ? `/${match[1]}/${match[2]}`
        : alias && !reserved.has(alias.toLowerCase())
          ? `/c/${alias}`
          : null);
    return path ? { url: `https://www.youtube.com${path}` } : null;
  } catch {
    return null;
  }
}

/** Read public channel metadata; scripts are never executed. */
export function channelFromHtml(html: string): { id: string; title: string } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let id: string | null = null;
  for (const link of Array.from(doc.querySelectorAll('link[rel="alternate"][href]'))) {
    try {
      const url = new URL(link.getAttribute('href') ?? '', 'https://www.youtube.com');
      if (url.origin === 'https://www.youtube.com' && url.pathname === '/feeds/videos.xml') {
        const candidate = url.searchParams.get('channel_id') ?? '';
        if (CHANNEL_ID.test(candidate)) {
          id = candidate;
          break;
        }
      }
    } catch {
      /* malformed metadata is not a channel */
    }
  }
  id ??=
    doc.querySelector('meta[itemprop="channelId"]')?.getAttribute('content') ??
    /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    null;
  if (!id || !CHANNEL_ID.test(id)) return null;
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    doc.title.replace(/\s*-\s*YouTube$/, '') ??
    id;
  return { id, title: title.trim() || id };
}

export { videoFeedUrl };
