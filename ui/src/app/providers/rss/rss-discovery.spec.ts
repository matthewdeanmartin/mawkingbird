import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyBatchFetch } from '../cors-proxy/cors-proxy-batch-fetch';
import { feedLinksIn, RssDiscovery } from './rss-discovery';
import { RssSubscriptions } from './rss-subscriptions';

describe('feedLinksIn', () => {
  it('finds RSS and Atom declarations', () => {
    const html = `
      <link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="https://x.test/atom">
    `;
    // `type` is carried through, not discarded: two declarations of the same
    // content in different formats are told apart by it. See `collapseFormats`.
    expect(feedLinksIn(html, 'https://x.test/')).toEqual([
      { url: 'https://x.test/feed.xml', title: 'Blog', type: 'application/rss+xml' },
      { url: 'https://x.test/atom', title: 'x.test', type: 'application/atom+xml' },
    ]);
  });

  it('resolves a relative href against the site, not against this app', () => {
    const html = `<link rel="alternate" type="application/rss+xml" href="feed/">`;
    expect(feedLinksIn(html, 'https://blog.test/posts/')[0].url).toBe(
      'https://blog.test/posts/feed/',
    );
  });

  it('ignores alternates that are not feeds', () => {
    // The same rel carries translations and canonical alternates; only the feed
    // MIME types are ours.
    const html = `
      <link rel="alternate" hreflang="fr" href="https://x.test/fr">
      <link rel="alternate" type="text/html" href="https://x.test/amp">
      <link rel="stylesheet" type="application/rss+xml" href="https://x.test/nope">
    `;
    expect(feedLinksIn(html, 'https://x.test/')).toEqual([]);
  });

  it('de-duplicates the same feed declared twice', () => {
    const html = `
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    `;
    expect(feedLinksIn(html, 'https://x.test/')).toHaveLength(1);
  });

  it('refuses non-http schemes', () => {
    const html = `<link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">`;
    expect(feedLinksIn(html, 'https://x.test/')).toEqual([]);
  });

  it('survives markup with no links at all', () => {
    expect(feedLinksIn('<html><body>hi</body></html>', 'https://x.test/')).toEqual([]);
    expect(feedLinksIn('', 'https://x.test/')).toEqual([]);
  });
});

describe('RssDiscovery', () => {
  /** site URL → HTML, anything else fails the fetch. */
  let pages: Map<string, string>;
  let proxyAvailable: boolean;
  let fetchText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    pages = new Map();
    proxyAvailable = true;
    fetchText = vi.fn((url: string) => {
      const html = pages.get(url);
      return html === undefined ? throwError(() => new Error('boom')) : of(html);
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: CorsProxyBatchFetch, useValue: { text: fetchText } },
        {
          provide: CorsProxy,
          useValue: {
            available: () => proxyAvailable,
            proxyRequest: (target: string) => ({ url: target, headers: {} }),
          },
        },
      ],
    });
  });

  const feedLink = (href: string, title = 'Feed') =>
    `<link rel="alternate" type="application/rss+xml" title="${title}" href="${href}">`;

  it('probes the site root, not the article URL', async () => {
    pages.set('https://blog.test/', feedLink('/feed.xml'));
    const found = await TestBed.inject(RssDiscovery).discover([
      { url: 'https://blog.test/posts/some-article', via: 'alice' },
    ]);

    expect(found).toEqual([
      {
        url: 'https://blog.test/feed.xml',
        title: 'Feed',
        siteUrl: 'https://blog.test/',
        via: 'alice',
        type: 'application/rss+xml',
      },
    ]);
  });

  it('probes each site once however many links point at it', async () => {
    pages.set('https://blog.test/', feedLink('/feed.xml'));
    await TestBed.inject(RssDiscovery).discover([
      { url: 'https://blog.test/a', via: 'alice' },
      { url: 'https://blog.test/b', via: 'bob' },
      { url: 'https://blog.test/c', via: 'carol' },
    ]);

    expect(fetchText).toHaveBeenCalledTimes(1);
    // Attribution goes to whoever linked it first.
    expect(TestBed.inject(RssDiscovery).found()[0].via).toBe('alice');
  });

  it('caps how many sites one run will fetch', async () => {
    const links = Array.from({ length: 25 }, (_, i) => ({
      url: `https://site${i}.test/post`,
      via: 'alice',
    }));
    await TestBed.inject(RssDiscovery).discover(links);

    // Each probe is a third-party fetch on a shared budget.
    expect(fetchText).toHaveBeenCalledTimes(10);
  });

  it('keeps going when a site will not load', async () => {
    pages.set('https://ok.test/', feedLink('/feed.xml'));
    // dead.test is absent from `pages`, so its fetch throws.
    const found = await TestBed.inject(RssDiscovery).discover([
      { url: 'https://dead.test/x', via: 'alice' },
      { url: 'https://ok.test/x', via: 'bob' },
    ]);

    expect(found.map((f) => f.url)).toEqual(['https://ok.test/feed.xml']);
  });

  it('does not suggest a feed already subscribed', async () => {
    pages.set('https://blog.test/', feedLink('/feed.xml'));
    TestBed.inject(RssSubscriptions).add('https://blog.test/feed.xml', 'Already');

    expect(
      await TestBed.inject(RssDiscovery).discover([{ url: 'https://blog.test/a', via: 'alice' }]),
    ).toEqual([]);
  });

  it('refuses to run without a proxy, and says why', async () => {
    proxyAvailable = false;
    const discovery = TestBed.inject(RssDiscovery);

    expect(await discovery.discover([{ url: 'https://blog.test/a', via: 'alice' }])).toEqual([]);
    expect(discovery.error()).toContain('CORS proxy');
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('ignores links that are not http(s)', async () => {
    await TestBed.inject(RssDiscovery).discover([
      { url: 'mailto:someone@example.com', via: 'alice' },
      { url: 'not a url', via: 'bob' },
    ]);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('clears running state when finished', async () => {
    pages.set('https://blog.test/', feedLink('/feed.xml'));
    const discovery = TestBed.inject(RssDiscovery);

    await discovery.discover([{ url: 'https://blog.test/a', via: 'alice' }]);

    expect(discovery.running()).toBe(false);
    expect(discovery.checked()).toBe(1);
  });
});
