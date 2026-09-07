import { TestBed } from '@angular/core/testing';
import { EMPTY, firstValueFrom, NEVER, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { ParsedFeed } from './rss-parser';
import { RssFetch } from './rss-fetch';
import { PER_FEED_ITEM_CAP, RssProvider } from './rss-provider';
import { RssSubscriptions } from './rss-subscriptions';

function feed(title: string, dates: string[]): ParsedFeed {
  return {
    title,
    link: null,
    items: dates.map((d, i) => ({
      guid: `${title}-${i}`,
      title: `${title} item ${i}`,
      link: `https://x.example/${title}/${i}`,
      publishedAt: d,
      html: '<p>x</p>',
      isFullContent: true,
      enclosures: [],
      categories: [],
      author: null,
      commentsFeedUrl: null,
      commentCount: null,
    })),
  };
}

/**
 * Dates spaced an hour apart, newest first — comfortably past
 * `qualifiesForHome`'s frequency floor (rss-home-eligibility.ts) so a test
 * fixture built with this reads as "chatty" without having to restate the
 * threshold in every test. Most of this file's fixtures use short `<p>x</p>`
 * bodies already, which is the other half of qualifying.
 */
function hourlyDatesFrom(latest: string, count: number): string[] {
  const start = Date.parse(latest);
  return Array.from({ length: count }, (_, i) =>
    new Date(start - i * 60 * 60 * 1000).toISOString(),
  );
}

describe('RssProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setUp(fetchImpl: (url: string) => unknown) {
    TestBed.configureTestingModule({
      providers: [{ provide: RssFetch, useValue: { fetchFeed: vi.fn(fetchImpl) } }],
    });
    return TestBed.inject(RssProvider);
  }

  it('is linked only when at least one feed is enabled', () => {
    const provider = setUp(() => of(feed('a', [])));
    const subs = TestBed.inject(RssSubscriptions);
    expect(provider.linked()).toBe(false);

    subs.add('https://a.example/feed', 'A');
    expect(provider.linked()).toBe(true);

    subs.setEnabled('https://a.example/feed', false);
    expect(provider.linked()).toBe(false);
  });

  it('returns items of all enabled feeds newest-first, then exhausts', async () => {
    const provider = setUp((url) =>
      of(
        url.includes('a.example')
          ? feed('a', hourlyDatesFrom('2026-07-14T00:00:00.000Z', 2))
          : feed('b', hourlyDatesFrom('2026-07-12T00:00:00.000Z', 2)),
      ),
    );
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://a.example/feed', 'A');
    subs.add('https://b.example/feed', 'B');

    provider.reset();
    const page = await firstValueFrom(provider.fetchPage());
    expect(page.map((s) => s.created_at)).toEqual([
      '2026-07-14T00:00:00.000Z',
      '2026-07-13T23:00:00.000Z',
      '2026-07-12T00:00:00.000Z',
      '2026-07-11T23:00:00.000Z',
    ]);
    expect(page.every((s) => s.provider === 'rss')).toBe(true);

    expect(await firstValueFrom(provider.fetchPage())).toEqual([]);
  });

  it('excludes a feed that reads like an article site, not a timeline', async () => {
    // Two items four days apart: infrequent, so it stays /rss-only. Real
    // exclusion behaviour (long items too) is covered in rss-home-eligibility.spec.ts.
    const provider = setUp(() =>
      of(feed('news', ['2026-07-10T00:00:00.000Z', '2026-07-14T00:00:00.000Z'])),
    );
    TestBed.inject(RssSubscriptions).add('https://news.example/feed', 'News');

    provider.reset();
    expect(await firstValueFrom(provider.fetchPage())).toEqual([]);
  });

  it('tolerates a failing feed and records the error', async () => {
    const provider = setUp((url) =>
      url.includes('bad')
        ? throwError(() => new Error('no CORS for you'))
        : of(feed('good', hourlyDatesFrom('2026-07-12T00:00:00.000Z', 2))),
    );
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://good.example/feed', 'Good');
    subs.add('https://bad.example/feed', 'Bad');

    provider.reset();
    const page = await firstValueFrom(provider.fetchPage());
    expect(page).toHaveLength(2);
    expect(provider.errors()).toEqual(['Bad: no CORS for you']);
  });

  it('getFeed returns the feed account plus every item, newest first (unfiltered by Home eligibility)', async () => {
    const provider = setUp(() =>
      of(feed('a', ['2026-07-10T00:00:00.000Z', '2026-07-14T00:00:00.000Z'])),
    );
    const { account, statuses } = await firstValueFrom(provider.getFeed('https://a.example/feed'));
    expect(account.display_name).toBe('a');
    expect(statuses.map((s) => s.created_at)).toEqual([
      '2026-07-14T00:00:00.000Z',
      '2026-07-10T00:00:00.000Z',
    ]);
  });

  it('getFeedItem resolves one item by guid and surfaces its comment info', async () => {
    const provider = setUp(() =>
      of({
        title: 'a',
        link: null,
        items: [
          {
            guid: 'a-0',
            title: 'Post',
            link: 'https://x.example/a/0',
            publishedAt: '2026-07-14T00:00:00.000Z',
            html: '<p>body</p>',
            isFullContent: true,
            enclosures: [],
            categories: [],
            author: null,
            commentsFeedUrl: 'https://x.example/a/0/comments',
            commentCount: 4,
          },
        ],
      }),
    );
    const view = await firstValueFrom(provider.getFeedItem('https://a.example/feed', 'a-0'));
    expect(view.status.id).toBe('rss:https://a.example/feed::a-0');
    expect(view.commentsFeedUrl).toBe('https://x.example/a/0/comments');
    expect(view.commentCount).toBe(4);
  });

  it('getFeedItem errors when the guid is gone from the feed', async () => {
    const provider = setUp(() => of(feed('a', ['2026-07-14T00:00:00.000Z'])));
    await expect(
      firstValueFrom(provider.getFeedItem('https://a.example/feed', 'missing')),
    ).rejects.toThrow(/no longer in the feed/);
  });

  it('getComments adapts a comment feed into oldest-first replies with authors', async () => {
    const provider = setUp(() =>
      of({
        title: 'Comments on Post',
        link: null,
        items: [
          {
            guid: 'c2',
            title: 'Comment by Bob',
            link: 'https://x.example/a/0#c2',
            publishedAt: '2026-07-15T00:00:00.000Z',
            html: '<p>Second</p>',
            isFullContent: true,
            enclosures: [],
            categories: [],
            author: 'Bob',
            commentsFeedUrl: null,
            commentCount: null,
          },
          {
            guid: 'c1',
            title: 'Comment by Ann',
            link: 'https://x.example/a/0#c1',
            publishedAt: '2026-07-14T00:00:00.000Z',
            html: '<p>First</p>',
            isFullContent: true,
            enclosures: [],
            categories: [],
            author: 'Ann',
            commentsFeedUrl: null,
            commentCount: null,
          },
        ],
      }),
    );
    const parentId = 'rss:https://a.example/feed::a-0';
    const comments = await firstValueFrom(
      provider.getComments('https://a.example/comments', 'https://a.example/feed', parentId),
    );
    // Oldest first (chronological reading order).
    expect(comments.map((c) => c.account.display_name)).toEqual(['Ann', 'Bob']);
    expect(comments.every((c) => c.in_reply_to_id === parentId)).toBe(true);
    expect(comments[0].id).toBe(`${parentId}::comment::c1`);
  });

  /**
   * The reported freeze, at its source.
   *
   * A Hugo blog with no `services.rss.limit` published its entire archive as one
   * feed. Home accepted every entry, adapted each into a Status and rendered the
   * lot — a frozen tab and unresponsive buttons. Feeds have no pagination, so
   * the provider is the only thing standing between a publisher's choice and the
   * reader's timeline.
   */
  describe('a feed that publishes its whole archive', () => {
    /** Descending dates, so item 0 is newest — the shape a real feed has. */
    function bigFeed(count: number): ParsedFeed {
      const dates = Array.from({ length: count }, (_, i) =>
        new Date(Date.UTC(2026, 6, 14, 0, 0, 0) - i * 60_000).toISOString(),
      );
      return feed('big', dates);
    }

    it('contributes at most PER_FEED_ITEM_CAP items to a round', async () => {
      const provider = setUp(() => of(bigFeed(4052)));
      TestBed.inject(RssSubscriptions).add('https://big.example/feed', 'Big');

      provider.reset();
      const page = await firstValueFrom(provider.fetchPage());

      expect(page).toHaveLength(PER_FEED_ITEM_CAP);
    });

    it('keeps the newest items, not an arbitrary slice', async () => {
      const provider = setUp(() => of(bigFeed(500)));
      TestBed.inject(RssSubscriptions).add('https://big.example/feed', 'Big');

      provider.reset();
      const page = await firstValueFrom(provider.fetchPage());

      // Newest first, and the oldest kept item is still newer than everything dropped.
      const times = page.map((s) => Date.parse(s.created_at));
      expect(times[0]).toBe(Date.UTC(2026, 6, 14, 0, 0, 0));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    /**
     * The Feeds page says "4,052 items · newest 100 in Home", so the count it
     * reads must be the feed's real size rather than what survived the cap.
     */
    it('records the feed’s true size, not the capped size', async () => {
      const provider = setUp(() => of(bigFeed(4052)));
      const subs = TestBed.inject(RssSubscriptions);
      subs.add('https://big.example/feed', 'Big');

      provider.reset();
      await firstValueFrom(provider.fetchPage());

      expect(subs.feeds().find((f) => f.url === 'https://big.example/feed')?.itemCount).toBe(4052);
    });

    it('leaves a normal feed untouched', async () => {
      const provider = setUp(() => of(bigFeed(12)));
      TestBed.inject(RssSubscriptions).add('https://small.example/feed', 'Small');

      provider.reset();
      expect(await firstValueFrom(provider.fetchPage())).toHaveLength(12);
    });
  });
  /**
   * Regression: one silent feed hung the entire reading pane.
   *
   * `getFeeds` joins every subscribed feed with `forkJoin`, which emits only
   * once *all* of them complete. A feed whose request never settles therefore
   * left the pane on "Loading items…" forever — no error, no partial list, and
   * the same feed stalled it again on the next refresh. That is what a user
   * reported, and it is why there is a backstop timeout here as well as in
   * `RssFetch`: the inner one covers the network, this one covers everything
   * else that can fail to settle, such as an IndexedDB read whose callback
   * never fires.
   */
  it('renders the feeds that answered when one never does', async () => {
    vi.useFakeTimers();
    try {
      const provider = setUp((url: string) =>
        // Never emits and never completes — a socket that was opened and then
        // forgotten about.
        url.includes('stalled') ? NEVER : of(feed('good', ['2026-01-01T00:00:00Z'])),
      );
      const subs = TestBed.inject(RssSubscriptions);
      subs.add('https://good.example/feed', 'Good');
      subs.add('https://stalled.example/feed', 'Stalled');

      let result: { statuses: Status[]; failed: string[] } | null = null;
      provider
        .getFeeds(['https://good.example/feed', 'https://stalled.example/feed'])
        .subscribe((value) => (result = value));

      await vi.advanceTimersByTimeAsync(31_000);

      // The pane resolves rather than hanging, the working feed still renders,
      // and the stalled one is named so the UI can say which failed.
      expect(result).not.toBeNull();
      expect(result!.statuses.length).toBeGreaterThan(0);
      expect(result!.failed).toEqual(['https://stalled.example/feed']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the feeds that answered when one completes without a value', async () => {
    const provider = setUp((url: string) =>
      url.includes('silent') ? EMPTY : of(feed('good', ['2026-01-01T00:00:00Z'])),
    );
    const urls = ['https://good.example/feed', 'https://silent.example/feed'];

    const result = await firstValueFrom(provider.getFeeds(urls));

    expect(result.statuses).toHaveLength(1);
    expect(result.failed).toEqual(['https://silent.example/feed']);
  });
});
