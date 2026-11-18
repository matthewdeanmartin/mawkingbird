import { ParsedFeed } from '../../../lib/rss/rss-parser';
import { VideoSubscription } from './video-subscriptions';
import { statusVideo, VideoSource, youtubeSource } from '../video-player/media-source';
import { Status } from '../../platform/api/models';

export interface VideoItem {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string | null;
  source: VideoSource;
  /** A YouTube Short (`/shorts/` link); hidden unless the reader asks for them. */
  short?: boolean;
  /** Posts by people you follow that share this video, newest first. */
  sharedBy?: Status[];
}

const isShortLink = (url: string | null | undefined): boolean =>
  !!url && /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\//i.test(url);

export function feedVideos(feed: ParsedFeed, channel: VideoSubscription): VideoItem[] {
  return feed.items.flatMap((item) => {
    const source = item.link ? youtubeSource(item.link) : null;
    if (!source) return [];
    return [
      {
        id: source.key,
        channelId: channel.id,
        channelTitle: feed.title || channel.title,
        title: item.title,
        publishedAt: item.publishedAt,
        short: isShortLink(item.link),
        source: {
          ...source,
          title: item.title,
          poster: `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`,
        },
      },
    ];
  });
}

export function newestVideos(items: VideoItem[]): VideoItem[] {
  const sorted = [...items].sort(
    (a, b) =>
      (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0) ||
      a.id.localeCompare(b.id),
  );
  const unique = new Map<string, VideoItem>();
  for (const item of sorted) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()];
}

/**
 * Fold posts from people you follow into the subscription feed
 * (spec/youtube-client.md, S4). A post about an upload you already have joins
 * that upload's `sharedBy`; a post about any other YouTube video becomes an
 * item of its own, dated by the post. Boosts count as the booster sharing it.
 */
export function mergeFollowedPosts(items: VideoItem[], posts: Status[]): VideoItem[] {
  const byVideo = new Map<string, VideoItem>();
  for (const item of items) {
    if (item.source.videoId)
      byVideo.set(item.source.videoId, { ...item, sharedBy: [...(item.sharedBy ?? [])] });
  }
  const merged = items.map((item) =>
    item.source.videoId ? byVideo.get(item.source.videoId)! : item,
  );
  for (const status of posts) {
    const post = status.reblog ?? status;
    const source = statusVideo(post);
    if (source?.kind !== 'youtube' || !source.videoId) continue;
    const held = byVideo.get(source.videoId);
    if (held) {
      if (!held.sharedBy!.some((shared) => shared.id === status.id)) held.sharedBy!.push(status);
      continue;
    }
    const added: VideoItem = {
      id: source.key,
      channelId: '',
      channelTitle: post.card?.author_name ?? '',
      title: post.card?.title || source.title,
      publishedAt: status.created_at,
      short: isShortLink(post.card?.url) || isShortLink(source.url),
      source: {
        ...source,
        poster: source.poster ?? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`,
      },
      sharedBy: [status],
    };
    byVideo.set(source.videoId, added);
    merged.push(added);
  }
  for (const item of byVideo.values())
    item.sharedBy!.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return merged;
}

export type VideoSort = 'newest' | 'oldest' | 'title' | 'channel';

export function sortVideos(items: VideoItem[], order: VideoSort): VideoItem[] {
  return [...items].sort((a, b) => {
    const date = (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0);
    const primary =
      order === 'title'
        ? a.title.localeCompare(b.title)
        : order === 'channel'
          ? a.channelTitle.localeCompare(b.channelTitle)
          : order === 'oldest'
            ? -date
            : date;
    return primary || date || a.id.localeCompare(b.id);
  });
}

/** Preserve existing inner capitals while joining a channel's words as a hashtag. */
export function channelHashtag(title: string): string {
  const words = title.normalize('NFKC').match(/[\p{L}\p{M}\p{N}_]+/gu) ?? [];
  const tag = words
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join('')
    .slice(0, 100);
  return tag ? '#' + tag : '';
}

export function videoResponseText(
  item: Pick<VideoItem, 'title' | 'channelTitle' | 'source'>,
): string {
  return [item.title, item.source.url, channelHashtag(item.channelTitle)]
    .filter(Boolean)
    .join('\n');
}
