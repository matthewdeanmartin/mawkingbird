import { describe, expect, it } from 'vitest';
import {
  adaptFeedItem,
  adaptPost,
  adaptProfile,
  adaptRelationship,
  renderRichText,
} from './bluesky-adapter';
import { BskyFeedItem, BskyPostView, BskyProfile, BskyRef } from './bluesky-types';

function makePost(overrides: Partial<BskyPostView> = {}): BskyPostView {
  return {
    uri: 'at://did:plc:alice/app.bsky.feed.post/3k44',
    cid: 'cid-1',
    author: { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: 'Alice' },
    record: {
      $type: 'app.bsky.feed.post',
      text: 'Hello world',
      createdAt: '2026-07-14T10:00:00.000Z',
    },
    replyCount: 2,
    repostCount: 3,
    likeCount: 4,
    indexedAt: '2026-07-14T10:00:05.000Z',
    ...overrides,
  };
}

describe('renderRichText', () => {
  it('escapes plain text and wraps paragraphs', () => {
    expect(renderRichText('a <b> & c')).toBe('<p>a &lt;b&gt; &amp; c</p>');
    expect(renderRichText('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('links facets using UTF-8 byte offsets (multibyte text before the facet)', () => {
    // '🦋 ' is 5 bytes; 'bsky.app' follows as a link facet.
    const text = '🦋 bsky.app';
    const facets = [
      {
        index: { byteStart: 5, byteEnd: 13 },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://bsky.app' }],
      },
    ];
    expect(renderRichText(text, facets)).toBe('<p>🦋 <a href="https://bsky.app">bsky.app</a></p>');
  });

  it('renders mention and tag facets as bsky.app links', () => {
    const text = '@alice.bsky.social #birds';
    const facets = [
      {
        index: { byteStart: 0, byteEnd: 18 },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
      },
      {
        index: { byteStart: 19, byteEnd: 25 },
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'birds' }],
      },
    ];
    const html = renderRichText(text, facets);
    expect(html).toContain(
      '<a href="https://bsky.app/profile/did:plc:alice">@alice.bsky.social</a>',
    );
    expect(html).toContain('<a href="https://bsky.app/hashtag/birds">#birds</a>');
  });

  it('ignores out-of-range and overlapping facets', () => {
    const facets = [
      { index: { byteStart: 0, byteEnd: 99 }, features: [] },
      { index: { byteStart: 2, byteEnd: 1 }, features: [] },
    ];
    expect(renderRichText('hi', facets)).toBe('<p>hi</p>');
  });
});

describe('adaptPost', () => {
  it('produces a bluesky-tagged Status with counts, url and providerRef', () => {
    const status = adaptPost(makePost());
    expect(status.provider).toBe('bluesky');
    expect(status.id).toBe('bsky:at://did:plc:alice/app.bsky.feed.post/3k44');
    expect(status.url).toBe('https://bsky.app/profile/alice.bsky.social/post/3k44');
    expect(status.account.acct).toBe('alice.bsky.social');
    expect(status.replies_count).toBe(2);
    expect(status.reblogs_count).toBe(3);
    expect(status.favourites_count).toBe(4);
    const ref = status.providerRef as BskyRef;
    expect(ref.cid).toBe('cid-1');
    // A top-level post is its own thread root for replies.
    expect(ref.replyRoot.uri).toBe(status.url ? ref.uri : ref.uri);
    expect(ref.likeUri).toBeNull();
  });

  it('takes the first declared language, which the Language facet counts', () => {
    // The record carries an array and Mastodon's shape carries one value, so
    // the first wins. Without this the Language facet was always empty and the
    // refine panel silently dropped it for having nothing to discriminate on.
    const status = adaptPost(
      makePost({
        record: {
          $type: 'app.bsky.feed.post',
          text: 'Bonjour',
          createdAt: '2026-07-14T10:00:00.000Z',
          langs: ['fr', 'en'],
        },
      }),
    );
    expect(status.language).toBe('fr');
  });

  it('reports no language when the post declares none, rather than guessing', () => {
    expect(adaptPost(makePost()).language).toBeNull();
  });

  it('maps viewer like/repost state and keeps the record uris for undo', () => {
    const status = adaptPost(
      makePost({ viewer: { like: 'at://me/like/1', repost: 'at://me/repost/2' } }),
    );
    expect(status.favourited).toBe(true);
    expect(status.reblogged).toBe(true);
    const ref = status.providerRef as BskyRef;
    expect(ref.likeUri).toBe('at://me/like/1');
    expect(ref.repostUri).toBe('at://me/repost/2');
  });

  it('keeps the thread root of a reply for further replies', () => {
    const status = adaptPost(
      makePost({
        record: {
          $type: 'app.bsky.feed.post',
          text: 'a reply',
          createdAt: '2026-07-14T10:00:00.000Z',
          reply: {
            root: { uri: 'at://root', cid: 'cid-root' },
            parent: { uri: 'at://parent', cid: 'cid-parent' },
          },
        },
      }),
    );
    expect(status.in_reply_to_id).toBe('bsky:at://parent');
    expect((status.providerRef as BskyRef).replyRoot).toEqual({
      uri: 'at://root',
      cid: 'cid-root',
    });
  });

  it('turns image embeds into media attachments', () => {
    const status = adaptPost(
      makePost({
        embed: {
          $type: 'app.bsky.embed.images#view',
          images: [{ thumb: 'https://cdn/t.jpg', fullsize: 'https://cdn/f.jpg', alt: 'a bird' }],
        },
      }),
    );
    expect(status.media_attachments).toHaveLength(1);
    expect(status.media_attachments[0].preview_url).toBe('https://cdn/t.jpg');
    expect(status.media_attachments[0].description).toBe('a bird');
  });

  it('appends external embeds as a link card line', () => {
    const status = adaptPost(
      makePost({
        embed: {
          $type: 'app.bsky.embed.external#view',
          external: { uri: 'https://example.com/story', title: 'A story', description: '' },
        },
      }),
    );
    expect(status.content).toContain('<a href="https://example.com/story">A story</a>');
  });

  it('maps record embeds to a Mastodon-style quote', () => {
    const status = adaptPost(
      makePost({
        embed: {
          $type: 'app.bsky.embed.record#view',
          record: {
            $type: 'app.bsky.embed.record#viewRecord',
            uri: 'at://did:plc:bob/app.bsky.feed.post/9z',
            cid: 'cid-q',
            author: { did: 'did:plc:bob', handle: 'bob.bsky.social' },
            value: {
              $type: 'app.bsky.feed.post',
              text: 'quoted!',
              createdAt: '2026-07-13T00:00:00Z',
            },
          },
        },
      }),
    );
    expect(status.quote?.state).toBe('accepted');
    expect(status.quote?.quoted_status?.content).toBe('<p>quoted!</p>');
    expect(status.quote?.quoted_status?.account.acct).toBe('bob.bsky.social');
  });

  it('shows blocked/removed quoted posts as unavailable', () => {
    const status = adaptPost(
      makePost({
        embed: {
          $type: 'app.bsky.embed.record#view',
          record: { $type: 'app.bsky.embed.record#viewNotFound' },
        },
      }),
    );
    expect(status.quote).toEqual({ state: 'deleted', quoted_status: null });
  });
});

