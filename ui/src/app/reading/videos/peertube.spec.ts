import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import { peertubeVideo, PeerTubeVideos, pickStream } from './peertube';
import { peertubeSource, statusVideo, watchParams } from '../video-player/media-source';
import { validWatchParams } from './watch-queue';
import { PLATFORM_FEED_READ } from '../../platform/http/platform-http';
import { EXTERNAL_FETCH } from '../../platform/http/external-fetch';
import { Status } from '../../platform/api/models';

const uuid = '9c9de5e8-0a1e-484a-b099-e80766180a6d';
const short = 'kkGMgK9ZtnKfYAgnEtQxbv';
const api = {
  name: 'Free software talk',
  duration: 754,
  nsfw: false,
  previewPath: '/lazy-static/previews/a.jpg',
  channel: { name: 'fsf_channel', host: 'tube.example', displayName: 'FSF' },
  files: [],
  streamingPlaylists: [
    {
      playlistUrl: 'https://tube.example/static/hls/master.m3u8',
      files: [
        { fileUrl: 'https://tube.example/static/a-1080.mp4', resolution: { id: 1080 } },
        { fileUrl: 'https://tube.example/static/a-480.mp4', resolution: { id: 480 } },
        { fileUrl: 'https://tube.example/static/a-720.mp4', resolution: { id: 720 } },
        { fileUrl: 'http://tube.example/insecure.mp4', resolution: { id: 360 } },
      ],
    },
  ],
};

describe('PeerTube links', () => {
  it('recognises /w/ and /videos/watch/ links on any https host', () => {
    expect(peertubeSource(`https://Tube.Example/w/${short}`)).toMatchObject({
      kind: 'peertube',
      key: `peertube:tube.example/${short}`,
      peertube: { host: 'tube.example', id: short },
    });
    expect(peertubeSource(`https://tube.example/videos/watch/${uuid}`)?.peertube?.id).toBe(uuid);
    for (const bad of [
      `http://tube.example/w/${short}`,
      `https://tube.example/w/${short}/comments`,
      'https://tube.example/w/IlO0IlO0IlO0IlO0IlO0Il',
      'https://tube.example/videos/watch/not-a-uuid',
      `https://user:pw@tube.example/w/${short}`,
    ])
      expect(peertubeSource(bad)).toBeNull();
  });

  it('finds a PeerTube video in a post and gives Watch a peertube param', () => {
    const status = {
      id: '5',
      content: `<p><a href="https://tube.example/w/${short}">talk</a></p>`,
      media_attachments: [],
      card: null,
    } as unknown as Status;
    const source = statusVideo(status)!;
    expect(source.kind).toBe('peertube');
    const params = watchParams(status, source, 'https://home.example');
    expect(params).toEqual({ post: '5', server: 'https://home.example', peertube: short });
    expect(validWatchParams(params)).toBe(true);
    expect(validWatchParams({ peertube: short })).toBe(false);
    expect(validWatchParams({ post: '5', peertube: 'nope' })).toBe(false);
  });
});

describe('PeerTube streams', () => {
  it('prefers HLS on the web and a ≤720p MP4 on Native, never plain http', () => {
    expect(pickStream(api, 'tube.example', false)).toBe(
      'https://tube.example/static/hls/master.m3u8',
    );
    expect(pickStream(api, 'tube.example', true)).toBe('https://tube.example/static/a-720.mp4');
    expect(pickStream({ files: [] }, 'tube.example', true)).toBeNull();
  });

  it('describes the video, its channel actor and a playable native source', () => {
    const video = peertubeVideo(api, 'tube.example', false, 'peertube:tube.example/x');
    expect(video).toMatchObject({
      title: 'Free software talk',
      channel: 'fsf_channel@tube.example',
      channelName: 'FSF',
      sensitive: false,
      playable: {
        kind: 'native',
        url: 'https://tube.example/static/hls/master.m3u8',
        poster: 'https://tube.example/lazy-static/previews/a.jpg',
        duration: 754,
      },
    });
    expect(peertubeVideo({ ...api, nsfw: true }, 'tube.example', false, 'k').sensitive).toBe(true);
  });

  it('reads the instance’s public API anonymously', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_FEED_READ, useValue: vi.fn() },
      ],
    });
    const videos = TestBed.inject(PeerTubeVideos);
    const found = videos.get(peertubeSource(`https://tube.example/w/${short}`)!);
    const request = TestBed.inject(HttpTestingController).expectOne(
      `https://tube.example/api/v1/videos/${short}`,
    );
    expect(request.request.context.get(EXTERNAL_FETCH)).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(api);
    // Native (a feed reader is present) takes the MP4.
    expect((await found).playable?.url).toBe('https://tube.example/static/a-720.mp4');
  });
});
