import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { LinkedAudioResolver } from './linked-audio-resolver';

const item = {
  item: {
    title: 'Život jest sen',
    contributor_names: ['Victor Dance Orchestra -- Musical Group -- Musical Group'],
  },
  resources: [
    { audio: 'https://tile.loc.gov/streaming-services/a/default.mp3' },
    { audio: 'https://evil.example/b.mp3' },
  ],
};

function post(content: string): Status {
  return { id: '1', content, media_attachments: [] } as unknown as Status;
}

describe('LinkedAudioResolver', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let resolver: LinkedAudioResolver;
  beforeEach(() => {
    fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    resolver = TestBed.inject(LinkedAudioResolver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('resolves Library of Congress items once, without credentials, to tile.loc.gov files', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify(item)));
    const linked = post('<a href="https://www.loc.gov/item/jukebox-19856/">Listen</a>');
    expect(resolver.candidate(linked)).toBe(true);
    expect(resolver.attachments(linked)).toEqual([]);
    resolver.resolve([linked, linked]);
    resolver.resolve([linked]);
    await vi.waitFor(() => expect(resolver.attachments(linked)).toHaveLength(1));
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://www.loc.gov/item/jukebox-19856/?fo=json&at=item,resources');
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(resolver.attachments(linked)[0]).toMatchObject({
      id: 'loc:jukebox-19856:0',
      url: 'https://tile.loc.gov/streaming-services/a/default.mp3',
      description: 'Život jest sen — Victor Dance Orchestra',
    });
  });

  it('remembers a failed lookup instead of retrying it', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    const linked = post('<a href="https://www.loc.gov/item/jukebox-1/">Listen</a>');
    resolver.resolve([linked]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await Promise.resolve();
    await Promise.resolve();
    resolver.resolve([linked]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(resolver.attachments(linked)).toEqual([]);
  });

  it('reads ID3 titles from one bounded range request, only for https MP3s', async () => {
    const tag = new Uint8Array([
      0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 15, 0x54, 0x49, 0x54, 0x32, 0, 0, 0, 5, 0, 0, 3, 0x53,
      0x65, 0x61, 0x21,
    ]);
    fetch.mockResolvedValue(new Response(tag, { status: 206 }));
    resolver.readTags('https://a.example/song.mp3');
    resolver.readTags('https://a.example/song.mp3');
    resolver.readTags('https://a.example/song.ogg');
    resolver.readTags('http://a.example/song.mp3');
    await vi.waitFor(() => expect(resolver.tags('https://a.example/song.mp3')).toBeTruthy());
    expect(resolver.tags('https://a.example/song.mp3')).toEqual({ title: 'Sea!' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: { Range: 'bytes=0-65535' },
      credentials: 'omit',
    });
  });
});
