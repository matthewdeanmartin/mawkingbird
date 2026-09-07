import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../models';
import { ANONYMOUS_FOLLOW_LIMIT, AnonymousFollows } from './anonymous-follows';
import { AnonymousHomeFeedCache } from './anonymous-home-feed-cache';

function account(username: string, host = 'example.social'): Account {
  return {
    id: `${host}:${username}`,
    username,
    acct: `${username}@${host}`,
    display_name: username,
    note: '',
    url: `https://${host}/@${username}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

describe('AnonymousFollows', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('persists a canonical cross-instance follow and synthesizes relationships', () => {
    const follows = TestBed.inject(AnonymousFollows);
    const target = account('Alice', 'social.example');

    expect(follows.follow(target, 'https://mastodon.social').ok).toBe(true);
    expect(follows.relationship(target, 'https://mastodon.social').following).toBe(true);
    expect(follows.follows()[0].key).toBe('alice@social.example');
    expect(follows.follows()[0].server).toBe('https://social.example');
    expect(follows.follows()[0].readRef).toEqual({
      server: 'https://mastodon.social',
      accountId: 'social.example:Alice',
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(AnonymousFollows).count()).toBe(1);
  });

  /**
   * A follow caches the whole `Account` because the timeline renders author
   * cards from it — and before `refreshAccount` there was no way to ever update
   * that copy, since `follow` returns early for an account already followed. A
   * display name or avatar captured at follow time was stale forever.
   */
  describe('refreshAccount', () => {
    it('replaces the stored copy of an account already followed', () => {
      const follows = TestBed.inject(AnonymousFollows);
      const target = account('Alice', 'social.example');
      follows.follow(target, 'https://mastodon.social');

      follows.refreshAccount(
        { ...target, display_name: 'Alice Renamed', avatar: 'https://cdn.example/new.png' },
        'https://mastodon.social',
      );

      expect(follows.follows()[0].account.display_name).toBe('Alice Renamed');
      expect(follows.follows()[0].account.avatar).toBe('https://cdn.example/new.png');
    });

    /** The federated handle is computed at follow time; a refresh must not undo it. */
    it('keeps the federated acct it normalized at follow time', () => {
      const follows = TestBed.inject(AnonymousFollows);
      const target = account('Alice', 'social.example');
      follows.follow(target, 'https://mastodon.social');
      const acct = follows.follows()[0].account.acct;

      follows.refreshAccount({ ...target, acct: 'Alice' }, 'https://mastodon.social');

      expect(follows.follows()[0].account.acct).toBe(acct);
    });

    it('refreshes, never adds', () => {
      const follows = TestBed.inject(AnonymousFollows);

      follows.refreshAccount(account('Nobody', 'social.example'), 'https://mastodon.social');

      expect(follows.count()).toBe(0);
    });
  });

  it('deduplicates different account ids for the same federated identity', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice'), 'https://mastodon.social');
    follows.follow({ ...account('alice'), id: 'another-server-id' }, 'https://other.example');

    expect(follows.count()).toBe(1);
  });

  it('invalidates the populated home feed when following or unfollowing', () => {
    const cache = TestBed.inject(AnonymousHomeFeedCache);
    const follows = TestBed.inject(AnonymousFollows);
    const target = account('alice');
    cache.store([{ id: 'cached', account: target } as never]);

    follows.follow(target, 'https://mastodon.social');
    expect(cache.populated()).toBe(false);

    cache.store([{ id: 'cached-again', account: target } as never]);
    follows.unfollow(target, 'https://mastodon.social');
    expect(cache.populated()).toBe(false);
  });

  it('unfollows locally', () => {
    const follows = TestBed.inject(AnonymousFollows);
    const target = account('alice');
    follows.follow(target, 'https://mastodon.social');

    expect(follows.unfollow(target, 'https://mastodon.social').following).toBe(false);
    expect(follows.count()).toBe(0);
  });

  it('rejects the first follow above the configured limit with a useful error', () => {
    const follows = TestBed.inject(AnonymousFollows);
    for (let index = 0; index < ANONYMOUS_FOLLOW_LIMIT; index += 1) {
      follows.follow(account(`user${index}`), 'https://mastodon.social');
    }

    const result = follows.follow(account('one-too-many'), 'https://mastodon.social');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected the follow limit to reject this account.');
    }
    expect(result.error).toContain(`up to ${ANONYMOUS_FOLLOW_LIMIT}`);
    expect(follows.count()).toBe(ANONYMOUS_FOLLOW_LIMIT);
  });

  it('recovers from malformed storage', () => {
    localStorage.setItem('mockingbird_anonymous_follows', '{nope');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(AnonymousFollows).follows()).toEqual([]);
  });

  it('replaces incompatible older storage instead of migrating it', () => {
    localStorage.setItem(
      'mockingbird_anonymous_follows',
      JSON.stringify({ version: 1, follows: [{ key: 'alice@example.social' }] }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(AnonymousFollows).follows()).toEqual([]);
  });

  it('persists route-specific backoff without extending an active failure window', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice'), 'https://mastodon.social');
    const key = follows.follows()[0].key;

    follows.markRouteFailure(key, 'canonical-api');
    const retryAfter = follows.follows()[0].routeRetryAfter['canonical-api'];
    follows.markRouteFailure(key, 'canonical-api');
    expect(follows.routeDeferred(follows.follows()[0], 'canonical-api')).toBe(true);
    expect(follows.routeDeferred(follows.follows()[0], 'read-api')).toBe(false);
    expect(follows.follows()[0].routeRetryAfter['canonical-api']).toBe(retryAfter);

    follows.clearBackoff(key);
    expect(follows.hasBackoff(follows.follows()[0])).toBe(false);
  });
  /**
   * One follow list, two networks.
   *
   * The alternative was a parallel Bluesky store, which produces two lists, two
   * counts, and a dozen consumers that each show half. Anonymous mode is meant
   * to be *one* experience with both networks in it — someone who will not log
   * into either service can still follow people on both.
   */
  describe('Bluesky follows', () => {
    function bskyAccount(handle: string, did: string): Account {
      return {
        ...account(handle, 'bsky.app'),
        // Namespaced at the provider edge, which is what `networkForAccount`
        // reads to tell the two networks apart.
        id: `bsky:${did}`,
        acct: handle,
        url: `https://bsky.app/profile/${handle}`,
      };
    }

    it('stores a Bluesky follow keyed by DID, with no instance', () => {
      const follows = TestBed.inject(AnonymousFollows);
      follows.follow(bskyAccount('alice.bsky.social', 'did:plc:alice'), '');

      const stored = follows.follows()[0];
      expect(stored.network).toBe('bluesky');
      // The DID is the durable identity — handles are rentable and change.
      expect(stored.key).toBe('bsky:did:plc:alice');
      expect(stored.readRef.accountId).toBe('did:plc:alice');
      expect(stored.server).toBe('');
    });

    it('keeps both networks in one list', () => {
      const follows = TestBed.inject(AnonymousFollows);
      follows.follow(account('bob'), 'https://mastodon.social');
      follows.follow(bskyAccount('alice.bsky.social', 'did:plc:alice'), '');

      expect(follows.count()).toBe(2);
      expect(
        follows
          .follows()
          .map((f) => f.network)
          .sort(),
      ).toEqual(['bluesky', 'mastodon']);
    });

    it('survives a reload — a Bluesky row is not discarded for having no origin', () => {
      TestBed.inject(AnonymousFollows).follow(
        bskyAccount('alice.bsky.social', 'did:plc:alice'),
        '',
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});

      // The validator requires a readable instance origin for Mastodon rows.
      // Applying that rule to Bluesky would silently empty the list on reload.
      const reloaded = TestBed.inject(AnonymousFollows).follows();
      expect(reloaded).toHaveLength(1);
      expect(reloaded[0].network).toBe('bluesky');
    });

    it('reports following state for a Bluesky account', () => {
      const follows = TestBed.inject(AnonymousFollows);
      const alice = bskyAccount('alice.bsky.social', 'did:plc:alice');

      expect(follows.isFollowing(alice, '')).toBe(false);
      follows.follow(alice, '');
      expect(follows.isFollowing(alice, '')).toBe(true);
      follows.unfollow(alice, '');
      expect(follows.isFollowing(alice, '')).toBe(false);
    });

    it('migrates v2 rows to mastodon rather than discarding them', () => {
      // What a browser that followed accounts before this sprint has on disk.
      localStorage.setItem(
        'mockingbird_anonymous_follows',
        JSON.stringify({
          version: 2,
          follows: [
            {
              key: 'alice@example.social',
              handle: 'alice@example.social',
              server: 'https://example.social',
              profileUrl: 'https://example.social/@alice',
              account: account('alice'),
              followedAt: new Date().toISOString(),
              readRef: { server: 'https://example.social', accountId: 'example.social:alice' },
              routeRetryAfter: { 'read-api': null, 'canonical-api': null, rss: null },
            },
          ],
        }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});

      const rows = TestBed.inject(AnonymousFollows).follows();
      expect(rows).toHaveLength(1);
      expect(rows[0].network).toBe('mastodon');
    });
  });
});
