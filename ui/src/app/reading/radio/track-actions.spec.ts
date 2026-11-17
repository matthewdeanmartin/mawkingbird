import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { AppDialogs } from '../../shell/app-dialogs';
import { Auth } from '../../platform/session/auth';
import { ShareRequest } from './share-request';
import { FollowTrust } from '../../accounts/follow-trust';
import { Status } from '../../platform/api/models';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { Server } from '../../platform/http/server';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Playback } from '../video-player/playback';
import { RadioPlaylists } from './radio-playlists';
import { RadioPlayer } from './radio-player';
import { TrackActions } from './track-actions';

describe('TrackActions', () => {
  let actions: TrackActions;
  let lists: RadioPlaylists;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    localStorage.clear();
    api = {
      postStatus: vi.fn(() => of({ id: 'reply', url: 'https://home.example/@me/reply' })),
      editStatus: vi.fn(() => of({ id: 'root' })),
      deleteStatus: vi.fn(),
      verifyCredentials: vi.fn(),
      getAccountStatuses: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: api },
        {
          provide: Auth,
          useValue: { kind: signal('mastodon'), token: signal('t'), account: signal(null) },
        },
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
    actions = TestBed.inject(TrackActions);
    lists = TestBed.inject(RadioPlaylists);
  });

  const post = (extra: Partial<Status> = {}) =>
    ({
      id: '5',
      url: 'https://sea.example/@singer/5',
      visibility: 'public',
      content: '<p>Blow the man down</p>',
      account: { id: 'singer', acct: 'singer@sea.example', display_name: 'Singer' },
      media_attachments: [{ id: 'm', type: 'audio', url: 'https://sea.example/m.mp3' }],
      ...extra,
    }) as Status;

  it('credits the poster and opens Share with the recording', () => {
    const [track] = TestBed.inject(RadioPlayer).tracks(post());
    expect(actions.credit(track)).toBe('shared by @singer@sea.example');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    actions.share(track);
    expect(TestBed.inject(ShareRequest).take()).toBe(track);
    expect(navigate).toHaveBeenCalledWith(['/share']);
  });

  it('appends to a published playlist only after the cost is confirmed', async () => {
    const [first] = lists.fromUrl('https://audio.example/one.mp3');
    const id = lists.save('Mix', [first])!;
    lists.update(id, (row) => ({
      ...row,
      published: {
        rootId: 'root',
        url: 'https://home.example/@me/root',
        visibility: 'public',
        name: 'Mix',
        description: '',
        editable: true,
        entries: [{ key: first.key, postId: 'r1', title: 'one' }],
      },
    }));
    const [track] = TestBed.inject(RadioPlayer).tracks(post());
    const confirm = vi.spyOn(TestBed.inject(AppDialogs), 'confirm').mockResolvedValue(false);
    expect(await actions.append(track, id)).toBe('');
    expect(confirm.mock.calls[0][0]).toContain('create 1 posts and edit 1');
    expect(api['postStatus']).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    expect(await actions.append(track, id)).toContain('Added to');
    // The reply quotes the original post rather than linking its file.
    expect(api['postStatus']).toHaveBeenCalledWith(
      '2. Blow the man down · @singer@sea.example',
      { inReplyToId: 'r1', visibility: 'unlisted', quotedStatusId: '5' },
      expect.any(String),
    );
    expect(JSON.stringify(api['postStatus'].mock.calls)).not.toContain('m.mp3');
    expect(lists.saved()[0].published?.entries).toHaveLength(2);
  });

  it('refuses to append a private recording', async () => {
    const [first] = lists.fromUrl('https://audio.example/one.mp3');
    const id = lists.save('Mix', [first])!;
    lists.update(id, (row) => ({
      ...row,
      published: {
        rootId: 'root',
        url: 'https://home.example/@me/root',
        visibility: 'public',
        name: 'Mix',
        description: '',
        editable: true,
        entries: [],
      },
    }));
    const [hidden] = TestBed.inject(RadioPlayer).tracks(post({ visibility: 'private' }));
    expect(await actions.append(hidden, id)).toContain('is not public');
  });

  it('never adds a player that plays only on its own page to a playlist', () => {
    lists.refresh();
    const spotify = post({
      media_attachments: [],
      content: '<a href="https://open.spotify.com/track/abc123">Spotify</a>',
    });
    const tracks = TestBed.inject(RadioPlayer).singlesOf(spotify);
    const id = lists.create('Listen')!;
    expect(actions.keep(tracks, id)).toBe(
      'These recordings play only on their own page, so they can’t join a playlist.',
    );
    expect(lists.saved()[0].tracks).toEqual([]);
  });
});
