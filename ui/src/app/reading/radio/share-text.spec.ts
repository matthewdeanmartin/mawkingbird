import { describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import { RadioTrack } from './radio-player';
import { playlistText, shareLinks, shareTags, singleText } from './share-text';

function track(extra: Partial<Status> = {}): RadioTrack {
  const post = {
    id: '5',
    url: 'https://sea.example/@singer/5',
    visibility: 'public',
    account: { id: 'singer', acct: 'singer@sea.example', display_name: 'Singer' },
    content:
      '<a href="https://open.spotify.com/track/abc123">Spotify</a> <a href="https://singer.bandcamp.com/track/sea">Bandcamp</a>',
    tags: [
      { name: 'Jazz', url: '' },
      { name: 'cats', url: '' },
    ],
    media_attachments: [],
    ...extra,
  } as unknown as Status;
  return { key: '5:m', post, media: { id: 'm', type: 'audio', url: '' } } as RadioTrack;
}

describe('share text', () => {
  it('lists the post and every service it links, once each', () => {
    const links = shareLinks(track(), 'The Mastodon post');
    expect(links.map((link) => link.label)).toEqual(['The Mastodon post', 'Spotify', 'Bandcamp']);
    expect(links[0].url).toBe('https://sea.example/@singer/5');
  });

  it('leaves out a private post’s own link', () => {
    const links = shareLinks(track({ visibility: 'private' }), 'The Mastodon post');
    expect(links.map((link) => link.label)).toEqual(['Spotify', 'Bandcamp']);
  });

  it('offers the usual music tags, then the post’s own music tags only', () => {
    expect(shareTags([track()])).toEqual(['nowplaying', 'fedimusic', 'music', 'jazz']);
  });

  it('writes a single as title, credit, links and tags, leaving out what was unticked', () => {
    expect(
      singleText('Sea Song', 'shared by @singer', {
        credit: false,
        links: ['https://a.example/1', 'https://b.example/2'],
        tags: ['nowplaying'],
      }),
    ).toBe('Sea Song\n\nhttps://a.example/1\nhttps://b.example/2\n\n#nowplaying');
  });

  it('writes a playlist as one post with numbered tracks', () => {
    expect(
      playlistText(
        'Road trip',
        'For the drive',
        [
          { title: 'One', url: 'https://a.example/1' },
          { title: 'Two  songs', url: 'https://a.example/2' },
        ],
        ['fedimusic'],
      ),
    ).toBe(
      'Road trip\n\nFor the drive\n\n1. One\nhttps://a.example/1\n2. Two songs\nhttps://a.example/2\n\n#fedimusic',
    );
  });
});
