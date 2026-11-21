import { describe, expect, it } from 'vitest';
import {
  controlsFromPref,
  DEFAULT_HOME_FEED_PREFS,
  filterHomeFeed,
  homeFeedPrefsOf,
  prefFromControls,
  sortThreadReplies,
  threadSortOf,
} from './bluesky-reading-prefs';
import { BskyFeedItem, BskyThreadNode } from './bluesky-types';

const ME = 'did:plc:me';

function item(
  id: string,
  opts: {
    author?: string;
    reply?: { parentAuthor: string; followed?: boolean };
    repost?: boolean;
    quote?: boolean;
    likes?: number;
  } = {},
): BskyFeedItem {
  const author = opts.author ?? 'did:plc:a';
  return {
    post: {
      uri: `at://${author}/app.bsky.feed.post/${id}`,
      cid: id,
      author: { did: author, handle: 'a' },
      record: {
        $type: 'app.bsky.feed.post',
        text: id,
        createdAt: '2026-11-20T00:00:00Z',
        ...(opts.reply
          ? { reply: { root: { uri: 'r', cid: 'r' }, parent: { uri: 'p', cid: 'p' } } }
          : {}),
      },
      indexedAt: '2026-11-20T00:00:00Z',
      likeCount: opts.likes ?? 0,
      ...(opts.quote ? { embed: { $type: 'app.bsky.embed.record#view' } } : {}),
    },
    ...(opts.repost ? { reason: { $type: 'app.bsky.feed.defs#reasonRepost' } } : {}),
    ...(opts.reply
      ? {
          reply: {
            parent: {
              author: {
                did: opts.reply.parentAuthor,
                handle: 'p',
                viewer: opts.reply.followed ? { following: 'at://follow' } : {},
              },
            },
          },
        }
      : {}),
  };
}

const ids = (items: BskyFeedItem[]) => items.map((i) => i.post.cid);

describe('filterHomeFeed', () => {
  const feed = [
    item('plain'),
    item('toFollowed', { reply: { parentAuthor: 'did:plc:f', followed: true } }),
    item('toStranger', { reply: { parentAuthor: 'did:plc:s' } }),
    item('selfThread', { author: 'did:plc:a', reply: { parentAuthor: 'did:plc:a' } }),
    item('mine', { author: ME, reply: { parentAuthor: 'did:plc:s' } }),
    item('repost', { repost: true }),
    item('quote', { quote: true }),
  ];

  it('applies bsky.app defaults: replies to people you don’t follow are hidden', () => {
    expect(ids(filterHomeFeed(feed, DEFAULT_HOME_FEED_PREFS, ME))).toEqual([
      'plain',
      'toFollowed',
      'selfThread',
      'mine',
      'repost',
      'quote',
    ]);
  });

  it('hides replies, reposts and quotes, but never self-threads or your own', () => {
    const prefs = {
      ...DEFAULT_HOME_FEED_PREFS,
      hideReplies: true,
      hideReposts: true,
      hideQuotePosts: true,
    };
    expect(ids(filterHomeFeed(feed, prefs, ME))).toEqual(['plain', 'selfThread', 'mine']);
  });

  it('hides replies under a like threshold', () => {
    const prefs = {
      ...DEFAULT_HOME_FEED_PREFS,
      hideRepliesByUnfollowed: false,
      hideRepliesByLikeCount: 2,
    };
    const items = [
      item('few', { reply: { parentAuthor: 'did:plc:s' }, likes: 1 }),
      item('many', { reply: { parentAuthor: 'did:plc:s' }, likes: 5 }),
    ];
    expect(ids(filterHomeFeed(items, prefs, ME))).toEqual(['many']);
  });
});

describe('stored preferences', () => {
  it('reads the Following feed preference over the defaults', () => {
    expect(homeFeedPrefsOf(undefined)).toEqual(DEFAULT_HOME_FEED_PREFS);
    expect(
      homeFeedPrefsOf({ hideRepliesByUnfollowed: false, hideRepliesByLikeCount: 3.7 }),
    ).toMatchObject({
      hideRepliesByUnfollowed: false,
      hideRepliesByLikeCount: 3,
    });
  });

  it('reads a thread sort, defaulting to Bluesky’s ranking', () => {
    expect(threadSortOf({ sort: 'newest' })).toBe('newest');
    expect(threadSortOf({ sort: 'sideways' })).toBe('hotness');
  });
});

describe('sortThreadReplies', () => {
  const node = (id: string, time: string, likes: number, replies: BskyThreadNode[] = []) =>
    ({
      post: { cid: id, indexedAt: time, likeCount: likes },
      replies,
    }) as unknown as BskyThreadNode;
  const tree = [
    node('b', '2026-01-02', 1, [node('b2', '2026-01-05', 0), node('b1', '2026-01-04', 9)]),
    node('a', '2026-01-01', 5),
  ];
  const order = (nodes: BskyThreadNode[]): string[] =>
    nodes.flatMap((n) => [n.post!.cid, ...order(n.replies ?? [])]);

  it('sorts every level', () => {
    expect(order(sortThreadReplies(tree, 'oldest'))).toEqual(['a', 'b', 'b1', 'b2']);
    expect(order(sortThreadReplies(tree, 'newest'))).toEqual(['b', 'b2', 'b1', 'a']);
    expect(order(sortThreadReplies(tree, 'most-likes'))).toEqual(['a', 'b', 'b1', 'b2']);
  });

  it('keeps the server’s ranking for hotness', () => {
    expect(order(sortThreadReplies(tree, 'hotness'))).toEqual(['b', 'b2', 'b1', 'a']);
  });
});

describe('default reply and quote controls', () => {
  it('round-trips through postInteractionSettingsPref, keeping list rules', () => {
    const stored = {
      $type: 'app.bsky.actor.defs#postInteractionSettingsPref',
      threadgateAllowRules: [
        { $type: 'app.bsky.feed.threadgate#followingRule' },
        { $type: 'app.bsky.feed.threadgate#listRule', list: 'at://l' },
      ],
      postgateEmbeddingRules: [{ $type: 'app.bsky.feed.postgate#disableRule' }],
    };
    const value = controlsFromPref(stored);
    expect(value).toEqual({ replies: ['following'], quotes: false, lists: 1 });
    expect(
      prefFromControls({ ...value, replies: ['mention'] }, stored)['threadgateAllowRules'],
    ).toEqual([
      { $type: 'app.bsky.feed.threadgate#mentionRule' },
      { $type: 'app.bsky.feed.threadgate#listRule', list: 'at://l' },
    ]);
  });

  it('writes nothing for everyone, and an empty rule list for nobody', () => {
    expect(controlsFromPref(undefined)).toEqual({ replies: 'everyone', quotes: true });
    expect(prefFromControls({ replies: 'everyone', quotes: true }, undefined)).toEqual({
      $type: 'app.bsky.actor.defs#postInteractionSettingsPref',
    });
    expect(
      prefFromControls({ replies: 'nobody', quotes: true }, undefined)['threadgateAllowRules'],
    ).toEqual([]);
    expect(controlsFromPref({ threadgateAllowRules: [] })).toEqual({
      replies: 'nobody',
      quotes: true,
    });
  });
});
