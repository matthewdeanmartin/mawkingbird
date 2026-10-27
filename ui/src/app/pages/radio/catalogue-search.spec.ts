import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { FollowTrust } from '../../follow-trust';
import { Server } from '../../server';
import { TrustedAccounts } from '../../trusted-accounts';
import { Playback } from '../../video-player/playback';
import { CatalogueSearch } from './catalogue-search';
import { trackUrl } from './radio-playlists';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';

const respond = (body: unknown) => new Response(JSON.stringify(body));

describe('CatalogueSearch', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let catalogue: CatalogueSearch;
  beforeEach(() => {
    fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('t') } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        { provide: AnonymousPublicApi, useValue: {} },
      ],
    });
    catalogue = TestBed.inject(CatalogueSearch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('searches Library of Congress audio items only, without credentials', async () => {
    fetch.mockResolvedValue(
      respond({
        results: [
          {
            url: 'https://www.loc.gov/item/2017701737/',
            title: 'Whiskey Johnny',
            contributor: ['brodeur, arthur'],
            date: '1939',
            rights: ['No known restrictions'],
          },
          { url: 'https://blogs.loc.gov/folklife/2021/01/shanties/', title: 'A blog post' },
          { url: 'http://www.loc.gov/item/podcasts/2021-01-29/sea-shanties/', title: 'Podcast' },
        ],
        pagination: { next: 'https://www.loc.gov/audio/?sp=2' },
      }),
    );
    const result = await catalogue.search('loc', ' sea shanty ');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('https://www.loc.gov/audio/?q=sea%20shanty&fo=json');
    expect(url).toContain('fa=online-format:audio');
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(result.more).toBe(true);
    expect(result.items.map((item) => item.page)).toEqual([
      'https://www.loc.gov/item/2017701737/',
      'https://www.loc.gov/item/podcasts/2021-01-29/sea-shanties/',
    ]);
    expect(result.items[0]).toMatchObject({
      title: 'Whiskey Johnny',
      creator: 'brodeur, arthur',
      rights: 'No known restrictions',
    });
  });

  it('searches Internet Archive audio and keeps one MP3 per recording', async () => {
    fetch
      .mockResolvedValueOnce(
        respond({
          response: {
            numFound: 41,
            docs: [
              {
                identifier: 'sea-album',
                title: 'Sea album',
                creator: 'Crew',
                date: '1925-01-01T00:00:00Z',
              },
              { identifier: 'bad id!', title: 'Rejected' },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        respond({
          result: [
            { name: 'Track 01.mp3', format: 'VBR MP3', title: 'Blow the man down' },
            { name: 'Track 01_64kb.mp3', format: '64Kbps MP3' },
            { name: 'Track 02.flac', format: 'Flac' },
            { name: 'Track 02.mp3', format: 'VBR MP3' },
            { name: 'cover.jpg', format: 'JPEG' },
          ],
        }),
      );
    const { items, more } = await catalogue.search('archive', 'sea');
    expect(fetch.mock.calls[0][0]).toContain(encodeURIComponent('(sea) AND mediatype:audio'));
    expect(more).toBe(true);
    expect(items.map((item) => item.id)).toEqual(['sea-album']);
    expect(items[0]).toMatchObject({
      date: '1925-01-01',
      page: 'https://archive.org/details/sea-album',
    });
    const tracks = await catalogue.tracks(items[0]);
    expect(tracks.map((track) => track.media.url)).toEqual([
      'https://archive.org/download/sea-album/Track%2001.mp3',
      'https://archive.org/download/sea-album/Track%2002.mp3',
    ]);
    expect(tracks[0].media.description).toBe('Blow the man down');
    // Published and shared links point at the item page for the file.
    expect(trackUrl(tracks[0])).toBe('https://archive.org/details/sea-album/Track%2001.mp3');
  });

  it('resolves a Library of Congress item through its JSON and links its page', async () => {
    fetch
      .mockResolvedValueOnce(
        respond({
          results: [{ url: 'https://www.loc.gov/item/2017701737/', title: 'Whiskey Johnny' }],
        }),
      )
      .mockResolvedValueOnce(
        respond({
          item: { title: 'Whiskey Johnny' },
          resources: [{ audio: 'https://tile.loc.gov/a/default.mp3' }],
        }),
      );
    const [item] = (await catalogue.search('loc', 'whiskey')).items;
    const [track] = await catalogue.tracks(item);
    expect(track.media.url).toBe('https://tile.loc.gov/a/default.mp3');
    expect(trackUrl(track)).toBe('https://www.loc.gov/item/2017701737/');
  });

  it('does not search for an empty query', async () => {
    expect(await catalogue.search('loc', '   ')).toEqual({ items: [], more: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
