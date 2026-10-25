import { describe, expect, it } from 'vitest';
import { externalMedia, postExternalMedia } from './providers';
import { Status } from '../models';
import { matchesMedia, parseMediaQuery } from '../media-query';
import { buildFacets, statusMatchesFacet } from '../pages/search/search-refine';

function post(content: string): Status {
  return {
    id: 'post',
    content,
    media_attachments: [],
    account: { acct: 'music' },
  } as unknown as Status;
}
describe('external media providers', () => {
  it('extracts every alternative and deduplicates card and body links', () => {
    const status = post(
      '<a href="https://open.spotify.com/track/abc?si=one">Spotify</a><a href="https://soundcloud.com/artist/track">SC</a><a href="https://open.spotify.com/track/abc?si=two">again</a>',
    );
    expect(postExternalMedia(status).map((s) => s.provider)).toEqual(['spotify', 'soundcloud']);
    expect(matchesMedia(status, ['audio', 'embed'])).toBe(true);
    expect(matchesMedia({ reblog: status } as Status, ['audio'])).toBe(true);
    expect(
      buildFacets([status])
        .find((f) => f.kind === 'provider')
        ?.values.map((v) => [v.value, v.count]),
    ).toEqual([
      ['spotify', 1],
      ['soundcloud', 1],
    ]);
    expect(statusMatchesFacet(status, 'delivery', 'embed')).toBe(true);
    expect(statusMatchesFacet(status, 'provider', 'soundcloud')).toBe(true);
  });
  it.each([
    'https://youtube.com/watch?v=abcdefghijk',
    'https://music.youtube.com/watch?v=abcdefghijk',
    'https://youtu.be/abcdefghijk',
  ])('keeps %s exclusively video', (url) => {
    const status = post(`<a href="${url}">A song</a>`);
    expect(matchesMedia(status, ['video', 'embed'])).toBe(true);
    expect(matchesMedia(status, ['audio'])).toBe(false);
  });
  it.each([
    'https://open.spotify.com.evil.test/track/abc',
    'https://open.spotify.com@evil.test/track/abc',
    'https://open.spotify.com:8080/track/abc',
    'javascript:alert(1)',
    'https://youtub.com/watch?v=abcdefghijk',
    'https://mixcloud.com/live/person',
    'https://soundcloud.com/artist/likes',
  ])('rejects unsupported URL %s', (url) => expect(externalMedia(url)).toBeNull());
  it('resolves Bandcamp only from validated numeric embed metadata, never executing card HTML', () => {
    const status = {
      ...post(''),
      card: {
        url: 'https://artist.bandcamp.com/album/record',
        html: '<script>alert(1)</script><iframe src="https://bandcamp.com/EmbeddedPlayer/album=123/size=large/"></iframe>',
      },
    } as Status;
    const source = postExternalMedia(status)[0];
    expect(source.embed).toContain('album=123/size=small/');
    expect(source.url).toBe('https://artist.bandcamp.com/album/record');
    status.card!.html = '<iframe src="https://evil.test/embed"></iframe>';
    expect(postExternalMedia(status)[0].embed).toBeUndefined();
    expect(matchesMedia(status, ['audio'])).toBe(true);
    expect(matchesMedia(status, ['embed'])).toBe(false);
    expect(statusMatchesFacet(status, 'delivery', 'link')).toBe(true);
  });
  it('distinguishes mixed-media providers and preserves Apple song selection', () => {
    expect(externalMedia('https://music.apple.com/us/album/record/123?i=456')?.embed).toBe(
      'https://embed.music.apple.com/us/album/record/123?i=456',
    );
    expect(externalMedia('https://music.apple.com/us/music-video/song/123')?.type).toBe('video');
    expect(externalMedia('https://tidal.com/browse/video/123')?.type).toBe('video');
    expect(externalMedia('https://podcasts.apple.com/us/podcast/show/id123?i=456')?.type).toBe(
      'unknown',
    );
  });
  it('does not force external media queries through attachment-only search', () => {
    expect(parseMediaQuery('has:audio')).toEqual({ query: '', types: ['audio'] });
    expect(parseMediaQuery('jazz has:embed')).toEqual({ query: 'jazz', types: ['embed'] });
    expect(parseMediaQuery('"has:embed"')).toEqual({ query: '"has:embed"', types: [] });
  });
});
