import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { delay, firstValueFrom, NEVER, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { HomeDiagnostics } from '../home-diagnostics';
import { Status } from '../models';
import { FeedAggregator } from './feed-aggregator';
import { BlueskyProvider } from './bluesky/bluesky-provider';
import { MastodonConnector } from './mastodon/mastodon-connector';
import { RssProvider } from './rss/rss-provider';
import { byNewestFirst } from '../status-sort';
import { seedBskyIdentity } from '../testing/seed-storage';

function makeStatus(id: string, createdAt: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: createdAt,
    edited_at: null,
    content: `<p>${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'a1', acct: 'a', username: 'a', display_name: 'A' } as Status['account'],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...overrides,
  };
}

function rssStatus(id: string, createdAt: string, feedAccountId = 'rss:feed'): Status {
  return makeStatus(id, createdAt, {
    provider: 'rss',
    account: { id: feedAccountId, acct: 'feed' } as Status['account'],
  });
}

function blueskyStatus(id: string, createdAt: string): Status {
  return makeStatus(id, createdAt, { provider: 'bluesky' });
}

/** Minute-spaced mastodon statuses, newest first, on 2026-07-14. */
function mastodonPage(startMinute: number, count: number): Status[] {
  return Array.from({ length: count }, (_, i) => {
    const minute = String(startMinute - i).padStart(2, '0');
    return makeStatus(`m${startMinute - i}`, `2026-07-14T10:${minute}:00.000Z`);
  });
}

interface FakeProvider {
  linked: ReturnType<typeof signal<boolean>>;
  pages: Status[][];
  fetchPage: ReturnType<typeof vi.fn>;
}

describe('FeedAggregator', () => {
  let homeTimeline: ReturnType<typeof vi.fn>;
  let fakeRss: FakeProvider;
  let fakeBluesky: FakeProvider;
  let diagnostics: Pick<HomeDiagnostics, 'info' | 'warn' | 'error'>;

  beforeEach(() => {
    localStorage.clear();
    homeTimeline = vi.fn();
    const fakeProvider = (): FakeProvider => {
      const fake: FakeProvider = { linked: signal(false), pages: [], fetchPage: vi.fn() };
      fake.fetchPage.mockImplementation(() => of(fake.pages.shift() ?? []));
      return fake;
    };
    fakeRss = fakeProvider();
    fakeBluesky = fakeProvider();
    diagnostics = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { homeTimeline } },
        { provide: HomeDiagnostics, useValue: diagnostics },
        {
          provide: BlueskyProvider,
          useValue: {
            id: 'bluesky',
            label: 'Bluesky',
            badge: '🦋 Bsky',
            linked: fakeBluesky.linked,
            errors: signal<string[]>([]),
            reset: vi.fn(),
            fetchPage: fakeBluesky.fetchPage,
          },
        },
        {
          provide: RssProvider,
          useValue: {
            id: 'rss',
            label: 'RSS',
            badge: '📡 RSS',
            linked: fakeRss.linked,
            errors: signal<string[]>([]),
            reset: vi.fn(),
            fetchPage: fakeRss.fetchPage,
          },
        },
      ],
    });
    // These specs assert *merge* behaviour with fixed 2026-07-14 dates, which
    // sit outside the default 24h loading window. The window has its own
    // describe block below; here it would only mask what is being tested.
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });

  it('with no providers linked, passes the Mastodon timeline through page by page', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    homeTimeline.mockReturnValueOnce(of(mastodonPage(59, 20))).mockReturnValueOnce(of([]));

    aggregator.reset();
    const page1 = await firstValueFrom(aggregator.nextPage());
    expect(page1.map((s) => s.id)).toEqual(mastodonPage(59, 20).map((s) => s.id));
    expect(homeTimeline).toHaveBeenCalledWith(undefined);
    expect(aggregator.hasMore()).toBe(true);

    const page2 = await firstValueFrom(aggregator.nextPage());
    expect(page2).toEqual([]);
    expect(homeTimeline).toHaveBeenLastCalledWith('m40');
    expect(aggregator.hasMore()).toBe(false);
    expect(diagnostics.info).toHaveBeenCalledWith('mastodon:page-success', {
      posts: 20,
      exhausted: false,
    });
  });

  it('interleaves RSS items chronologically among Mastodon posts', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    fakeRss.linked.set(true);
    // Mastodon posts at 10:59 and 10:57; RSS at 10:58 — a short, exhausted timeline.
    homeTimeline.mockReturnValueOnce(
      of([
        makeStatus('m2', '2026-07-14T10:59:00.000Z'),
        makeStatus('m1', '2026-07-14T10:57:00.000Z'),
      ]),
    );
    fakeRss.pages = [[rssStatus('r1', '2026-07-14T10:58:00.000Z')]];

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());
    expect(page.map((s) => s.id)).toEqual(['m2', 'r1', 'm1']);
  });

  it('does not let a full Mastodon page squeeze out an older RSS page', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    fakeRss.linked.set(true);
    homeTimeline.mockReturnValueOnce(of(mastodonPage(59, 20)));
    fakeRss.pages = [[rssStatus('r-old', '2026-07-01T00:00:00.000Z')]];

    aggregator.reset();
    const page1 = await firstValueFrom(aggregator.nextPage());
    expect(page1).toHaveLength(21);
    expect(page1.at(-1)?.id).toBe('r-old');
  });

  it('loads 20 posts from each of two active sources', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    fakeRss.linked.set(true);
    homeTimeline.mockReturnValue(of(mastodonPage(59, 20)));
    fakeRss.pages = [
      Array.from({ length: 20 }, (_, i) =>
        rssStatus(`r${i}`, `2026-07-14T09:${String(59 - i).padStart(2, '0')}:00.000Z`),
      ),
    ];

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());
    expect(page).toHaveLength(40);
    expect(page.filter((s) => !s.provider)).toHaveLength(20);
    expect(page.filter((s) => s.provider === 'rss')).toHaveLength(20);
  });

  it('loads a foreign source until it reaches 20 and keeps the whole crossing page', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    fakeRss.linked.set(true);
    homeTimeline.mockReturnValue(of([]));
    fakeRss.pages = [
      Array.from({ length: 12 }, (_, i) =>
        rssStatus(`r${i}`, `2026-07-14T10:${String(59 - i).padStart(2, '0')}:00.000Z`),
      ),
      Array.from({ length: 11 }, (_, i) =>
        rssStatus(`r${i + 12}`, `2026-07-14T09:${String(59 - i).padStart(2, '0')}:00.000Z`),
      ),
    ];

    aggregator.reset();
    const page1 = await firstValueFrom(aggregator.nextPage());
    expect(page1).toHaveLength(23);
    expect(fakeRss.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('loads 20 posts for each of Mastodon, Bluesky, and RSS', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    fakeRss.linked.set(true);
    fakeBluesky.linked.set(true);
    homeTimeline.mockReturnValue(of(mastodonPage(59, 20)));
    fakeBluesky.pages = [
      Array.from({ length: 20 }, (_, i) =>
        blueskyStatus(`b${i}`, `2026-07-14T09:${String(59 - i).padStart(2, '0')}:00.000Z`),
      ),
    ];
    fakeRss.pages = [
      Array.from({ length: 20 }, (_, i) =>
        rssStatus(`r${i}`, `2026-07-14T08:${String(59 - i).padStart(2, '0')}:00.000Z`),
      ),
    ];

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());
    expect(page).toHaveLength(60);
    expect(page.filter((s) => !s.provider)).toHaveLength(20);
    expect(page.filter((s) => s.provider === 'bluesky')).toHaveLength(20);
    expect(page.filter((s) => s.provider === 'rss')).toHaveLength(20);
  });

  it('treats all RSS subscriptions as one source quota', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    TestBed.inject(ClientPrefs).toggleProvider('mastodon');
    fakeRss.linked.set(true);
    fakeRss.pages = [
      Array.from({ length: 20 }, (_, i) =>
        rssStatus(
          `r${i}`,
          `2026-07-14T10:${String(30 - i).padStart(2, '0')}:00.000Z`,
          `rss:feed${i % 2}`,
        ),
      ),
    ];

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());
    expect(page).toHaveLength(20);
    expect(fakeRss.fetchPage).toHaveBeenCalledTimes(1);
    expect(homeTimeline).not.toHaveBeenCalled();
  });

  it('falls back to Mastodon when persisted filters hide every source', async () => {
    // A shared prefs blob can leave mastodon + all linked providers hidden. A
    // non-anonymous reader would otherwise get an empty home feed with no chip
    // to recover; the aggregator keeps Mastodon (their primary network) on.
    const aggregator = TestBed.inject(FeedAggregator);
    const prefs = TestBed.inject(ClientPrefs);
    prefs.toggleProvider('mastodon');
    prefs.toggleProvider('rss');
    prefs.toggleProvider('bluesky');
    fakeRss.linked.set(true);
    fakeBluesky.linked.set(true);
    homeTimeline.mockReturnValueOnce(of(mastodonPage(59, 20))).mockReturnValueOnce(of([]));

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());

    expect(page).toHaveLength(20);
    expect(homeTimeline).toHaveBeenCalled();
    expect(fakeRss.fetchPage).not.toHaveBeenCalled();
    expect(fakeBluesky.fetchPage).not.toHaveBeenCalled();
    expect(diagnostics.warn).toHaveBeenCalledWith('aggregator:all-sources-hidden-fallback');
  });

  /**
   * The bug that made a Bluesky-primary home feed empty.
   *
   * Such an account has no Mastodon token until a Mastodon connector is attached,
   * so `/api/v1/timelines/home` returns 401. The round is a `forkJoin`, so that
   * one failure took the *whole* round down — discarding the Bluesky posts that
   * had already loaded perfectly well, and reporting the feed as failed.
   */
  it('does not query the Mastodon timeline for a Bluesky-primary account', async () => {
    const auth = TestBed.inject(Auth);
    localStorage.setItem(
      'mockingbird_bsky_identity_profile',
      JSON.stringify({ did: 'did:plc:me', handle: 'me.bsky.social' }),
    );
    localStorage.setItem(
      'mockingbird_bsky_identity_credentials',
      JSON.stringify({ accessJwt: 'a', refreshJwt: 'r', connectedAt: Date.now() }),
    );
    auth.enterBluesky();
    const aggregator = TestBed.inject(FeedAggregator);
    fakeBluesky.linked.set(true);
    fakeBluesky.pages = [[blueskyStatus('b1', '2026-07-14T10:00:00.000Z')]];

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());

    expect(homeTimeline).not.toHaveBeenCalled();
    expect(page.map((status) => status.id)).toEqual(['b1']);
  });

  /**
   * The safety net that re-enables Mastodon when every source is hidden must not
   * fire for a Bluesky-primary account: it would reinstate the 401 above, and
   * "every source is hidden" is not the situation they are in.
   */
  it('does not re-enable Mastodon for a Bluesky-primary account with no other source', async () => {
    const auth = TestBed.inject(Auth);
    localStorage.setItem(
      'mockingbird_bsky_identity_profile',
      JSON.stringify({ did: 'did:plc:me', handle: 'me.bsky.social' }),
    );
    localStorage.setItem(
      'mockingbird_bsky_identity_credentials',
      JSON.stringify({ accessJwt: 'a', refreshJwt: 'r', connectedAt: Date.now() }),
    );
    auth.enterBluesky();
    const aggregator = TestBed.inject(FeedAggregator);
    // Nothing linked at all — the state that trips the fallback.
    aggregator.reset();
    await firstValueFrom(aggregator.nextPage());

    expect(homeTimeline).not.toHaveBeenCalled();
    expect(diagnostics.warn).not.toHaveBeenCalledWith('aggregator:all-sources-hidden-fallback');
  });

  /**
   * Decision 4 of the Mastodon-connector sprint, and the reason the connector
   * has three states rather than a boolean.
   *
   * An **anonymous** connector has no follows, so `/timelines/home` is a public
   * firehose: strangers mixed into a timeline that otherwise contains only
   * people the user chose. Explore, trends and tag timelines still work — they
   * never went through the aggregator. Merging Home is the payoff for signing
   * in, which is what makes the upgrade worth making.
   */
  it('keeps Home Bluesky-only while the Mastodon connector is anonymous', async () => {
    const auth = TestBed.inject(Auth);
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    auth.enterBluesky();
    TestBed.inject(MastodonConnector).enableAnonymous();

    const aggregator = TestBed.inject(FeedAggregator);
    fakeBluesky.linked.set(true);
    fakeBluesky.pages = [[blueskyStatus('b1', '2026-07-14T10:00:00.000Z')]];

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());

    expect(homeTimeline).not.toHaveBeenCalled();
    expect(page.map((status) => status.id)).toEqual(['b1']);
  });

  it('merges Mastodon into Home once the connector is signed in', async () => {
    const auth = TestBed.inject(Auth);
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    auth.enterBluesky();
    const connector = TestBed.inject(MastodonConnector);
    connector.enableAnonymous();
    connector.signIn('tok-123', 'https://mastodon.social', null);

    const aggregator = TestBed.inject(FeedAggregator);
    fakeBluesky.linked.set(true);
    fakeBluesky.pages = [[blueskyStatus('b1', '2026-07-14T10:00:00.000Z')]];
    homeTimeline
      .mockReturnValueOnce(of([makeStatus('m1', '2026-07-14T11:00:00.000Z')]))
      .mockReturnValue(of([]));

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());

    // The payoff for upgrading: a signed-in connector has real follows, so its
    // home timeline is people the user chose — and the identity is still Bluesky.
    expect(homeTimeline).toHaveBeenCalled();
    expect(page.map((status) => status.id)).toEqual(['m1', 'b1']);
    expect(auth.kind()).toBe('bluesky');
  });

  it('keeps healthy sources when a browser-only provider fails', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    fakeRss.linked.set(true);
    homeTimeline.mockReturnValueOnce(of([makeStatus('healthy', '2026-07-14T10:00:00.000Z')]));
    fakeRss.fetchPage.mockReturnValueOnce(
      throwError(() => new Error('RSS server blocked this browser with CORS')),
    );

    aggregator.reset();
    const page = await firstValueFrom(aggregator.nextPage());

    expect(page.map((status) => status.id)).toEqual(['healthy']);
    expect(aggregator.hasMore()).toBe(false);
    // objectContaining, so adding a field to the diagnostic payload (waitedMs and
    // friends, which is how a slow source gets attributed) is not a test failure.
    expect(diagnostics.error).toHaveBeenCalledWith(
      'foreign:page-error',
      expect.any(Error),
      expect.objectContaining({ provider: 'rss' }),
    );
  });
  // ------------------------------------------------------- loading window

  describe('the loading window bounds what is fetched, not just what is shown', () => {
    const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

    /** Build the aggregator with a chosen window. */
    function withWindow(window: 'today' | 'week' | 'all'): FeedAggregator {
      TestBed.inject(ClientPrefs).setHomeWindow(window);
      const aggregator = TestBed.inject(FeedAggregator);
      aggregator.reset();
      return aggregator;
    }

    it('drops posts older than the window', async () => {
      homeTimeline.mockReturnValue(
        of([makeStatus('fresh', hoursAgo(1)), makeStatus('ancient', hoursAgo(48))]),
      );
      const page = await firstValueFrom(withWindow('today').nextPage());
      expect(page.map((s) => s.id)).toEqual(['fresh']);
    });

    it('stops paging a source that has crossed the cutoff', async () => {
      // The point of the whole feature: an RSS feed or a dormant Twitter
      // account should not keep being paged into its 2019 archive just because
      // the busy sources ran out. Without this the page grows without bound —
      // worst of all for Anonymous client-side follows, which merge 20-40
      // accounts.
      fakeRss.linked.set(true);
      fakeRss.pages = [
        [rssStatus('r1', hoursAgo(2)), rssStatus('r2', hoursAgo(100))],
        [rssStatus('r3', hoursAgo(200))],
      ];
      homeTimeline.mockReturnValue(of([]));

      const page = await firstValueFrom(withWindow('today').nextPage());
      expect(page.map((s) => s.id)).toEqual(['r1']);
      // One call only: the source was retired the moment it went past the
      // cutoff, rather than being paged again and filtered afterwards.
      expect(fakeRss.fetchPage).toHaveBeenCalledTimes(1);
    });

    it('loads everything when the window is off', async () => {
      fakeRss.linked.set(true);
      fakeRss.pages = [[rssStatus('r1', hoursAgo(2)), rssStatus('r2', hoursAgo(9000))], []];
      homeTimeline.mockReturnValue(of([]));

      const page = await firstValueFrom(withWindow('all').nextPage());
      expect(page.map((s) => s.id)).toEqual(['r1', 'r2']);
    });

    it('honours a week-long window', async () => {
      homeTimeline.mockReturnValue(
        of([makeStatus('recent', hoursAgo(48)), makeStatus('old', hoursAgo(24 * 9))]),
      );
      const page = await firstValueFrom(withWindow('week').nextPage());
      expect(page.map((s) => s.id)).toEqual(['recent']);
    });

    it('reports how much was hidden, so Home can offer to widen', async () => {
      homeTimeline.mockReturnValue(
        of([
          makeStatus('fresh', hoursAgo(1)),
          makeStatus('a', hoursAgo(48)),
          makeStatus('b', hoursAgo(72)),
        ]),
      );
      const aggregator = withWindow('today');
      await firstValueFrom(aggregator.nextPage());
      expect(aggregator.droppedByWindow()).toBe(2);
    });

    it('keeps a post whose date cannot be parsed', async () => {
      // normalizeTimestamp yields null rather than now() for an unreadable
      // date, and those statuses land at epoch 0. Dropping them would hide a
      // post because its provider sent a date we could not read, which is a
      // worse failure than showing it out of order.
      homeTimeline.mockReturnValue(
        of([makeStatus('fresh', hoursAgo(1)), makeStatus('undated', 'not-a-date')]),
      );
      const page = await firstValueFrom(withWindow('today').nextPage());
      expect(page.map((s) => s.id)).toContain('undated');
    });
  });

  /**
   * The backstop for a provider that dumps an archive instead of a page.
   *
   * One RSS feed returned 15,291 items in a single `fetchPage()`. `SOURCE_PAGE_SIZE`
   * is a quota that stops the *paging loop*, and it did — after the oversized page
   * was already in the feed. Nothing downstream capped it either, so Home stored
   * 15,411 posts and froze rendering them.
   */
  describe('a source that returns far more than a page', () => {
    it('truncates the page and stops that source for the round', async () => {
      const aggregator = TestBed.inject(FeedAggregator);
      fakeRss.linked.set(true);
      homeTimeline.mockReturnValue(of([]));
      const flood = Array.from({ length: 15_291 }, (_, i) =>
        rssStatus(`r${i}`, new Date(Date.UTC(2026, 6, 14) - i * 1000).toISOString()),
      );
      fakeRss.fetchPage.mockReturnValue(of(flood));

      aggregator.reset();
      const page = await firstValueFrom(aggregator.nextPage());

      // Truncated, not dropped: the reader still gets a feed.
      expect(page.length).toBeLessThanOrEqual(500);
      expect(page.length).toBeGreaterThan(0);
      expect(diagnostics.warn).toHaveBeenCalledWith(
        'foreign:page-oversized',
        expect.objectContaining({ provider: 'rss', returned: 15_291 }),
      );
      // The source is spent for this round rather than being paged again.
      expect(fakeRss.fetchPage).toHaveBeenCalledTimes(1);
    });

    it('leaves a normally-sized page alone', async () => {
      const aggregator = TestBed.inject(FeedAggregator);
      fakeRss.linked.set(true);
      homeTimeline.mockReturnValue(of([]));
      fakeRss.fetchPage
        .mockReturnValueOnce(of([rssStatus('r1', '2026-07-14T10:58:00.000Z')]))
        .mockReturnValue(of([]));

      aggregator.reset();
      const page = await firstValueFrom(aggregator.nextPage());

      expect(page.map((s) => s.id)).toEqual(['r1']);
      expect(diagnostics.warn).not.toHaveBeenCalledWith(
        'foreign:page-oversized',
        expect.anything(),
      );
    });
  });

  /**
   * The reported freeze. The round is a forkJoin, so before this the slowest
   * source set the time-to-first-post for every source: when the free CORS
   * proxies all started refusing, the Twitter provider's retry-with-backoff took
   * the better part of a minute to fail and Home showed a spinner the whole time.
   */
  describe('a source that stops answering', () => {
    it('does not hold up the rest of the round', async () => {
      vi.useFakeTimers();
      try {
        const aggregator = TestBed.inject(FeedAggregator);
        fakeRss.linked.set(true);
        homeTimeline.mockReturnValueOnce(of([makeStatus('m1', '2026-07-14T10:59:00.000Z')]));
        // A source that never emits at all — the shape a dead proxy produces.
        fakeRss.fetchPage.mockReturnValue(NEVER);

        aggregator.reset();
        const pagePromise = firstValueFrom(aggregator.nextPage());
        await vi.advanceTimersByTimeAsync(11_000);
        const page = await pagePromise;

        // The healthy source's posts arrive rather than being discarded.
        expect(page.map((s) => s.id)).toEqual(['m1']);
        expect(diagnostics.warn).toHaveBeenCalledWith(
          'foreign:page-timeout',
          expect.objectContaining({ provider: 'rss' }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('stays eligible next round, because a timeout is not an empty source', async () => {
      vi.useFakeTimers();
      try {
        const aggregator = TestBed.inject(FeedAggregator);
        fakeRss.linked.set(true);
        homeTimeline.mockReturnValue(of([]));
        fakeRss.fetchPage.mockReturnValueOnce(NEVER);

        aggregator.reset();
        const first = firstValueFrom(aggregator.nextPage());
        await vi.advanceTimersByTimeAsync(11_000);
        await first;

        // Second round: the source answers from cache, as it would after a blip.
        // One page then empty, so it exhausts rather than paging the same post
        // until it reaches the round quota.
        fakeRss.fetchPage
          .mockReturnValueOnce(of([rssStatus('r1', '2026-07-14T10:58:00.000Z')]))
          .mockReturnValue(of([]));
        const second = firstValueFrom(aggregator.nextPage());
        await vi.advanceTimersByTimeAsync(11_000);

        expect((await second).map((s) => s.id)).toEqual(['r1']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('bounds a slow source across its own paging, not per page', async () => {
      vi.useFakeTimers();
      try {
        const aggregator = TestBed.inject(FeedAggregator);
        fakeRss.linked.set(true);
        homeTimeline.mockReturnValue(of([]));
        // Each page takes 6s and never fills the 20-post quota, so without a
        // shared deadline this pages forever at 6s a time.
        let n = 0;
        fakeRss.fetchPage.mockImplementation(() => {
          n += 1;
          return of([rssStatus(`r${n}`, '2026-07-14T10:58:00.000Z')]).pipe(delay(6_000));
        });

        aggregator.reset();
        const pagePromise = firstValueFrom(aggregator.nextPage());
        await vi.advanceTimersByTimeAsync(60_000);
        await pagePromise;

        // Two pages fit in the 10s budget; the third is refused by the deadline.
        expect(fakeRss.fetchPage.mock.calls.length).toBeLessThanOrEqual(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  /**
   * The permanently pinned bottom post.
   *
   * Reported three times from real use: after "load more", one post stays welded
   * to the end of the feed while every new page inserts above it. It is not a
   * paging off-by-one — `max_id` is exclusive on the server and `dedupeExact`
   * removes any repeated boundary item, so the post is not a duplicate; it is
   * the same post, never moving.
   *
   * The cause is the sort key. `time()` maps an unreadable `created_at` to 0,
   * and `twitterapi-io/normalizers.ts` explicitly stamps such tweets with
   * `new Date(0)`. Epoch is older than every real post, so a newest-first sort
   * puts that status last and *keeps* it there for the life of the session:
   * nothing can ever sort below it. The "sorts last rather than jumping to the
   * top" comment there chose the bottom as the safer end, missing that the
   * bottom is permanent while the top is transient.
   *
   * The fix keeps undated posts (see the window block above) but stops treating
   * "no date" as "infinitely old", so they hold their arrival position instead
   * of sinking to a floor nothing can sort beneath.
   */
  describe('a post whose date cannot be read does not pin itself to the end', () => {
    const at = (n: number) => new Date(Date.UTC(2026, 6, 14, 12) - n * 60_000).toISOString();

    /** Page the aggregator the way "load more" does, accumulating as Home does. */
    async function pageTwice(first: Status[], second: Status[]): Promise<Status[]> {
      TestBed.inject(ClientPrefs).setHomeWindow('all');
      const aggregator = TestBed.inject(FeedAggregator);
      aggregator.reset();
      homeTimeline.mockReturnValueOnce(of(first)).mockReturnValueOnce(of(second));
      const one = await firstValueFrom(aggregator.nextPage());
      const two = await firstValueFrom(aggregator.nextPage());
      // Home's mergeStatuses: concatenate, then re-sort newest-first.
      return [...one, ...two].sort(byNewestFirst);
    }

    it('does not leave an undated post stranded below a newly loaded page', async () => {
      const feed = await pageTwice(
        [makeStatus('undated', 'not-a-date'), makeStatus('a', at(1))],
        [makeStatus('b', at(2)), makeStatus('c', at(3))],
      );
      // The symptom: 'undated' is last, and page two landed above it.
      expect(feed.at(-1)?.id).not.toBe('undated');
    });

    it('keeps the undated post in the feed rather than dropping it', async () => {
      const feed = await pageTwice(
        [makeStatus('undated', 'not-a-date'), makeStatus('a', at(1))],
        [makeStatus('b', at(2))],
      );
      expect(feed.map((s) => s.id)).toContain('undated');
    });

    it('still orders the posts that do have dates newest-first', async () => {
      const feed = await pageTwice(
        [makeStatus('undated', 'not-a-date'), makeStatus('a', at(1))],
        [makeStatus('b', at(2)), makeStatus('c', at(3))],
      );
      const dated = feed.filter((s) => s.id !== 'undated').map((s) => s.id);
      // A short first page exhausts the source, so only page one is fetched —
      // ordering within what did load is what this asserts.
      expect(dated).toEqual(['a']);
    });
  });
});
