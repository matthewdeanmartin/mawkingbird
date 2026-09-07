import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settleRssCache } from '../../testing/settle-rss-cache';
import { RssSubscriptions } from '../rss/rss-subscriptions';
import { HugoFeed } from './hugo-feed';
import { HugoRepo, HugoSettings } from './hugo-settings';

const REPO: HugoRepo = {
  owner: 'mistersql',
  repo: 'my-blog',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: 'https://mistersql.github.io/my-blog/',
  includeInProfile: false,
};

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>My Blog</title>
  <item><title>One</title><link>https://mistersql.github.io/my-blog/posts/one/</link><guid>one</guid></item>
  <item><title>Two</title><link>https://mistersql.github.io/my-blog/posts/two/</link><guid>two</guid></item>
</channel></rss>`;

const INDEX_XML = 'https://mistersql.github.io/my-blog/index.xml';

describe('HugoFeed', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  function connect(over: Partial<HugoRepo> = {}): HugoFeed {
    TestBed.inject(HugoSettings).connect('tok', { ...REPO, ...over });
    return TestBed.inject(HugoFeed);
  }

  it('finds the feed at Hugo default location and subscribes with no proxy', async () => {
    const feed = connect();
    const pending = feed.subscribe();
    await settleRssCache();

    httpMock.expectOne(INDEX_XML).flush(FEED);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 posts');

    const sub = TestBed.inject(RssSubscriptions).feeds()[0];
    expect(sub.url).toBe(INDEX_XML);
    expect(sub.title).toBe('mistersql/my-blog');
    // GitHub Pages is CORS-open, so proxying the user's own public writing
    // through a third party would be gratuitous. Falsy rather than literally
    // `false`: `RssSubscriptions` leaves the flag absent when it is off, which
    // is what makes an older subscription keep fetching directly.
    expect(TestBed.inject(RssSubscriptions).usesProxy(sub.url)).toBe(false);
  });

  it('falls back to other conventional feed names before giving up', async () => {
    const feed = connect();
    const pending = feed.subscribe();
    await settleRssCache();

    httpMock.expectOne(INDEX_XML).flush('', { status: 404, statusText: 'Not Found' });
    await settleRssCache();
    httpMock.expectOne('https://mistersql.github.io/my-blog/feed.xml').flush(FEED);

    const result = await pending;

    expect(result.ok).toBe(true);
    expect(TestBed.inject(RssSubscriptions).feeds()[0].url).toBe(
      'https://mistersql.github.io/my-blog/feed.xml',
    );
  });

  it('remembers which feed name won, so later checks do not re-guess', async () => {
    const feed = connect();
    const pending = feed.subscribe();
    await settleRssCache();
    httpMock.expectOne(INDEX_XML).flush('', { status: 404, statusText: 'Not Found' });
    await settleRssCache();
    httpMock.expectOne('https://mistersql.github.io/my-blog/feed.xml').flush(FEED);
    await pending;

    expect(TestBed.inject(HugoSettings).feedUrl()).toBe(
      'https://mistersql.github.io/my-blog/feed.xml',
    );
    expect(feed.subscribed()).toBe(true);
  });

  it('explains a CORS block in terms of what the user can do about it', async () => {
    const feed = connect();
    const pending = feed.subscribe();
    await settleRssCache();

    // status 0 is the browser hiding a cross-origin failure — in practice, no
    // CORS headers. The URL works fine when pasted into a tab, which is what
    // makes this the confusing case.
    for (const url of [
      INDEX_XML,
      'https://mistersql.github.io/my-blog/feed.xml',
      'https://mistersql.github.io/my-blog/rss.xml',
      'https://mistersql.github.io/my-blog/atom.xml',
      'https://mistersql.github.io/my-blog/index.rss',
    ]) {
      httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
      await settleRssCache();
    }

    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not allow other sites to read it');
    expect(TestBed.inject(RssSubscriptions).feeds()).toHaveLength(0);
  });

  it('asks for a site address rather than probing nothing', async () => {
    const feed = connect({ siteUrl: null });

    const result = await feed.subscribe();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('site address');
    httpMock.expectNone(() => true);
  });

  it('is idempotent — a second subscribe does not duplicate the feed', async () => {
    const feed = connect();
    const first = feed.subscribe();
    await settleRssCache();
    httpMock.expectOne(INDEX_XML).flush(FEED);
    await first;

    const second = feed.subscribe();
    await settleRssCache();
    httpMock.expectOne(INDEX_XML).flush(FEED);
    const result = await second;

    expect(result.ok).toBe(true);
    expect(result.message).toContain('already in your feeds');
    expect(TestBed.inject(RssSubscriptions).feeds()).toHaveLength(1);
  });

  it('reports subscribed state from the subscription list, not its own flag', async () => {
    const feed = connect();
    const pending = feed.subscribe();
    await settleRssCache();
    httpMock.expectOne(INDEX_XML).flush(FEED);
    await pending;
    expect(feed.subscribed()).toBe(true);

    // Removing it on the Feeds page must be reflected here, not disagreed with.
    TestBed.inject(RssSubscriptions).remove(INDEX_XML);

    expect(feed.subscribed()).toBe(false);
  });

  it('unsubscribes only its own feed', async () => {
    const subs = TestBed.inject(RssSubscriptions);
    subs.add('https://example.com/other.xml', 'Someone else');
    const feed = connect();
    const pending = feed.subscribe();
    await settleRssCache();
    httpMock.expectOne(INDEX_XML).flush(FEED);
    await pending;

    feed.unsubscribe();

    expect(subs.feeds().map((f) => f.url)).toEqual(['https://example.com/other.xml']);
  });
});
