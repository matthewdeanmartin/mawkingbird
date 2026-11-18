import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { externalFetch } from '../../platform/http/external-fetch';
import { PLATFORM_FEED_READ } from '../../platform/http/platform-http';
import { VideoSource } from '../video-player/media-source';

/** A PeerTube video, resolved from its instance's public API (spec/youtube-client.md, S4). */
export interface PeerTubeVideo {
  title: string;
  /** A plain source the shared player plays in `<video>` (MP4, or HLS via hls.js). */
  playable: VideoSource | null;
  /** `channel@host`, the ActivityPub actor to follow from Mastodon. */
  channel: string | null;
  channelName: string;
  sensitive: boolean;
  live: boolean;
}

interface ApiFile {
  fileUrl?: unknown;
  resolution?: { id?: unknown };
}

interface ApiVideo {
  name?: unknown;
  duration?: unknown;
  nsfw?: unknown;
  isLive?: unknown;
  previewPath?: unknown;
  thumbnailPath?: unknown;
  files?: ApiFile[];
  streamingPlaylists?: { playlistUrl?: unknown; files?: ApiFile[] }[];
  channel?: { name?: unknown; host?: unknown; displayName?: unknown };
}

const httpsOn = (raw: unknown, host: string): string | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw, `https://${host}`);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * The stream to play. MP4 files play anywhere; Native's webview cannot fetch
 * HLS segments itself, so it takes MP4 when one exists. A middling resolution
 * (≤ 720p) keeps the first frame quick.
 */
export function pickStream(video: ApiVideo, host: string, preferMp4: boolean): string | null {
  const files = [
    ...(video.files ?? []),
    ...(video.streamingPlaylists ?? []).flatMap((p) => p.files ?? []),
  ]
    .map((file) => ({ url: httpsOn(file.fileUrl, host), height: Number(file.resolution?.id) || 0 }))
    .filter((file): file is { url: string; height: number } => !!file.url && file.height > 0)
    .sort((a, b) => {
      const fit = (height: number) => (height <= 720 ? 720 - height : 10_000 + height);
      return fit(a.height) - fit(b.height);
    });
  const hls = httpsOn(video.streamingPlaylists?.[0]?.playlistUrl, host);
  if (preferMp4) return files[0]?.url ?? hls;
  return hls ?? files[0]?.url ?? null;
}

export function peertubeVideo(
  video: ApiVideo,
  host: string,
  preferMp4: boolean,
  key: string,
): PeerTubeVideo {
  const title = typeof video.name === 'string' ? video.name : '';
  const url = pickStream(video, host, preferMp4);
  const channelName = typeof video.channel?.name === 'string' ? video.channel.name : '';
  const channelHost = typeof video.channel?.host === 'string' ? video.channel.host : host;
  return {
    title,
    playable: url
      ? {
          kind: 'native',
          key,
          url,
          title,
          ...(httpsOn(video.previewPath ?? video.thumbnailPath, host)
            ? { poster: httpsOn(video.previewPath ?? video.thumbnailPath, host)! }
            : {}),
          ...(typeof video.duration === 'number' && video.duration > 0
            ? { duration: video.duration }
            : {}),
        }
      : null,
    channel:
      /^[\w.-]+$/.test(channelName) && /^[\w.-]+\.[a-z]{2,}$/i.test(channelHost)
        ? `${channelName}@${channelHost.toLowerCase()}`
        : null,
    channelName:
      typeof video.channel?.displayName === 'string' ? video.channel.displayName : channelName,
    sensitive: video.nsfw === true,
    live: video.isLive === true,
  };
}

/**
 * Reads one PeerTube video from its own instance's public API, anonymously.
 * Native routes this through its public reader (an `/api/` path); browsers
 * fetch it directly, as PeerTube allows any origin.
 */
@Injectable({ providedIn: 'root' })
export class PeerTubeVideos {
  private readonly http = inject(HttpClient);
  private readonly native = !!inject(PLATFORM_FEED_READ);

  async get(source: VideoSource): Promise<PeerTubeVideo> {
    const ref = source.peertube;
    if (source.kind !== 'peertube' || !ref) throw new Error('Not a PeerTube video');
    const video = await firstValueFrom(
      this.http
        .get<ApiVideo>(`https://${ref.host}/api/v1/videos/${encodeURIComponent(ref.id)}`, {
          context: externalFetch(),
          withCredentials: false,
        })
        .pipe(timeout(15_000)),
    );
    return peertubeVideo(video, ref.host, this.native, source.key);
  }
}
