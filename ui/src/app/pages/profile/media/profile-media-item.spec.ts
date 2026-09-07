import { describe, expect, it } from 'vitest';
import { Status } from '../../../models';
import { buildMediaItems, extractMedia, looksLikePhoto, mediaKey } from './profile-media-item';

/** A status carrying whatever the test needs, with the rest left inert. */
function makeStatus(overrides: Partial<Status>): Status {
  return {
    id: 's1',
    content: '',
    media_attachments: [],
    account: { id: '7', username: 'kay', acct: 'kay' },
    reblog: null,
    sensitive: false,
    ...overrides,
  } as unknown as Status;
}

describe('looksLikePhoto', () => {
  it('accepts ordinary image URLs', () => {
    expect(looksLikePhoto('https://cdn.example/photos/sunset.jpg')).toBe(true);
    expect(looksLikePhoto('https://cdn.example/a/b/IMG_2031.png')).toBe(true);
    expect(looksLikePhoto('https://cdn.example/clip.mp4')).toBe(true);
  });

  it('rejects the junk RSS bodies are full of', () => {
    // Every one of these is something a feed actually embeds, and none of them
    // belongs on a wall of somebody's pictures.
    expect(looksLikePhoto('https://feeds.example/~r/blog/~4/pixel.gif')).toBe(false);
    expect(looksLikePhoto('https://example.com/tracking/beacon.png')).toBe(false);
    expect(looksLikePhoto('https://example.com/img/share-button.png')).toBe(false);
    expect(looksLikePhoto('https://example.com/assets/logo.png')).toBe(false);
    expect(looksLikePhoto('https://example.com/favicon.png')).toBe(false);
    expect(looksLikePhoto('https://gravatar.com/avatar/abc.jpg')).toBe(false);
    expect(looksLikePhoto('https://example.com/emoji/smile.png')).toBe(false);
    expect(looksLikePhoto('https://example.com/spacer.gif')).toBe(false);
    expect(looksLikePhoto('https://example.com/1x1.gif')).toBe(false);
  });

  it('rejects non-images and inline data URIs', () => {
    expect(looksLikePhoto('https://example.com/page.html')).toBe(false);
    expect(looksLikePhoto('https://example.com/no-extension')).toBe(false);
    expect(looksLikePhoto('data:image/gif;base64,R0lGOD')).toBe(false);
    expect(looksLikePhoto('')).toBe(false);
  });

  it('rejects renditions the URL admits are tiny', () => {
    expect(looksLikePhoto('https://example.com/pic.jpg?w=16')).toBe(false);
    expect(looksLikePhoto('https://example.com/pic.jpg?s=32')).toBe(false);
    // Three digits is a real size, not a thumbnail.
    expect(looksLikePhoto('https://example.com/pic.jpg?w=600')).toBe(true);
  });
});

