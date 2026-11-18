import { describe, expect, it } from 'vitest';
import { parseFeed } from '../../../lib/rss/rss-parser';
import { Status } from '../../platform/api/models';
import {
  feedVideos,
  mergeFollowedPosts,
  newestVideos,
  sortVideos,
  channelHashtag,
  videoResponseText,
} from './video-items';

describe('Video feed chronology', () => {
  it('builds an editable response with a channel hashtag, title and original link', () => {
    expect(channelHashtag('Technology Connections')).toBe('#TechnologyConnections');
    expect(channelHashtag('TechnologyConnections')).toBe('#TechnologyConnections');
    expect(channelHashtag('Café & Science!')).toBe('#CaféScience');
    expect(channelHashtag('🎬')).toBe('');
    const source = {
      kind: 'youtube' as const,
      title: 'Why lamps work',
      key: 'youtube:0KoeY54M5VA',
      url: 'https://www.youtube.com/watch?v=0KoeY54M5VA',
      videoId: '0KoeY54M5VA',
    };
    expect(
      videoResponseText({
        title: 'Why lamps work',
        channelTitle: 'Technology Connections',
        source,
      }).split(String.fromCharCode(10)),
    ).toEqual(['Why lamps work', source.url, '#TechnologyConnections']);
  });

  it('reads YouTube Atom links, ignores unsupported links and merges newest first without duplicates', () => {
    const feed = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
      <entry><id>older</id><title>Older</title><link href="https://youtube.com/watch?v=0KoeY54M5VA"/><published>2026-01-01T10:00:00Z</published></entry>
      <entry><id>newer</id><title>Newer</title><link href="https://youtube.com/shorts/uMhdcq2rqUU"/><published>2026-01-02T10:00:00Z</published></entry>
      <entry><id>bad</id><title>Not YouTube</title><link href="https://evil.test/watch?v=0KoeY54M5VA"/></entry>
    </feed>`);
    const items = feedVideos(feed, {
      id: 'UCy0tKL1T7wFoYcxCe0xjN6Q',
      title: 'Example',
      enabled: true,
    });
    expect(items).toHaveLength(2);
    expect(newestVideos([...items, items[0]]).map((item) => item.title)).toEqual([
      'Newer',
      'Older',
    ]);
    expect(sortVideos(items, 'oldest').map((item) => item.title)).toEqual(['Older', 'Newer']);
    expect(sortVideos(items, 'title').map((item) => item.title)).toEqual(['Newer', 'Older']);
    expect(
      sortVideos(
        [
          { ...items[0], channelTitle: 'Zebra' },
          { ...items[1], channelTitle: 'Alpha' },
        ],
        'channel',
      ).map((item) => item.channelTitle),
    ).toEqual(['Alpha', 'Zebra']);
    expect(items.map((item) => item.title)).toEqual(['Older', 'Newer']);
    expect(items[1].source.videoId).toBe('uMhdcq2rqUU');
  });
});

describe('mergeFollowedPosts', () => {
  const channel = { id: 'UCy0tKL1T7wFoYcxCe0xjN6Q', title: 'TC', enabled: true };
  const feed = parseFeed(
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>TC</title>` +
      `<entry><title>Lamps</title><link href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/><published>2026-11-01T00:00:00Z</published></entry>` +
      `<entry><title>A short</title><link href="https://www.youtube.com/shorts/sssssssssss"/><published>2026-11-02T00:00:00Z</published></entry></feed>`,
  );
  const post = (id: string, videoId: string, at: string, extra: Partial<Status> = {}): Status =>
    ({
      id,
      created_at: at,
      content: '',
      media_attachments: [],
      account: { id: `a${id}`, username: `u${id}`, display_name: `User ${id}` },
      card: {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: `Video ${videoId}`,
        author_name: 'Someone',
        image: null,
      },
      ...extra,
    }) as unknown as Status;

  it('marks Shorts from the feed', () => {
    const items = feedVideos(feed, channel);
    expect(items.map((item) => [item.title, !!item.short])).toEqual([
      ['Lamps', false],
      ['A short', true],
    ]);
  });

  it('adds who shared an upload, and posts about other videos as their own items', () => {
    const items = feedVideos(feed, channel);
    const merged = mergeFollowedPosts(items, [
      post('1', 'aaaaaaaaaaa', '2026-11-03T00:00:00Z'),
      post('2', 'aaaaaaaaaaa', '2026-11-04T00:00:00Z'),
      post('3', 'bbbbbbbbbbb', '2026-11-05T00:00:00Z'),
      { ...post('4', 'zzzzzzzzzzz', '2026-11-06T00:00:00Z'), card: null } as Status,
    ]);
    const lamps = merged.find((item) => item.title === 'Lamps')!;
    expect(lamps.sharedBy!.map((p) => p.id)).toEqual(['2', '1']);
    const other = merged.find((item) => item.source.videoId === 'bbbbbbbbbbb')!;
    expect(other).toMatchObject({
      channelId: '',
      channelTitle: 'Someone',
      title: 'Video bbbbbbbbbbb',
      publishedAt: '2026-11-05T00:00:00Z',
    });
    expect(merged).toHaveLength(3);
    // The input list is not modified.
    expect(items[0].sharedBy).toBeUndefined();
  });

  it('reads a boost as the booster sharing the boosted video', () => {
    const boost = {
      ...post('9', 'x', '2026-11-07T00:00:00Z'),
      card: null,
      reblog: post('8', 'ccccccccccc', '2026-11-06T00:00:00Z'),
    } as Status;
    const [item] = mergeFollowedPosts([], [boost]);
    expect(item.source.videoId).toBe('ccccccccccc');
    expect(item.sharedBy![0].id).toBe('9');
  });
});
