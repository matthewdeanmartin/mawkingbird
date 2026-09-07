import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { ProfileAccountKey } from '../providers/account/profile-account-key';
import { SupporterStatus } from '../providers/account/supporter-status';
import { FoundFeed } from '../providers/rss/friend-feed-cache';
import { FriendFeedScan, FriendScanResult } from '../providers/rss/friend-feed-scan';
import { RssAddFeed } from '../providers/rss/rss-add-feed';
import { RssSubscriptions } from '../providers/rss/rss-subscriptions';
import { CorsProxy } from '../providers/cors-proxy/cors-proxy';
import { CorsProxySettings } from '../providers/cors-proxy/cors-proxy-settings';
import { of, throwError } from 'rxjs';
import { FriendFeedsDialog } from './friend-feeds-dialog';

function feed(url: string, via = 'ana'): FoundFeed {
  return { url, title: `Blog at ${url}`, siteUrl: url, via };
}

function result(feeds: FoundFeed[], partial = false): FriendScanResult {
  return {
    feeds,
    opml: '<opml />',
    generatedAt: Date.now(),
    checkedCount: 12,
    partial,
  };
}

describe('FriendFeedsDialog', () => {
  let supporter: { isSupporter: ReturnType<typeof vi.fn> };
  let scan: {
    progress: ReturnType<typeof signal>;
    result: ReturnType<typeof signal>;
    running: ReturnType<typeof vi.fn>;
    percent: ReturnType<typeof vi.fn>;
    available: ReturnType<typeof vi.fn>;
    scan: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    loadStored: ReturnType<typeof vi.fn>;
    forget: ReturnType<typeof vi.fn>;
  };

  /**
   * Stands in for the real add path.
   *
   * `addFeed.add(url, useProxy)` is what proves a feed is readable; the dialog's
   * job is to call it direct-first-then-proxy and to record what happened, so
   * the double is keyed on `useProxy` to let a test say "direct fails, proxy
   * works" — the shape most personal blogs actually have.
   */
  let addFeed: { add: ReturnType<typeof vi.fn> };
  let proxyAvailable: boolean;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    proxyAvailable = true;
    addFeed = {
      // Writes the subscription, like the real one: these tests assert on the
      // resulting list, and the limit is enforced by `RssSubscriptions.add`,
      // so a double that skipped the write would test nothing that matters.
      add: vi.fn((url: string, useProxy: boolean) => {
        const subs = TestBed.inject(RssSubscriptions);
        const error = subs.add(url, `Feed at ${url}`, useProxy, 3);
        return error ? throwError(() => new Error(error)) : of({ title: url, itemCount: 3 });
      }),
    };
    supporter = { isSupporter: vi.fn().mockReturnValue(true) };
    scan = {
      progress: signal(null),
      result: signal(null),
      running: vi.fn().mockReturnValue(false),
      percent: vi.fn().mockReturnValue(null),
      available: vi.fn().mockReturnValue(true),
      scan: vi.fn().mockResolvedValue(null),
      stop: vi.fn(),
      loadStored: vi.fn().mockResolvedValue(null),
      forget: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [FriendFeedsDialog],
      providers: [
        provideRouter([]),
        { provide: SupporterStatus, useValue: supporter },
        { provide: FriendFeedScan, useValue: scan },
        { provide: ProfileAccountKey, useValue: { current: () => 'account-1' } },
        // The scan walks *your* following list, so it needs an account to walk.
        // Signed out is a real state the dialog handles, but it is not the one
        // most of these tests are about.
        { provide: Auth, useValue: { account: signal({ id: 'me', acct: 'me' }) } },
        { provide: RssAddFeed, useValue: addFeed },
        { provide: CorsProxy, useValue: { available: () => proxyAvailable } },
        {
          provide: CorsProxySettings,
          useValue: { missingEntitledProxy: () => false, adoptSupporterProxy: vi.fn() },
        },
      ],
    });
  });

  function render(): ComponentFixture<FriendFeedsDialog> {
    const fixture = TestBed.createComponent(FriendFeedsDialog);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<FriendFeedsDialog>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Click the first button whose label contains `label`. */
  function clickButton(fixture: ComponentFixture<FriendFeedsDialog>, label: string): void {
    const button = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((candidate) => candidate.textContent?.includes(label));
    if (!button) {
      throw new Error(`No button labelled ${label}`);
    }
    button.click();
  }

  it('offers the upsell rather than the scan when the account is not Plus', () => {
    // Visible to everyone on purpose: a feature nobody can see is a feature
    // nobody upgrades for. What must not happen is it being *runnable*.
    supporter.isSupporter.mockReturnValue(false);

    const fixture = render();

    expect(text(fixture)).toContain('Part of Mawkingbird Plus');
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];
    expect(buttons.some((b) => b.textContent?.includes('Start checking'))).toBe(false);
  });

  it('quotes the cost in sites before anything is spent', () => {
    const fixture = render();

    // Sites, not accounts: one profile carries up to four links, so only the
    // site count maps to requests actually made.
    expect(text(fixture)).toContain('500 sites');
  });

  it('will not start without a proxy to fetch through', () => {
    scan.available.mockReturnValue(false);

    const fixture = render();

    const start = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((b) => b.textContent?.includes('Start checking'));
    expect(start?.disabled).toBe(true);
  });

  it('shows what was found and never what was not', () => {
    scan.result.set(result([feed('https://one.example/feed.xml')]));

    const fixture = render();
    const body = text(fixture);

    expect(body).toContain('Blog at https://one.example/feed.xml');
    expect(body).toContain('from ana');
    // The sites that had nothing are one number, not hundreds of rows.
    expect(body).toContain('checked 12 sites');
  });

  it('says a stopped run may have missed things', () => {
    scan.result.set(result([feed('https://one.example/feed.xml')], true));

    expect(text(render())).toContain('Stopped before the end');
  });

  it('reports finding nothing as a plain answer', () => {
    scan.result.set(result([]));

    const fixture = render();

    expect(text(fixture)).toContain('No feeds found');
    // Nothing to download and nothing to follow, so neither is offered.
    const labels = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].map((b) => b.textContent?.trim());
    expect(labels.some((l) => l?.includes('Follow all'))).toBe(false);
    expect(labels.some((l) => l?.includes('Download'))).toBe(false);
  });

  it('fills to the subscription limit and says what was left over', async () => {
    // The user asked for all of them, so they should get as many as they can
    // have — and then be told plainly why the rest did not fit, with the lever
    // that fixes it named.
    const subs = TestBed.inject(RssSubscriptions);
    subs.setLimit(2);
    scan.result.set(
      result([
        feed('https://one.example/feed.xml'),
        feed('https://two.example/feed.xml'),
        feed('https://three.example/feed.xml'),
      ]),
    );

    const fixture = render();
    const followAll = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((b) => b.textContent?.includes('Follow all'));
    followAll?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(subs.feeds()).toHaveLength(2);
    const body = text(fixture);
    expect(body).toContain('Added 2');
    expect(body).toContain('2-feed limit');
  });

  it('marks a feed as followed once it has been added', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    scan.result.set(result([feed('https://one.example/feed.xml')]));

    const fixture = render();
    const follow = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((b) => b.textContent?.trim() === 'Follow');
    follow?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(subs.has('https://one.example/feed.xml')).toBe(true);
    expect(text(fixture)).toContain('Following');
  });

  it('reopens on the stored result rather than asking to scan again', async () => {
    // The result is the expensive part and it is already paid for.
    scan.loadStored.mockResolvedValue(result([feed('https://one.example/feed.xml')]));

    render();
    await Promise.resolve();

    expect(scan.loadStored).toHaveBeenCalledWith('account-1');
  });
  /**
   * Regression: a stray backdrop click abandoned a running scan.
   *
   * The scan itself survives — it is root-provided, so reopening shows it
   * again — but a dialog that vanishes minutes into a job the user has paid
   * proxy requests for reads as a crash. Stop is right there for anyone who
   * means it.
   */
  it('ignores a backdrop click while a scan is running', () => {
    scan.running.mockReturnValue(true);
    scan.progress.set({
      phase: 'probing',
      accountsWalked: 10,
      accountsTotal: 10,
      probed: 1,
      probeTarget: 5,
      found: 0,
      linksFound: 3,
      fromCache: 0,
    });
    const fixture = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.overlay')?.click();

    expect(closed).not.toHaveBeenCalled();
  });

  it('still closes on a backdrop click when nothing is running', () => {
    const fixture = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.overlay')?.click();

    expect(closed).toHaveBeenCalled();
  });
  /**
   * Regression: every subscription claimed it worked without the proxy.
   *
   * The scan reads a *page* to find `<link rel=alternate>`; how that page was
   * fetched says nothing about the feed. Writing subscriptions straight from
   * discovery produced hundreds of entries that looked fine and then failed on
   * first read, because most personal blogs send no CORS headers.
   */
  it('falls back to the proxy when a feed cannot be read directly', async () => {
    addFeed.add.mockImplementation((url: string, useProxy: boolean) => {
      if (!useProxy) {
        return throwError(() => new Error('CORS'));
      }
      const subs = TestBed.inject(RssSubscriptions);
      subs.add(url, `Feed at ${url}`, true, 3);
      return of({ title: url, itemCount: 3 });
    });
    scan.result.set(result([feed('https://one.example/feed.xml')]));

    const fixture = render();
    clickButton(fixture, 'Follow');
    await fixture.whenStable();
    fixture.detectChanges();

    // Direct first — free and private, and it works for the minority who send
    // the header — then the proxy. Never the other way round.
    expect(addFeed.add.mock.calls.map(([, useProxy]) => useProxy)).toEqual([false, true]);
    // And the subscription records the route that actually worked, so the
    // reader does not have to rediscover it.
    expect(TestBed.inject(RssSubscriptions).feeds()[0].useProxy).toBe(true);
  });

  it('does not ask the user to opt into the proxy feed by feed', async () => {
    // These are public feed URLs found on public pages, carrying no credential.
    // Asking hundreds of times would be both tedious and a strange question.
    addFeed.add.mockImplementation((url: string, useProxy: boolean) => {
      if (!useProxy) {
        return throwError(() => new Error('CORS'));
      }
      TestBed.inject(RssSubscriptions).add(url, url, true, 3);
      return of({ title: url, itemCount: 3 });
    });
    scan.result.set(
      result([feed('https://one.example/feed.xml'), feed('https://two.example/feed.xml')]),
    );

    const fixture = render();
    clickButton(fixture, 'Follow all');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(RssSubscriptions).feeds()).toHaveLength(2);
  });

  /**
   * Regression: hitting the ten-feed default sent the user to another page.
   *
   * A scan that finds hundreds of feeds is the moment the default is proven
   * wrong, and losing this screen — and its results — to go and change a number
   * is a poor answer to a question the user answered by pressing Follow all.
   */
  it('raises the limit in place and follows the rest', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.setLimit(1);
    scan.result.set(
      result([
        feed('https://one.example/feed.xml'),
        feed('https://two.example/feed.xml'),
        feed('https://three.example/feed.xml'),
      ]),
    );

    const fixture = render();
    clickButton(fixture, 'Follow all');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(subs.feeds()).toHaveLength(1);

    clickButton(fixture, 'Raise the limit');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(subs.limit()).toBe(3);
    expect(subs.feeds()).toHaveLength(3);
  });

  it('raises the limit only as far as this result needs', async () => {
    // The cap exists because long lists are slow to read, so the honest move is
    // to fit the list in hand rather than to remove the ceiling.
    const subs = TestBed.inject(RssSubscriptions);
    subs.setLimit(1);
    scan.result.set(
      result([feed('https://one.example/feed.xml'), feed('https://two.example/feed.xml')]),
    );

    const fixture = render();
    clickButton(fixture, 'Follow all');
    await fixture.whenStable();
    fixture.detectChanges();
    clickButton(fixture, 'Raise the limit');
    await fixture.whenStable();

    expect(subs.limit()).toBe(2);
  });

  it('reports feeds that could not be read even through the proxy', async () => {
    addFeed.add.mockReturnValue(throwError(() => new Error('unreadable')));
    scan.result.set(result([feed('https://one.example/feed.xml')]));

    const fixture = render();
    clickButton(fixture, 'Follow all');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('could not be read');
  });
});
