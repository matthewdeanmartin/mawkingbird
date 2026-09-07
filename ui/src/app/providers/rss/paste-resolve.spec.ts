import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Api } from '../../api';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyBatchFetch } from '../cors-proxy/cors-proxy-batch-fetch';
import { handleIn, PasteResolve, youtubeFeedFor } from './paste-resolve';
import { RssFetch } from './rss-fetch';

describe('handleIn', () => {
  it('reads every handle form', () => {
    expect(handleIn('@alice@mastodon.social')).toBe('alice@mastodon.social');
    expect(handleIn('alice@mastodon.social')).toBe('alice@mastodon.social');
    expect(handleIn('https://mastodon.social/@alice')).toBe('alice@mastodon.social');
    expect(handleIn('https://mastodon.social/users/alice')).toBe('alice@mastodon.social');
  });

  it('reads a local handle, which has no host to add', () => {
    // `lookupAccount` takes a bare username for an account on this server.
    expect(handleIn('@grace')).toBe('grace');
  });

  it('requires the @ on a local handle, so bare words stay searchable', () => {
    // Without this, every typo and unfinished domain would become an account
    // lookup instead of the message explaining what the box wants.
    expect(handleIn('grace')).toBeNull();
  });

  it('is not fooled by a plain site url', () => {
    expect(handleIn('https://blog.test/')).toBeNull();
    expect(handleIn('https://blog.test/posts/hello')).toBeNull();
    expect(handleIn('not a url')).toBeNull();
  });
});

describe('youtubeFeedFor', () => {
  it('builds the feed url from a channel id', () => {
    expect(youtubeFeedFor(new URL('https://www.youtube.com/channel/UCabc123/videos'))?.url).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123',
    );
  });

  it('leaves handle and video urls to the generic probe', () => {
    // These need the page fetched anyway, and the generic probe already handles
    // them — a bespoke scraper here would duplicate it.
    expect(youtubeFeedFor(new URL('https://www.youtube.com/@somebody'))).toBeNull();
    expect(youtubeFeedFor(new URL('https://www.youtube.com/watch?v=abc'))).toBeNull();
  });

  it('ignores other hosts', () => {
    expect(youtubeFeedFor(new URL('https://notyoutube.com/channel/UCabc'))).toBeNull();
  });
});

