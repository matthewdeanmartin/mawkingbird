import { Status } from '../models';
import { youtubeSource } from './media-source';

const VIDEO_HOSTS = new Set([
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'vimeo.com',
  'player.vimeo.com',
  'dailymotion.com',
  'dai.ly',
  'twitch.tv',
  'clips.twitch.tv',
  'tiktok.com',
  'bilibili.com',
  'b23.tv',
  'rumble.com',
  'odysee.com',
  'dtube.video',
  'streamable.com',
  'loom.com',
  'wistia.com',
  'wistia.net',
  'kick.com',
  'd.tube',
  'bitchute.com',
  'nicovideo.jp',
  'nico.ms',
  'niconico.jp',
  'youku.com',
  'iqiyi.com',
  'v.qq.com',
]);

/** Discovery only: recognizing a video link never authorizes an embed. */
export function isVideoLink(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.replace(/^(?:www\.|m\.)/, '');
    if (
      VIDEO_HOSTS.has(host) ||
      [...VIDEO_HOSTS].some((site) => host.endsWith('.' + site)) ||
      youtubeSource(raw)
    )
      return true;
    if (/\.(?:mp4|webm|m4v|mov|ogv)$/i.test(url.pathname)) return true;
    // PeerTube is federated; its standard video routes work on arbitrary hosts.
    if (
      /^\/videos\/(?:watch|embed)\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\/?$/i.test(
        url.pathname,
      ) ||
      /^\/w\/[1-9A-HJ-NP-Za-km-z]{22}\/?$/.test(url.pathname)
    )
      return true;
    return (
      ['facebook.com', 'fb.watch', 'instagram.com', 'x.com', 'twitter.com'].includes(host) &&
      (host === 'fb.watch' || /\/(?:watch|videos?|reels?)\b/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export function isVideoStatus(post: Status): boolean {
  const status = post.reblog ?? post;
  if (status.media_attachments.some((media) => media.type === 'video')) return true;
  if (status.card && (isVideoLink(status.card.url) || status.card.type === 'video')) return true;
  if (!status.content?.includes('<a')) return false;
  const doc = new DOMParser().parseFromString(status.content, 'text/html');
  return Array.from(doc.querySelectorAll('a[href]')).some((anchor) =>
    isVideoLink(anchor.getAttribute('href') ?? ''),
  );
}
