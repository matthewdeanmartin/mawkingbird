import { describe, expect, it } from 'vitest';
import {
  commentAccount,
  feedToStatuses,
  itemToStatus,
  feedAccount,
  sanitizeFeedHtml,
} from './rss-adapter';
import { ParsedFeed, ParsedItem } from './rss-parser';

const FETCHED_AT = '2026-07-14T12:00:00.000Z';

function makeItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    guid: 'g1',
    title: 'A post title',
    link: 'https://blog.example.com/post',
    publishedAt: '2026-07-13T10:00:00.000Z',
    html: '<p>Body text</p>',
    isFullContent: true,
    enclosures: [],
    categories: [],
    author: null,
    commentsFeedUrl: null,
    commentCount: null,
    ...overrides,
  };
}

function makeFeed(items: ParsedItem[]): ParsedFeed {
  return { title: 'My Blog', link: 'https://blog.example.com', items };
}

describe('sanitizeFeedHtml', () => {
  it('drops scripts outright and unwraps unknown block elements', () => {
    const { html } = sanitizeFeedHtml(
      '<div class="wrap"><script>alert(1)</script><p onclick="x()">keep <em>me</em></p></div>',
    );
    expect(html).toBe('<p>keep <em>me</em></p>');
  });

  it('extracts images into the images list and out of the markup', () => {
    const { html, images } = sanitizeFeedHtml(
      '<p>text <img src="https://x.example/a.png"> more</p><img src="javascript:evil()">',
    );
    expect(images).toEqual(['https://x.example/a.png']);
    expect(html).not.toContain('<img');
    expect(html).toContain('text');
  });

  it('keeps only http(s) hrefs on links and strips every other attribute', () => {
    const { html } = sanitizeFeedHtml(
      '<a href="https://ok.example" target="_top" onmouseover="x()">ok</a>' +
        '<a href="javascript:evil()">bad</a>',
    );
    expect(html).toBe('<a href="https://ok.example">ok</a><a>bad</a>');
  });
});