describe('PasteResolve', () => {
  /** url → html */
  let pages: Map<string, string>;
  /** url → feed title, for urls that parse as feeds */
  let feeds: Map<string, string>;
  let accounts: Map<string, { id: string; url: string; acct: string }>;
  let proxyAvailable: boolean;
  let httpGet: ReturnType<typeof vi.fn>;
  let fetchFeed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pages = new Map();
    feeds = new Map();
    accounts = new Map();
    proxyAvailable = true;

    httpGet = vi.fn((url: string) => {
      const html = pages.get(url);
      return html === undefined ? throwError(() => new Error('unreachable')) : of(html);
    });
    fetchFeed = vi.fn((url: string) => {
      const title = feeds.get(url);
      return title === undefined
        ? throwError(() => new Error('not a feed'))
        : of({ title, items: [] });
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: CorsProxyBatchFetch, useValue: { text: httpGet } },
        { provide: RssFetch, useValue: { fetchFeed } },
        {
          provide: CorsProxy,
          useValue: {
            available: () => proxyAvailable,
            proxyRequest: (target: string) => ({ url: target, headers: {} }),
          },
        },
        {
          provide: Api,
          useValue: {
            lookupAccount: vi.fn((acct: string) => {
              const found = accounts.get(acct);
              return found ? of(found) : throwError(() => new Error('404'));
            }),
          },
        },
      ],
    });
  });

  const resolver = () => TestBed.inject(PasteResolve);

  const page = (url: string, ...links: string[]) =>
    pages.set(
      url,
      `<html><head><title>The Blog</title>${links
        .map((h) => `<link rel="alternate" type="application/rss+xml" href="${h}">`)
        .join('')}</head><body>hi</body></html>`,
    );

  it('subscribes a site with one declared feed', async () => {
    page('https://blog.test/', '/feed.xml');
    const result = await resolver().resolve('https://blog.test/');

    expect(result.kind).toBe('feeds');
    if (result.kind !== 'feeds') return;
    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0].url).toBe('https://blog.test/feed.xml');
  });

  it('pre-picks the main feed over the comments feed', async () => {
    page('https://blog.test/', '/feed/', '/comments/feed/');
    const result = await resolver().resolve('https://blog.test/');

    expect(result.kind).toBe('feeds');
    if (result.kind !== 'feeds') return;
    // Both offered — the alternative stays visible — but the main one is first.
    expect(result.feeds).toHaveLength(2);
    expect(result.feeds[0].url).toBe('https://blog.test/feed/');
  });

  it('takes a direct feed url without fetching the page', async () => {
    feeds.set('https://blog.test/feed.xml', 'The Blog');
    const result = await resolver().resolve('https://blog.test/feed.xml');

    expect(result.kind).toBe('feeds');
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('falls back to a page probe when a feed-ish url is really a page', async () => {
    // /feed serving HTML is common enough that the extension cannot be trusted.
    page('https://blog.test/feed', '/real-feed.xml');
    const result = await resolver().resolve('https://blog.test/feed');

    expect(result.kind).toBe('feeds');
    if (result.kind !== 'feeds') return;
    expect(result.feeds[0].url).toBe('https://blog.test/real-feed.xml');
  });

  it('retries a direct feed through the proxy when the direct fetch fails', async () => {
    fetchFeed.mockImplementation((url: string, opts: { useProxy?: boolean }) =>
      opts.useProxy ? of({ title: 'Proxied', items: [] }) : throwError(() => new Error('cors')),
    );
    const result = await resolver().resolve('https://blog.test/feed.xml');

    expect(result.kind).toBe('feeds');
    if (result.kind !== 'feeds') return;
    expect(result.needsProxy).toBe(true);
  });

  it('offers a follow for a handle, with rss as the secondary option', async () => {
    accounts.set('alice@mastodon.social', {
      id: '42',
      url: 'https://mastodon.social/@alice',
      acct: 'alice@mastodon.social',
    });
    const result = await resolver().resolve('@alice@mastodon.social');

    expect(result.kind).toBe('account');
    if (result.kind !== 'account') return;
    expect(result.account.id).toBe('42');
    // Available, but the UI presents it as the lesser option.
    expect(result.rssUrl).toBe('https://mastodon.social/@alice.rss');
  });

  it('falls through to a page probe when a handle-shaped url is not an account', async () => {
    page('https://blog.test/@notanaccount', '/feed.xml');
    const result = await resolver().resolve('https://blog.test/@notanaccount');

    expect(result.kind).toBe('feeds');
  });

  it('suggests a scheme for a bare domain rather than fetching it', async () => {
    const result = await resolver().resolve('example.com');

    expect(result).toEqual({ kind: 'suggestion', url: 'https://example.com' });
    // The point: no network call happened on the user's behalf.
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('explains a non-url instead of guessing', async () => {
    const result = await resolver().resolve('what is rss anyway');

    expect(result.kind).toBe('none');
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('refuses non-http schemes', async () => {
    expect((await resolver().resolve('javascript:alert(1)')).kind).toBe('none');
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('says a site declares no feed, rather than failing silently', async () => {
    page('https://nofeeds.test/');
    const result = await resolver().resolve('https://nofeeds.test/');

    expect(result.kind).toBe('none');
    if (result.kind !== 'none') return;
    expect(result.reason).toContain('No feed');
  });

  it('resolves the same paste twice for one network round trip', async () => {
    page('https://blog.test/', '/feed.xml');
    await resolver().resolve('https://blog.test/');
    await resolver().resolve('https://blog.test/');

    // Pasting the same url twice while trying to make something work is the
    // common case, and each probe costs proxy budget.
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure caused by missing configuration', async () => {
    proxyAvailable = false;
    page('https://blog.test/', '/feed.xml');

    const first = await resolver().resolve('https://blog.test/');
    expect(first.kind).toBe('none');
    if (first.kind !== 'none') return;
    expect(first.reason).toContain('CORS proxy');

    // The user goes and sets a proxy up; the same paste must now work.
    proxyAvailable = true;
    expect((await resolver().resolve('https://blog.test/')).kind).toBe('feeds');
  });

  it('reports an unreachable site', async () => {
    const result = await resolver().resolve('https://gone.test/');

    expect(result.kind).toBe('none');
    if (result.kind !== 'none') return;
    expect(result.reason).toContain('Couldn’t reach');
  });

  it('handles a url that serves a feed with no feed-ish extension', async () => {
    pages.set('https://blog.test/x', '<?xml version="1.0"?><rss version="2.0"><channel/></rss>');
    feeds.set('https://blog.test/x', 'Sneaky Feed');
    const result = await resolver().resolve('https://blog.test/x');

    expect(result.kind).toBe('feeds');
    if (result.kind !== 'feeds') return;
    expect(result.feeds[0].title).toBe('Sneaky Feed');
  });

  it('clears running state when finished', async () => {
    page('https://blog.test/', '/feed.xml');
    await resolver().resolve('https://blog.test/');

    expect(resolver().running()).toBe(false);
  });
});
