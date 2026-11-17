import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { RadioHandoff } from '../radio-handoff';
import { Playback } from '../video-player/playback';
import { RadioPage } from './radio-page';
import { RADIO_AUDIO, RadioPlayer } from './radio-player';
import { playlistFragment } from './radio-playlists';

/** An audio element whose play() settles, as browsers do; jsdom's returns nothing. */
function quietAudio(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.play = () => Promise.resolve();
  audio.pause = () => undefined;
  audio.load = () => undefined;
  return audio;
}

describe('RadioPage', () => {
  const audio = {
    id: 'audio',
    url: 'https://sea.example/@singer/1',
    visibility: 'public',
    account: { acct: 'music' },
    media_attachments: [{ id: 'm', type: 'audio', url: 'https://audio.example/song.mp3' }],
  } as Status;
  let navigate: { mock: { calls: unknown[][] } } & ((...args: unknown[]) => unknown);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            isAnonymous: false,
            kind: signal('mastodon'),
            token: signal('test'),
          },
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: RADIO_AUDIO, useValue: quietAudio },
      ],
    });
  });

  /** `before` runs once the route is set, when services may first be injected. */
  function open(
    params: Record<string, string>,
    fragment = '',
    before?: () => void,
    data: Record<string, string> = {},
  ) {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { fragment, data }, queryParamMap: of(convertToParamMap(params)) },
    });
    before?.();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(RadioPage);
    fixture.detectChanges();
    return fixture;
  }

  it('says nothing is playing and points to Singles and Playlists, with no tabs', () => {
    const fixture = open({});
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Now playing');
    expect(root.textContent).toContain('Nothing is playing');
    expect(Array.from(root.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/singles', '/playlists', '/radio/settings']),
    );
    expect(root.querySelector('nav')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows Radio settings on their own route, never forwarding from there', () => {
    const fixture = open({ acct: 'singer@sea.example' }, '', undefined, { view: 'settings' });
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-radio-settings')).toBeTruthy();
    expect(fixture.componentInstance.player.fullView()).toBe(false);
  });

  it.each([
    [{ acct: 'singer@sea.example' }, '', ['/singles', 'find'], { acct: 'singer@sea.example' }],
    [
      { post: 'https://sea.example/@singer/1' },
      '',
      ['/playlists', 'shared'],
      { post: 'https://sea.example/@singer/1' },
    ],
  ])(
    'forwards an older shared Radio link %o to its new page',
    (params, fragment, path, queryParams) => {
      open(params, fragment);
      expect(navigate).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ queryParams, replaceUrl: true }),
      );
    },
  );

  it.each(['search', 'publish', 'saved', 'mine', 'playlist'])(
    'ignores the retired tab address ?view=%s instead of forwarding it',
    (view) => {
      open({ view });
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('forwards a shared playlist fragment to the shared playlist page', () => {
    const fragment = playlistFragment(['https://sea.example/song.mp3']);
    open({}, fragment);
    expect(navigate).toHaveBeenCalledWith(
      ['/playlists', 'shared'],
      expect.objectContaining({ fragment, replaceUrl: true }),
    );
  });

  it('plays an in-app Play in Radio post from the handoff as a Single', async () => {
    const url = 'https://sea.example/@singer/789';
    const offered = { ...audio, id: '789', url } as Status;
    const getStatus = vi.fn(() => throwError(() => new Error('origin refuses anonymous reads')));
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { getStatus } });
    let player!: RadioPlayer;
    const fixture = open({ play: url }, '', () => {
      TestBed.inject(RadioHandoff).offer(offered);
      player = TestBed.inject(RadioPlayer);
      player.playTracks(player.tracks(audio));
    });
    await vi.waitFor(() => expect(fixture.componentInstance.opening()).toBe(false));
    expect(getStatus).not.toHaveBeenCalled();
    expect(player.queue().map((track) => track.post.id)).toEqual(['789']);
    expect(player.active()).toBe(true);
    expect(fixture.componentInstance.failed()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(
      ['/radio'],
      expect.objectContaining({ replaceUrl: true }),
    );
    player.stop();
  });

  it('opens a post Radio cannot continue through on its own Listen page', async () => {
    const url = 'https://sea.example/@singer/790';
    const inline = {
      ...audio,
      id: '790',
      url,
      media_attachments: [],
      content: '<a href="https://open.spotify.com/track/abc123">Music</a>',
    } as Status;
    TestBed.overrideProvider(AnonymousPublicApi, { useValue: { getStatus: () => of(inline) } });
    const fixture = open({ play: url });
    await vi.waitFor(() => expect(fixture.componentInstance.opening()).toBe(false));
    expect(fixture.componentInstance.player.active()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(
      ['/listen'],
      expect.objectContaining({ queryParams: expect.objectContaining({ post: '790' }) }),
    );
  });
});
