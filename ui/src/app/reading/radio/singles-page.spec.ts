import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { RadioHandoff } from '../radio-handoff';
import { Playback } from '../video-player/playback';
import { RADIO_AUDIO, RadioPlayer } from './radio-player';
import { RadioPlaylists } from './radio-playlists';
import { SavedSingles } from './saved-singles';
import { SinglesPage } from './singles-page';
import { AppDialogs } from '../../shell/app-dialogs';

function quietAudio(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.play = () => Promise.resolve();
  audio.pause = () => undefined;
  audio.load = () => undefined;
  return audio;
}

describe('SinglesPage', () => {
  const song = {
    id: '1',
    url: 'https://sea.example/@singer/1',
    visibility: 'public',
    account: { acct: 'singer', display_name: 'Singer' },
    content: '<p>Sea shanty</p>',
    media_attachments: [{ id: 'm', type: 'audio', url: 'https://audio.example/1.mp3' }],
  } as unknown as Status;
  const spotify = {
    ...song,
    id: '2',
    url: 'https://sea.example/@singer/2',
    media_attachments: [],
    content: '<a href="https://open.spotify.com/track/abc123">Spotify song</a>',
  } as Status;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let getStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    params = new BehaviorSubject(convertToParamMap({}));
    getStatus = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'singles', children: [] },
          { path: 'listen', children: [] },
          { path: 'playlists/:id', children: [] },
        ]),
        {
          provide: Auth,
          useValue: { isAnonymous: false, kind: signal('mastodon'), token: signal('t') },
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        { provide: RADIO_AUDIO, useValue: quietAudio },
        { provide: AnonymousPublicApi, useValue: { getStatus } },
        { provide: ActivatedRoute, useValue: { snapshot: {}, queryParamMap: params } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(SinglesPage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  it('says when nothing is saved and leads to Find singles', () => {
    const { root } = render();
    expect(root.querySelector('h1')?.textContent).toContain('Singles');
    expect(root.querySelector('nav a[aria-current="page"]')?.textContent).toContain('Saved');
    expect(root.textContent).toContain('No saved singles yet');
    expect(Array.from(root.querySelectorAll('a'), (link) => link.getAttribute('href'))).toContain(
      '/singles/find',
    );
  });

  it('saves a post handed over by a card, then drops the parameter', async () => {
    TestBed.inject(RadioHandoff).offer(spotify);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    params.next(convertToParamMap({ save: 'https://sea.example/@singer/2' }));
    const { page, fixture, root } = render();
    await vi.waitFor(() => expect(page.saving()).toBe(false));
    fixture.detectChanges();
    expect(getStatus).not.toHaveBeenCalled();
    expect(page.message()).toBe('Saved 1 single.');
    expect(root.textContent).toContain('Plays on its own page');
    expect(navigate).toHaveBeenCalledWith(['/singles'], { replaceUrl: true });
  });

  it('plays a continuous Single as a one-track playlist and opens the others on Listen', () => {
    const player = TestBed.inject(RadioPlayer);
    const singles = TestBed.inject(SavedSingles);
    singles.save([...player.singlesOf(spotify), ...player.singlesOf(song)]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { page } = render();
    const byPost = (id: string) => singles.items().find((item) => item.track.post.id === id)!.track;
    page.play(byPost('1'));
    expect(player.queue().map((track) => track.post.id)).toEqual(['1']);
    page.play(byPost('2'));
    expect(navigate).toHaveBeenCalledWith(['/listen'], expect.anything());
    expect(player.queue().map((track) => track.post.id)).toEqual(['1']);
    player.stop();
  });

  it('adds a Single to a playlist, or starts one with it', () => {
    const player = TestBed.inject(RadioPlayer);
    const playlists = TestBed.inject(RadioPlaylists);
    playlists.refresh();
    const id = playlists.create('Mix')!;
    const [track] = player.singlesOf(song);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { page } = render();
    page.addTo(track, id);
    expect(page.message()).toBe('Added 1 to Mix.');
    page.addTo(track, id);
    expect(page.message()).toBe('Already in Mix.');
    page.newPlaylist(track);
    expect(playlists.saved()).toHaveLength(2);
    expect(navigate).toHaveBeenCalledWith(['/playlists', playlists.saved()[1].id]);
  });

  it('clears every saved single after confirming', async () => {
    const player = TestBed.inject(RadioPlayer);
    const singles = TestBed.inject(SavedSingles);
    singles.save([...player.singlesOf(song), ...player.singlesOf(spotify)]);
    const confirm = vi.spyOn(TestBed.inject(AppDialogs), 'confirm').mockResolvedValueOnce(false);
    const { page, fixture, root } = render();
    expect(root.textContent).toContain('Clear all');
    await page.clearAll();
    expect(singles.items()).toHaveLength(2);
    confirm.mockResolvedValueOnce(true);
    await page.clearAll();
    expect(confirm).toHaveBeenLastCalledWith(
      'Remove all 2 saved singles? Playlists keep their tracks.',
    );
    fixture.detectChanges();
    expect(singles.items()).toEqual([]);
    expect(root.textContent).toContain('No saved singles yet');
  });
});
