import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
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
import { Playback } from '../../video-player/playback';
import { TrustedAccounts } from '../../trusted-accounts';
import { FollowTrust } from '../../follow-trust';

@Component({ selector: 'app-status-card', template: '{{ status().id }}' })
class CardStub {
  readonly status = input.required<Status>();
}

describe('RadioPage', () => {
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
    await fixture.componentInstance.scan.whenIdle();
    fixture.detectChanges();
    expect(fixture.componentInstance.player.queue()).toHaveLength(1);
    expect(fixture.componentInstance.player.active()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Copy Radio link');
    expect(api.lookupAccount).not.toHaveBeenCalled();
    params.next(convertToParamMap({ post: 'https://sea.example/@singer/456' }));
    await fixture.componentInstance.scan.whenIdle();
    expect(fixture.componentInstance.scan.posts().map((post) => post.id)).toEqual(['456']);
    expect(fixture.componentInstance.shareParams()).toEqual({
      post: 'https://sea.example/@singer/456',
    });
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
    media_attachments: [{ type: 'audio' }],
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
    expect(anonymous.nativeElement.textContent).toContain('Sign in');
  });
});
