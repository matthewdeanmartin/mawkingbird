import { describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import { musicPost, youtubeMusic } from './youtube-music';

function post(extra: Partial<Status>): Status {
  return {
    id: '1',
    content: '<a href="https://www.youtube.com/watch?v=jNQXAC9IVRw&t=30">A video</a>',
    tags: [],
    card: null,
    media_attachments: [],
    ...extra,
  } as unknown as Status;
}

describe('YouTube music', () => {
  it('leaves a YouTube link alone unless the post is about music', () => {
    expect(musicPost(post({}))).toBe(false);
    expect(youtubeMusic(post({}))).toEqual([]);
  });

  it.each([
    ['a music hashtag', { tags: [{ name: 'NowPlaying', url: '' }] }],
    ['a Topic channel card', { card: { author_name: 'Sade - Topic', title: 'Smooth Operator' } }],
    ['an official audio title', { card: { title: 'Song (Official Audio)' } }],
    [
      'the words around it',
      { content: '<p>Now playing:</p><a href="https://youtu.be/jNQXAC9IVRw">x</a>' },
    ],
  ])('recognises music from %s', (_why, extra) => {
    expect(musicPost(post(extra as Partial<Status>))).toBe(true);
  });

  it('offers a music post’s YouTube link as audio Radio can drive, from where the link starts', () => {
    const [source] = youtubeMusic(post({ tags: [{ name: 'jazz', url: '' }] }));
    expect(source).toMatchObject({
      provider: 'youtube',
      type: 'audio',
      controllable: true,
    });
    expect(source.embed).toBe(
      `https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?enablejsapi=1&playsinline=1&origin=${encodeURIComponent(location.origin)}&start=30`,
    );
  });
});