describe('adaptFeedItem', () => {
  it('wraps reposts like Mastodon boosts', () => {
    const item: BskyFeedItem = {
      post: makePost(),
      reason: {
        $type: 'app.bsky.feed.defs#reasonRepost',
        by: { did: 'did:plc:carol', handle: 'carol.bsky.social', displayName: 'Carol' },
        indexedAt: '2026-07-14T11:00:00.000Z',
      },
    };
    const status = adaptFeedItem(item);
    expect(status.reblog?.account.acct).toBe('alice.bsky.social');
    expect(status.account.acct).toBe('carol.bsky.social');
    expect(status.created_at).toBe('2026-07-14T11:00:00.000Z');
    expect(status.id).toContain('bsky:repost:did:plc:carol');
  });

  it('passes plain posts through', () => {
    const status = adaptFeedItem({ post: makePost() });
    expect(status.reblog).toBeNull();
  });
});

describe('adaptProfile', () => {
  const detailed: BskyProfile = {
    did: 'did:plc:alice',
    handle: 'alice.bsky.social',
    displayName: 'Alice',
    description: 'Line one\nstill one\n\nParagraph two',
    avatar: 'https://cdn.example/avatar.jpg',
    banner: 'https://cdn.example/banner.jpg',
    followersCount: 120,
    followsCount: 45,
    postsCount: 900,
  };

  it('carries the bio, banner and all three counts', () => {
    const account = adaptProfile(detailed);
    expect(account.id).toBe('bsky:did:plc:alice');
    expect(account.acct).toBe('alice.bsky.social');
    expect(account.header).toBe('https://cdn.example/banner.jpg');
    expect(account.followers_count).toBe(120);
    expect(account.following_count).toBe(45);
    expect(account.statuses_count).toBe(900);
  });

  it('renders the plain-text bio as paragraphs, escaping markup', () => {
    const account = adaptProfile({ ...detailed, description: 'a <b>bold</b> claim' });
    expect(account.note).toBe('<p>a &lt;b&gt;bold&lt;/b&gt; claim</p>');
  });

  it('turns blank lines into paragraphs and single newlines into breaks', () => {
    expect(adaptProfile(detailed).note).toBe('<p>Line one<br>still one</p><p>Paragraph two</p>');
  });

  it('leaves the note empty when there is no bio', () => {
    expect(adaptProfile({ ...detailed, description: '   ' }).note).toBe('');
  });

  it('falls back to the placeholder avatar and zero counts', () => {
    const account = adaptProfile({ did: 'did:plc:bob', handle: 'bob.bsky.social' });
    expect(account.display_name).toBe('bob.bsky.social');
    expect(account.avatar).toContain('data:image/svg+xml');
    expect(account.followers_count).toBe(0);
  });
});

describe('adaptRelationship', () => {
  it('reads presence of the follow records, not their values', () => {
    const rel = adaptRelationship({
      did: 'did:plc:alice',
      handle: 'alice.bsky.social',
      viewer: { following: 'at://a/b/c', followedBy: 'at://d/e/f', muted: true },
    });
    expect(rel).toEqual({
      id: 'bsky:did:plc:alice',
      following: true,
      followed_by: true,
      requested: false,
      blocking: false,
      muting: true,
    });
  });

  it('reports no relationship when the viewer state is absent', () => {
    const rel = adaptRelationship({ did: 'did:plc:alice', handle: 'alice.bsky.social' });
    expect(rel.following).toBe(false);
    expect(rel.followed_by).toBe(false);
    // Bluesky has no locked accounts, so a follow is never merely requested.
    expect(rel.requested).toBe(false);
  });
});
