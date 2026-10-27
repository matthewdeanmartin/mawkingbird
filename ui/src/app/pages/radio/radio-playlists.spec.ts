import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { FollowTrust } from '../../follow-trust';
import { TrustedAccounts } from '../../trusted-accounts';
import { Playback } from '../../video-player/playback';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { Status } from '../../models';
import { RadioPlayer } from './radio-player';
import {
  playlistFragment,
  playlistUrls,
  readPlaylistFragment,
  RadioPlaylists,
} from './radio-playlists';

describe('Radio playlists', () => {
  const api = { getStatus: vi.fn(), getContext: vi.fn() };
  let lists: RadioPlaylists;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('test') } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        { provide: AnonymousPublicApi, useValue: api },
      ],
    });
    lists = TestBed.inject(RadioPlaylists);
  });
  it('accepts native, SoundCloud and Mixcloud while rejecting inline-only and unsafe URLs', () => {
    for (const url of [
      'https://audio.example/song.mp3',
      'https://soundcloud.com/artist/song',
      'https://mixcloud.com/artist/mix/',
    ]) {
      expect(lists.fromUrl(url)).toHaveLength(1);
    }
    for (const url of [
      'https://open.spotify.com/track/abc',
      'https://music.youtube.com/watch?v=z71d3cWLwsw',
      'https://youtu.be/z71d3cWLwsw',
      'javascript:alert(1)',
      'https://soundcloud.com.evil.example/artist/song',
    ]) {
      expect(lists.fromUrl(url)).toEqual([]);
    }
  });
  it('imports Wikimedia file pages as their files and Library of Congress items through the API', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            item: { title: 'Song' },
            resources: [{ audio: 'https://tile.loc.gov/a/default.mp3' }],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    try {
      const [file] = lists.fromUrl('https://commons.wikimedia.org/wiki/File:Sea_shanty.ogg');
      expect(file.media.url).toBe(
        'https://commons.wikimedia.org/wiki/Special:FilePath/Sea_shanty.ogg',
      );
      expect(lists.fromUrl('https://en.wikipedia.org/wiki/Sea_shanty.ogg')).toEqual([]);
      const result = await lists.importUrls(['https://www.loc.gov/item/jukebox-19856/']);
      expect(result.skipped).toBe(0);
      expect(result.tracks.map((track) => track.media.url)).toEqual([
        'https://tile.loc.gov/a/default.mp3',
      ]);
      expect(result.tracks[0].media.description).toBe('Song');
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('round-trips ordered public URLs without including private posts', () => {
    const tracks = [
      ...lists.fromUrl('https://audio.example/one.mp3'),
      ...lists.fromUrl('https://mixcloud.com/artist/mix/'),
    ];
    const urls = playlistUrls(tracks);
    expect(readPlaylistFragment(playlistFragment(urls))).toEqual(urls);
    tracks[0].post.visibility = 'private';
    expect(playlistUrls(tracks)).toEqual(['https://mixcloud.com/artist/mix/']);
    expect(readPlaylistFragment('playlist=%not-json')).toBeNull();
  });
  it('saves multiple named playlists locally, reloads order and deletes only the selected playlist', () => {
    const tracks = [
      ...lists.fromUrl('https://audio.example/two.mp3'),
      ...lists.fromUrl('https://audio.example/one.mp3'),
    ];
    lists.save('Shanties', tracks);
    lists.save('Mix', lists.fromUrl('https://mixcloud.com/artist/mix/'));
    const id = lists.saved()[0].id;
    lists.saved.set([]);
    lists.refresh();
    expect(lists.saved().map((p) => p.name)).toEqual(['Shanties', 'Mix']);
    expect(lists.saved()[0].tracks.map((t) => t.media.url)).toEqual(tracks.map((t) => t.media.url));
    lists.remove(id);
    expect(lists.saved().map((p) => p.name)).toEqual(['Mix']);
  });
  it('imports every supported link from a self-reply thread and excludes other authors and branches through them', async () => {
    const post = (id: string, parent: string | null, author = 'artist'): Status =>
      ({
        id,
        in_reply_to_id: parent,
        account: { id: author, acct: author },
        visibility: 'public',
        media_attachments: [],
        content: `<a href="https://soundcloud.com/artist/${id}">Track</a><a href="https://mixcloud.com/artist/${id}/">Mix</a>`,
      }) as unknown as Status;
    api.getStatus.mockReturnValue(of(post('1', null)));
    api.getContext.mockReturnValue(
      of({
        ancestors: [],
        descendants: [post('2', '1'), post('3', '1', 'other'), post('4', '2'), post('5', '3')],
      }),
    );
    const result = await lists.importUrls(['https://sea.example/@artist/1'], true);
    expect(result.tracks.map((t) => t.post.id)).toEqual(['1', '1', '2', '2', '4', '4']);
    expect(result.skipped).toBe(0);
  });
  it('retains playable imports when another URL fails and does not autoplay', async () => {
    api.getStatus.mockReturnValue(throwError(() => new Error('gone')));
    const result = await lists.importUrls([
      'https://sea.example/@artist/9',
      'https://audio.example/song.mp3',
    ]);
    expect(result.tracks).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(TestBed.inject(RadioPlayer).active()).toBe(false);
  });
});
