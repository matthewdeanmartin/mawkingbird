import { describe, expect, it } from 'vitest';
import { seenVideo } from './seen-videos';
import { Status } from '../../platform/api/models';

const base = {
  id: '42',
  url: 'https://a.example/@u/42',
  created_at: '2026-11-18T00:00:00Z',
  content: '',
  account: { id: 'u', acct: 'u' },
  media_attachments: [],
  card: null,
};

describe('seenVideo', () => {
  it('keeps a YouTube post as a Watch link with title and poster', () => {
    const status = {
      ...base,
      card: {
        url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        title: 'Lamps',
        image: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq.jpg',
      },
    } as unknown as Status;
    expect(seenVideo(status, 'https://home.example')).toEqual({
      title: 'Lamps',
      poster: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq.jpg',
      params: {
        post: '42',
        server: 'https://home.example',
        acct: 'u@home.example',
        youtube: 'aaaaaaaaaaa',
      },
    });
  });

  it('keeps an uploaded video by its attachment, never its media URL', () => {
    const status = {
      ...base,
      media_attachments: [
        {
          id: 'm1',
          type: 'video',
          url: 'https://media.example/v.mp4',
          preview_url: 'https://media.example/p.jpg',
          description: 'A clip',
        },
      ],
    } as unknown as Status;
    const video = seenVideo(status, 'https://home.example')!;
    expect(video.params).toEqual({
      post: '42',
      server: 'https://home.example',
      acct: 'u@home.example',
      attachment: 'm1',
    });
    expect(JSON.stringify(video)).not.toContain('v.mp4');
  });

  it('ignores posts without video', () => {
    expect(seenVideo(base as unknown as Status, 'https://home.example')).toBeNull();
  });
});
