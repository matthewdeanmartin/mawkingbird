import { describe, expect, it } from 'vitest';
import { parseFeed } from '../../providers/rss/rss-parser';
import { feedVideos, newestVideos } from './video-items';

describe('Video feed chronology', () => {
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
    expect(items[1].source.videoId).toBe('uMhdcq2rqUU');
  });
});
