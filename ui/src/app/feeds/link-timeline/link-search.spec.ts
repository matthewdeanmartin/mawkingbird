import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { post } from '../../testing/forum-fixtures';
import { bareLink, linkNeedle, mentionsLink, searchPostsForLink } from './link-search';

describe('bareLink', () => {
  it('drops scheme, www., trailing slash, fragment and tracking parameters', () => {
    expect(bareLink('https://www.news.example/a/b/?utm_source=x&fbclid=1#top')).toBe(
      'news.example/a/b',
    );
  });

  it('keeps a query that names the page', () => {
    expect(bareLink('https://forum.example/thread?id=5&utm_medium=social')).toBe(
      'forum.example/thread?id=5',
    );
  });

  it('is empty for something that is not a URL', () => {
    expect(bareLink('not a url')).toBe('');
  });
});

describe('linkNeedle', () => {
  it('uses the video id for any YouTube link shape', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(linkNeedle(url)).toBe('dQw4w9WgXcQ');
    }
  });

  it('uses the bare link otherwise', () => {
    expect(linkNeedle('https://news.example/story')).toBe('news.example/story');
  });
});

describe('mentionsLink', () => {
  it('finds the link in post text, HTML-escaped or not, or in the preview card', () => {
    const inText = post('1', 'a', {
      content: '<p><a href="https://forum.example/thread?id=5&amp;page=2">t</a></p>',
    });
    expect(mentionsLink(inText, 'forum.example/thread?id=5&page=2')).toBe(true);
    const inCard = post('2', 'a', { card: { url: 'https://news.example/story' } as never });
    expect(mentionsLink(inCard, 'news.example/story')).toBe(true);
  });

  it('reads a boost as the boosted post', () => {
    const boosted = post('3', 'b', { content: '<p>https://news.example/story</p>' });
    expect(mentionsLink(post('4', 'c', { reblog: boosted }), 'news.example/story')).toBe(true);
  });

  it('rejects a post that only shares words with the link', () => {
    expect(
      mentionsLink(post('5', 'a', { content: '<p>news about a story</p>' }), 'news.example/story'),
    ).toBe(false);
    expect(mentionsLink(post('6', 'a'), '')).toBe(false);
  });
});

describe('searchPostsForLink', () => {
  const results = (statuses: unknown[]) => of({ accounts: [], statuses, hashtags: [] });

  it('asks the home server for from:me searches and keeps only posts that link the page', async () => {
    const search = vi.fn(() =>
      results([
        post('1', 'me', { content: '<p>https://youtu.be/dQw4w9WgXcQ</p>' }),
        post('2', 'me', { content: '<p>another video</p>' }),
      ]),
    );
    const found = await new Promise((resolve) =>
      searchPostsForLink(
        { search } as unknown as Api,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        {
          prefix: 'from:me ',
          limit: 5,
        },
      ).subscribe(resolve),
    );
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(
      'from:me https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'statuses',
      { limit: 5, homeServer: true },
    );
    expect((found as { id: string }[]).map((s) => s.id)).toEqual(['1']);
  });

  it('tries the needle second only when the full URL found nothing', async () => {
    const search = vi
      .fn()
      .mockReturnValueOnce(results([]))
      .mockReturnValueOnce(results([post('3', 'x', { content: '<p>youtu.be/dQw4w9WgXcQ</p>' })]));
    const found = await new Promise((resolve) =>
      searchPostsForLink({ search } as unknown as Api, 'https://youtu.be/dQw4w9WgXcQ').subscribe(
        resolve,
      ),
    );
    expect(search.mock.calls.map((call) => call[0])).toEqual([
      'https://youtu.be/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ]);
    expect(search.mock.calls[0][2]).toEqual({ limit: 20, homeServer: false });
    expect((found as { id: string }[]).map((s) => s.id)).toEqual(['3']);
  });
});
