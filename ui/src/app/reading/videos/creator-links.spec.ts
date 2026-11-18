import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  addressesFromLinks,
  CreatorLinks,
  mastodonAddress,
  profileLinksChannel,
  wikidataAddresses,
  wikidataQuery,
} from './creator-links';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { PLATFORM_WIKIDATA } from '../../platform/http/platform-http';
import { EXTERNAL_FETCH } from '../../platform/http/external-fetch';
import { YoutubeFeeds } from './youtube-feeds';
import { Account } from '../../platform/api/models';

const channelId = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
const sparql = (...addresses: string[]) =>
  JSON.stringify({
    results: {
      bindings: [
        { item: { value: 'http://www.wikidata.org/entity/Q1' } },
        ...addresses.map((value) => ({ mastodon: { value } })),
      ],
    },
  });

describe('creator link parsing', () => {
  it('normalises Mastodon addresses as Wikidata and profiles write them', () => {
    expect(mastodonAddress('TechConnectify@mas.to')).toBe('TechConnectify@mas.to');
    expect(mastodonAddress('@alice@Social.Example')).toBe('alice@social.example');
    expect(mastodonAddress('https://mastodon.social/@geerlingguy')).toBe(
      'geerlingguy@mastodon.social',
    );
    expect(mastodonAddress('not an address')).toBeNull();
    expect(mastodonAddress('a@b')).toBeNull();
  });

  it('reads addresses from SPARQL JSON, once each, and survives junk', () => {
    expect(wikidataAddresses(sparql('a@one.example', '@a@one.example', 'b@two.example'))).toEqual([
      'a@one.example',
      'b@two.example',
    ]);
    expect(wikidataAddresses('<html>')).toEqual([]);
    expect(wikidataQuery(channelId)).toContain(`wdt:P2397 "${channelId}"`);
  });

  it('takes Mastodon-shaped About links, not Medium, Bluesky or YouTube ones', () => {
    expect(
      addressesFromLinks([
        { url: 'https://mas.to/@TechConnectify' },
        { url: 'https://medium.com/@someone' },
        { url: 'https://bsky.app/profile/x.bsky.social' },
        { url: 'https://www.youtube.com/@Other' },
        { url: 'https://mas.to/@TechConnectify/123' },
        { url: 'https://patreon.com/tc' },
      ]),
    ).toEqual(['TechConnectify@mas.to']);
  });

  it('confirms a profile that links back by channel ID or @handle', () => {
    const profile = (value: string, note = '') =>
      ({ note, fields: [{ name: 'YouTube', value }] }) as Pick<Account, 'note' | 'fields'>;
    expect(
      profileLinksChannel(
        profile(`<a href="https://www.youtube.com/channel/${channelId}">YT</a>`),
        channelId,
        null,
      ),
    ).toBe(true);
    expect(
      profileLinksChannel(
        profile('<a href="https://youtube.com/@TechnologyConnections">yt</a>'),
        channelId,
        '@TechnologyConnections',
      ),
    ).toBe(true);
    // A longer handle that merely starts the same is someone else.
    expect(
      profileLinksChannel(
        profile('https://youtube.com/@TechnologyConnectionsFan'),
        channelId,
        '@TechnologyConnections',
      ),
    ).toBe(false);
    expect(profileLinksChannel(profile('https://example.org'), channelId, null)).toBe(false);
  });
});

