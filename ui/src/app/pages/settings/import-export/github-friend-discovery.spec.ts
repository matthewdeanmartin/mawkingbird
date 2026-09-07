import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../../api';
import { Account, Relationship } from '../../../models';
import { GitHubFollowedUser, GitHubSession } from '../../../providers/github/github-session';
import {
  GitHubFriendDiscovery,
  profileMastodonIdentity,
  rankGitHubMatch,
} from './github-friend-discovery';

function githubUser(login: string, changes: Partial<GitHubFollowedUser> = {}): GitHubFollowedUser {
  return {
    login,
    name: login,
    avatarUrl: `https://avatars.example/${login}`,
    url: `https://github.com/${login}`,
    bio: null,
    websiteUrl: null,
    socialAccounts: { nodes: [] },
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

function starredOwner(profile: GitHubFollowedUser, repository = `${profile.login}/project`) {
  return {
    profile,
    repositories: [
      {
        nameWithOwner: repository,
        url: `https://github.com/${repository}`,
        description: `${repository} description`,
      },
    ],
  };
}

describe('GitHub friend identity evidence', () => {
  it('turns a GitHub social-account Mastodon URL into a confirmed handle', () => {
    const identity = profileMastodonIdentity(
      githubUser('alice', {
        socialAccounts: {
          nodes: [
            {
              provider: 'GENERIC',
              displayName: 'Mastodon',
              url: 'https://fosstodon.org/@alice',
            },
          ],
        },
      }),
    );

    expect(identity).toEqual({
      handle: 'alice@fosstodon.org',
      url: 'https://fosstodon.org/@alice',
      evidence: 'Mastodon profile linked from GitHub',
      confidence: 'confirmed',
    });
  });

  it('recognizes a verified Mastodon profile field linking back to GitHub', () => {
    const match = rankGitHubMatch(
      githubUser('hotcoder'),
      mastodonAccount('hotcoder', {
        fields: [
          {
            name: 'GitHub',
            value: '<a href="https://github.com/hotcoder">github.com/hotcoder</a>',
            verified_at: '2026-07-22T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(match.confidence).toBe('confirmed');
    expect(match.signals).toContain('Verified rel=me link back to GitHub');
  });
});

describe('GitHubFriendDiscovery API budget', () => {
  let followedUsers: ReturnType<typeof vi.fn>;
  let starredRepositoryOwners: ReturnType<typeof vi.fn>;
  let search: ReturnType<typeof vi.fn>;
  let relationships: ReturnType<typeof vi.fn>;
  let follow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    followedUsers = vi.fn();
    starredRepositoryOwners = vi.fn();
    search = vi.fn();
    relationships = vi.fn().mockReturnValue(of([]));
    follow = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: GitHubSession, useValue: { followedUsers, starredRepositoryOwners } },
        { provide: Api, useValue: { search, relationships, follow } },
      ],
    });
  });

  it('paginates GitHub once, completes linked identities, and queues only unmatched profiles', async () => {
    followedUsers
      .mockResolvedValueOnce({
        users: [
          githubUser('linked', { websiteUrl: 'https://mastodon.social/@linked' }),
          githubUser('hotcoder'),
        ],
        hasNextPage: true,
        endCursor: 'page-2',
      })
      .mockResolvedValueOnce({
        users: [githubUser('secondpage')],
        hasNextPage: false,
        endCursor: null,
      });
    search.mockReturnValue(
      of({
        accounts: [
          mastodonAccount('linked', {
            acct: 'linked@mastodon.social',
            url: 'https://mastodon.social/@linked',
          }),
        ],
        statuses: [],
        hashtags: [],
      }),
    );
    const discovery = TestBed.inject(GitHubFriendDiscovery);

    await discovery.load();

    expect(followedUsers).toHaveBeenNthCalledWith(1, null);
    expect(followedUsers).toHaveBeenNthCalledWith(2, 'page-2');
    expect(discovery.githubPageCount()).toBe(2);
    expect(discovery.rows().map((row) => row.status)).toEqual(['complete', 'pending', 'pending']);
    expect(discovery.rows()[0].identity?.handle).toBe('linked@mastodon.social');
    expect(discovery.rows()[0].matches[0].account.id).toBe('linked');
    expect(search).toHaveBeenCalledWith('linked@mastodon.social', 'accounts', {
      resolve: true,
      limit: 5,
    });
    expect(discovery.linkedLookupCount()).toBe(1);
    expect(discovery.callCount()).toBe(0);
  });

  it('spends one Mastodon call per unmatched GitHub login and resumes at the budget', async () => {
    followedUsers.mockResolvedValue({
      users: [
        githubUser('linked', { websiteUrl: 'https://mastodon.social/@linked' }),
        githubUser('hotcoder'),
        githubUser('later'),
      ],
      hasNextPage: false,
      endCursor: null,
    });
    search.mockImplementation((query: string) =>
      of({ accounts: [mastodonAccount(query)], statuses: [], hashtags: [] }),
    );
    const discovery = TestBed.inject(GitHubFriendDiscovery);
    discovery.delayMs = 0;
    await discovery.load();

    await discovery.start(1);

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenNthCalledWith(2, 'hotcoder', 'accounts', {
      resolve: false,
      limit: 10,
    });
    expect(discovery.callCount()).toBe(1);
    expect(discovery.rows().map((row) => row.status)).toEqual(['complete', 'complete', 'pending']);

    await discovery.start(2);

    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenLastCalledWith('later', 'accounts', {
      resolve: false,
      limit: 10,
    });
    expect(discovery.callCount()).toBe(2);
    expect(discovery.rows().every((row) => row.status === 'complete')).toBe(true);
  });

  it('loads relationships and follows an unfollowed match in place', async () => {
    followedUsers.mockResolvedValue({
      users: [githubUser('hotcoder')],
      hasNextPage: false,
      endCursor: null,
    });
    search.mockReturnValue(
      of({ accounts: [mastodonAccount('hotcoder')], statuses: [], hashtags: [] }),
    );
    relationships.mockReturnValue(of([relationship('hotcoder')]));
    follow.mockReturnValue(of(relationship('hotcoder', { following: true })));
    const discovery = TestBed.inject(GitHubFriendDiscovery);
    discovery.delayMs = 0;
    await discovery.load();

    await discovery.start(1);

    const account = discovery.rows()[0].matches[0].account;
    expect(relationships).toHaveBeenCalledWith(['hotcoder']);
    expect(discovery.relationship(account.id)?.following).toBe(false);

    await discovery.follow(account);

    expect(follow).toHaveBeenCalledWith('hotcoder');
    expect(discovery.relationship(account.id)?.following).toBe(true);
  });

  it('checks unique starred-repository owners for direct identities without username searches', async () => {
    followedUsers.mockResolvedValue({
      users: [githubUser('existing')],
      hasNextPage: false,
      endCursor: null,
    });
    starredRepositoryOwners
      .mockResolvedValueOnce({
        owners: [
          starredOwner(
            githubUser('owner-b', { websiteUrl: 'https://social.example/@owner-b' }),
            'owner-b/first',
          ),
          starredOwner(githubUser('owner-a')),
          starredOwner(
            githubUser('owner-b', { websiteUrl: 'https://social.example/@owner-b' }),
            'owner-b/second',
          ),
        ],
        repositoryCount: 3,
        hasNextPage: true,
        endCursor: 'stars-2',
      })
      .mockResolvedValueOnce({
        owners: [
          starredOwner(githubUser('existing', { websiteUrl: 'https://social.example/@existing' })),
          starredOwner(githubUser('owner-c', { websiteUrl: 'https://social.example/@owner-c' })),
        ],
        repositoryCount: 2,
        hasNextPage: false,
        endCursor: null,
      });
    search.mockImplementation((query: string) =>
      of({
        accounts: [
          mastodonAccount(query.split('@')[0], {
            acct: query,
            url: `https://${query.split('@')[1]}/@${query.split('@')[0]}`,
          }),
        ],
        statuses: [],
        hashtags: [],
      }),
    );
    const discovery = TestBed.inject(GitHubFriendDiscovery);
    await discovery.load();
    search.mockClear();

    await discovery.loadStarredOwners();

    expect(starredRepositoryOwners).toHaveBeenNthCalledWith(1, null);
    expect(starredRepositoryOwners).toHaveBeenNthCalledWith(2, 'stars-2');
    expect(discovery.starredRepositoryCount()).toBe(5);
    expect(discovery.starredOwnerCount()).toBe(4);
    expect(discovery.rows().map((row) => row.profile.login)).toEqual([
      'existing',
      'owner-b',
      'owner-c',
    ]);
    expect(discovery.rows()[1].starredRepositories?.map((repo) => repo.nameWithOwner)).toEqual([
      'owner-b/first',
      'owner-b/second',
    ]);
    expect(search.mock.calls.map(([query]) => query)).toEqual([
      'owner-b@social.example',
      'owner-c@social.example',
    ]);
    expect(discovery.callCount()).toBe(0);
    expect(discovery.starredOwnersLoaded()).toBe(true);
  });

  it('keeps Mastodon matches in API arrival order', async () => {
    followedUsers.mockResolvedValue({
      users: [githubUser('alice')],
      hasNextPage: false,
      endCursor: null,
    });
    search.mockReturnValue(
      of({
        accounts: [
          mastodonAccount('alice', { id: 'first', fields: [] }),
          mastodonAccount('alice', {
            id: 'confirmed-second',
            fields: [
              {
                name: 'GitHub',
                value: '<a href="https://github.com/alice">GitHub</a>',
                verified_at: '2026-07-23T00:00:00.000Z',
              },
            ],
          }),
        ],
        statuses: [],
        hashtags: [],
      }),
    );
    const discovery = TestBed.inject(GitHubFriendDiscovery);
    discovery.delayMs = 0;
    await discovery.load();

    await discovery.start(1);

    expect(discovery.rows()[0].matches.map((match) => match.account.id)).toEqual([
      'first',
      'confirmed-second',
    ]);
  });

  it('keeps starred-owner matches when GitHub follows are loaded afterward', async () => {
    starredRepositoryOwners.mockResolvedValue({
      owners: [
        starredOwner(
          githubUser('star-owner', { websiteUrl: 'https://social.example/@star-owner' }),
        ),
      ],
      repositoryCount: 1,
      hasNextPage: false,
      endCursor: null,
    });
    followedUsers.mockResolvedValue({
      users: [githubUser('friend')],
      hasNextPage: false,
      endCursor: null,
    });
    search.mockReturnValue(
      of({
        accounts: [
          mastodonAccount('star-owner', {
            acct: 'star-owner@social.example',
            url: 'https://social.example/@star-owner',
          }),
        ],
        statuses: [],
        hashtags: [],
      }),
    );
    const discovery = TestBed.inject(GitHubFriendDiscovery);

    await discovery.loadStarredOwners();
    await discovery.load();

    expect(discovery.rows().map((row) => [row.profile.login, row.source])).toEqual([
      ['star-owner', 'starred-owner'],
      ['friend', 'following'],
    ]);
    expect(discovery.rows()[0].matches).toHaveLength(1);
  });
});
