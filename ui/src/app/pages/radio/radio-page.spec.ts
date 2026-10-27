import { ExternalMedia } from '../../audio-embeds/providers';
import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { PageDiagnostics } from '../../page-diagnostics';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import {
  adaptAnonymousAccount,
  adaptAnonymousStatus,
} from '../../providers/anonymous/anonymous-mastodon-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { RadioPage } from './radio-page';
import { RadioPlayer } from './radio-player';
import { playlistFragment, playlistUrls, RadioPlaylists } from './radio-playlists';
import { RadioHandoff } from '../../radio-handoff';
import { Playback } from '../../video-player/playback';
import { TrustedAccounts } from '../../trusted-accounts';
import { FollowTrust } from '../../follow-trust';

@Component({ selector: 'app-status-card', template: '{{ status().id }}' })
class CardStub {
  readonly status = input.required<Status>();
  readonly radioQueue = input(false);
  readonly radioSources = input<ExternalMedia[]>([]);
  readonly playAudio = output<void>();
  readonly addAudio = output<void>();
  readonly listenRadio = output<ExternalMedia>();
}

describe('RadioPage', () => {
  it('automatically scans a profile through the signed-in server, using the same path as Find audio', async () => {
    const publicLookup = vi.fn(() => throwError(() => new Error('origin blocks browser requests')));
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { lookupAccount: publicLookup } });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ acct: 'MaQuest@djs.social' })),
      },
    });
    const fixture = TestBed.createComponent(RadioPage);
    await fixture.componentInstance.scan.whenIdle();
    fixture.detectChanges();
    expect(api.lookupAccount).toHaveBeenCalledWith('MaQuest@djs.social');
    expect(publicLookup).not.toHaveBeenCalled();
    expect(fixture.componentInstance.view()).toBe('playlist');
    expect(fixture.componentInstance.player.queue()).toHaveLength(1);
    expect(fixture.componentInstance.failed()).toBe(false);
    expect(fixture.componentInstance.player.active()).toBe(false);
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
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Could not load audio. Try Find audio again.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('results are retained');
    expect(diagnostics).toHaveBeenCalledWith('Radio', 'account-lookup:failed', error, {
      transport: 'signed-in',
      handle: 'music@sea.example',
    });
  });
  it('opens a shared post anonymously, queues it without autoplay, and responds to a new link', async () => {
    const params = new BehaviorSubject(
      convertToParamMap({ post: 'https://sea.example/@singer/123' }),
    );
    const getStatus = vi.fn((ref: { id: string }) =>
      of({
        ...audio,
        id: ref.id,
        visibility: 'public',
        url: `https://sea.example/@singer/${ref.id}`,
        media_attachments: [{ id: 'clip', type: 'audio', url: 'https://sea.example/song.mp3' }],
      } as Status),
    );
    auth.isAnonymous = true;
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: {}, queryParamMap: params } });
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { getStatus } });
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.importing()).toBe(false));
    fixture.detectChanges();
    expect(fixture.componentInstance.player.queue()).toHaveLength(1);
    expect(fixture.componentInstance.player.active()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Copy Radio link');
    expect(fixture.componentInstance.view()).toBe('playlist');
    expect(api.lookupAccount).not.toHaveBeenCalled();
    params.next(convertToParamMap({ post: 'https://sea.example/@singer/456' }));
    await vi.waitFor(() => expect(fixture.componentInstance.importing()).toBe(false));
    expect(fixture.componentInstance.scan.posts().map((post) => post.id)).toEqual(['456']);
    expect(fixture.componentInstance.shareParams()).toEqual({
      post: 'https://sea.example/@singer/456',
    });
  });

  it('plays an in-app Open in Radio post from the handoff, keeping the current queue', async () => {
    const url = 'https://sea.example/@singer/789';
    const offered = {
      ...audio,
      id: '789',
      visibility: 'public',
      url,
      media_attachments: [{ id: 'new', type: 'audio', url: 'https://sea.example/new.mp3' }],
    } as Status;
    const getStatus = vi.fn(() => throwError(() => new Error('origin refuses anonymous reads')));
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { getStatus } });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ post: url, add: '1', view: 'radio' })),
      },
    });
    TestBed.inject(RadioHandoff).offer(offered);
    const player = TestBed.inject(RadioPlayer);
    player.replacePlaylist(player.tracks(audio));
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.importing()).toBe(false));
    expect(getStatus).not.toHaveBeenCalled();
    expect(player.queue().map((track) => track.post.id)).toEqual(['audio', '789']);
    expect(player.current()?.post.id).toBe('789');
    expect(player.active()).toBe(true);
    expect(fixture.componentInstance.view()).toBe('radio');
    player.stop();
  });

  it('keeps playing when returning to a Radio address whose fragment is the current queue', () => {
    const fragment = new BehaviorSubject('');
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ view: 'radio' })),
        fragment,
      },
    });
    const player = TestBed.inject(RadioPlayer);
    const song = {
      ...audio,
      id: 'song',
      visibility: 'public',
      url: 'https://sea.example/@singer/1',
      media_attachments: [{ id: 'm', type: 'audio', url: 'https://sea.example/song.mp3' }],
    } as Status;
    player.replacePlaylist(player.tracks(song));
    const queue = player.queue();
    const importUrls = vi.spyOn(TestBed.inject(RadioPlaylists), 'importUrls');
    fragment.next(playlistFragment(playlistUrls(queue)));
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.importing()).toBe(false);
    expect(importUrls).not.toHaveBeenCalled();
    expect(player.queue()).toBe(queue);
  });

  it('explains a post Radio cannot continue through instead of silently showing Search', async () => {
    const url = 'https://sea.example/@singer/790';
    const inline = {
      ...audio,
      id: '790',
      visibility: 'public',
      url,
      media_attachments: [],
      content: '<a href="https://open.spotify.com/track/abc123">Music</a>',
    } as Status;
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { getStatus: () => of(inline) } });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {},
        queryParamMap: of(convertToParamMap({ post: url, add: '1', view: 'radio' })),
      },
    });
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.importing()).toBe(false));
    fixture.detectChanges();
    expect(fixture.componentInstance.view()).toBe('search');
    expect(fixture.nativeElement.textContent).toContain(
      'This post has no audio that Radio can play continuously.',
    );
    expect(fixture.componentInstance.scan.posts().map((post) => post.id)).toEqual(['790']);
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
    const fixture = TestBed.createComponent(RadioPage);
    await fixture.componentInstance.scan.whenIdle();
    expect(publicApi.lookupAccount).toHaveBeenCalledWith('https://sea.example', 'singer');
    expect(publicApi.getAccountStatuses).toHaveBeenNthCalledWith(
      2,
      accountRef,
      expect.objectContaining({ maxId: '123' }),
    );
    expect(fixture.componentInstance.player.active()).toBe(false);
    expect(fixture.componentInstance.shareParams()).toEqual({ acct: 'singer@sea.example' });
  });
  const audio = {
    id: 'audio',
    account: { acct: 'music' },
    media_attachments: [{ type: 'audio', url: 'https://audio.example/song.mp3' }],
  } as Status;
  let api: {
    lookupAccount: ReturnType<typeof vi.fn>;
    getAccountStatuses: ReturnType<typeof vi.fn>;
    homeTimelinePage: ReturnType<typeof vi.fn>;
    listTimeline: ReturnType<typeof vi.fn>;
    lists: ReturnType<typeof vi.fn>;
  };
  let auth: { isAnonymous: boolean; isBlueskyPrimary: boolean };

  beforeEach(() => {
    auth = { isAnonymous: false, isBlueskyPrimary: false };
    api = {
      lookupAccount: vi.fn(() => of({ id: 'account' })),
      getAccountStatuses: vi.fn((_: string, opts: { maxId?: string }) =>
        of(opts.maxId ? [] : [audio]),
      ),
      homeTimelinePage: vi.fn(() => of({ statuses: [audio], nextMaxId: null })),
      listTimeline: vi.fn((_: string, cursor?: string) => of(cursor ? [] : [audio])),
      lists: vi.fn(() => of([{ id: 'list', title: 'Music' }])),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
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
    TestBed.overrideComponent(RadioPage, {
      remove: { imports: [StatusCard] },
      add: { imports: [CardStub] },
    });
  });

  it('waits for an explicit action, resolves an account, and discovers only its media', async () => {
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    expect(api.lookupAccount).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('select[mbControl]')).toBeTruthy();
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
    const linked = {
      ...audio,
      id: 'linked',
      media_attachments: [],
      content: '<a href="https://open.spotify.com/track/abc123">Music</a>',
    } as Status;
    const video = {
      ...linked,
      id: 'video',
      content: '<a href="https://youtu.be/abcdefghijk">Video</a>',
    };
    const music = {
      ...linked,
      id: 'music',
      content: '<a href="https://music.youtube.com/watch?v=z71d3cWLwsw">Sea shanty</a>',
    };
    api.homeTimelinePage.mockReturnValue(
      of({ statuses: [audio, linked, video, music], nextMaxId: null }),
    );
    const fixture = TestBed.createComponent(RadioPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]').checked).toBe(false);
    page.chooseSource('home');
    page.discover();
    await fixture.whenStable();
    expect(page.scan.posts()).toEqual([audio, linked, music]);
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
    const fixture = TestBed.createComponent(RadioPage);
    fixture.componentInstance.started.set(true);
    fixture.componentInstance.scanReady.set(true);
    fixture.detectChanges();
    const more = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Continue scanning'))!;
    const progress = fixture.nativeElement.querySelector('section.radio-page > p[role="status"]');
    expect(progress.textContent).toContain('Scanned');
    expect(more.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses the home pagination cursor and loads lists only on selection', async () => {
    const fixture = TestBed.createComponent(RadioPage);
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
    const fixture = TestBed.createComponent(RadioPage);
    fixture.componentInstance.handle.set('music');
    fixture.componentInstance.discover();
    fixture.destroy();
    expect(pending.observed).toBe(false);
    expect(api.getAccountStatuses).not.toHaveBeenCalled();
    auth.isAnonymous = true;
    const anonymous = TestBed.createComponent(RadioPage);
    anonymous.detectChanges();
    anonymous.componentInstance.chooseSource('list');
    anonymous.componentInstance.discover();
    expect(api.lists).not.toHaveBeenCalled();
    expect(anonymous.nativeElement.textContent).toContain('Account handle');
  });
});
