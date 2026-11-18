import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../platform/api/models';
import type { UnbirdArchive, UnbirdPerson } from './unbird-archive';
import {
  fullAcct,
  publicAccountSearch,
  serverShares,
  strongMatches,
  UnbirdMatcher,
} from './unbird-matcher';
import { StoredMatchRow, UnbirdStore } from './unbird-store';

function person(handle: string, extra: Partial<UnbirdPerson> = {}): UnbirdPerson {
  return {
    twitter_handle: handle,
    twitter_name: null,
    twitter_account_id: null,
    previous_handles: [],
    currently_following: true,
    reply_count: 0,
    mention_count: 0,
    first_interaction_at: null,
    last_interaction_at: null,
    twitter_profile_url: `https://twitter.com/${handle}`,
    mutual: false,
    closeness: 3,
    ...extra,
  };
}

function account(acct: string, extra: Partial<Account> = {}): Account {
  const username = acct.split('@')[0];
  return {
    id: acct,
    username,
    acct,
    display_name: username,
    note: '',
    fields: [],
    url: `https://example.social/@${username}`,
    avatar: 'a.png',
    avatar_static: 'a.png',
    bot: false,
    statuses_count: 5,
    followers_count: 9,
    following_count: 1,
    ...extra,
  } as Account;
}

function archiveOf(people: UnbirdPerson[]): UnbirdArchive {
  return {
    version: 1,
    readAt: 0,
    owner: { accountId: null, userName: 'me', displayName: null },
    generatedAt: null,
    profile: null,
    counts: {},
    files: { total: 7, opened: [] },
    hasContacts: false,
    followingCount: people.length,
    followerCount: 0,
    people,
    tweets: [],
    likes: [],
    savedSearches: [],
  };
}

describe('Unbird matching', () => {
  it('keeps only username or profile-link matches, never a display name alone', () => {
    const matches = strongMatches(
      person('ada', { twitter_name: 'Ada L' }),
      [account('ada@hachyderm.io'), account('someone', { display_name: 'Ada L' })],
      'mastodon.social',
    );
    expect(matches.map((match) => match.acct)).toEqual(['ada@hachyderm.io']);
    expect(matches[0].confidence).toBe('likely');
  });

  it('fills in the answering server for local results', () => {
    expect(fullAcct('ada', 'mastodon.social')).toBe('ada@mastodon.social');
    expect(fullAcct('ada@hachyderm.io', 'mastodon.social')).toBe('ada@hachyderm.io');
  });

  it('counts the servers where likely matches landed', () => {
    const row = (acct: string, confidence: 'likely' | 'possible'): StoredMatchRow => ({
      handle: acct,
      status: 'complete',
      checkedAt: 0,
      matches: [{ acct, confidence } as StoredMatchRow['matches'][number]],
    });
    expect(
      serverShares([
        row('a@hachyderm.io', 'likely'),
        row('b@hachyderm.io', 'likely'),
        row('c@mastodon.social', 'likely'),
        row('d@tiny.town', 'possible'),
      ]),
    ).toEqual([
      { server: 'hachyderm.io', people: 2 },
      { server: 'mastodon.social', people: 1 },
    ]);
  });

  it('searches publicly without credentials or resolve', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ accounts: [account('ada')] }));
    await publicAccountSearch('ada', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mastodon.social/api/v2/search?type=accounts&limit=8&q=ada',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  describe('UnbirdMatcher', () => {
    function setup(responses: Record<string, Response>) {
      const saved: StoredMatchRow[] = [];
      TestBed.configureTestingModule({
        providers: [
          {
            provide: UnbirdStore,
            useValue: {
              saveMatches: async (rows: StoredMatchRow[]) => saved.push(...rows),
              loadMatches: async () => [],
              saveArchive: async () => true,
            },
          },
        ],
      });
      const matcher = TestBed.inject(UnbirdMatcher);
      matcher.delayMs = 0;
      matcher.fetchImpl = vi.fn(async (url: string | URL | Request) => {
        const handle = new URL(String(url)).searchParams.get('q')!;
        return responses[handle] ?? Response.json({ accounts: [] });
      }) as typeof fetch;
      return { matcher, saved };
    }

    it('searches closest first, up to the count, and remembers what it found', async () => {
      const { matcher, saved } = setup({
        ada: Response.json({ accounts: [account('ada@hachyderm.io')] }),
      });
      await matcher.adopt(archiveOf([person('ada'), person('bob'), person('cy')]));
      await matcher.search('public', 2);
      expect(matcher.searched()).toBe(2);
      expect(matcher.found()).toBe(1);
      expect(matcher.remaining()).toBe(1);
      expect(saved.map((row) => row.handle)).toEqual(['ada', 'bob']);
      expect(matcher.servers()).toEqual([{ server: 'hachyderm.io', people: 1 }]);
    });

    it('stops at a rate limit and leaves the person unsearched, to resume later', async () => {
      const { matcher } = setup({ bob: new Response(null, { status: 429 }) });
      await matcher.adopt(archiveOf([person('ada'), person('bob'), person('cy')]));
      await matcher.search('public', 10);
      expect(matcher.rateLimited()).toBe(true);
      expect(matcher.searched()).toBe(1);
      expect(matcher.remaining()).toBe(2);
    });
  });
});
