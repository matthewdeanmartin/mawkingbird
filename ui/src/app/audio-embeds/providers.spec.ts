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
  it('constructs Amazon and Deezer players without tracking parameters', () => {
    expect(
      externalMedia('https://music.amazon.com/albums/B0FT4N23VX?trackAsin=B0FT4N23VY&ref=tracking'),
    ).toMatchObject({
      provider: 'amazon-music',
      type: 'audio',
      controllable: false,
      embed: 'https://music.amazon.com/embed/B0FT4N23VY/',
    });
    expect(externalMedia('https://www.deezer.com/en/track/3135556?utm_source=test')).toMatchObject({
      provider: 'deezer',
      type: 'audio',
      embed: 'https://widget.deezer.com/widget/dark/track/3135556',
    });
    expect(externalMedia('https://music.amazon.com.evil.test/albums/B0FT4N23VX')).toBeNull();
    expect(externalMedia('https://deezer.com/track/not-an-id')).toBeNull();
  });
  it('offers Archive embeds without misclassifying movies and books as audio', () => {
    expect(externalMedia('https://archive.org/details/shanties')).toMatchObject({
      type: 'unknown',
      embed: 'https://archive.org/embed/shanties',
      controllable: false,
    });
    expect(externalMedia('https://archive.org/details/shanties/song.mp3')?.type).toBe('audio');
    expect(externalMedia('https://archive.org/details/shanties/movie.mp4')?.type).toBe('video');
    expect(externalMedia('https://archive.org/details/shanties/book.pdf')?.type).toBe('unknown');
  });
  it('keeps author first and provider/delivery immediately below media', () => {
    const facets = buildFacets([
      post('<a href="https://www.deezer.com/track/3135556">Music</a>'),
    ]).map((f) => f.kind);
    expect(facets[0]).toBe('author');
    expect(facets.slice(facets.indexOf('media'), facets.indexOf('media') + 3)).toEqual([
      'media',
      'provider',
      'delivery',
    ]);
  });
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
  it.each(['https://youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk'])(
    'keeps %s exclusively video',
    (url) => {
      const status = post(`<a href="${url}">A song</a>`);
      expect(matchesMedia(status, ['video', 'embed'])).toBe(true);
      expect(matchesMedia(status, ['audio'])).toBe(false);
    },
  );
  it('classifies YouTube Music as audio and supplies an explicitly loaded visible player', () => {
    const url = 'https://music.youtube.com/watch?v=z71d3cWLwsw&si=6w5bILhLDRVOXzUO';
    expect(externalMedia(url)).toMatchObject({
      provider: 'youtube-music',
      type: 'audio',
      controllable: false,
      embed: 'https://www.youtube-nocookie.com/embed/z71d3cWLwsw?autoplay=0',
    });
    const status = post(`<a href="${url}">Sea shanty</a>`);
    expect(matchesMedia(status, ['audio', 'embed'])).toBe(true);
    expect(matchesMedia(status, ['video'])).toBe(false);
    expect(externalMedia('https://music.youtube.com.evil.test/watch?v=z71d3cWLwsw')).toBeNull();
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
