import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YoutubeFeeds } from './youtube-feeds';
import { RssCache } from '../rss/rss-cache';
import { ClientPrefs } from '../../client-prefs';
import { FeatureFlags } from '../../feature-flags';
import { SupporterStatus } from '../account/supporter-status';
import { PlusTokenSource } from '../account/plus-token.interceptor';
import { EXTERNAL_FETCH } from '../external-fetch';
import { parseFeed } from '../rss/rss-parser';

const id = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
describe('YouTube feed transport', () => {
  const cache = { get: vi.fn(), put: vi.fn().mockResolvedValue(undefined) };
  beforeEach(() => {
    cache.get.mockReset();
    cache.put.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RssCache, useValue: cache },
        { provide: ClientPrefs, useValue: { rssCacheTtlHours: () => 24 } },
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: PlusTokenSource, useValue: { token: vi.fn() } },
      ],
    });
  });
  it('fetches free RSS through the narrow proxy without YouTube credentials', async () => {
    const request = TestBed.inject(YoutubeFeeds).feed(id);
    await Promise.resolve();
    await Promise.resolve();
    const http = TestBed.inject(HttpTestingController);
    const pending = http.expectOne(
      (req) => new URL(req.url).searchParams.get('route') === 'youtube',
    );
    expect(pending.request.context.get(EXTERNAL_FETCH)).toBe(true);
    expect(pending.request.headers.has('Authorization')).toBe(false);
    expect(pending.request.withCredentials).toBe(false);
    pending.flush('<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title></feed>');
    expect((await request).title).toBe('Example');
    expect(cache.put).toHaveBeenCalled();
    http.verify();
  });
  it('serves cached content when refresh fails without removing subscriptions', async () => {
    const feed = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Saved</title></feed>');
    cache.get.mockResolvedValue({ stale: true, feed });
    const request = TestBed.inject(YoutubeFeeds).feed(id, true);
    await Promise.resolve();
    await Promise.resolve();
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.method === 'GET')
      .flush('Not found', { status: 404, statusText: 'Not found' });
    expect(await request).toBe(feed);
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('refuses free search before loading the library or making a request', async () => {
    expect(TestBed.inject(SupporterStatus).isSupporter()).toBe(false);
    await expect(TestBed.inject(YoutubeFeeds).search('birds', 'video')).rejects.toThrow('Plus');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
  it('runs anonymous InnerTube search through the Plus-only proxy and parses its results', async () => {
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    vi.mocked(TestBed.inject(PlusTokenSource).token).mockResolvedValue('plus-token-for-proxy');
    const result = TestBed.inject(YoutubeFeeds).search('Example', 'channel');
    const http = TestBed.inject(HttpTestingController);
    let pending: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      pending = http.expectOne(
        (req) => new URL(req.url).searchParams.get('route') === 'youtube-search',
      );
    });
    expect(pending!.request.headers.get('X-Mawkingbird-Token')).toBe('plus-token-for-proxy');
    expect(pending!.request.headers.has('Authorization')).toBe(false);
    expect(pending!.request.headers.has('Cookie')).toBe(false);
    expect(pending!.request.body).toContain('Example');
    pending!.flush(
      JSON.stringify({
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: {
              sectionListRenderer: {
                contents: [
                  {
                    itemSectionRenderer: {
                      contents: [
                        {
                          channelRenderer: {
                            channelId: id,
                            title: { simpleText: 'Example' },
                            navigationEndpoint: { browseEndpoint: { browseId: id } },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    );
    expect(await result).toEqual([
      { id, title: 'Example', channelId: id, channelTitle: 'Example' },
    ]);
    http.verify();
  });
});
