import { describe, expect, it } from 'vitest';
import { isVideoLink, isVideoStatus } from './video-discovery';
import { Status } from '../models';

describe('Video discovery, independent of playback support', () => {
  it.each([
    'https://youtu.be/QCSOlTrsMfs',
    'https://vimeo.com/12345',
    'https://www.dailymotion.com/video/abc',
    'https://www.twitch.tv/videos/123',
    'https://www.tiktok.com/@somebody/video/123',
    'https://www.bilibili.com/video/BV123',
    'https://rumble.com/a-video.html',
    'https://odysee.com/@channel:1/video:2',
    'https://tube.example/videos/watch/9db9f3f1-9b54-44ed-9e91-461d262d2205',
    'https://tube.example/w/7usCE3v2RrWK6nuoSr4NHJ',
  ])('recognizes %s', (url) => expect(isVideoLink(url)).toBe(true));
  it.each([
    'https://youtube.com.evil.test/watch?v=QCSOlTrsMfs',
    'https://evil.test/?url=https://youtu.be/QCSOlTrsMfs',
    'javascript:alert(1)',
    'https://name:pass@youtube.com/watch?v=QCSOlTrsMfs',
    'https://example.test/article',
  ])('does not misclassify %s', (url) => expect(isVideoLink(url)).toBe(false));
  it('includes uploads, cardless links and boosted underlying posts, excluding standalone animations and audio', () => {
    const base = { media_attachments: [], content: '' } as unknown as Status;
    expect(isVideoStatus({ ...base, media_attachments: [{ type: 'video' }] } as Status)).toBe(true);
    expect(isVideoStatus({ ...base, media_attachments: [{ type: 'gifv' }] } as Status)).toBe(false);
    expect(isVideoStatus({ ...base, media_attachments: [{ type: 'audio' }] } as Status)).toBe(
      false,
    );
    const link = { ...base, content: '<p><a href="https://vimeo.com/123">watch</a></p>' };
    expect(isVideoStatus({ ...base, reblog: link } as Status)).toBe(true);
    expect(
      isVideoStatus({
        ...base,
        card: { url: 'https://example.test/article', type: 'link', image: 'poster' },
      } as Status),
    ).toBe(false);
  });
});
