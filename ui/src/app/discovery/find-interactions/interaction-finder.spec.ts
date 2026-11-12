import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BskyPostView } from '../../connections/bluesky/bluesky-types';
import { Account, Mention, Status } from '../../platform/api/models';
import {
  blueskyPostInvolves,
  InteractionFinder,
  mastodonPostInvolves,
  parsePerson,
} from './interaction-finder';

function toot(id: string, created: string, mentions: Partial<Mention>[] = []): Status {
  return {
    id,
    created_at: created,
    account: {} as Account,
    mentions: mentions as Mention[],
    reblog: null,
    providerRef: { statusId: id },
  } as unknown as Status;
}

function skeet(
  did: string,
  rkey: string,
  extra: Partial<BskyPostView['record']> = {},
  embed?: unknown,
): BskyPostView {
  return {
    uri: `at://${did}/app.bsky.feed.post/${rkey}`,
    cid: rkey,
    author: { did, handle: `${rkey}.test` },
    record: { $type: 'app.bsky.feed.post', text: '', createdAt: '2026-11-01T00:00:00Z', ...extra },
    indexedAt: '2026-11-01T00:00:00Z',
    ...(embed ? { embed } : {}),
  } as unknown as BskyPostView;
}

describe('parsePerson', () => {
  it('tells Mastodon handles from Bluesky ones', () => {
    expect(parsePerson('@alice@mastodon.social')).toMatchObject({ network: 'mastodon' });
    expect(parsePerson('https://mastodon.social/@alice')).toMatchObject({ network: 'mastodon' });
    expect(parsePerson('@alice.bsky.social')).toMatchObject({
      network: 'bluesky',
      actor: 'alice.bsky.social',
    });
    expect(parsePerson('https://bsky.app/profile/alice.bsky.social')).toMatchObject({
      network: 'bluesky',
    });
    expect(parsePerson('did:plc:abc123')).toMatchObject({
      network: 'bluesky',
      actor: 'did:plc:abc123',
    });
    expect(parsePerson('alice')).toBeNull();
    expect(parsePerson('@alice')).toBeNull();
  });
});

describe('interaction rules', () => {
  it('counts a Mastodon mention of the other account, qualified on the reading server', () => {
    const target = { handle: 'bob@far.example', url: 'https://far.example/@bob' };
    expect(
      mastodonPostInvolves(toot('1', '', [{ acct: 'bob@far.example' }]), 'home.example', target),
    ).toBe(true);
    // A local mention on bob's own server is just "bob".
    expect(mastodonPostInvolves(toot('1', '', [{ acct: 'bob' }]), 'far.example', target)).toBe(
      true,
    );
    expect(mastodonPostInvolves(toot('1', '', [{ acct: 'bob' }]), 'home.example', target)).toBe(
      false,
    );
    expect(
      mastodonPostInvolves(
        toot('1', '', [{ acct: 'x', url: 'https://far.example/@bob' }]),
        'h.example',
        target,
      ),
    ).toBe(true);
  });

  it('counts a Bluesky reply, mention or quote of the other account', () => {
    const bob = 'did:plc:bob';
    const parent = { uri: `at://${bob}/app.bsky.feed.post/1`, cid: 'c' };
    expect(
      blueskyPostInvolves(skeet('did:plc:a', 'r', { reply: { root: parent, parent } }), bob),
    ).toBe(true);
    expect(
      blueskyPostInvolves(
        skeet('did:plc:a', 'm', {
          facets: [
            { index: { byteStart: 0, byteEnd: 4 }, features: [{ $type: 'mention', did: bob }] },
          ],
        }),
        bob,
      ),
    ).toBe(true);
    expect(
      blueskyPostInvolves(skeet('did:plc:a', 'q', {}, { record: { uri: parent.uri } }), bob),
    ).toBe(true);
    expect(blueskyPostInvolves(skeet('did:plc:a', 'n'), bob)).toBe(false);
  });
});

