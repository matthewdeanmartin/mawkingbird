import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aboutLink, YoutubeFeeds } from './youtube-feeds';
import { ExtensionBridge, extensionAccessOrigin } from '../../platform/extension/extension-bridge';
import { RssCache } from '../rss/rss-cache';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { SupporterStatus } from '../../accounts/mawkingbird/supporter-status';
import { PlusTokenSource } from '../../accounts/mawkingbird/plus-token.interceptor';
import { EXTERNAL_FETCH } from '../../platform/http/external-fetch';
import { parseFeed } from '../../../lib/rss/rss-parser';
import {
  PLATFORM_ARTICLE_READ,
  PLATFORM_FEED_READ,
  PLATFORM_YOUTUBE,
} from '../../platform/http/platform-http';

const id = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
describe('YouTube feed transport', () => {
  const cache = { get: vi.fn(), put: vi.fn().mockResolvedValue(undefined) };
  beforeEach(() => {
    cache.get.mockReset();
    cache.put.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
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
  it('tries one handle fallback for a missing legacy channel alias', async () => {
    const result = TestBed.inject(YoutubeFeeds).resolve('https://youtube.com/pdina');
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(
        (req) => new URL(req.url).searchParams.get('url') === 'https://www.youtube.com/c/pdina',
      )
      .flush('Missing', { status: 404, statusText: 'Not found' });
    await vi.waitFor(() => {
      http
        .expectOne(
          (req) => new URL(req.url).searchParams.get('url') === 'https://www.youtube.com/@pdina',
        )
        .flush(`<meta itemprop="channelId" content="${id}"><title>PDina - YouTube</title>`);
    });
    expect(await result).toEqual({ id, title: 'PDina' });
    http.verify();
  });
  it('does not retry alternate aliases for upstream rate limits', async () => {
    const result = TestBed.inject(YoutubeFeeds).resolve('pdina');
    const rejected = expect(result).rejects.toMatchObject({ status: 429 });
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(() => true).flush('Slow down', { status: 429, statusText: 'Too many requests' });
    await rejected;
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

describe('YouTube feeds away from mawkingbird.com', () => {
  const cache = { get: vi.fn(), put: vi.fn().mockResolvedValue(undefined) };
  const feedRead = vi.fn();
  const pageRead = vi.fn();

  function setUp(native: boolean) {
    cache.get.mockReset().mockResolvedValue(null);
    feedRead.mockReset();
    pageRead.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: RssCache, useValue: cache },
        { provide: ClientPrefs, useValue: { rssCacheTtlHours: () => 24 } },
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: PlusTokenSource, useValue: { token: vi.fn() } },
        { provide: PLATFORM_FEED_READ, useValue: native ? feedRead : null },
        { provide: PLATFORM_ARTICLE_READ, useValue: native ? pageRead : null },
      ],
    });
    return TestBed.inject(YoutubeFeeds);
  }

  it('never calls the Mawkingbird proxy from a copy hosted elsewhere', async () => {
    const feeds = setUp(false);
    vi.spyOn(feeds as unknown as { hostedProxy(): boolean }, 'hostedProxy').mockReturnValue(false);
    await expect(feeds.feed(id)).rejects.toThrow('only available on mawkingbird.com');
    TestBed.inject(HttpTestingController).verify();
  });

  it('reads channel RSS directly on Native, with no proxy request', async () => {
    const feeds = setUp(true);
    feedRead.mockResolvedValue(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Direct</title></feed>',
    );
    expect((await feeds.feed(id)).title).toBe('Direct');
    expect(feedRead).toHaveBeenCalledWith(expect.stringContaining(id));
    TestBed.inject(HttpTestingController).verify();
  });

  it('resolves a handle from the channel page directly on Native, trying the alias on a 404', async () => {
    const feeds = setUp(true);
    pageRead.mockResolvedValueOnce({ status: 404, finalUrl: '', body: '' }).mockResolvedValueOnce({
      status: 200,
      finalUrl: '',
      body: `<meta itemprop="channelId" content="${id}"><meta property="og:title" content="Example">`,
    });
    const channel = await feeds.resolve('https://www.youtube.com/c/example');
    expect(channel.id).toBe(id);
    expect(pageRead).toHaveBeenCalledTimes(2);
    TestBed.inject(HttpTestingController).verify();
  });
});

describe('YouTube search and details: Native vs web × Plus', () => {
  const youtube = vi.fn();
  const channelSearch = JSON.stringify({
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
  });

  function setUp(native: boolean, flags: (id: string) => boolean = () => true) {
    youtube.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: RssCache, useValue: { get: vi.fn(), put: vi.fn() } },
        { provide: ClientPrefs, useValue: { rssCacheTtlHours: () => 24 } },
        { provide: FeatureFlags, useValue: { enabled: flags } },
        { provide: PlusTokenSource, useValue: { token: vi.fn() } },
        { provide: PLATFORM_YOUTUBE, useValue: native ? youtube : null },
      ],
    });
    return TestBed.inject(YoutubeFeeds);
  }

  it('offers search on Native without Plus, and on the web only with Plus', () => {
    expect(setUp(true).canSearch()).toBe(true);
    TestBed.resetTestingModule();
    const web = setUp(false);
    expect(web.canSearch()).toBe(false);
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    expect(web.canSearch()).toBe(true);
    expect(web.canReadDetails()).toBe(false);
  });

  it('searches YouTube directly on Native without Plus, never touching the proxy', async () => {
    const feeds = setUp(true);
    expect(TestBed.inject(SupporterStatus).isSupporter()).toBe(false);
    youtube.mockResolvedValue(channelSearch);
    expect(await feeds.search('Example', 'channel')).toEqual([
      { id, title: 'Example', channelId: id, channelTitle: 'Example' },
    ]);
    const [endpoint, body, headers] = youtube.mock.calls[0] as [string, string, [string, string][]];
    expect(endpoint).toBe('search');
    expect(body).toContain('Example');
    // Only the allow-listed web-client headers cross into Rust.
    for (const [name] of headers) {
      expect(['x-youtube-client-name', 'x-youtube-client-version', 'x-goog-visitor-id']).toContain(
        name.toLowerCase(),
      );
    }
    expect(TestBed.inject(PlusTokenSource).token).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).verify();
  });

  it('respects the video feeds connection setting on Native', async () => {
    const feeds = setUp(true, (flag) => flag !== 'connector-rss');
    await expect(feeds.search('Example', 'video')).rejects.toThrow('disabled');
    expect(youtube).not.toHaveBeenCalled();
  });

  it('reads video details through the player endpoint on Native', async () => {
    const feeds = setUp(true);
    youtube.mockResolvedValue(
      JSON.stringify({
        playabilityStatus: { status: 'OK' },
        videoDetails: {
          videoId: 'abcdefghijk',
          title: 'Example video',
          lengthSeconds: '754',
          channelId: id,
          author: 'Example',
          shortDescription: '0:00 Intro\n1:30 Middle\n10:05 End',
          isLiveContent: false,
        },
        microformat: { playerMicroformatRenderer: { isFamilySafe: true } },
      }),
    );
    const details = await feeds.details('abcdefghijk');
    expect(youtube.mock.calls[0][0]).toBe('player');
    expect(details).toMatchObject({
      id: 'abcdefghijk',
      title: 'Example video',
      channelId: id,
      channelTitle: 'Example',
      durationSeconds: 754,
      familySafe: true,
      live: false,
    });
    expect(details.chapters.map((c) => c.seconds)).toEqual([0, 90, 605]);
  });

  it('reads YouTube comments as plain text on Native, page by page', async () => {
    const feeds = setUp(true);
    const thread = (id: string, text: string) => ({
      comment: {
        comment_id: id,
        author: { name: '@viewer' },
        published_time: '2 days ago',
        like_count: '12',
        content: { toString: () => text },
        reply_count: '3',
        author_is_channel_owner: id === 'c2',
      },
    });
    const second = { contents: [thread('c2', 'Thanks!')], has_continuation: false };
    const first = {
      contents: [thread('c1', '<b>not html</b>'), { comment: null }],
      has_continuation: true,
      getContinuation: vi.fn(async () => second),
    };
    const getComments = vi.fn(async () => first);
    vi.spyOn(feeds as unknown as { session(): Promise<unknown> }, 'session').mockResolvedValue({
      getComments,
    });
    const page = await feeds.comments('abcdefghijk');
    expect(getComments).toHaveBeenCalledWith('abcdefghijk', 'TOP_COMMENTS');
    expect(page.comments).toEqual([
      {
        id: 'c1',
        author: '@viewer',
        published: '2 days ago',
        likes: '12',
        text: '<b>not html</b>',
        replies: '3',
        byCreator: false,
      },
    ]);
    const next = await page.more!();
    expect(next.comments[0]).toMatchObject({ id: 'c2', byCreator: true });
    expect(next.more).toBeNull();
  });

  it("prefers YouTube's chapter markers, creator before automatic, over the description", async () => {
    const feeds = setUp(true);
    const markers = (key: string, titles: string[]) => ({
      marker_key: key,
      value: {
        chapters: titles.map((title, i) => ({
          title: { toString: () => title },
          time_range_start_millis: i * 60_500,
        })),
      },
    });
    const info = (maps: unknown[] | null, description = '0:00 A\n1:00 B\n2:00 C') => ({
      basic_info: { title: 'T', short_description: description, duration: 600 },
      player_overlays: maps
        ? { decorated_player_bar: { player_bar: { markers_map: maps } } }
        : undefined,
    });
    const getInfo = vi.fn();
    const getBasicInfo = vi.fn();
    vi.spyOn(feeds as unknown as { session(): Promise<unknown> }, 'session').mockResolvedValue({
      getInfo,
      getBasicInfo,
    });

    getInfo.mockResolvedValueOnce(
      info([
        markers('AUTO_CHAPTERS', ['Auto 1', 'Auto 2']),
        markers('DESCRIPTION_CHAPTERS', ['Mine', 'Yours']),
      ]),
    );
    let details = await feeds.details('abcdefghijk');
    expect(details.chapterSource).toBe('creator');
    expect(details.chapters).toEqual([
      { seconds: 0, title: 'Mine' },
      { seconds: 60, title: 'Yours' },
    ]);

    // Auto chapters for a video whose description has no timestamps at all.
    getInfo.mockResolvedValueOnce(
      info([markers('AUTO_CHAPTERS', ['One', 'Two', 'Three'])], 'No stamps'),
    );
    details = await feeds.details('abcdefghijk');
    expect(details.chapterSource).toBe('auto');
    expect(details.chapters.map((c) => c.title)).toEqual(['One', 'Two', 'Three']);

    // No markers: the description's timestamps.
    getInfo.mockResolvedValueOnce(info(null));
    details = await feeds.details('abcdefghijk');
    expect(details.chapterSource).toBe('description');

    // The watch-next read failed: player details alone still answer.
    getInfo.mockRejectedValueOnce(new Error('next refused'));
    getBasicInfo.mockResolvedValueOnce(info(null, 'Nothing'));
    details = await feeds.details('abcdefghijk');
    expect(details).toMatchObject({ title: 'T', chapters: [], chapterSource: null });
  });

  it("reads a channel's handle, About links and uploads on Native", async () => {
    const feeds = setUp(true);
    const lockup = (videoId: string, title: string) => ({
      content_id: videoId,
      metadata: {
        title: { toString: () => title },
        metadata: {
          metadata_rows: [
            {
              metadata_parts: [
                { text: { toString: () => '1.3M views' } },
                { text: { toString: () => '2 weeks ago' } },
              ],
            },
          ],
        },
      },
      content_image: { overlays: [{ badges: [{ text: '23:01' }] }] },
    });
    const getVideos = vi.fn(async () => ({
      videos: [lockup('aaaaaaaaaaa', 'Lamps'), { content_id: 'bad id' }],
      has_continuation: true,
      getContinuation: async () => ({
        videos: [lockup('bbbbbbbbbbb', 'Switches')],
        has_continuation: false,
        getContinuation: vi.fn(),
      }),
    }));
    const getChannel = vi.fn(async () => ({
      metadata: {
        title: 'Technology Connections',
        vanity_channel_url: 'http://www.youtube.com/@TechnologyConnections',
      },
      getAbout: async () => ({
        metadata: {
          description: 'About me',
          subscriber_count: { toString: () => '2.4M subscribers' },
          links: [
            {
              title: { toString: () => 'Mastodon' },
              link: { toString: () => 'mas.to/@TechConnectify' },
            },
            { title: { toString: () => 'Bad' }, link: { toString: () => 'javascript:alert(1)' } },
          ],
        },
      }),
      getVideos,
    }));
    vi.spyOn(feeds as unknown as { session(): Promise<unknown> }, 'session').mockResolvedValue({
      getChannel,
    });
    const info = await feeds.channel(id);
    expect(info).toMatchObject({
      id,
      title: 'Technology Connections',
      handle: '@TechnologyConnections',
      description: 'About me',
      subscribers: '2.4M subscribers',
      links: [{ title: 'Mastodon', url: 'https://mas.to/@TechConnectify' }],
    });
    expect(info.uploads.videos).toEqual([
      {
        videoId: 'aaaaaaaaaaa',
        title: 'Lamps',
        views: '1.3M views',
        age: '2 weeks ago',
        duration: '23:01',
      },
    ]);
    expect((await info.uploads.more!()).videos[0].title).toBe('Switches');

    getVideos.mockClear();
    expect((await feeds.channel(id, { uploads: false })).uploads.videos).toEqual([]);
    expect(getVideos).not.toHaveBeenCalled();
  });

  it('has no channel pages on the web', async () => {
    await expect(setUp(false).channel(id)).rejects.toThrow('Mawkingbird app');
  });

  it('has no YouTube comments on the web', async () => {
    const feeds = setUp(false);
    await expect(feeds.comments('abcdefghijk')).rejects.toThrow('Mawkingbird app');
  });

  it('has no video details on the web, and asks nothing', async () => {
    const feeds = setUp(false);
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    await expect(feeds.details('abcdefghijk')).rejects.toThrow('Mawkingbird app');
    TestBed.inject(HttpTestingController).verify();
  });
});