describe('itemToStatus', () => {
  const account = feedAccount('https://blog.example.com/feed.xml', makeFeed([]));

  it('produces a Mastodon-shaped, rss-tagged, namespaced status', () => {
    const status = itemToStatus(
      makeItem(),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(status.provider).toBe('rss');
    expect(status.id).toBe('rss:https://blog.example.com/feed.xml::g1');
    expect(status.created_at).toBe('2026-07-13T10:00:00.000Z');
    expect(status.url).toBe('https://blog.example.com/post');
    expect(status.visibility).toBe('public');
    expect(status.account.display_name).toBe('My Blog');
    expect(status.account.acct).toBe('blog.example.com');
  });

  /**
   * Comment parity: an RSS item with a discussion should say so the way a post
   * says it has replies. This used to be a hard `0`, which rendered "0 replies"
   * on an item with forty of them.
   */
  describe('replies_count', () => {
    const feedUrl = 'https://blog.example.com/feed.xml';

    it('carries the publisher’s declared comment count', () => {
      const status = itemToStatus(makeItem({ commentCount: 47 }), feedUrl, account, FETCHED_AT);

      expect(status.replies_count).toBe(47);
    });

    it('is 0, not null, when the feed declares no count', () => {
      // `Status.replies_count` is a number and cards render it directly; a null
      // would reach the template as "null replies".
      const status = itemToStatus(makeItem({ commentCount: null }), feedUrl, account, FETCHED_AT);

      expect(status.replies_count).toBe(0);
    });

    it('keeps a declared count that disagrees with the comments actually served', () => {
      // The rule this test exists to document: the count is the publisher's
      // *claim*, not a tally of the comment feed. A comment moderated after the
      // count was cached, or a comment feed truncated to the latest ten, makes
      // the two numbers differ legitimately. Neither is wrong, and the mismatch
      // must not be "corrected" by recounting the thread.
      const status = itemToStatus(makeItem({ commentCount: 47 }), feedUrl, account, FETCHED_AT);

      expect(status.replies_count).toBe(47);
    });

    it('gives a comment 0 even if its own entry declares a count', () => {
      // A comment feed states no reply count for its own entries, and nothing
      // renders a reply count on a comment anyway.
      const comment = itemToStatus(makeItem({ commentCount: 9 }), feedUrl, account, FETCHED_AT, {
        inReplyToId: 'rss:https://blog.example.com/feed.xml::parent',
        isComment: true,
      });

      expect(comment.replies_count).toBe(0);
    });
  });

  it('carries the parsed item’s full-content flag onto the status', () => {
    const full = itemToStatus(
      makeItem({ isFullContent: true }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(full.rssFullContent).toBe(true);

    const teaser = itemToStatus(
      makeItem({ isFullContent: false }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(teaser.rssFullContent).toBe(false);
  });

  it('leads with the bold title when the body does not start with it', () => {
    const status = itemToStatus(
      makeItem(),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(status.content).toBe('<p><strong>A post title</strong></p><p>Body text</p>');
  });

  it('skips the title when the body already starts with it (microblog feeds)', () => {
    const status = itemToStatus(
      makeItem({ title: 'Body text', html: '<p>Body text and more</p>' }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(status.content).toBe('<p>Body text and more</p>');
  });

  it('turns inline and enclosure images into media attachments, deduped', () => {
    const status = itemToStatus(
      makeItem({
        html: '<p>pic: <img src="https://x.example/a.png"></p>',
        enclosures: [
          { url: 'https://x.example/a.png', type: 'image/png' },
          { url: 'https://x.example/b.jpg', type: 'image/jpeg' },
          { url: 'https://x.example/audio.mp3', type: 'audio/mpeg' },
        ],
      }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(status.media_attachments.map((m) => m.url)).toEqual([
      'https://x.example/a.png',
      'https://x.example/b.jpg',
    ]);
    expect(status.media_attachments[0].type).toBe('image');
  });

  it('appends feed categories as a trailing tag line', () => {
    const status = itemToStatus(
      makeItem({ categories: ['Machine Learning', 'News'] }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(status.content).toContain('class="rss-categories"');
    // Whitespace is squeezed out so the tag stays a single #token.
    expect(status.content).toContain('#MachineLearning');
    expect(status.content).toContain('#News');
  });

  it('adapts a comment item as a reply: namespaced id, in_reply_to_id, no title heading', () => {
    const parentId = 'rss:https://blog.example.com/feed.xml::g1';
    const status = itemToStatus(
      makeItem({ guid: 'c1', title: 'Comment on Post by Dana', html: '<p>Nice write-up!</p>' }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
      { inReplyToId: parentId, isComment: true },
    );
    expect(status.in_reply_to_id).toBe(parentId);
    expect(status.id).toBe(`${parentId}::comment::c1`);
    // Comments don't get the synthetic bold-title heading.
    expect(status.content).toBe('<p>Nice write-up!</p>');
  });

  it('builds a per-author account for authored comments, else the channel account', () => {
    const channel = feedAccount('https://blog.example.com/post/feed', makeFeed([]));
    const authored = commentAccount(
      makeItem({ author: 'Dana' }),
      'https://blog.example.com/post/feed',
      channel,
    );
    expect(authored.display_name).toBe('Dana');
    expect(authored.id).toContain('::author::Dana');

    const anon = commentAccount(
      makeItem({ author: null }),
      'https://blog.example.com/post/feed',
      channel,
    );
    expect(anon).toBe(channel);
  });

  it('falls back to fetch time for undated items', () => {
    const status = itemToStatus(
      makeItem({ publishedAt: null }),
      'https://blog.example.com/feed.xml',
      account,
      FETCHED_AT,
    );
    expect(status.created_at).toBe(FETCHED_AT);
  });
});

describe('feedToStatuses', () => {
  it('adapts every item, newest first', () => {
    const feed = makeFeed([
      makeItem({ guid: 'old', publishedAt: '2026-07-01T00:00:00.000Z' }),
      makeItem({ guid: 'new', publishedAt: '2026-07-13T00:00:00.000Z' }),
    ]);
    const statuses = feedToStatuses('https://blog.example.com/feed.xml', feed, FETCHED_AT);
    expect(statuses.map((s) => s.id)).toEqual([
      'rss:https://blog.example.com/feed.xml::new',
      'rss:https://blog.example.com/feed.xml::old',
    ]);
  });
});
