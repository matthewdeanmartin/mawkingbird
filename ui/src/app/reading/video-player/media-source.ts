import { MediaAttachment, Status } from '../../platform/api/models';
import { anonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';

export interface VideoSource {
  /**
   * `peertube` is a link to a PeerTube video: feeds show its poster, and
   * Watch resolves it to a `native` stream from the instance's public API.
   */
  kind: 'native' | 'youtube' | 'peertube';
  key: string;
  url: string;
  title: string;
  poster?: string;
  duration?: number;
  videoId?: string;
  start?: number;
  /** A single image accompanying a YouTube link serves as its poster, not a second media row. */
  posterAttachmentId?: string;
  /** For `peertube`: the instance and the video's UUID or short UUID. */
  peertube?: { host: string; id: string };
}

/** A PeerTube video ID: a UUID, or the 22-character short UUID of `/w/` links. */
export const PEERTUBE_ID =
  /^(?:[\da-fA-F]{8}(?:-[\da-fA-F]{4}){3}-[\da-fA-F]{12}|[1-9A-HJ-NP-Za-km-z]{22})$/;

/** A PeerTube watch link (`/w/<id>` or `/videos/watch/<uuid>`) on any https host. */
export function peertubeSource(raw: string): VideoSource | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const id =
      /^\/w\/([^/]+)\/?$/.exec(url.pathname)?.[1] ??
      /^\/videos\/(?:watch|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (!id || !PEERTUBE_ID.test(id)) return null;
    const host = url.hostname.toLowerCase();
    return {
      kind: 'peertube',
      key: `peertube:${host}/${id}`,
      url: `https://${host}/w/${id}`,
      title: 'PeerTube',
      peertube: { host, id },
    };
  } catch {
    return null;
  }
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_START = 7 * 24 * 60 * 60;

export function mediaUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, document.baseURI);
    return ['https:', 'http:', 'blob:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function startSeconds(raw: string | null): number | undefined {
  if (!raw) return 0;
  let seconds: number;
  if (/^\d+(?:\.\d+)?s?$/.test(raw)) {
    seconds = Number(raw.replace(/s$/, ''));
  } else {
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
    if (!match || !match.slice(1).some(Boolean)) return undefined;
    seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_START
    ? Math.floor(seconds)
    : undefined;
}

/** Exact hosts and URL paths; preview HTML/provider labels are never executable input. */
/**
 * Watch's `t` cue (chapters, shared moments): seconds or YouTube's `1h2m3s`.
 * `undefined` when absent or invalid, so the link's own start stands.
 */
export function cueSeconds(raw: string | null | undefined): number | undefined {
  return raw ? startSeconds(raw) : undefined;
}

export function youtubeSource(raw: string): VideoSource | null {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
      return null;
    }
    let id: string | null = null;
    if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
      id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    } else if (YOUTUBE_HOSTS.has(url.hostname)) {
      id =
        url.pathname === '/watch'
          ? url.searchParams.get('v')
          : (/^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null);
    }
    const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
    if (!id || !VIDEO_ID.test(id) || start === undefined) return null;
    return {
      kind: 'youtube',
      key: `youtube:${id}`,
      videoId: id,
      start,
      title: 'YouTube',
      url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}` : ''}`,
    };
  } catch {
    return null;
  }
}

export function attachmentSource(media: MediaAttachment): VideoSource | null {
  if (media.type !== 'video' && media.type !== 'gifv') return null;
  const url = mediaUrl(media.url || media.remote_url);
  if (!url) return null;
  const duration = media.meta?.original?.duration;
  return {
    kind: 'native',
    key: `native:${url}`,
    url,
    title: media.description || '',
    poster: mediaUrl(media.preview_url),
    ...(typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? { duration }
      : {}),
  };
}

/** Recognize one primary link, even when the server did not supply a preview card. */
export function statusVideo(status: Status): VideoSource | null {
  const image =
    status.media_attachments?.length === 1 && status.media_attachments[0].type === 'image'
      ? status.media_attachments[0]
      : null;
  const withPoster = (source: VideoSource): VideoSource =>
    image
      ? {
          ...source,
          poster: mediaUrl(image.preview_url || image.url),
          posterAttachmentId: image.id,
        }
      : source;
  const cardSource = status.card
    ? (youtubeSource(status.card.url) ?? peertubeSource(status.card.url))
    : null;
  if (cardSource) {
    return withPoster({
      ...cardSource,
      title: status.card!.title || cardSource.title,
      poster: mediaUrl(status.card!.image),
    });
  }
  if (!status.content?.includes('<a')) return null;
  const doc = new DOMParser().parseFromString(status.content, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href') ?? '';
    const source = youtubeSource(href) ?? peertubeSource(href);
    if (source) return withPoster(source);
  }
  return null;
}

/** A reloadable Watch URL resolves the post again; it never grants access to a media URL. */
export function watchParams(
  status: Status,
  source: VideoSource,
  server: string,
  attachmentId?: string,
): Record<string, string> {
  const ref = status.providerRef as { server?: string; statusId?: string } | undefined;
  const post =
    status.provider === 'anonymous-mastodon' && ref?.server && ref.statusId
      ? anonymousStatusRouteRef({
          server: ref.server,
          id: ref.statusId,
          originalUrl: status.url ?? undefined,
        })
      : status.id;
  return {
    post,
    server: new URL(server || location.origin).origin,
    ...(attachmentId
      ? { attachment: attachmentId }
      : source.kind === 'peertube'
        ? { peertube: source.peertube!.id }
        : { youtube: source.videoId! }),
  };
}
