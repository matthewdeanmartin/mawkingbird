import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableProxyFlags } from '../../../testing/enable-proxy-flags';
import { Api } from '../../../api';
import { FeatureFlags } from '../../../feature-flags';
import { SupporterStatus } from '../../../providers/account/supporter-status';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import { RssFetch } from '../../../providers/rss/rss-fetch';
import { RssSubscriptions } from '../../../providers/rss/rss-subscriptions';
import { AddFeedDialog } from './add-feed-dialog';

interface DialogInternals {
  input: WritableSignal<string>;
}

function feed(title: string, itemCount = 3) {
  return {
    title,
    link: null,
    items: Array.from({ length: itemCount }, (_, i) => ({
      guid: `${title}-${i}`,
      title: `${title} ${i}`,
      link: null,
      publishedAt: null,
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

/** A page declaring `hrefs` as feeds. */
function page(...hrefs: string[]): string {
  return `<html><head><title>The Blog</title>${hrefs
    .map((h) => `<link rel="alternate" type="application/rss+xml" href="${h}">`)
    .join('')}</head><body>x</body></html>`;
}

describe('AddFeedDialog', () => {
  let fetchFeed: ReturnType<typeof vi.fn>;
  let httpGet: ReturnType<typeof vi.fn>;
  let lookupAccount: ReturnType<typeof vi.fn>;
  let follow: ReturnType<typeof vi.fn>;
  /** Page URL → HTML, for the site-probe path. */
  let pages: Map<string, string>;

  beforeEach(() => {
    localStorage.clear();
    pages = new Map();
    fetchFeed = vi.fn();
    httpGet = vi.fn((url: string) => {
      const html = pages.get(url);
      return html === undefined ? throwError(() => new Error('unreachable')) : of(html);
    });
    lookupAccount = vi.fn(() => throwError(() => new Error('404')));
    follow = vi.fn(() => of({ following: true }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RssFetch, useValue: { fetchFeed } },
        { provide: HttpClient, useValue: { get: httpGet } },
        { provide: Api, useValue: { lookupAccount, follow } },
      ],
    });
  });

  /**
   * Configure a proxy that passes the target URL through unchanged, so the page
   * map can be keyed by the real site URL. Probing a site needs one.
   */
  function withProxy(): void {
    TestBed.inject(CorsProxySettings).select('custom', {
      template: '{url}',
      encodeTarget: false,
    });
  }

  function setUp(): ComponentFixture<AddFeedDialog> {
    const fixture = TestBed.createComponent(AddFeedDialog);
    fixture.detectChanges();
    return fixture;
  }

  function typeUrl(fixture: ComponentFixture<AddFeedDialog>, url: string): void {
    (fixture.componentInstance as unknown as DialogInternals).input.set(url);
    fixture.detectChanges();
  }

  /** Submit and let the resolver's promises settle. */
  async function submit(fixture: ComponentFixture<AddFeedDialog>): Promise<void> {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(fixture: ComponentFixture<AddFeedDialog>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function buttonLabelled(fixture: ComponentFixture<AddFeedDialog>, label: string) {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined;
  }

  it('subscribes and emits (added) + (closed) on a direct feed url', async () => {
    fetchFeed.mockReturnValue(of(feed('A News', 5)));
    const fixture = setUp();
    const added = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.added.subscribe(added);
    fixture.componentInstance.closed.subscribe(closed);

    typeUrl(fixture, 'https://a.example/feed');
    await submit(fixture);

    expect(TestBed.inject(RssSubscriptions).has('https://a.example/feed')).toBe(true);
    expect(added).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('subscribes a site with one declared feed in a single step', async () => {
    // The whole point of the sprint: a site URL, not a feed URL, and no
    // view-source in between.
    withProxy();
    pages.set('https://blog.example/', page('/feed.xml'));
    fetchFeed.mockReturnValue(of(feed('The Blog', 4)));
    const fixture = setUp();
    const added = vi.fn();
    fixture.componentInstance.added.subscribe(added);

    typeUrl(fixture, 'https://blog.example/');
    await submit(fixture);

    expect(TestBed.inject(RssSubscriptions).has('https://blog.example/feed.xml')).toBe(true);
    expect(added).toHaveBeenCalledTimes(1);
  });

  it('offers a choice when a site declares several feeds, best guess pre-picked', async () => {
    withProxy();
    pages.set('https://blog.example/', page('/comments/feed/', '/feed/'));
    const fixture = setUp();
    typeUrl(fixture, 'https://blog.example/');
    await submit(fixture);

    // Nothing subscribed yet — this is a decision only the user can make.
    expect(fetchFeed).not.toHaveBeenCalled();
    const radios = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
        'input[type=radio]',
      ),
    );
    expect(radios).toHaveLength(2);
    // The main feed is pre-picked, not the comments feed.
    expect(radios.find((r) => r.checked)?.value).toBe('https://blog.example/feed/');
    // ...and the alternative is still on screen, which is what makes an
    // imperfect ranking survivable.
    expect(text(fixture)).toContain('comments/feed');
  });

  it('subscribes the chosen candidate, not the pre-picked one', async () => {
    withProxy();
    pages.set('https://blog.example/', page('/comments/feed/', '/feed/'));
    fetchFeed.mockReturnValue(of(feed('Comments', 2)));
    const fixture = setUp();
    typeUrl(fixture, 'https://blog.example/');
    await submit(fixture);

    fixture.componentInstance.choose('https://blog.example/comments/feed/');
    fixture.detectChanges();
    buttonLabelled(fixture, 'Subscribe')!.click();
    await fixture.whenStable();

    expect(TestBed.inject(RssSubscriptions).has('https://blog.example/comments/feed/')).toBe(true);
  });

  it('offers Follow for a fediverse handle, and does not subscribe by RSS', async () => {
    lookupAccount.mockReturnValue(
      of({
        id: '42',
        acct: 'alice@mastodon.social',
        username: 'alice',
        display_name: 'Alice',
        url: 'https://mastodon.social/@alice',
        avatar: 'https://mastodon.social/a.png',
      }),
    );
    const fixture = setUp();
    typeUrl(fixture, '@alice@mastodon.social');
    await submit(fixture);

    expect(text(fixture)).toContain('alice@mastodon.social');
    const followBtn = buttonLabelled(fixture, 'Follow');
    expect(followBtn).toBeTruthy();

    followBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(follow).toHaveBeenCalledWith('42');
    // Following an account must not also subscribe to its RSS feed.
    expect(TestBed.inject(RssSubscriptions).feeds()).toHaveLength(0);
  });

  it('still allows RSS on an account, as the secondary option', async () => {
    lookupAccount.mockReturnValue(
      of({
        id: '42',
        acct: 'alice@mastodon.social',
        username: 'alice',
        display_name: 'Alice',
        url: 'https://mastodon.social/@alice',
        avatar: 'https://mastodon.social/a.png',
      }),
    );
    fetchFeed.mockReturnValue(of(feed('Alice', 10)));
    const fixture = setUp();
    typeUrl(fixture, '@alice@mastodon.social');
    await submit(fixture);

    await fixture.componentInstance.subscribeToAccountRss();

    expect(TestBed.inject(RssSubscriptions).has('https://mastodon.social/@alice.rss')).toBe(true);
    expect(follow).not.toHaveBeenCalled();
  });

  it('suggests a scheme for a bare domain rather than fetching it', async () => {
    const fixture = setUp();
    typeUrl(fixture, 'example.com');
    await submit(fixture);

    expect(text(fixture)).toContain('https://example.com');
    expect(httpGet).not.toHaveBeenCalled();
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it('explains a non-url instead of guessing at one', async () => {
    const fixture = setUp();
    typeUrl(fixture, 'what is rss anyway');
    await submit(fixture);

    expect(fetchFeed).not.toHaveBeenCalled();
    expect(httpGet).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('doesn’t look like a link');
  });

  it('shows an error and does not emit when a feed will not load', async () => {
    fetchFeed.mockReturnValue(throwError(() => new Error('CORS blocked')));
    const fixture = setUp();
    const added = vi.fn();
    fixture.componentInstance.added.subscribe(added);

    typeUrl(fixture, 'https://a.example/feed.xml');
    await submit(fixture);

    expect(added).not.toHaveBeenCalled();
    expect(TestBed.inject(RssSubscriptions).has('https://a.example/feed.xml')).toBe(false);
  });

  it('a Plus subscriber with no proxy configured is adopted onto one and retried silently', async () => {
    enableProxyFlags();
    TestBed.inject(FeatureFlags).setState('proxy-mawkingbird-plus', 'production');
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    expect(TestBed.inject(CorsProxySettings).currentId()).toBeNull();

    // Direct fetches fail as CORS typically does; anything proxied succeeds.
    // Written as a predicate rather than a call-count sequence because the
    // resolver and the subscribe path each make their own attempts, and a
    // positional mock would silently test the wrong one.
    fetchFeed.mockImplementation((_url: string, options: { useProxy?: boolean } = {}) =>
      options.useProxy ? of(feed('Vox', 20)) : throwError(() => new Error('CORS blocked')),
    );

    const fixture = setUp();
    const added = vi.fn();
    fixture.componentInstance.added.subscribe(added);

    typeUrl(fixture, 'https://www.vox.com/rss/index.xml');
    await submit(fixture);

    expect(TestBed.inject(CorsProxySettings).currentId()).toBe('mawkingbird');
    expect(TestBed.inject(RssSubscriptions).has('https://www.vox.com/rss/index.xml')).toBe(true);
    expect(added).toHaveBeenCalledTimes(1);
    // No manual "try again" prompt shown — the retry already happened.
    expect(text(fixture)).not.toContain('Try again via');
  });

  it('emits (closed) on Cancel without subscribing', () => {
    const fixture = setUp();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    buttonLabelled(fixture, 'Cancel')!.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
