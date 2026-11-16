import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { ChatSuggestions, MUTUALS_TTL_MS, rankSuggestions } from './chat-suggestions';

const account = (id: string, acct: string, name = ''): Account =>
  ({ id, acct, username: acct.split('@')[0], display_name: name }) as Account;

function setUp(
  options: {
    lists?: { id: string; title: string }[];
    following?: Account[];
    followers?: Account[];
    counts?: [number, number];
    archive?: unknown;
    token?: string;
  } = {},
) {
  const [following_count, followers_count] = options.counts ?? [2, 2];
  const api = {
    lists: vi.fn(() => of(options.lists ?? [])),
    listAccounts: vi.fn(() => of([account('9', 'listed@far.example', 'Listed')])),
    accountFollowingPage: vi.fn(() => of({ accounts: options.following ?? [], nextMaxId: null })),
    accountFollowersPage: vi.fn(() => of({ accounts: options.followers ?? [], nextMaxId: null })),
    searchFollowedAccounts: vi.fn(() => of([])),
  };
  localStorage.setItem('mastodon_mock_token', options.token ?? 'tok');
  TestBed.configureTestingModule({
    providers: [
      { provide: Api, useValue: api },
      {
        provide: Auth,
        useValue: {
          token: signal(options.token ?? 'tok'),
          account: signal({ id: 'me', following_count, followers_count }),
        },
      },
      { provide: NATIVE_PROFILES, useValue: options.archive ?? null },
    ],
  });
  return { api, suggestions: TestBed.inject(ChatSuggestions) };
}

describe('ChatSuggestions', () => {
  it('intersects following and followers, then serves the stored set for a week', async () => {
    const alice = account('1', 'mistersql@mastodon.social', 'Mister SQL');
    const { api, suggestions } = setUp({
      following: [alice, account('2', 'idol@big.example')],
      followers: [alice, account('3', 'fan@far.example')],
    });
    await suggestions.ensure();
    expect(suggestions.source()).toBe('built');
    expect(suggestions.mutuals()).toEqual([
      { acct: 'mistersql@mastodon.social', name: 'Mister SQL' },
    ]);

    // A fresh service stands in for a reload: no requests while the set is fresh.
    TestBed.resetTestingModule();
    const again = setUp();
    await again.suggestions.ensure();
    expect(again.suggestions.source()).toBe('cache');
    expect(again.api.accountFollowingPage).not.toHaveBeenCalled();
    expect(api.accountFollowingPage).toHaveBeenCalledTimes(1);
  });

  it('rebuilds once the stored set is a week old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
      await setUp().suggestions.ensure();
      vi.setSystemTime(new Date(Date.parse('2026-11-01T00:00:00Z') + MUTUALS_TTL_MS + 1));
      TestBed.resetTestingModule();
      const later = setUp();
      await later.suggestions.ensure();
      expect(later.api.accountFollowingPage).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the Mutuals people list when there is one, instead of paging', async () => {
    const { api, suggestions } = setUp({ lists: [{ id: 'L', title: 'Mawkingbird: Mutuals' }] });
    await suggestions.ensure();
    expect(suggestions.source()).toBe('list');
    expect(api.listAccounts).toHaveBeenCalledWith('L', 0);
    expect(api.accountFollowingPage).not.toHaveBeenCalled();
  });

  it('reads Native’s archive with no request at all', async () => {
    const peopleMembers = vi.fn(async () => [
      { acct: 'friend@far.example', displayName: 'Friend' },
    ]);
    const { api, suggestions } = setUp({
      archive: { peopleMembers },
      token: 'native-mastodon:one',
    });
    await suggestions.ensure();
    expect(suggestions.source()).toBe('archive');
    expect(peopleMembers).toHaveBeenCalledWith('native-mastodon:one', 'mutuals');
    expect(api.lists).not.toHaveBeenCalled();
  });

  it('does not page a large account; typing searches its follows instead', async () => {
    const { api, suggestions } = setUp({ counts: [1500, 4000] });
    await suggestions.ensure();
    expect(suggestions.source()).toBe('capped');
    expect(api.accountFollowingPage).not.toHaveBeenCalled();
  });
});

describe('rankSuggestions', () => {
  const sql = { acct: 'mistersql@mastodon.social', name: 'Mister SQL' };
  const ann = { acct: 'ann@far.example', name: 'Ann Lee' };

  it('matches the handle, the server, or the start of a name word', () => {
    expect(rankSuggestions('@mister', [sql, ann], [])).toEqual([sql]);
    expect(rankSuggestions('mastodon.soc', [sql, ann], [])).toEqual([sql]);
    expect(rankSuggestions('lee', [sql, ann], [])).toEqual([ann]);
  });

  it('puts mutuals before chat partners and lists each handle once', () => {
    const partner = { acct: 'pal@far.example', name: 'Pal' };
    expect(rankSuggestions('', [sql], [partner, { ...sql, name: 'dup' }])).toEqual([sql, partner]);
  });
});
