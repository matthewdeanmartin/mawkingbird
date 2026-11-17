import { ExternalMedia } from '../audio-embeds/providers';
import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import {
  adaptAnonymousAccount,
  adaptAnonymousStatus,
} from '../../accounts/anonymous/anonymous-mastodon-provider';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Status } from '../../platform/api/models';
import { StatusCard } from '../../posts/status-card/status-card';
import { FindSinglesPage } from './find-singles-page';
import { RadioPlaylists } from './radio-playlists';
import { SavedSingles } from './saved-singles';
import { SavedSearches } from '../../discovery/search/saved-searches';
import { emptySearch } from '../../discovery/search/mawkingbird-search';
import { serializeMastodonQuery } from '../../discovery/search/mastodon-query-serializer';
import { Playback } from '../video-player/playback';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { FollowTrust } from '../../accounts/follow-trust';

@Component({ selector: 'app-status-card', template: '{{ status().id }}' })
class CardStub {
  readonly status = input.required<Status>();
  readonly radioQueue = input(false);
  readonly radioAddLabel = input('');
  readonly radioSources = input<ExternalMedia[]>([]);
  readonly playAudio = output<void>();
  readonly addAudio = output<void>();
  readonly listenRadio = output<ExternalMedia>();
}

describe('FindSinglesPage', () => {
  const audio = {
    id: 'audio',
    url: 'https://sea.example/@music/1',
    visibility: 'public',
    account: { acct: 'music' },
    media_attachments: [{ id: 'm', type: 'audio', url: 'https://audio.example/song.mp3' }],
  } as Status;
  const spotify = {
    ...audio,
    id: 'spotify',
    url: 'https://sea.example/@music/2',
    media_attachments: [],
    content: '<a href="https://open.spotify.com/track/abc123">Music</a>',
  } as Status;
  let api: {
    lookupAccount: ReturnType<typeof vi.fn>;
    getAccountStatuses: ReturnType<typeof vi.fn>;
    homeTimelinePage: ReturnType<typeof vi.fn>;
    listTimeline: ReturnType<typeof vi.fn>;
    lists: ReturnType<typeof vi.fn>;
    tagTimeline: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
  let auth: { isAnonymous: boolean; isBlueskyPrimary: boolean };

  beforeEach(() => {
    localStorage.clear();
    auth = { isAnonymous: false, isBlueskyPrimary: false };
    api = {
      lookupAccount: vi.fn(() => of({ id: 'account' })),
      getAccountStatuses: vi.fn((_: string, opts: { maxId?: string }) =>
        of(opts.maxId ? [] : [audio]),
      ),
      homeTimelinePage: vi.fn(() => of({ statuses: [audio], nextMaxId: null })),
      listTimeline: vi.fn((_: string, cursor?: string) => of(cursor ? [] : [audio])),
      lists: vi.fn(() => of([{ id: 'list', title: 'Music' }])),
      search: vi.fn(() => of({ accounts: [], hashtags: [], statuses: [] })),
      tagTimeline: vi.fn((_: string, cursor?: string) =>
        of(
          cursor
            ? []
            : [{ ...audio, id: 'tagged', content: '<a href="https://soundcloud.com/a/b">x</a>' }],
        ),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'singles/find', children: [] }]),
        { provide: Api, useValue: api },
        {
          provide: Auth,
          useValue: Object.assign(auth, { kind: signal('mastodon'), token: signal('test') }),
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
      ],
    });
    TestBed.overrideComponent(FindSinglesPage, {
      remove: { imports: [StatusCard] },
      add: { imports: [CardStub] },
    });
  });

  it('automatically scans a shared account through the signed-in server, keeping nothing until asked', async () => {
    const publicLookup = vi.fn(() => throwError(() => new Error('origin blocks browser requests')));
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { lookupAccount: publicLookup } });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ acct: 'MaQuest@djs.social' })),
      },
    });
    const fixture = TestBed.createComponent(FindSinglesPage);
    await fixture.componentInstance.scan.whenIdle();
    fixture.detectChanges();
    expect(api.lookupAccount).toHaveBeenCalledWith('MaQuest@djs.social');
    expect(publicLookup).not.toHaveBeenCalled();
    expect(fixture.componentInstance.player.resultTracks()).toHaveLength(1);
    expect(TestBed.inject(SavedSingles).items()).toEqual([]);
    expect(fixture.componentInstance.player.queue()).toEqual([]);
    expect(fixture.componentInstance.failed()).toBe(false);
  });

  it('logs an automatic lookup failure and gives a plain retry message', () => {
    const error = { status: 503, url: 'https://home.example/api/v1/accounts/lookup' };
    api.lookupAccount.mockReturnValue(throwError(() => error));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ acct: 'music@sea.example' })),
      },
    });
    const diagnostics = vi.spyOn(TestBed.inject(PageDiagnostics), 'error');
    const fixture = TestBed.createComponent(FindSinglesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Could not load audio. Try Find audio again.',
    );
    expect(diagnostics).toHaveBeenCalledWith('Radio', 'account-lookup:failed', error, {
      transport: 'signed-in',
      handle: 'music@sea.example',
    });
  });

  it('searches a hashtag, keeping link posts unless only native audio is wanted', async () => {
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    page.chooseSource('tag');
    page.tag.set('#robotmusic');
    expect(page.searchReady()).toBe(true);
    page.discover();
    await page.scan.whenIdle();
    expect(api.tagTimeline).toHaveBeenCalledWith('robotmusic', undefined, 40, false);
    expect(page.scan.posts().map((post) => post.id)).toEqual(['tagged']);
    page.tag.set('not a tag!');
    expect(page.searchReady()).toBe(false);
  });

  it('reads a hashtag anonymously from the browsing server', async () => {
    auth.isAnonymous = true;
    const getTagTimeline = vi.fn(() => of([]));
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { getTagTimeline } });
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    page.chooseSource('tag');
    page.tag.set('robotmusic');
    page.discover();
    await page.scan.whenIdle();
    expect(getTagTimeline).toHaveBeenCalledWith(
      expect.stringMatching(/^https:/),
      'robotmusic',
      undefined,
      40,
      false,
    );
    expect(api.tagTimeline).not.toHaveBeenCalled();
  });

  it('offers saved searches as their own choice and keeps only playable posts', async () => {
    const saved = TestBed.inject(SavedSearches);
    const hashtag = saved.save(
      'Robot music',
      { ...emptySearch('hashtags'), hashtag: { text: '#robotmusic' } },
      { instance: 'https://home.example', authenticated: true },
    );
    const posts = saved.save(
      'Banjo posts',
      { ...emptySearch('posts'), post: { words: 'banjo' } },
      { instance: 'https://home.example', authenticated: true },
    );
    saved.save('People', emptySearch('accounts'), { instance: '', authenticated: true });
    if (!hashtag.ok || !posts.ok) throw new Error('save failed');
    api.search.mockImplementation((_q: string, _type: string, options: { offset: number }) =>
      of({ accounts: [], hashtags: [], statuses: options.offset ? [] : [audio] }),
    );
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    // Account searches cannot find posts, so they are not offered.
    expect(page.savedSearches().map((item) => item.name)).toEqual(['Banjo posts', 'Robot music']);
    expect(page.scopes().map((scope) => scope.value)).toContain('saved');
    page.chooseSource('saved');
    page.chooseSaved(hashtag.saved.id);
    page.discover();
    await page.scan.whenIdle();
    expect(api.tagTimeline).toHaveBeenCalledWith('robotmusic', undefined, 40, false);
    page.chooseSource('saved');
    page.chooseSaved(posts.saved.id);
    page.discover();
    await page.scan.whenIdle();
    // The same serialization the main Search screen sends.
    expect(api.search).toHaveBeenCalledWith(
      serializeMastodonQuery({ words: 'banjo' }),
      'statuses',
      { limit: 40, offset: 0 },
    );
    expect(page.scan.posts().map((post) => post.id)).toEqual(['audio']);
    for (const item of saved.all()) saved.delete(item.id);
  });

  it('shows the catalogue search in place of feed results for a catalogue source', () => {
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    page.chooseSource('loc');
    fixture.detectChanges();
    expect(page.catalogueSource()).toBe('loc');
    expect(fixture.nativeElement.querySelector('app-catalogue-panel')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Find audio');
  });

  it('resolves a shared account at its origin and paginates with raw server IDs', async () => {
    const accountRef = { server: 'https://sea.example', id: '17' };
    const publicApi = {
      lookupAccount: vi.fn(() =>
        of(
          adaptAnonymousAccount(
            { id: '17', acct: 'singer', username: 'singer' } as Status['account'],
            accountRef.server,
          ),
        ),
      ),
      getAccountStatuses: vi.fn((_: unknown, opts: { maxId?: string }) =>
        of(opts.maxId ? [] : [adaptAnonymousStatus({ ...audio, id: '123' }, accountRef.server)]),
      ),
    };
    auth.isAnonymous = true;
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ acct: 'singer@sea.example' })),
      },
    });
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: publicApi });
    const fixture = TestBed.createComponent(FindSinglesPage);
    await fixture.componentInstance.scan.whenIdle();
    expect(publicApi.lookupAccount).toHaveBeenCalledWith('https://sea.example', 'singer');
    expect(publicApi.getAccountStatuses).toHaveBeenNthCalledWith(
      2,
      accountRef,
      expect.objectContaining({ maxId: '123' }),
    );
    expect(fixture.componentInstance.player.active()).toBe(false);
  });

  it('waits for an explicit action, resolves an account, and discovers its media', async () => {
    const fixture = TestBed.createComponent(FindSinglesPage);
    fixture.detectChanges();
    expect(api.lookupAccount).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('mb-radio-group')).toBeTruthy();
    const page = fixture.componentInstance;
    page.handle.set('@music@server.example');
    page.discover();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.lookupAccount).toHaveBeenCalledWith('music@server.example');
    expect(api.getAccountStatuses).toHaveBeenNthCalledWith(1, 'account', {
      maxId: undefined,
      limit: 40,
      onlyMedia: false,
      excludeReblogs: true,
    });
    expect(page.scan.posts()).toEqual([audio]);
    expect(fixture.nativeElement.textContent).toContain('Reached the end');
  });

  it('finds external players by default and restricts every feed to native audio on request', async () => {
    const video = {
      ...spotify,
      id: 'video',
      url: 'https://sea.example/@music/3',
      content: '<a href="https://youtu.be/abcdefghijk">Video</a>',
    };
    const music = {
      ...spotify,
      id: 'music',
      url: 'https://sea.example/@music/4',
      content: '<a href="https://music.youtube.com/watch?v=z71d3cWLwsw">Sea shanty</a>',
    };
    api.homeTimelinePage.mockReturnValue(
      of({ statuses: [audio, spotify, video, music], nextMaxId: null }),
    );
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    page.chooseSource('home');
    fixture.detectChanges();
    const nativeFilter = Array.from(
      fixture.nativeElement.querySelectorAll('mb-checkbox') as NodeListOf<HTMLElement>,
    ).find((checkbox) => checkbox.textContent?.includes('Native Mastodon audio only'))!;
    expect(nativeFilter.querySelector('input')!.checked).toBe(false);
    page.discover();
    await fixture.whenStable();
    expect(page.scan.posts()).toEqual([audio, spotify, music]);
    page.changeNativeOnly(true);
    expect(page.scan.posts()).toEqual([]);
    expect(page.started()).toBe(false);
    page.discover();
    await fixture.whenStable();
    expect(page.scan.posts()).toEqual([audio]);
    page.chooseSource('account');
    page.handle.set('music');
    page.discover();
    await fixture.whenStable();
    expect(api.getAccountStatuses).toHaveBeenCalledWith(
      'account',
      expect.objectContaining({ onlyMedia: true }),
    );
  });

  it('places scan continuation before the progress count', () => {
    const fixture = TestBed.createComponent(FindSinglesPage);
    fixture.componentInstance.started.set(true);
    fixture.componentInstance.scanReady.set(true);
    fixture.detectChanges();
    const more = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Continue scanning'))!;
    const progress = fixture.nativeElement.querySelector('p.progress');
    expect(progress.textContent).toContain('Scanned');
    expect(more.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses the home pagination cursor and loads lists only on selection', async () => {
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    expect(api.lists).not.toHaveBeenCalled();
    page.chooseSource('home');
    page.discover();
    await fixture.whenStable();
    expect(api.homeTimelinePage).toHaveBeenCalledWith(undefined);
    page.chooseSource('list');
    expect(page.lists()).toEqual([{ id: 'list', title: 'Music' }]);
    page.listId.set('list');
    page.discover();
    await fixture.whenStable();
    expect(api.listTimeline).toHaveBeenCalledWith('list', undefined, 40);
    expect(api.listTimeline).toHaveBeenCalledWith('list', 'audio', 40);
  });

  it('cancels account resolution when leaving and prevents anonymous API calls', () => {
    const pending = new Subject<{ id: string }>();
    api.lookupAccount.mockReturnValue(pending);
    const fixture = TestBed.createComponent(FindSinglesPage);
    fixture.componentInstance.handle.set('music');
    fixture.componentInstance.discover();
    fixture.destroy();
    expect(pending.observed).toBe(false);
    expect(api.getAccountStatuses).not.toHaveBeenCalled();
    auth.isAnonymous = true;
    const anonymous = TestBed.createComponent(FindSinglesPage);
    anonymous.detectChanges();
    expect(anonymous.componentInstance.scopes().map((scope) => scope.value)).not.toContain('home');
    anonymous.componentInstance.chooseSource('list');
    anonymous.componentInstance.discover();
    expect(api.lists).not.toHaveBeenCalled();
  });

  it('saves results as Singles, including players that only play on their own page', async () => {
    api.homeTimelinePage.mockReturnValue(of({ statuses: [audio, spotify], nextMaxId: null }));
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    page.chooseSource('home');
    page.discover();
    await fixture.whenStable();
    expect(page.canKeep(spotify)).toBe(true);
    page.keep(spotify);
    expect(page.message()).toBe('Saved 1 singles.');
    page.keepResults();
    expect(page.message()).toBe('Saved 1 singles.');
    page.keep(audio);
    expect(page.message()).toBe('Already in your saved singles.');
    expect(
      TestBed.inject(SavedSingles)
        .items()
        .map((item) => item.track.post.id),
    ).toEqual(['audio', 'spotify']);
    // Saving never changes what is playing.
    expect(page.player.queue()).toEqual([]);
  });

  it('adds only continuous recordings when finding for a playlist', async () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({}));
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: {}, queryParamMap } });
    const playlists = TestBed.inject(RadioPlaylists);
    playlists.refresh();
    const id = playlists.create('Road trip')!;
    queryParamMap.next(convertToParamMap({ playlist: id }));
    api.homeTimelinePage.mockReturnValue(of({ statuses: [audio, spotify], nextMaxId: null }));
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Add to Road trip');
    page.chooseSource('home');
    page.discover();
    await fixture.whenStable();
    expect(page.canKeep(spotify)).toBe(false);
    expect(page.keepLabel()).toBe('findSingles.addToPlaylist');
    page.keepResults();
    expect(page.message()).toBe('Added 1 to Road trip.');
    expect(playlists.saved()[0].tracks.map((track) => track.post.id)).toEqual(['audio']);
  });

  it('opens pasted links as results', async () => {
    const fixture = TestBed.createComponent(FindSinglesPage);
    const page = fixture.componentInstance;
    const importUrls = vi
      .spyOn(TestBed.inject(RadioPlaylists), 'importUrls')
      .mockResolvedValue({ tracks: page.player.tracks(audio), skipped: 1 });
    page.chooseSource('links');
    page.importText.set('see https://sea.example/@music/1 and https://nope.example/x');
    await page.openLinks();
    fixture.detectChanges();
    expect(importUrls).toHaveBeenCalledWith(
      ['https://sea.example/@music/1', 'https://nope.example/x'],
      true,
    );
    expect(page.results().map((post) => post.id)).toEqual(['audio']);
    expect(fixture.nativeElement.textContent).toContain('skipped: 1');
  });
});