describe('InteractionFinder', () => {
  const lookupAccount = vi.fn();
  const getAccountStatuses = vi.fn();
  const getProfile = vi.fn();
  const getAuthorFeed = vi.fn();
  const searchPosts = vi.fn();
  const linked = signal(false);

  beforeEach(() => {
    for (const fn of [lookupAccount, getAccountStatuses, getProfile, getAuthorFeed, searchPosts])
      fn.mockReset();
    linked.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AnonymousPublicApi, useValue: { lookupAccount, getAccountStatuses } },
        { provide: BlueskyApi, useValue: { getProfile, getAuthorFeed, searchPosts } },
        { provide: BlueskySession, useValue: { linked } },
      ],
    });
  });

  it('refuses mixed networks and the same account twice before any request', async () => {
    const finder = TestBed.inject(InteractionFinder);
    expect(await finder.find('@a@x.example', 'b.bsky.social')).toEqual({ reason: 'mixed' });
    expect(await finder.find('@a@x.example', 'a@X.example')).toEqual({ reason: 'same' });
    expect(await finder.find('nope', '@a@x.example')).toEqual({ reason: 'invalid', which: 0 });
    expect(lookupAccount).not.toHaveBeenCalled();
  });

  it("scans each Mastodon account's posts on its own server, both ways, newest first", async () => {
    lookupAccount.mockImplementation((server: string) =>
      of(
        server === 'https://a.example'
          ? ({ id: 'A', url: 'https://a.example/@alice' } as Account)
          : ({ id: 'B', url: 'https://b.example/@bob' } as Account),
      ),
    );
    getAccountStatuses.mockImplementation((ref: { id: string }, opts: { maxId?: string }) => {
      if (opts.maxId) return of([]);
      return of(
        ref.id === 'A'
          ? [
              toot('a1', '2026-11-02T00:00:00Z', [{ acct: 'bob@b.example' }]),
              toot('a2', '2026-11-03T00:00:00Z'),
            ]
          : [toot('b1', '2026-11-04T00:00:00Z', [{ acct: 'alice@a.example' }])],
      );
    });
    const result = await TestBed.inject(InteractionFinder).find(
      '@alice@a.example',
      '@bob@b.example',
    );
    expect(result).toMatchObject({ network: 'mastodon', scanned: [2, 1], searched: false });
    expect(('posts' in result ? result.posts : []).map((p) => p.id)).toEqual(['b1', 'a1']);
  });

  it('reads Bluesky author feeds, skipping reposts, and adds search when signed in', async () => {
    getProfile.mockImplementation((actor: string) =>
      of({ did: actor === 'alice.test' ? 'did:plc:a' : 'did:plc:b' }),
    );
    const reply = skeet('did:plc:a', 'r1', {
      reply: {
        root: { uri: 'at://did:plc:b/app.bsky.feed.post/0', cid: 'c' },
        parent: { uri: 'at://did:plc:b/app.bsky.feed.post/0', cid: 'c' },
      },
    });
    getAuthorFeed.mockImplementation((actor: string) =>
      of({
        feed:
          actor === 'did:plc:a'
            ? [{ post: reply }, { post: skeet('did:plc:b', 'x'), reason: { $type: 'repost' } }]
            : [],
      }),
    );
    searchPosts.mockReturnValue(of({ posts: [skeet('did:plc:b', 's1')] }));
    linked.set(true);

    const result = await TestBed.inject(InteractionFinder).find('alice.test', 'bob.test');
    expect(result).toMatchObject({ network: 'bluesky', scanned: [1, 0], searched: true });
    expect(searchPosts).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'did:plc:a', mentions: 'did:plc:b' }),
      null,
    );
    expect(('posts' in result ? result.posts : []).map((p) => p.id).sort()).toEqual([
      'bsky:at://did:plc:a/app.bsky.feed.post/r1',
      'bsky:at://did:plc:b/app.bsky.feed.post/s1',
    ]);
  });

  it('says which account could not be read', async () => {
    lookupAccount.mockImplementation((server: string) =>
      server === 'https://a.example' ? of({ id: 'A' } as Account) : of(null),
    );
    expect(
      await TestBed.inject(InteractionFinder).find('@alice@a.example', '@bob@b.example'),
    ).toEqual({
      reason: 'notFound',
      which: 1,
    });
  });
});
