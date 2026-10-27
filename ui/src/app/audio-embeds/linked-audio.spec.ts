import { describe, expect, it } from 'vitest';
import { Status } from '../models';
import { directAudioUrl, linkedAudio, locItems } from './linked-audio';

function post(content: string, extra: Partial<Status> = {}): Status {
  return { id: '1', content, media_attachments: [], ...extra } as Status;
}

describe('linked audio', () => {
  it('maps direct files, Wikimedia file pages and Archive file pages to playable https URLs', () => {
    expect(directAudioUrl('https://example.org/show/Ep%201.mp3?dl=1')).toBe(
      'https://example.org/show/Ep%201.mp3?dl=1',
    );
    expect(directAudioUrl('https://commons.wikimedia.org/wiki/File:Sea shanty.ogg')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Sea_shanty.ogg',
    );
    expect(directAudioUrl('https://en.m.wikipedia.org/wiki/File:Bach_Prelude.oga')).toBe(
      'https://en.wikipedia.org/wiki/Special:FilePath/Bach_Prelude.oga',
    );
    expect(directAudioUrl('https://archive.org/details/78_song/track%2001.mp3')).toBe(
      'https://archive.org/download/78_song/track%2001.mp3',
    );
  });

  it('rejects insecure, credentialed, non-audio and non-file links', () => {
    for (const raw of [
      'http://example.org/a.mp3',
      'https://user:pw@example.org/a.mp3',
      'https://example.org:8443/a.mp3',
      'https://example.org/a.mp4',
      'https://example.org/podcast',
      'https://commons.wikimedia.org/wiki/File:Photo.jpg',
      'https://commons.wikimedia.org/wiki/Category:Audio.ogg',
      'https://evil.example/wiki/File:x.ogg/../y',
      'https://archive.org/details/78_song',
      'not a url',
    ])
      expect(directAudioUrl(raw), raw).toBeNull();
  });

  it('collects each linked file once and skips the post’s own attachments', () => {
    const status = post(
      '<a href="https://a.example/x.mp3">x</a> <a href="https://a.example/x.mp3">again</a> <a href="https://files.example/own.mp3">own</a>',
      {
        media_attachments: [{ id: 'm', type: 'audio', url: 'https://files.example/own.mp3' }],
        card: { url: 'https://b.example/y.ogg' },
      } as Partial<Status>,
    );
    expect(linkedAudio(status).map((item) => item.media.id)).toEqual([
      'link:https://b.example/y.ogg',
      'link:https://a.example/x.mp3',
    ]);
  });

  it('recognises Library of Congress items and playlist embeds', () => {
    expect(
      locItems(
        post(
          '<a href="https://www.loc.gov/item/jukebox-19856/">a</a> <a href="https://www.loc.gov/item/playlist?tracks=jukebox-19856%7Cjukebox-202039&embed=resources">b</a> <a href="https://www.loc.gov/photos/">c</a>',
        ),
      ),
    ).toEqual(['jukebox-19856', 'jukebox-202039']);
    expect(
      locItems(post('<a href="https://www.loc.gov/item/podcasts/2021-01-29/sea-shanties/">p</a>')),
    ).toEqual(['podcasts/2021-01-29/sea-shanties']);
  });
});
