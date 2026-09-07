import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defer, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { Auth } from '../auth';
import { Account, MastodonNotification, Relationship, Status, UserList } from '../models';
import { Server } from '../server';
import { PEOPLE_CATEGORIES, PEOPLE_LIST_TITLES } from './people-categories';
import { PeopleLists } from './people-lists';

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    bot: false,
    followers_count: 10,
    following_count: 2,
    last_status_at: '2026-09-01',
    ...overrides,
  } as Account;
}
function relation(id: string, followed_by = true): Relationship {
  return { id, following: true, followed_by } as Relationship;
}
function page(accounts: Account[], nextMaxId: string | null = null) {
  return { accounts, nextMaxId, paginationKnown: true, source: 'link-header' };
}

describe('PeopleLists synchronization', () => {
  let service: PeopleLists;
  let lists: UserList[];
  let members: Map<string, Set<string>>;
  let auth: {
    kind: ReturnType<typeof signal<string>>;
    token: ReturnType<typeof signal<string>>;
    account: ReturnType<typeof signal<Account>>;
  };
  let server: { baseUrl: ReturnType<typeof signal<string>> };
  let api: ReturnType<typeof fakeApi>;
  let sequence: number;

  function fakeApi() {
    return {
      accountFollowingPage: vi.fn((_id: string, _cursor?: string, _limit?: number) =>
        of(page([account('a'), account('b', { followers_count: 20_000 })])),
      ),
      relationships: vi.fn((ids: string[]) => of(ids.map((id) => relation(id, id === 'a')))),
      getAccounts: vi.fn((_ids: string[]) => of([] as Account[])),
      getAccount: vi.fn((id: string) => of(account(id))),
      notifications: vi.fn((_cursor?: string) => of([] as MastodonNotification[])),
      getAccountStatuses: vi.fn((_id: string, _opts?: unknown) => of([] as Status[])),
      homeTimeline: vi.fn((_cursor?: string) => of([] as Status[])),
      lists: vi.fn(() => defer(() => of([...lists]))),
      createList: vi.fn((title: string) =>
        defer(() => {
          const list = { id: `generated-${++sequence}`, title } as UserList;
          lists.push(list);
          members.set(list.id, new Set());
          return of(list);
        }),
      ),
      listAccountsPage: vi.fn((id: string, _cursor?: string, _limit?: number) =>
        defer(() => {
          if (!members.has(id)) return throwError(() => new HttpErrorResponse({ status: 404 }));
          return of(page([...members.get(id)!].map((member) => account(member))));
        }),
      ),
      addManyToList: vi.fn((id: string, ids: string[]) =>
        defer(() => {
          for (const member of ids) members.get(id)!.add(member);
          return of({});
        }),
      ),
      removeManyFromList: vi.fn((id: string, ids: string[]) =>
        defer(() => {
          for (const member of ids) members.get(id)!.delete(member);
          return of({});
        }),
      ),
    };
  }
  const listFor = (category: keyof typeof PEOPLE_LIST_TITLES) =>
    lists.find((list) => list.title === PEOPLE_LIST_TITLES[category])!;

  beforeEach(() => {
    localStorage.clear();
    lists = [{ id: 'personal', title: 'My personal list' } as UserList];
    members = new Map([['personal', new Set(['unrelated'])]]);
    sequence = 0;
    auth = {
      kind: signal('mastodon'),
      token: signal('test-token'),
      account: signal(account('me')),
    };
    server = { baseUrl: signal('https://example.test') };
    api = fakeApi();
    TestBed.configureTestingModule({
      providers: [
        PeopleLists,
        { provide: Api, useValue: api },
        { provide: Auth, useValue: auth },
        { provide: Server, useValue: server },
      ],
    });
    service = TestBed.inject(PeopleLists);
    service.delayMs = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('creates native branded lists, then makes a second identical sync write-free', async () => {
    await service.start();
    expect(service.job()?.phase).toBe('done');
    expect(api.createList).toHaveBeenCalledTimes(11);
    expect(members.get(listFor('mutuals').id)).toEqual(new Set(['a']));
    expect(members.get(listFor('parasocials').id)).toEqual(new Set(['b']));
    expect(members.get('personal')).toEqual(new Set(['unrelated']));
    expect(service.status(lists)).toBe('fresh');
    api.addManyToList.mockClear();
    api.removeManyFromList.mockClear();
    await service.start();
    expect(api.createList).toHaveBeenCalledTimes(11);
    expect(api.addManyToList).not.toHaveBeenCalled();
    expect(api.removeManyFromList).not.toHaveBeenCalled();
    expect(api.getAccountStatuses).toHaveBeenCalledTimes(2); // only our own timeline
  });

  it('defaults to removing old/manual membership, with an explicit add-only option', async () => {
    await service.start();
    const mutuals = listFor('mutuals');
    members.get(mutuals.id)!.add('manual');
    api.relationships.mockImplementation((ids) => of(ids.map((id) => relation(id, id === 'b'))));
    await service.start(true);
    expect(members.get(mutuals.id)).toEqual(new Set(['a', 'b', 'manual']));
    expect(service.status(lists)).toBe('addOnly');
    await service.start();
    expect(members.get(mutuals.id)).toEqual(new Set(['b']));
    expect(service.status(lists)).toBe('fresh');
  });

  it('repairs partial and complete deletion and discovers existing titles without local state', async () => {
    await service.start();
    const deleted = listFor('mutuals').id;
    lists = lists.filter((list) => list.id !== deleted);
    members.delete(deleted);
    expect(service.status(lists)).toBe('missing');
    await service.start();
    expect(listFor('mutuals').id).not.toBe(deleted);
    expect(api.createList).toHaveBeenCalledTimes(12);
    localStorage.clear();
    await service.start();
    expect(api.createList).toHaveBeenCalledTimes(12);
    lists = lists.filter((list) => list.id === 'personal');
    members = new Map([['personal', new Set(['unrelated'])]]);
    await service.start();
    expect(api.createList).toHaveBeenCalledTimes(23);
    expect(service.job()?.phase).toBe('done');
  });

  it('retains a remembered renamed list and flags staleness by age and follow count', async () => {
    await service.start();
    listFor('mutuals').title = 'My renamed mutuals';
    await service.start();
    expect(api.createList).toHaveBeenCalledTimes(11);
    expect(service.status(lists, Date.now() + 8 * 86_400_000)).toBe('stale');
    auth.account.set(account('me', { following_count: 3 }));
    expect(service.status(lists)).toBe('stale');
  });

  it('walks opaque follow cursors and all membership pages before computing removals', async () => {
    api.accountFollowingPage.mockImplementation((_id, cursor) =>
      of(cursor ? page([account('b')]) : page([account('a')], 'follow-edge-2')),
    );
    await service.start();
    expect(api.accountFollowingPage).toHaveBeenCalledWith('me', 'follow-edge-2', 80);
    const mutuals = listFor('mutuals').id;
    members.get(mutuals)!.add('old');
    const original = api.listAccountsPage.getMockImplementation()!;
    api.listAccountsPage.mockImplementation((id, cursor, limit) => {
      if (id === mutuals && members.get(id)!.has('old'))
        return of(cursor ? page([account('old')]) : page([account('a')], 'membership-edge-2'));
      return original(id, cursor, limit);
    });
    await service.start();
    expect(api.listAccountsPage).toHaveBeenCalledWith(mutuals, 'membership-edge-2', 80);
    expect(members.get(mutuals)).toEqual(new Set(['a']));
  });

  it('refuses repeated or guessed follow cursors and missing relationship data before writes', async () => {
    api.accountFollowingPage.mockReturnValue(of(page([account('a')], 'repeat')));
    await service.start();
    expect(service.job()?.phase).toBe('failed');
    expect(api.createList).not.toHaveBeenCalled();
    api.accountFollowingPage.mockReturnValue(
      of({ ...page([account('a')], 'guess'), source: 'account-id-fallback' }),
    );
    await service.start();
    expect(service.job()?.phase).toBe('failed');
    expect(api.createList).not.toHaveBeenCalled();
    api.accountFollowingPage.mockReturnValue(of(page([account('a')])));
    api.relationships.mockReturnValue(of([]));
    await service.start();
    expect(service.job()?.phase).toBe('failed');
    expect(api.createList).not.toHaveBeenCalled();
  });

  it('does not remove members when list pagination is hidden', async () => {
    await service.start();
    api.listAccountsPage.mockReturnValue(of({ ...page([account('old')]), paginationKnown: false }));
    await service.start();
    expect(service.job()?.phase).toBe('failed');
    expect(api.removeManyFromList).not.toHaveBeenCalled();
    expect(service.status(lists)).toBe('stale');
  });

  it('recovers a list deleted between discovery and reading its members', async () => {
    await service.start();
    const id = listFor('top_friends').id;
    api.listAccountsPage.mockImplementationOnce(() => {
      lists = lists.filter((list) => list.id !== id);
      members.delete(id);
      return throwError(() => new HttpErrorResponse({ status: 404 }));
    });
    await service.start();
    expect(service.job()?.phase).toBe('done');
    expect(listFor('top_friends').id).not.toBe(id);
  });

  it('reconciles a concurrent add rejected with 422 instead of duplicating it', async () => {
    api.addManyToList.mockImplementationOnce((id, ids) => {
      for (const member of ids) members.get(id)!.add(member);
      return throwError(() => new HttpErrorResponse({ status: 422 }));
    });
    await service.start();
    expect(service.job()?.phase).toBe('done');
    expect(members.get(listFor('mutuals').id)).toEqual(new Set(['a']));
  });

  it('reports real write failures and leaves a repairable dirty snapshot', async () => {
    api.addManyToList.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    await service.start();
    expect(service.job()?.phase).toBe('failed');
    expect(service.lastSync()).toBeNull();
    expect(service.status(lists)).toBe('missing');
    expect(api.removeManyFromList).not.toHaveBeenCalled();
  });

  it('retains readers evidence across thin refreshes but updates mutuals from current relationships', async () => {
    api.notifications.mockImplementation((cursor) =>
      of(
        cursor ? [] : [{ id: 'n', type: 'reblog', account: account('a') } as MastodonNotification],
      ),
    );
    await service.start();
    api.notifications.mockReturnValue(of([]));
    api.relationships.mockImplementation((ids) => of(ids.map((id) => relation(id, false))));
    await service.start();
    expect(members.get(listFor('readers').id)).toEqual(new Set(['a']));
    expect(members.get(listFor('mutuals').id)).toEqual(new Set());
  });

  it('caps activity reads to ten pages per source', async () => {
    let index = 0;
    api.notifications.mockImplementation(() =>
      of([{ id: `n${index++}`, type: 'reblog', account: account('a') } as MastodonNotification]),
    );
    await service.start();
    expect(api.notifications).toHaveBeenCalledTimes(10);
    expect(service.job()?.phase).toBe('done');
  });

  it('cancels an in-flight read and prevents duplicate simultaneous runs', async () => {
    const pending = new Subject<ReturnType<typeof page>>();
    api.accountFollowingPage.mockReturnValue(pending);
    const run = service.start();
    await Promise.resolve();
    await service.start();
    service.stop();
    await run;
    expect(api.accountFollowingPage).toHaveBeenCalledTimes(1);
    expect(service.job()?.phase).toBe('cancelled');
    expect(api.createList).not.toHaveBeenCalled();
  });

  it('pauses on 429 and resumes the same operation, with a working stop button', async () => {
    vi.useFakeTimers();
    api.accountFollowingPage.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '2' }) }),
      ),
    );
    const run = service.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(service.job()?.phase).toBe('paused');
    await vi.advanceTimersByTimeAsync(2000);
    await run;
    expect(service.job()?.phase).toBe('done');
    expect(api.accountFollowingPage).toHaveBeenCalledTimes(2);
    api.accountFollowingPage.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 429 })),
    );
    const stopped = service.start();
    await vi.advanceTimersByTimeAsync(1);
    service.stop();
    await vi.advanceTimersByTimeAsync(100);
    await stopped;
    expect(service.job()?.phase).toBe('cancelled');
  });

  it('never continues writes under another account, token, or server', async () => {
    const pending = new Subject<ReturnType<typeof page>>();
    api.accountFollowingPage.mockReturnValue(pending);
    const run = service.start();
    await Promise.resolve();
    auth.account.set(account('different'));
    auth.token.set('different-token');
    server.baseUrl.set('https://other.test');
    pending.next(page([account('a')]));
    await run;
    expect(service.job()).toBeNull();
    expect(service.running()).toBe(false);
    expect(api.createList).not.toHaveBeenCalled();
    expect(service.lastSync()).toBeNull();
  });

  it('does not offer native Mastodon writes to anonymous or Bluesky primary accounts', async () => {
    for (const kind of ['anonymous', 'bluesky']) {
      auth.kind.set(kind);
      await service.start();
      expect(service.eligible()).toBe(false);
    }
    expect(api.accountFollowingPage).not.toHaveBeenCalled();
    expect(PEOPLE_CATEGORIES).toHaveLength(11);
  });
});
