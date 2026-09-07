import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Account } from '../../models';
import { PageDiagnostics } from '../../page-diagnostics';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { FriendFeedCache, ProbeRecord } from './friend-feed-cache';
import { FriendFeedScan } from './friend-feed-scan';
import { PasteResolve } from './paste-resolve';

/** An account whose profile fields carry `urls`. */
function account(acct: string, ...urls: string[]): Account {
  return {
    id: acct,
    username: acct,
    acct,
    display_name: acct,
    note: '',
    url: `https://example.social/@${acct}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: urls.map((value, index) => ({ name: `link${index}`, value })),
  };
}

/**
 * An in-memory stand-in for the IndexedDB cache.
 *
 * jsdom has no IndexedDB, so the real class degrades to "no cache" there and
 * every assertion about *not re-probing* would pass vacuously. This fake is
 * what makes the cost-control tests mean something.
 */
class FakeCache {
  records = new Map<string, ProbeRecord>();
  saved: unknown[] = [];

  probes = vi.fn(async () => this.records);
  recordProbe = vi.fn(async (url: string, outcome: ProbeRecord['outcome'], feeds = []) => {
    this.records.set(url, { url, outcome, feeds, probedAt: 1 });
  });
  opml = vi.fn(async () => null);
  saveOpml = vi.fn(async (record: unknown) => {
    this.saved.push(record);
  });
  clear = vi.fn(async () => undefined);
}

describe('FriendFeedScan', () => {
  let api: { accountFollowingPage: ReturnType<typeof vi.fn> };
  let resolver: { resolve: ReturnType<typeof vi.fn> };
  let cache: FakeCache;
  let diagnostics: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let scan: FriendFeedScan;
  let batchCapacity: number;

  /** One page of `accounts`, with no cursor so the walk stops. */
  function onePage(accounts: Account[]) {
    return of({ accounts, nextMaxId: null, source: 'link' as const });
  }

  /** A resolution reporting one feed on the probed site. */
  function feedFound(url: string) {
    return {
      kind: 'feeds' as const,
      feeds: [{ url: `${url}/feed.xml`, title: 'A blog' }],
      siteUrl: url,
      needsProxy: false,
    };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    api = { accountFollowingPage: vi.fn() };
    resolver = { resolve: vi.fn() };
    cache = new FakeCache();
    diagnostics = { info: vi.fn(), warn: vi.fn() };
    batchCapacity = 1;
    TestBed.configureTestingModule({
      providers: [
        FriendFeedScan,
        { provide: Api, useValue: api },
        { provide: PasteResolve, useValue: resolver },
        { provide: FriendFeedCache, useValue: cache },
        {
          provide: CorsProxy,
          useValue: { available: () => true, batchCapacity: () => batchCapacity },
        },
        { provide: PageDiagnostics, useValue: diagnostics },
      ],
    });
    scan = TestBed.inject(FriendFeedScan);
    // The scanner paces itself (250ms between probes) and backs off for five
    // seconds on a 429. Both are correct in production and pure waiting here,
    // so time is faked and driven by `run` below.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Run a scan to completion under fake timers.
   *
   * The scanner alternates between awaiting a promise and awaiting a timer, so
   * neither `runAllTimersAsync` alone nor plain awaiting is enough: this races
   * the scan against a loop that keeps advancing the clock until it settles.
   */
  async function run(
    cap = 500,
    followingTotal = 0,
  ): Promise<Awaited<ReturnType<typeof scan.scan>>> {
    const promise = scan.scan('me', 'account-1', cap, followingTotal);
    let done = false;
    void promise.then(() => (done = true));
    while (!done) {
      await vi.advanceTimersByTimeAsync(1_000);
    }
    return promise;
  }

  it('probes each site once however many friends link it', async () => {
    // The group-blog case. Three friends, one site, one probe — and the
    // attribution keeps the first handle rather than the last.
    api.accountFollowingPage.mockReturnValue(
      onePage([
        account('ana', 'https://shared.example/'),
        account('ben', 'https://www.shared.example'),
        account('cal', 'https://shared.example/#about'),
      ]),
    );
    resolver.resolve.mockResolvedValue(feedFound('https://shared.example'));

    const result = await run();

    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(result?.feeds).toHaveLength(1);
    expect(result?.feeds[0].via).toBe('ana');
  });

  it('starts one Mawkingbird article batch at a time', async () => {
    batchCapacity = 6;
    const many = Array.from({ length: 8 }, (_, i) => account(`f${i}`, `https://s${i}.example`));
    api.accountFollowingPage.mockReturnValue(onePage(many));
    let inFlight = 0;
    let peak = 0;
    resolver.resolve.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight--;
            resolve(feedFound(url));
          }, 10);
        }),
    );

    await run();

    expect(peak).toBe(6);
    expect(resolver.resolve).toHaveBeenCalledTimes(8);
  });

  it('never re-probes a URL an earlier scan already answered', async () => {
    // The reason the cache exists. A site that had no feed last time is still
    // not going to have one, and re-asking is the expensive half of a re-scan.
    cache.records.set('https://known.example', {
      url: 'https://known.example',
      outcome: 'none',
      feeds: [],
      probedAt: 1,
    });
    api.accountFollowingPage.mockReturnValue(
      onePage([account('ana', 'https://known.example'), account('ben', 'https://fresh.example')]),
    );
    resolver.resolve.mockResolvedValue(feedFound('https://fresh.example'));

    await run();

    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(resolver.resolve).toHaveBeenCalledWith('https://fresh.example');
  });

  it('retries a site that could not be reached, unlike one that had no feed', async () => {
    // `unreachable` means the site was never actually answered. Believing it
    // would bake one bad afternoon into a permanent "your friend has no blog".
    cache.records.set('https://flaky.example', {
      url: 'https://flaky.example',
      outcome: 'unreachable',
      feeds: [],
      probedAt: 1,
    });
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://flaky.example')]));
    resolver.resolve.mockResolvedValue(feedFound('https://flaky.example'));

    await run();

    expect(resolver.resolve).toHaveBeenCalledOnce();
  });

  it('records an unreachable site as unreachable, not as feedless', async () => {
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://down.example')]));
    resolver.resolve.mockRejectedValue(new Error('network'));

    await run();

    expect(cache.recordProbe).toHaveBeenCalledWith('https://down.example', 'unreachable');
  });

  it('spends nothing on hosts that certainly have no per-profile feed', async () => {
    api.accountFollowingPage.mockReturnValue(
      onePage([account('ana', 'https://twitter.com/ana', 'https://linktr.ee/ana')]),
    );

    await run();

    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('stops at the cap and says the result is partial', async () => {
    api.accountFollowingPage.mockReturnValue(
      onePage([
        account('ana', 'https://one.example'),
        account('ben', 'https://two.example'),
        account('cal', 'https://three.example'),
      ]),
    );
    resolver.resolve.mockImplementation((url: string) => Promise.resolve(feedFound(url)));

    const result = await run(2);

    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    // Partial is the honest label: a third site was never looked at, and the
    // dialog has to be able to say so rather than imply a complete answer.
    expect(result?.partial).toBe(true);
  });

  it('reports a complete run as complete', async () => {
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://one.example')]));
    resolver.resolve.mockResolvedValue(feedFound('https://one.example'));

    const result = await run();

    expect(result?.partial).toBe(false);
  });

  it('keeps what it found when stopped part-way', async () => {
    // Unlike a bulk write, a partial read is still a real answer: the feeds
    // found so far are exactly as valid as a complete run would have made them.
    api.accountFollowingPage.mockReturnValue(
      onePage([account('ana', 'https://one.example'), account('ben', 'https://two.example')]),
    );
    resolver.resolve.mockImplementation((url: string) => {
      scan.stop();
      return Promise.resolve(feedFound(url));
    });

    const result = await run();

    expect(result?.feeds).toHaveLength(1);
    expect(result?.partial).toBe(true);
  });

  it('builds an OPML document and stores it against the account', async () => {
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://one.example')]));
    resolver.resolve.mockResolvedValue(feedFound('https://one.example'));

    const result = await run();

    expect(result?.opml).toContain('https://one.example/feed.xml');
    expect(cache.saveOpml).toHaveBeenCalledOnce();
    expect(cache.saved[0]).toMatchObject({ accountKey: 'account-1', feedCount: 1 });
  });

  it('ignores profile fields that are not links at all', async () => {
    // Pronouns, an email address and a location are what profile fields are
    // mostly full of. Each one that reached the prober would cost a fetch.
    api.accountFollowingPage.mockReturnValue(
      onePage([account('ana', 'she/her', 'mailto:ana@example.com', 'Berlin')]),
    );

    await run();

    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('reads the href out of a rendered profile link', async () => {
    // Mastodon sends field values as HTML; servers vary, so both shapes matter.
    api.accountFollowingPage.mockReturnValue(
      onePage([account('ana', '<a href="https://one.example" rel="me">one.example</a>')]),
    );
    resolver.resolve.mockResolvedValue(feedFound('https://one.example'));

    await run();

    expect(resolver.resolve).toHaveBeenCalledWith('https://one.example');
  });

  it('walks every page of the following list', async () => {
    api.accountFollowingPage
      .mockReturnValueOnce(of({ accounts: [account('ana')], nextMaxId: 'p2', source: 'link' }))
      .mockReturnValueOnce(of({ accounts: [account('ben')], nextMaxId: null, source: 'link' }));

    await run();

    expect(api.accountFollowingPage).toHaveBeenCalledTimes(2);
  });
  /**
   * The worst bug this feature could have.
   *
   * The Mawkingbird proxy allows supporters 300 requests a minute, and a bulk
   * scan is exactly the thing that can reach it. `probePage` turns a 429 into
   * an empty body, so without the `reached` flag every rate-limited site would
   * be cached as `none` — permanently marking hundreds of friends as having no
   * blog, with nothing saying why, and no future scan ever looking again.
   */
  it('never caches a rate-limited site as having no feed', async () => {
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://one.example')]));
    resolver.resolve.mockResolvedValue({
      kind: 'none',
      reason: 'rate limited',
      reached: false,
      rateLimited: true,
    });

    await run();

    expect(cache.recordProbe).toHaveBeenCalledWith('https://one.example', 'unreachable');
  });

  it('still caches a site that answered and had no feed', async () => {
    // The other half of the same rule: this one *is* safe to remember, and
    // remembering it is what makes a re-scan cheap.
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://one.example')]));
    resolver.resolve.mockResolvedValue({
      kind: 'none',
      reason: 'no feed on that page',
      reached: true,
    });

    await run();

    expect(cache.recordProbe).toHaveBeenCalledWith('https://one.example', 'none');
  });

  it('gives up rather than spending the budget on a proxy refusing everything', async () => {
    // Twenty failures in a row is the proxy saying no, not twenty dead sites.
    // Continuing would write `unreachable` for sites never actually asked.
    const many = Array.from({ length: 40 }, (_, i) => account(`f${i}`, `https://s${i}.example`));
    api.accountFollowingPage.mockReturnValue(onePage(many));
    resolver.resolve.mockResolvedValue({
      kind: 'none',
      reason: 'rate limited',
      reached: false,
      rateLimited: true,
    });

    const result = await run();

    expect(resolver.resolve.mock.calls.length).toBeLessThan(40);
    // Partial, so the dialog invites another run and the user is not told a
    // truncated answer is the whole one.
    expect(result?.partial).toBe(true);
  });

  it('keeps going when failures are scattered rather than consecutive', async () => {
    // A handful of dead sites is ordinary and must not end a scan.
    const many = Array.from({ length: 12 }, (_, i) => account(`f${i}`, `https://s${i}.example`));
    api.accountFollowingPage.mockReturnValue(onePage(many));
    let call = 0;
    resolver.resolve.mockImplementation((url: string) => {
      call++;
      return Promise.resolve(
        call % 2 === 0
          ? { kind: 'none' as const, reason: 'unreachable', reached: false }
          : feedFound(url),
      );
    });

    const result = await run();

    expect(resolver.resolve).toHaveBeenCalledTimes(12);
    expect(result?.partial).toBe(false);
  });
  /**
   * Regression: the progress bar never moved during the walk.
   *
   * `accountsTotal` was set to `accounts.length` — the numerator — so the walk
   * fraction was permanently 1.0 and the bar sat at the walk's weight while a
   * counter climbed beside it. On a 3,000-account following list that is
   * minutes of something indistinguishable from a hang.
   */
  it('takes the walk denominator from the server, not from what it has read', async () => {
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://one.example')]));
    resolver.resolve.mockResolvedValue(feedFound('https://one.example'));

    const promise = run(500, 4_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(scan.progress()?.accountsTotal).toBe(4_000);
    await promise;
  });

  it('never lets the denominator fall below what was actually read', async () => {
    // A stated count can be stale or plain wrong. A bar reading 140% is worse
    // than one that finishes sooner than promised.
    const many = Array.from({ length: 5 }, (_, i) => account(`f${i}`));
    api.accountFollowingPage.mockReturnValue(onePage(many));

    await run(500, 2);

    expect(scan.progress()?.accountsTotal).toBeGreaterThanOrEqual(5);
  });

  it('counts the websites worth checking while it walks', async () => {
    // "2,938 accounts read" says nothing about whether any of them had a site.
    // The count shown is post-filter, so it does not shrink later.
    api.accountFollowingPage.mockReturnValue(
      onePage([
        account('ana', 'https://one.example'),
        account('ben', 'https://twitter.com/ben'),
        account('cal', 'she/her'),
        account('dee', 'https://one.example'),
      ]),
    );
    resolver.resolve.mockResolvedValue(feedFound('https://one.example'));

    await run();

    // One: the skip-listed host, the non-URL and the duplicate are all excluded.
    expect(scan.progress()?.linksFound).toBe(1);
  });
  /** Events logged, as `event` strings, for the assertions below. */
  function logged(): string[] {
    return [...diagnostics.info.mock.calls, ...diagnostics.warn.mock.calls].map(
      ([, event]) => event as string,
    );
  }

  it('logs both edges of a rate-limit pause', async () => {
    // A pause that only logs its start leaves the reader unable to tell
    // "waiting" from "died while waiting" — the same ambiguity the pause
    // creates on screen, which is the reason to log it at all.
    api.accountFollowingPage.mockReturnValue(onePage([account('ana', 'https://one.example')]));
    resolver.resolve.mockResolvedValue({
      kind: 'none',
      reason: 'rate limited',
      reached: false,
      rateLimited: true,
    });

    await run();

    expect(logged()).toContain('probe:rate-limited:pausing');
    expect(logged()).toContain('probe:rate-limited:resumed');
  });

  it('logs the walk page by page, so a long read is not mistaken for a hang', async () => {
    api.accountFollowingPage
      .mockReturnValueOnce(of({ accounts: [account('ana')], nextMaxId: 'p2', source: 'link' }))
      .mockReturnValueOnce(of({ accounts: [account('ben')], nextMaxId: null, source: 'link' }));

    await run();

    expect(logged().filter((event) => event === 'walk:page')).toHaveLength(2);
    expect(logged()).toContain('walk:finished');
  });

  it('logs what the cache saved before probing starts', async () => {
    cache.records.set('https://known.example', {
      url: 'https://known.example',
      outcome: 'none',
      feeds: [],
      probedAt: 1,
    });
    api.accountFollowingPage.mockReturnValue(
      onePage([account('ana', 'https://known.example'), account('ben', 'https://fresh.example')]),
    );
    resolver.resolve.mockResolvedValue(feedFound('https://fresh.example'));

    await run();

    const planned = diagnostics.info.mock.calls.find(([, event]) => event === 'probe:planned');
    expect(planned?.[2]).toMatchObject({ candidates: 2, fromCache: 1, toProbe: 1 });
  });
});
