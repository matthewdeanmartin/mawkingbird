import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { articleTarget, outboundLinks } from './article-target';

function status(content: string, extra: Partial<Status> = {}): Status {
  return { content, url: null, provider: undefined, ...extra } as Status;
}

describe('outboundLinks', () => {
  it('finds an ordinary outbound link', () => {
    expect(outboundLinks('<p>see <a href="https://blog.example/post">this</a></p>')).toEqual([
      'https://blog.example/post',
    ]);
  });

  it('ignores mentions and hashtags', () => {
    const html =
      '<p><a href="https://mastodon.social/@someone" class="u-url mention">@someone</a> ' +
      '<a href="https://mastodon.social/tags/rust" class="hashtag">#rust</a></p>';
    expect(outboundLinks(html)).toEqual([]);
  });

  it('ignores links back to social hosts', () => {
    expect(outboundLinks('<a href="https://x.com/someone/status/1">tweet</a>')).toEqual([]);
    expect(outboundLinks('<a href="https://bsky.app/profile/x">post</a>')).toEqual([]);
  });

  it('does not hide an unknown host merely because its article path starts with an at-sign', () => {
    // Production regression: this exact shape made the whole fetch section
    // disappear on a post whose one visible link was otherwise valid.
    const url = 'https://famichiki.jp/@rmcauley/117133691283455910';
    expect(outboundLinks(`<a href="${url}">article</a>`)).toEqual([url]);
  });

  it('deduplicates a repeated link', () => {
    const html = '<a href="https://e.com/a">one</a><a href="https://e.com/a">two</a>';
    expect(outboundLinks(html)).toHaveLength(1);
  });

  it('ignores non-http schemes', () => {
    expect(outboundLinks('<a href="javascript:alert(1)">x</a>')).toEqual([]);
    expect(outboundLinks('<a href="mailto:a@b.c">mail</a>')).toEqual([]);
  });
});

describe('articleTarget', () => {
  it('uses an RSS item’s own URL when the feed only gave a teaser', () => {
    // The item *is* the article, and the feed did not already hand over the
    // full text — so there is genuinely more to fetch.
    const post = status('<p>summary</p>', {
      provider: 'rss',
      url: 'https://blog.example/post',
      rssFullContent: false,
    });
    expect(articleTarget(post)).toBe('https://blog.example/post');
  });

  it('refuses to offer expansion for an RSS item that already has the full body', () => {
    // Re-fetching the same URL the feed already gave us in full would spend
    // quota and a request to redownload text already on screen.
    const post = status('<p>the whole piece, already here</p>', {
      provider: 'rss',
      url: 'https://blog.example/post',
      rssFullContent: true,
    });
    expect(articleTarget(post)).toBeNull();
  });

  it('takes the single outbound link from an ordinary post', () => {
    expect(articleTarget(status('<p>read <a href="https://e.com/a">this</a></p>'))).toBe(
      'https://e.com/a',
    );
  });

  it('refuses to guess between several links', () => {
    // Picking the first would silently expand a footnote while the reader
    // watched — and it would spend their quota doing it.
    const html = '<a href="https://e.com/a">a</a> <a href="https://e.com/b">b</a>';
    expect(articleTarget(status(html))).toBeNull();
  });

  it('returns null when there is no link at all', () => {
    expect(articleTarget(status('<p>just words</p>'))).toBeNull();
  });
});
