import { describe, expect, it } from 'vitest';
import {
  adaptNotification,
  chunkUris,
  notificationType,
  postsByUri,
  subjectUris,
} from './bluesky-notification-adapter';
import { BskyNotification, BskyPostView } from './bluesky-types';

const AUTHOR = { did: 'did:plc:bob', handle: 'bob.bsky.social', displayName: 'Bob' };
const MY_POST = 'at://did:plc:me/app.bsky.feed.post/aaa';

function notification(overrides: Partial<BskyNotification> = {}): BskyNotification {
  return {
    uri: 'at://did:plc:bob/app.bsky.feed.like/xyz',
    cid: 'cid-n',
    author: AUTHOR,
    reason: 'like',
    reasonSubject: MY_POST,
    record: { $type: 'app.bsky.feed.like', createdAt: '2026-08-01T10:00:00.000Z' },
    isRead: false,
    indexedAt: '2026-08-01T10:00:05.000Z',
    ...overrides,
  };
}

function postView(uri = MY_POST): BskyPostView {
  return {
    uri,
    cid: 'cid-p',
    author: { did: 'did:plc:me', handle: 'me.bsky.social' },
    record: {
      $type: 'app.bsky.feed.post',
      text: 'my original post',
      createdAt: '2026-08-01T09:00:00.000Z',
    },
    indexedAt: '2026-08-01T09:00:01.000Z',
  };
}

describe('notificationType', () => {
  it('maps the reasons Mastodon has a row for', () => {
    expect(notificationType('like')).toBe('favourite');
    expect(notificationType('repost')).toBe('reblog');
    expect(notificationType('follow')).toBe('follow');
  });

  it('folds reply and quote into mention — all three are "someone wrote at you"', () => {
    expect(notificationType('mention')).toBe('mention');
    expect(notificationType('reply')).toBe('mention');
    expect(notificationType('quote')).toBe('mention');
  });

  it('folds the -via-repost variants into their base reason', () => {
    expect(notificationType('like-via-repost')).toBe('favourite');
    expect(notificationType('repost-via-repost')).toBe('reblog');
  });

  it('passes an unknown reason through rather than dropping it', () => {
    // knownValues is not a closed enum: a real account saw repost-via-repost in
    // its first 20 notifications, so the tail must render, not throw.
    expect(notificationType('contact-match')).toBe('contact-match');
    expect(notificationType('something-invented-in-2027')).toBe('something-invented-in-2027');
  });
});

describe('subjectUris', () => {
  it('collects like/repost subjects, deduped', () => {
    const uris = subjectUris([
      notification(),
      notification({ uri: 'at://x/like/2' }),
      notification({
        uri: 'at://x/repost/3',
        reason: 'repost',
        reasonSubject: 'at://did:plc:me/app.bsky.feed.post/bbb',
      }),
    ]);
    expect(uris).toEqual([MY_POST, 'at://did:plc:me/app.bsky.feed.post/bbb']);
  });

  it('skips reasons whose record is already the post', () => {
    // A reply carries its own post inline; asking for it again wastes a slot.
    expect(subjectUris([notification({ reason: 'reply' })])).toEqual([]);
    expect(subjectUris([notification({ reason: 'mention' })])).toEqual([]);
    expect(subjectUris([notification({ reason: 'quote' })])).toEqual([]);
  });

  it('skips a follow, which has no subject at all', () => {
    expect(subjectUris([notification({ reason: 'follow', reasonSubject: undefined })])).toEqual([]);
  });

  it('skips subjects that are not posts', () => {
    // Measured: a repost-via-repost names a repost record, and getPosts drops
    // it silently — nine uris in, eight posts out.
    const uris = subjectUris([
      notification({
        reason: 'repost-via-repost',
        reasonSubject: 'at://did:plc:me/app.bsky.feed.repost/ccc',
      }),
    ]);
    expect(uris).toEqual([]);
  });
});

describe('chunkUris', () => {
  it('splits at the getPosts cap', () => {
    const uris = Array.from({ length: 60 }, (_, i) => `at://x/app.bsky.feed.post/${i}`);
    const chunks = chunkUris(uris);
    expect(chunks.map((c) => c.length)).toEqual([25, 25, 10]);
  });

  it('leaves a short list in one chunk', () => {
    expect(chunkUris(['a', 'b'])).toEqual([['a', 'b']]);
  });
});

describe('adaptNotification', () => {
  it('uses indexedAt, not the record createdAt', () => {
    // createdAt is written by whoever made the record and can claim any time;
    // indexedAt is the AppView's own clock.
    const n = adaptNotification(
      notification({
        record: { $type: 'app.bsky.feed.like', createdAt: '2099-01-01T00:00:00.000Z' },
      }),
      new Map(),
    );
    expect(n.created_at).toBe('2026-08-01T10:00:05.000Z');
  });

  it('namespaces the id by the notifying record uri', () => {
    expect(adaptNotification(notification(), new Map()).id).toBe(
      'bsky:at://did:plc:bob/app.bsky.feed.like/xyz',
    );
  });

  it('attaches the hydrated subject for a like', () => {
    const subjects = postsByUri([postView()]);
    const n = adaptNotification(notification(), subjects);
    expect(n.type).toBe('favourite');
    expect(n.status?.content).toBe('<p>my original post</p>');
    expect(n.account.acct).toBe('bob.bsky.social');
  });

  it('renders a reply from its inline record with no hydration', () => {
    const n = adaptNotification(
      notification({
        uri: 'at://did:plc:bob/app.bsky.feed.post/reply1',
        reason: 'reply',
        record: {
          $type: 'app.bsky.feed.post',
          text: 'nice post!',
          createdAt: '2026-08-01T10:00:00.000Z',
        },
      }),
      new Map(),
    );
    expect(n.type).toBe('mention');
    expect(n.status?.content).toBe('<p>nice post!</p>');
    // The reply is a real, clickable post: its id is its own record uri.
    expect(n.status?.id).toBe('bsky:at://did:plc:bob/app.bsky.feed.post/reply1');
  });

  it('leaves a follow with no status', () => {
    const n = adaptNotification(
      notification({ reason: 'follow', reasonSubject: undefined }),
      new Map(),
    );
    expect(n.type).toBe('follow');
    expect(n.status).toBeUndefined();
  });

  it('renders a row whose subject could not be hydrated', () => {
    // A deleted post, or a subject getPosts refused to return. Normal, not an error.
    const n = adaptNotification(notification(), new Map());
    expect(n.type).toBe('favourite');
    expect(n.status).toBeUndefined();
    expect(n.account.acct).toBe('bob.bsky.social');
  });

  it('survives a reply whose record has no text', () => {
    const n = adaptNotification(
      notification({ reason: 'reply', record: { $type: 'app.bsky.feed.post' } }),
      new Map(),
    );
    expect(n.status).toBeUndefined();
  });
});

describe('postsByUri', () => {
  it('keys by uri so callers never index-align with the request', () => {
    const map = postsByUri([
      postView('at://a/app.bsky.feed.post/1'),
      postView('at://a/app.bsky.feed.post/2'),
    ]);
    expect([...map.keys()]).toEqual(['at://a/app.bsky.feed.post/1', 'at://a/app.bsky.feed.post/2']);
    expect(map.get('at://a/app.bsky.feed.post/2')?.provider).toBe('bluesky');
  });
});
