import { describe, expect, it } from 'vitest';
import {
  attachmentSource,
  mediaUrl,
  statusVideo,
  watchParams,
  youtubeSource,
} from './media-source';
import { MediaAttachment, Status } from '../models';
import { parseAnonymousStatusRouteRef } from '../providers/anonymous/anonymous-route-ref';

const ID = 'dQw4w9WgXcQ';
describe('Video source classification', () => {
  it.each([
    `https://youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?other=1&v=${ID}`,
    `https://m.youtube.com/shorts/${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtube.com/live/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ])('recognizes %s', (url) => {
    expect(youtubeSource(url)?.videoId).toBe(ID);
  });

  it.each([
    `https://youtube.com.evil.test/watch?v=${ID}`,
    `https://evil.test/youtube.com/watch?v=${ID}`,
    `https://youtube.com@evil.test/watch?v=${ID}`,
    `https://user:password@youtube.com/watch?v=${ID}`,
    `javascript:https://youtube.com/watch?v=${ID}`,
    `https://youtube.com:8443/watch?v=${ID}`,
    'https://youtube.com/playlist?list=123',
    'https://youtube.com/@channel/live',
    'https://youtu.be/invalid',
    `https://youtu.be/${ID}/extra`,
    `https://youtu.be/${ID}?t=-5`,
    `https://youtu.be/${ID}?t=Infinity`,
    `https://youtu.be/${ID}?t=999999999`,
    `https://youtu.be/${ID}?t=nonsense`,
  ])('rejects unsupported or hostile URL %s', (url) => {
    expect(youtubeSource(url)).toBeNull();
  });

  it('normalizes bounded timestamps without retaining autoplay or playlist parameters', () => {
    const source = youtubeSource(`https://youtu.be/${ID}?t=1h2m3s&autoplay=1&list=evil`)!;
    expect(source.start).toBe(3723);
    expect(source.url).toBe(`https://www.youtube.com/watch?v=${ID}&t=3723`);
    expect(youtubeSource(`https://youtube.com/watch?v=${ID}&start=75`)?.start).toBe(75);
  });

  it('recognizes post links without a card and never trusts card HTML', () => {
    const post = {
      content: `<p><a href="https://youtu.be/${ID}">Watch</a></p>`,
      card: null,
    } as Status;
    expect(statusVideo(post)?.videoId).toBe(ID);
    expect(
      statusVideo({
        ...post,
        content: '',
        card: {
          url: 'https://evil.test',
          html: `<iframe src="https://youtube.com/embed/${ID}"></iframe>`,
        },
      } as Status),
    ).toBeNull();
  });

  it('uses attachment types, safe URLs and optional metadata rather than thumbnails to identify videos', () => {
    const media = {
      type: 'video',
      url: 'https://media.test/video.mp4',
      description: 'A clip',
      meta: { original: { duration: 90 } },
    } as MediaAttachment;
    expect(attachmentSource(media)).toMatchObject({
      kind: 'native',
      duration: 90,
      title: 'A clip',
    });
    expect(attachmentSource({ ...media, type: 'image' })).toBeNull();
    expect(attachmentSource({ ...media, url: 'javascript:alert(1)' })).toBeNull();
    expect(attachmentSource({ ...media, meta: undefined })?.duration).toBeUndefined();
    expect(mediaUrl('data:text/html,evil')).toBeUndefined();
    expect(mediaUrl('https://user:secret@media.test/video')).toBeUndefined();
  });

  it('Watch links retain server and attachment identity and encode public remote post context', () => {
    const source = attachmentSource({
      type: 'video',
      url: 'https://media.test/a.mp4',
    } as MediaAttachment)!;
    expect(watchParams({ id: '12' } as Status, source, 'https://home.test', 'm1')).toEqual({
      post: '12',
      server: 'https://home.test',
      attachment: 'm1',
    });
    const params = watchParams(
      {
        id: 'anonymous:12',
        provider: 'anonymous-mastodon',
        url: 'https://remote.test/@alice/12',
        providerRef: { server: 'https://remote.test', statusId: '12' },
      } as unknown as Status,
      source,
      'https://home.test',
      'm1',
    );
    expect(parseAnonymousStatusRouteRef(params['post'])).toMatchObject({
      server: 'https://remote.test',
      id: '12',
    });
  });
});