describe('CreatorLinks', () => {
  function setUp(options: {
    native?: ((id: string) => Promise<string>) | null;
    wikidataOn?: boolean;
    channel?: { handle: string | null; links: { title: string; url: string }[] } | null;
  }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: FeatureFlags,
          useValue: {
            enabled: (id: string) => id !== 'connector-wikidata' || options.wikidataOn !== false,
          },
        },
        { provide: PLATFORM_WIKIDATA, useValue: options.native ?? null },
        {
          provide: YoutubeFeeds,
          useValue: {
            canReadDetails: () => options.channel !== undefined,
            channel: vi.fn(async () => {
              if (!options.channel) throw new Error('blocked');
              return { ...options.channel, id: channelId, uploads: { videos: [], more: null } };
            }),
          },
        },
      ],
    });
    return {
      links: TestBed.inject(CreatorLinks),
      http: TestBed.inject(HttpTestingController),
    };
  }

  const flushLookup = (http: HttpTestingController, host: string, account: Partial<Account>) =>
    http
      .expectOne((req) => req.url === `https://${host}/api/v1/accounts/lookup`)
      .flush({ id: '1', acct: 'x', note: '', fields: [], ...account });

  it('on the web asks Wikidata directly, then confirms the account on its own server', async () => {
    const { links, http } = setUp({});
    const found = links.forChannel({ id: channelId });
    const query = await vi.waitFor(() =>
      http.expectOne((req) => req.url === 'https://query.wikidata.org/sparql'),
    );
    expect(query.request.params.get('query')).toBe(wikidataQuery(channelId));
    expect(query.request.context.get(EXTERNAL_FETCH)).toBe(true);
    expect(query.request.withCredentials).toBe(false);
    query.flush(sparql('TechConnectify@mas.to'));
    const lookup = await vi.waitFor(() =>
      http.expectOne((req) => req.url === 'https://mas.to/api/v1/accounts/lookup'),
    );
    expect(lookup.request.params.get('acct')).toBe('TechConnectify');
    expect(lookup.request.headers.has('Authorization')).toBe(false);
    lookup.flush({
      id: '9',
      acct: 'TechConnectify',
      note: '',
      fields: [{ name: 'YT', value: `https://www.youtube.com/channel/${channelId}` }],
    });
    expect(await found).toMatchObject({
      acct: 'TechConnectify@mas.to',
      sources: ['wikidata'],
      confirmed: true,
    });
    http.verify();
  });

  it('on Native reads the channel’s About links and asks Wikidata through Rust', async () => {
    const native = vi.fn(async () => sparql('TechConnectify@mas.to'));
    const { links, http } = setUp({
      native,
      channel: {
        handle: '@TechnologyConnections',
        links: [{ title: 'Mastodon', url: 'https://mas.to/@TechConnectify' }],
      },
    });
    const found = links.lookupChannel(channelId);
    await vi.waitFor(() => flushLookup(http, 'mas.to', { acct: 'TechConnectify' }));
    expect(native).toHaveBeenCalledWith(channelId);
    const link = await found;
    // Both sources agree; the profile does not link back, so it is not confirmed.
    expect(link).toMatchObject({ sources: ['channel', 'wikidata'], confirmed: false });
    http.expectNone((req) => req.url.includes('wikidata'));
  });

  it('asks Wikidata nothing when its connection is turned off', async () => {
    const { links, http } = setUp({ wikidataOn: false });
    expect(await links.forChannel({ id: channelId })).toBeNull();
    http.expectNone(() => true);
  });

  it('prefers a confirmed account, and keeps an unreachable one unconfirmed', async () => {
    const { links, http } = setUp({});
    const found = links.forChannel({
      id: channelId,
      links: [{ url: 'https://down.example/@tc' }],
    });
    await vi
      .waitFor(() => http.expectOne((req) => req.url.startsWith('https://query.wikidata.org')))
      .then((req) => req.flush(sparql('real@mas.to')));
    await vi.waitFor(() => {
      http
        .expectOne((req) => req.url === 'https://down.example/api/v1/accounts/lookup')
        .flush('gone', { status: 404, statusText: 'Not found' });
      flushLookup(http, 'mas.to', {
        acct: 'real',
        note: `<a href="https://youtube.com/channel/${channelId}">me</a>`,
      });
    });
    expect(await found).toMatchObject({ acct: 'real@mas.to', confirmed: true });
  });

  it('ignores invalid channel IDs', async () => {
    const { links, http } = setUp({});
    expect(await links.forChannel({ id: 'nope' })).toBeNull();
    http.expectNone(() => true);
  });
});