describe('aboutLink', () => {
  it('adds the scheme YouTube leaves off and drops anything that is not a web link', () => {
    expect(aboutLink('mas.to/@TechConnectify')).toBe('https://mas.to/@TechConnectify');
    expect(aboutLink('https://example.org/x')).toBe('https://example.org/x');
    expect(aboutLink('javascript:alert(1)')).toBeNull();
    expect(aboutLink('  ')).toBeNull();
  });
});

describe('YouTube through Mawkingbird for Firefox', () => {
  const channelSearch = JSON.stringify({
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
  });
  let bridge: {
    present: () => boolean;
    youtube: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };

  function setUp() {
    bridge = { present: () => true, youtube: vi.fn(), read: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: RssCache, useValue: { get: vi.fn(), put: vi.fn() } },
        { provide: ClientPrefs, useValue: { rssCacheTtlHours: () => 24 } },
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: PlusTokenSource, useValue: { token: vi.fn() } },
        { provide: ExtensionBridge, useValue: bridge },
      ],
    });
    return TestBed.inject(YoutubeFeeds);
  }

  it('offers search, details and comments without Plus', () => {
    const feeds = setUp();
    expect(TestBed.inject(SupporterStatus).isSupporter()).toBe(false);
    expect(feeds.canSearch()).toBe(true);
    expect(feeds.canReadDetails()).toBe(true);
  });

  it('searches through the extension with only the web-client headers, never the proxy', async () => {
    const feeds = setUp();
    bridge.youtube.mockResolvedValue({ ok: true, status: 200, body: channelSearch });
    expect(await feeds.search('Example', 'channel')).toEqual([
      { id, title: 'Example', channelId: id, channelTitle: 'Example' },
    ]);
    const [endpoint, body, headers] = bridge.youtube.mock.calls[0] as [
      string,
      string,
      [string, string][],
    ];
    expect(endpoint).toBe('search');
    expect(body).toContain('Example');
    for (const [name] of headers) {
      expect(['x-youtube-client-name', 'x-youtube-client-version', 'x-goog-visitor-id']).toContain(
        name.toLowerCase(),
      );
    }
    expect(TestBed.inject(PlusTokenSource).token).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).verify();
  });

  it('names YouTube to allow when the extension may not read it yet', async () => {
    const feeds = setUp();
    bridge.youtube.mockResolvedValue({
      ok: false,
      error: 'needs-access',
      origin: 'https://www.youtube.com',
    });
    const error = await feeds.search('Example', 'video').catch((e: unknown) => e);
    expect(extensionAccessOrigin(error)).toBe('https://www.youtube.com');
  });

  it('reads channel feeds through the extension when YouTube is allowed', async () => {
    const feeds = setUp();
    bridge.read.mockResolvedValue({
      ok: true,
      status: 200,
      finalUrl: 'x',
      contentType: 'application/atom+xml',
      body: '<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title></feed>',
    });
    expect((await feeds.feed(id)).title).toBe('Example');
    expect(bridge.read).toHaveBeenCalledWith(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
      'feed',
    );
    TestBed.inject(HttpTestingController).verify();
  });

  it('falls back to the proxy for feeds while YouTube is not allowed', async () => {
    const feeds = setUp();
    bridge.read.mockResolvedValue({
      ok: false,
      error: 'needs-access',
      origin: 'https://www.youtube.com',
    });
    const request = feeds.feed(id);
    await vi.waitFor(() =>
      TestBed.inject(HttpTestingController)
        .expectOne((req) => new URL(req.url).searchParams.get('route') === 'youtube')
        .flush('<feed xmlns="http://www.w3.org/2005/Atom"><title>Proxied</title></feed>'),
    );
    expect((await request).title).toBe('Proxied');
  });
});
