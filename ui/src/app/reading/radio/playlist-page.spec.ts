import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowTrust } from '../../accounts/follow-trust';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { AppDialogs } from '../../shell/app-dialogs';
import { Playback } from '../video-player/playback';
import { PlaylistPage } from './playlist-page';
import { RADIO_AUDIO, RadioPlayer } from './radio-player';
import { RadioPlaylists } from './radio-playlists';
import { SavedSingles } from './saved-singles';

function quietAudio(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.play = () => Promise.resolve();
  audio.pause = () => undefined;
  audio.load = () => undefined;
  return audio;
}

function post(id: string, content = ''): Status {
  return {
    id,
    url: `https://sea.example/@singer/${id}`,
    visibility: 'public',
    account: { id: 'a', acct: 'singer', display_name: 'Singer' },
    content: content || `<p>Song ${id}</p>`,
    spoiler_text: '',
    sensitive: false,
    media_attachments: content
      ? []
      : [{ id: `m${id}`, type: 'audio', url: `https://audio.example/${id}.mp3` }],
  } as unknown as Status;
}

describe('PlaylistPage', () => {
  let paramMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let fragment: BehaviorSubject<string | null>;
  let playlists: RadioPlaylists;
  let player: RadioPlayer;

  beforeEach(() => {
    localStorage.clear();
    paramMap = new BehaviorSubject(convertToParamMap({ id: 'shared' }));
    queryParamMap = new BehaviorSubject(convertToParamMap({}));
    fragment = new BehaviorSubject<string | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'playlists', children: [] },
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
        {
          provide: ActivatedRoute,
          useValue: { snapshot: {}, paramMap, queryParamMap, fragment },
        },
      ],
    });
    playlists = TestBed.inject(RadioPlaylists);
    player = TestBed.inject(RadioPlayer);
    playlists.refresh();
  });

  function render() {
    const fixture = TestBed.createComponent(PlaylistPage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  it('edits a saved playlist in place and plays it without changing it', () => {
    const tracks = [...player.tracks(post('1')), ...player.tracks(post('2'))];
    const id = playlists.create('Road trip', tracks)!;
    paramMap.next(convertToParamMap({ id }));
    const { page, fixture, root } = render();
    expect(root.querySelector('h1')?.textContent).toContain('Road trip');
    page.rename('  Night drive ');
    page.move(0, 1);
    fixture.detectChanges();
    expect(playlists.saved()[0].name).toBe('Night drive');
    expect(playlists.saved()[0].tracks.map((track) => track.post.id)).toEqual(['2', '1']);
    page.play(1);
    expect(player.current()?.post.id).toBe('1');
    page.remove(0);
    expect(playlists.saved()[0].tracks.map((track) => track.post.id)).toEqual(['1']);
    expect(player.queue().map((track) => track.post.id)).toEqual(['2', '1']);
    player.stop();
  });

  it('offers saved Singles that can play continuously, and links to Find singles for more', () => {
    const singles = TestBed.inject(SavedSingles);
    singles.save([
      ...player.singlesOf(post('1')),
      ...player.singlesOf(post('s', '<a href="https://open.spotify.com/track/abc123">x</a>')),
    ]);
    const id = playlists.create('Empty')!;
    paramMap.next(convertToParamMap({ id }));
    const { page, fixture, root } = render();
    expect(root.textContent).toContain('This playlist is empty');
    fixture.detectChanges();
    expect(page.candidates().map((track) => track.post.id)).toEqual(['1']);
    expect(Array.from(root.querySelectorAll('a'), (link) => link.getAttribute('href'))).toContain(
      `/singles/find?playlist=${id}`,
    );
    page.add(page.candidates()[0]);
    expect(playlists.saved()[0].tracks).toHaveLength(1);
    expect(page.candidates()).toEqual([]);
  });

  it('previews a shared post with its thread and saves a copy', async () => {
    const importUrls = vi
      .spyOn(playlists, 'importUrls')
      .mockResolvedValue({ tracks: player.tracks(post('9')), skipped: 2 });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    queryParamMap.next(convertToParamMap({ post: 'https://sea.example/@singer/9' }));
    const { page, fixture, root } = render();
    await vi.waitFor(() => expect(page.loading()).toBe(false));
    fixture.detectChanges();
    expect(importUrls).toHaveBeenCalledWith(['https://sea.example/@singer/9'], true);
    expect(root.querySelector('h1')?.textContent).toContain('Song 9');
    expect(root.textContent).toContain('2 links can’t play here');
    expect(player.queue()).toEqual([]);
    page.saveCopy();
    expect(playlists.saved().map((row) => row.name)).toEqual(['Song 9']);
    expect(navigate).toHaveBeenCalledWith(['/playlists', playlists.saved()[0].id]);
  });

  it('links a posted playlist by its thread, never by a list of its tracks', () => {
    const id = playlists.create('Posted', player.tracks(post('3')))!;
    paramMap.next(convertToParamMap({ id }));
    const first = render();
    expect(first.root.textContent).toContain('Share the playlist to post it as a thread');
    first.fixture.destroy();
    playlists.update(id, (row) => ({
      ...row,
      published: {
        rootId: 'r',
        url: 'https://home.example/@me/r',
        visibility: 'public',
        name: 'Posted',
        description: '',
        entries: [],
        editable: true,
      },
    }));
    const { root } = render();
    const links = Array.from(root.querySelectorAll('a'), (link) => link.getAttribute('href'));
    const thread = links.find((href) => href?.startsWith('/playlists/shared?post='));
    expect(decodeURIComponent(thread!.split('post=')[1])).toBe('https://home.example/@me/r');
    expect(links.some((href) => href?.includes('#'))).toBe(false);
  });

  it('says when a playlist is not in this browser, and deletes after confirming', async () => {
    paramMap.next(convertToParamMap({ id: 'missing' }));
    const { root } = render();
    expect(root.textContent).toContain('isn’t saved in this browser');
    const id = playlists.create('Gone')!;
    paramMap.next(convertToParamMap({ id }));
    vi.spyOn(TestBed.inject(AppDialogs), 'confirm').mockResolvedValue(true);
    const page = TestBed.createComponent(PlaylistPage).componentInstance;
    await page.delete();
    expect(playlists.saved()).toEqual([]);
  });

  it('shares from a Share button and never publishes from the playlist page', () => {
    const tracks = player.tracks(post('1'));
    const id = playlists.create('Listen', tracks)!;
    paramMap.next(convertToParamMap({ id }));
    const { root } = render();
    expect(root.querySelector('section.publish')).toBeNull();
    const share = Array.from(root.querySelectorAll('a'), (link) => link.getAttribute('href')).find(
      (href) => href?.startsWith('/share'),
    );
    expect(share).toBe(`/share?playlist=${id}`);
  });

  it('marks and skips a stored track that plays only on its own page', () => {
    const stop = player.singleTracks(
      post('s', '<a href="https://open.spotify.com/track/abc123">Spotify</a>'),
    );
    const id = playlists.create('Thread', [...stop, ...player.tracks(post('1'))])!;
    paramMap.next(convertToParamMap({ id }));
    const { page, root } = render();
    expect(root.textContent).toContain('Plays on its own page');
    page.play();
    expect(player.queue().map((track) => track.post.id)).toEqual(['1']);
    player.stop();
  });
});