describe('extractMedia', () => {
  it('takes Mastodon attachments as authoritative', () => {
    // Named "logo" deliberately: a declared attachment is something the author
    // chose to post, so the scraping heuristics must not second-guess it.
    const status = makeStatus({
      media_attachments: [
        {
          id: 'm1',
          type: 'image',
          url: 'https://cdn.example/logo.png',
          preview_url: 'https://cdn.example/logo-small.png',
          description: 'our logo',
        },
      ],
    });
    const media = extractMedia(status);
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe('https://cdn.example/logo.png');
    expect(media[0].previewUrl).toBe('https://cdn.example/logo-small.png');
    expect(media[0].description).toBe('our logo');
  });

  it('marks video and gifv attachments so the grid can badge them', () => {
    const status = makeStatus({
      media_attachments: [
        {
          id: 'm1',
          type: 'video',
          url: 'https://cdn.example/a.mp4',
          preview_url: '',
          description: null,
        },
        {
          id: 'm2',
          type: 'gifv',
          url: 'https://cdn.example/b.gifv',
          preview_url: '',
          description: null,
        },
        {
          id: 'm3',
          type: 'audio',
          url: 'https://cdn.example/c.mp3',
          preview_url: '',
          description: null,
        },
      ],
    });
    const media = extractMedia(status);
    // Audio has nothing to look at, so it never reaches a photo wall.
    expect(media.map((m) => m.type)).toEqual(['video', 'gifv']);
  });

  it('scrapes images out of RSS bodies and drops the beacons', () => {
    const status = makeStatus({
      provider: 'rss',
      content: `
        <p>Trip photos</p>
        <img src="https://cdn.example/photos/beach.jpg" alt="the beach" />
        <img src="https://feeds.example/pixel.gif" />
        <img src="https://cdn.example/share-button.png" />
        <img src="https://cdn.example/thumb.png" width="16" height="16" />
      `,
    });
    const media = extractMedia(status);
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe('https://cdn.example/photos/beach.jpg');
    expect(media[0].description).toBe('the beach');
  });

  it('prefers the widest srcset rendition', () => {
    const status = makeStatus({
      content:
        '<img src="https://cdn.example/small.jpg" srcset="https://cdn.example/small.jpg 320w, https://cdn.example/large.jpg 1600w" />',
    });
    expect(extractMedia(status)[0].url).toBe('https://cdn.example/large.jpg');
  });

  it('does not show the same picture twice when a feed both attaches and embeds it', () => {
    const status = makeStatus({
      media_attachments: [
        {
          id: 'm1',
          type: 'image',
          url: 'https://cdn.example/photo.jpg',
          preview_url: '',
          description: null,
        },
      ],
      content: '<img src="https://cdn.example/photo.jpg" />',
    });
    expect(extractMedia(status)).toHaveLength(1);
  });

  it('falls back to the card image only when the post has no pictures of its own', () => {
    const withCard = makeStatus({
      content: '<p>a link</p>',
      card: { image: 'https://cdn.example/og.jpg', title: 'A story' },
    } as Partial<Status>);
    expect(extractMedia(withCard)[0].url).toBe('https://cdn.example/og.jpg');

    const withBoth = makeStatus({
      content: '<img src="https://cdn.example/real.jpg" />',
      card: { image: 'https://cdn.example/og.jpg', title: 'A story' },
    } as Partial<Status>);
    const media = extractMedia(withBoth);
    // The card picture belongs to the link, not the author — it must never
    // outrank something they actually posted.
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe('https://cdn.example/real.jpg');
  });
});

describe('buildMediaItems', () => {
  it('gives every image its own tile while tracking which post it came from', () => {
    const statuses = [
      makeStatus({
        id: 'a',
        media_attachments: [
          {
            id: '1',
            type: 'image',
            url: 'https://cdn.example/a1.jpg',
            preview_url: '',
            description: null,
          },
          {
            id: '2',
            type: 'image',
            url: 'https://cdn.example/a2.jpg',
            preview_url: '',
            description: null,
          },
        ],
      }),
      makeStatus({
        id: 'b',
        media_attachments: [
          {
            id: '3',
            type: 'image',
            url: 'https://cdn.example/b1.jpg',
            preview_url: '',
            description: null,
          },
        ],
      }),
    ];
    const items = buildMediaItems(statuses);

    expect(items).toHaveLength(3);
    // One tile per image, in reading order.
    expect(items.map((i) => i.key)).toEqual(['a.0', 'a.1', 'b.0']);
    // postIndex is what lets ↑/↓ skip a whole album in one keypress.
    expect(items.map((i) => i.postIndex)).toEqual([0, 0, 1]);
  });

  it('skips posts with no pictures and skips boosts', () => {
    const statuses = [
      makeStatus({ id: 'text', content: '<p>just words</p>' }),
      makeStatus({
        id: 'boost',
        reblog: makeStatus({
          id: 'other',
          media_attachments: [
            {
              id: '1',
              type: 'image',
              url: 'https://cdn.example/x.jpg',
              preview_url: '',
              description: null,
            },
          ],
        }),
      }),
      makeStatus({
        id: 'mine',
        media_attachments: [
          {
            id: '2',
            type: 'image',
            url: 'https://cdn.example/y.jpg',
            preview_url: '',
            description: null,
          },
        ],
      }),
    ];
    const items = buildMediaItems(statuses);
    // A boost is somebody else's picture; "their media" means what they posted.
    expect(items.map((i) => i.status.id)).toEqual(['mine']);
    expect(items[0].postIndex).toBe(0);
  });

  it('builds keys the ?photo= param can round-trip', () => {
    expect(mediaKey('s99', 2)).toBe('s99.2');
  });
});
