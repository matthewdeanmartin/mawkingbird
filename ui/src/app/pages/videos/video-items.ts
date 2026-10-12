import { ParsedFeed } from '../../providers/rss/rss-parser';
import { VideoSubscription } from '../../providers/videos/video-subscriptions';
import { VideoSource, youtubeSource } from '../../video-player/media-source';

export interface VideoItem {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string | null;
  source: VideoSource;
}

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
