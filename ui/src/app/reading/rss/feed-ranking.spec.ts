import { describe, expect, it } from 'vitest';
import { collapseFormats, FeedCandidate, rankFeeds } from './feed-ranking';

const feed = (url: string, title = 'Feed'): FeedCandidate => ({ url, title });

describe('rankFeeds', () => {
  it('puts the main feed ahead of the comments feed', () => {
    // The WordPress default, and the case that matters most: all three of these
    // are valid rel=alternate declarations on one page.
    const ranked = rankFeeds([
      feed('https://blog.test/comments/feed/', 'Comments for The Blog'),
      feed('https://blog.test/feed/', 'The Blog'),
    ]);
    expect(ranked[0].url).toBe('https://blog.test/feed/');
  });

  it('demotes a comments feed identified only by its title', () => {
    const ranked = rankFeeds([
      feed('https://blog.test/f2.xml', 'The Blog — Comments'),
      feed('https://blog.test/f1.xml', 'The Blog'),
    ]);
    expect(ranked[0].title).toBe('The Blog');
  });

  it('prefers the whole site over one category', () => {
    const ranked = rankFeeds([
      feed('https://blog.test/category/rust/feed/', 'Rust'),
      feed('https://blog.test/feed/', 'The Blog'),
    ]);
    expect(ranked[0].url).toBe('https://blog.test/feed/');
  });

  it('prefers the shorter path when nothing else discriminates', () => {
    const ranked = rankFeeds([
      feed('https://blog.test/blog/tech/feed/'),
      feed('https://blog.test/feed/'),
    ]);
    expect(ranked[0].url).toBe('https://blog.test/feed/');
  });

  it('prefers a feed titled like the page', () => {
    const ranked = rankFeeds(
      [
        feed('https://blog.test/a/feed.xml', 'Random Other Thing'),
        feed('https://blog.test/b/feed.xml', 'Widget Weekly'),
      ],
      'Widget Weekly — a newsletter',
    );
    expect(ranked[0].title).toBe('Widget Weekly');
  });

  it('does not let the title nudge outweigh a comments demotion', () => {
    // "Comments for X" contains the page title, so rule 4 argues for it. Rule 1
    // must still win — otherwise a well-titled comments feed becomes the pick.
    const ranked = rankFeeds(
      [
        feed('https://blog.test/comments/feed/', 'Comments for Widget Weekly'),
        feed('https://blog.test/feed/', 'Widget Weekly'),
      ],
      'Widget Weekly',
    );
    expect(ranked[0].url).toBe('https://blog.test/feed/');
  });

  it('is deterministic on a tie', () => {
    const candidates = [
      feed('https://blog.test/b.xml'),
      feed('https://blog.test/a.xml'),
      feed('https://blog.test/c.xml'),
    ];
    const once = rankFeeds(candidates).map((f) => f.url);
    // Same input, same order — including from a different starting permutation.
    expect(rankFeeds([...candidates].reverse()).map((f) => f.url)).toEqual(once);
  });

  it('does not mutate its input', () => {
    const candidates = [feed('https://blog.test/z.xml'), feed('https://blog.test/a.xml')];
    const before = candidates.map((f) => f.url);
    rankFeeds(candidates);
    expect(candidates.map((f) => f.url)).toEqual(before);
  });

  it('handles the ordinary single-candidate and empty cases', () => {
    expect(rankFeeds([])).toEqual([]);
    expect(rankFeeds([feed('https://blog.test/feed/')])).toHaveLength(1);
  });

  it('sorts an unparseable url last instead of throwing', () => {
    const ranked = rankFeeds([feed('not a url'), feed('https://blog.test/feed/')]);
    expect(ranked[0].url).toBe('https://blog.test/feed/');
  });
});

/** A candidate with an explicit declared type, which is the publisher's own word. */
const typed = (url: string, type: string, title = 'Feed'): FeedCandidate => ({ url, title, type });

