import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account, Relationship } from '../../../models';
import { TwitterArchivePerson } from '../../../twitter-archive';
import {
  isBotOrMirrorTwitterCandidate,
  isInactiveTwitterCandidate,
  isIncompleteTwitterCandidate,
  isStaleTwitterCandidate,
  rankTwitterMatch,
  TwitterFriendDiscovery,
} from './twitter-friend-discovery';

function twitterPerson(
  handle: string | null,
  changes: Partial<TwitterArchivePerson> = {},
): TwitterArchivePerson {
  return {
    twitter_handle: handle,
    twitter_name: handle,
    twitter_account_id: handle,
    previous_handles: [],
    currently_following: false,
    reply_count: 0,
    mention_count: 0,
    first_interaction_at: null,
    last_interaction_at: null,
    twitter_profile_url: handle ? `https://twitter.com/${handle}` : '',
    ...changes,
  };
}

function mastodonAccount(username: string, changes: Partial<Account> = {}): Account {
  return {
    id: username,
    username,
    acct: `${username}@social.example`,
    display_name: username,
    note: '',
    url: `https://social.example/@${username}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...changes,
  };
}

function relationship(id: string, changes: Partial<Relationship> = {}): Relationship {
  return {
    id,
    following: false,
    followed_by: false,
    requested: false,
    blocking: false,
    muting: false,
    ...changes,
  };
}

describe('Twitter-to-Mastodon identity evidence', () => {
  it('ranks the same handle and adds independent display-name and backlink clues', () => {
    const match = rankTwitterMatch(
      twitterPerson('AliceDev', { twitter_name: 'Alice Example' }),
      mastodonAccount('alicedev', {
        display_name: 'Alice Example',
        fields: [
          {
            name: 'Twitter',
            value: '<a href="https://twitter.com/AliceDev">Twitter</a>',
          },
        ],
      }),
    );

    expect(match.confidence).toBe('likely');
    expect(match.signals).toEqual([
      'Mastodon username matches Twitter handle',
      'Display name matches Twitter name',
      'Mastodon profile links back to Twitter handle',
    ]);
  });

  it('does not present a search result without a Twitter identity clue', () => {
    const match = rankTwitterMatch(
      twitterPerson('alice'),
      mastodonAccount('unrelated', { display_name: 'Someone Else' }),
    );

    expect(match.signals).toEqual([]);
    expect(match.confidence).toBe('possible');
  });
});

describe('Twitter candidate quality filters', () => {
  it('classifies fewer than ten combined posts, follows, and followers as inactive', () => {
    expect(
      isInactiveTwitterCandidate(
        mastodonAccount('quiet', {
          statuses_count: 3,
          following_count: 3,
          followers_count: 3,
        }),
      ),
    ).toBe(true);
    expect(
      isInactiveTwitterCandidate(
        mastodonAccount('active', {
          statuses_count: 4,
          following_count: 3,
          followers_count: 3,
        }),
      ),
    ).toBe(false);
  });

  it('detects blank bios and missing/default avatars', () => {
    expect(
      isIncompleteTwitterCandidate(
        mastodonAccount('complete', {
          note: '<p>Hello!</p>',
          avatar_static: 'https://social.example/avatar.png',
        }),
      ),
    ).toBe(false);
    expect(
      isIncompleteTwitterCandidate(
        mastodonAccount('blank-bio', {
          note: '<p><br></p>',
          avatar_static: 'https://social.example/avatar.png',
        }),
      ),
    ).toBe(true);
    expect(
      isIncompleteTwitterCandidate(
        mastodonAccount('default-avatar', {
          note: '<p>Hello!</p>',
          avatar_static: 'https://social.example/avatars/original/missing.png',
        }),
      ),
    ).toBe(true);
  });

  it('detects declared bots and bot or mirror language without matching botanist', () => {
    expect(isBotOrMirrorTwitterCandidate(mastodonAccount('declared', { bot: true }))).toBe(true);
    expect(
      isBotOrMirrorTwitterCandidate(
        mastodonAccount('mirror', { note: '<p>This is an automated mirror.</p>' }),
      ),
    ).toBe(true);
    expect(
      isBotOrMirrorTwitterCandidate(
        mastodonAccount('human', { note: '<p>Botanist and collector.</p>' }),
      ),
    ).toBe(false);
  });

  it('uses last_status_at when available and leaves omitted activity dates unclassified', () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    expect(isStaleTwitterCandidate(mastodonAccount('unknown'), now)).toBe(false);
    expect(isStaleTwitterCandidate(mastodonAccount('never', { last_status_at: null }), now)).toBe(
      true,
    );
    expect(
      isStaleTwitterCandidate(
        mastodonAccount('old', { last_status_at: '2025-07-23T23:59:59.000Z' }),
        now,
      ),
    ).toBe(true);
    expect(
      isStaleTwitterCandidate(mastodonAccount('recent', { last_status_at: '2025-07-24' }), now),
    ).toBe(false);
  });
});

describe('TwitterFriendDiscovery', () => {
  let discovery: TwitterFriendDiscovery;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    discovery = TestBed.inject(TwitterFriendDiscovery);
    discovery.delayMs = 0;
    http = TestBed.inject(HttpTestingController);
  });

  it('searches one recovered handle per call and resumes at the API budget', async () => {
    discovery.load([
      twitterPerson('alice'),
      twitterPerson(null, { twitter_account_id: 'unknown-id' }),
      twitterPerson('ALICE', { twitter_account_id: 'duplicate-handle' }),
      twitterPerson('bob'),
    ]);

    expect(discovery.rows().map((row) => row.person.twitter_handle)).toEqual(['alice', 'bob']);

    const firstRun = discovery.start(1);
    http
      .expectOne('/api/v2/search?q=alice&type=accounts&limit=10')
      .flush({ accounts: [], statuses: [], hashtags: [] });
    await firstRun;

    expect(discovery.callCount()).toBe(1);
    expect(discovery.rows().map((row) => row.status)).toEqual(['complete', 'pending']);

    const secondRun = discovery.start(2);
    http
      .expectOne('/api/v2/search?q=bob&type=accounts&limit=10')
      .flush({ accounts: [], statuses: [], hashtags: [] });
    await secondRun;

    expect(discovery.callCount()).toBe(2);
    expect(discovery.rows().map((row) => row.status)).toEqual(['complete', 'complete']);
    http.verify();
  });

  it('loads candidate relationships and follows a selected match in place', async () => {
    const account = mastodonAccount('alice', { id: 'mastodon-alice' });
    discovery.load([twitterPerson('alice')]);

    const run = discovery.start(1);
    http
      .expectOne('/api/v2/search?q=alice&type=accounts&limit=10')
      .flush({ accounts: [account], statuses: [], hashtags: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne('/api/v1/accounts/relationships?id%5B%5D=mastodon-alice')
      .flush([relationship(account.id)]);
    await run;

    expect(discovery.rows()[0].matches).toHaveLength(1);
    expect(discovery.relationship(account.id)?.following).toBe(false);

    const follow = discovery.follow(account);
    http
      .expectOne('/api/v1/accounts/mastodon-alice/follow')
      .flush(relationship(account.id, { following: true }));
    await follow;

    expect(discovery.relationship(account.id)?.following).toBe(true);
    http.verify();
  });
});