describe('collapseFormats', () => {
  it('collapses one feed published as both RSS and Atom, keeping Atom', () => {
    // The boss's case: "if they're the same thing, but 1 is atom, one is rss,
    // then we should just pick the more expressive one." Atom wins because the
    // app actually reads what it guarantees — stable ids, real timestamps, and
    // content distinct from summary.
    const out = collapseFormats([
      typed('https://blog.test/feed/', 'application/rss+xml'),
      typed('https://blog.test/feed/atom/', 'application/atom+xml'),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://blog.test/feed/atom/');
  });

  it('collapses the extension form too', () => {
    const out = collapseFormats([
      typed('https://blog.test/index.rss', 'application/rss+xml'),
      typed('https://blog.test/index.atom', 'application/atom+xml'),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://blog.test/index.atom');
  });

  it('collapses the query-parameter form, keeping other params intact', () => {
    const out = collapseFormats([
      typed('https://blog.test/?feed=rss2', 'application/rss+xml'),
      typed('https://blog.test/?feed=atom', 'application/atom+xml'),
    ]);

    expect(out).toHaveLength(1);
  });

  it('never collapses genuinely different sections', () => {
    // "If the feeds offered on a page are like, politics, books or comics, then
    // the user needs to pick." Different content is a real choice and must
    // survive: silently picking one here decides what somebody reads.
    const out = collapseFormats([
      feed('https://news.test/politics/feed/', 'Politics'),
      feed('https://news.test/books/feed/', 'Books'),
      feed('https://news.test/comics/feed/', 'Comics'),
    ]);

    expect(out).toHaveLength(3);
    expect(out.map((f) => f.title)).toEqual(['Politics', 'Books', 'Comics']);
  });

  it('keeps a query that names a section rather than a format', () => {
    // `?cat=politics` is content, `?feed=atom` is serialisation. Only the
    // second is dropped when deciding whether two URLs are the same feed.
    const out = collapseFormats([
      feed('https://news.test/?cat=politics'),
      feed('https://news.test/?cat=books'),
    ]);

    expect(out).toHaveLength(2);
  });

  it('turns three sections in two formats into a clean three-way choice', () => {
    // The case that makes collapsing worth doing: six declarations, but only
    // three actual decisions. Presenting six would bury the real question.
    const out = collapseFormats([
      typed('https://news.test/politics/feed/', 'application/rss+xml', 'Politics'),
      typed('https://news.test/politics/feed/atom/', 'application/atom+xml', 'Politics'),
      typed('https://news.test/books/feed/', 'application/rss+xml', 'Books'),
      typed('https://news.test/books/feed/atom/', 'application/atom+xml', 'Books'),
      typed('https://news.test/comics/feed/', 'application/rss+xml', 'Comics'),
      typed('https://news.test/comics/feed/atom/', 'application/atom+xml', 'Comics'),
    ]);

    expect(out).toHaveLength(3);
    expect(out.map((f) => f.title)).toEqual(['Politics', 'Books', 'Comics']);
    // Each survivor is the expressive one.
    expect(out.every((f) => f.url.includes('atom'))).toBe(true);
  });

  it('preserves the ranking order it was given', () => {
    // Collapsing decides which *format* survives, never which content ranks
    // first — that is rankFeeds' job and this must not undo it.
    const ranked = rankFeeds([
      feed('https://blog.test/comments/feed/', 'Comments'),
      feed('https://blog.test/feed/', 'Main'),
    ]);
    const out = collapseFormats(ranked);

    expect(out[0].title).toBe('Main');
  });

  it('falls back to the URL when no type was declared', () => {
    // Plenty of pages declare every feed as application/rss+xml regardless of
    // what they serve, so the URL is the more honest signal when type is absent.
    const out = collapseFormats([
      feed('https://blog.test/feed.rss'),
      feed('https://blog.test/feed.atom'),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://blog.test/feed.atom');
  });

  it('keeps an unparseable URL rather than dropping it', () => {
    const out = collapseFormats([feed('not-a-url'), feed('https://blog.test/feed/')]);

    expect(out).toHaveLength(2);
  });
});
