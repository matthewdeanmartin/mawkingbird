import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { Account, Status } from '../../platform/api/models';
import { OriginReads } from '../../reading/origin/origin-reads';
import { AnonymousPublicApi } from '../anonymous/anonymous-public-api';
import { FollowState } from '../follow-state';
import { InteractionDecayScan } from '../interaction-decay-scan';
import { ReactionLog } from '../reaction-log';
import { CHECK_STEP, NewPeopleScan } from '../new-people-scan';
import { NewPeoplePanel } from './new-people-panel';

function follower(i: number): Account {
  return {
    id: `p${i}`,
    acct: `p${i}@far.example`,
    username: `p${i}`,
    display_name: '',
    url: `https://far.example/@p${i}`,
    followers_count: 10,
    following_count: 10,
    statuses_count: 5,
    created_at: '2024-01-01T00:00:00Z',
    bot: false,
    fields: [],
  } as unknown as Account;
}

describe('new people', () => {
  const accountFollowersPage = vi.fn();
  const familiarFollowersOf = vi.fn();
  const getAccountStatuses = vi.fn();
  const originOfAccount = vi.fn();
  const lookupAccount = vi.fn();
  const originStatuses = vi.fn();
  /** p0 is followed, p1 requested, p2 muted, p3 blocked, p4 unknown. */
  const relationship = (id: string) => {
    const base = { id, following: false, requested: false, blocking: false, muting: false };
    return (
      {
        p0: { ...base, following: true },
        p1: { ...base, requested: true },
        p2: { ...base, muting: true },
        p3: { ...base, blocking: true },
        p4: undefined,
      }[id as 'p0'] ?? (id === 'p4' ? undefined : base)
    );
  };
  let scan: NewPeopleScan;

  beforeEach(() => {
    accountFollowersPage
      .mockReset()
      .mockReturnValue(
        of({ accounts: Array.from({ length: 30 }, (_, i) => follower(i)), nextMaxId: 'c1' }),
      );
    familiarFollowersOf
      .mockReset()
      .mockImplementation((ids: string[]) =>
        of(ids.map((id) => ({ id, accounts: id === 'p9' ? [follower(100)] : [] }))),
      );
    getAccountStatuses.mockReset().mockReturnValue(of([]));
    originOfAccount.mockReset().mockReturnValue(null);
    lookupAccount.mockReset().mockReturnValue(of({ id: '7' }));
    originStatuses.mockReset().mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [NewPeoplePanel],
      providers: [
        provideRouter([]),
        {
          provide: Api,
          useValue: { accountFollowersPage, familiarFollowersOf, getAccountStatuses },
        },
        {
          provide: FollowState,
          useValue: {
            resolve: () => Promise.resolve(),
            relationship,
            status: () => 'not-following',
            busyWith: () => false,
          },
        },
        { provide: OriginReads, useValue: { originOfAccount } },
        {
          provide: AnonymousPublicApi,
          useValue: { lookupAccount, getAccountStatuses: originStatuses },
        },
        { provide: InteractionDecayScan, useValue: { state: signal(null) } },
      ],
    });
    scan = TestBed.inject(NewPeopleScan);
  });

  const ids = () => scan.state()!.people.map((e) => e.account.id);

  it('lists only people you neither follow, asked, muted, blocked nor know nothing about', async () => {
    await scan.load('me');
    expect(ids()).toHaveLength(25);
    expect(ids()).not.toEqual(expect.arrayContaining(['p0']));
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(ids()).not.toContain(id);
    // Someone you follow vouches, so they come first.
    expect(ids()[0]).toBe('p9');
    expect(getAccountStatuses).not.toHaveBeenCalled();
  });

  it('treats a server without familiar followers as unknown, not as nobody', async () => {
    familiarFollowersOf.mockReturnValue(throwError(() => new Error('404')));
    await scan.load('me');
    expect(scan.state()?.phase).toBe('ready');
    expect(scan.state()?.people.every((e) => e.familiar === null)).toBe(true);
  });

  it('checks posts of 20 people per click, and skips those it could not read', async () => {
    getAccountStatuses.mockReturnValueOnce(throwError(() => new Error('gone')));
    await scan.load('me');
    await scan.checkPosts();
    expect(getAccountStatuses).toHaveBeenCalledTimes(CHECK_STEP);
    expect(scan.state()?.unreadable.size).toBe(1);
    expect(scan.unchecked()).toHaveLength(5);
    await scan.checkPosts();
    expect(getAccountStatuses).toHaveBeenCalledTimes(25);
  });

  it('stops between people and keeps what it read', async () => {
    getAccountStatuses.mockImplementation(() => {
      scan.cancel();
      return of([]);
    });
    await scan.load('me');
    await scan.checkPosts();
    expect(getAccountStatuses).toHaveBeenCalledTimes(1);
    expect(scan.state()?.phase).toBe('ready');
  });

  it('continues from the cursor, adds only new people, and ends when a page repeats', async () => {
    await scan.load('me');
    await scan.load('me', true);
    expect(accountFollowersPage.mock.calls[1][1]).toBe('c1');
    // The same page again: the followed ones were never listed, so only they are "new".
    expect(ids()).toHaveLength(25);
    accountFollowersPage.mockReturnValue(of({ accounts: [], nextMaxId: 'c2' }));
    await scan.load('me', true);
    expect(scan.state()?.cursor).toBeNull();
  });

  it('uses the notification read to see who replied before following', async () => {
    const log: ReactionLog = {
      reactions: [{ kind: 'replies', personId: 'p7', postId: 's', at: 1000 }],
      people: new Map(),
      posts: new Map(),
      firstFollow: new Map([['p7', 2000]]),
    };
    const decay = TestBed.inject(InteractionDecayScan) as unknown as {
      state: ReturnType<typeof signal<unknown>>;
    };
    decay.state.set({ accountId: 'me', log });
    await scan.load('me');
    const p7 = scan.state()!.people.find((e) => e.account.id === 'p7')!;
    expect(p7.repliedBeforeFollowing).toBe(true);
    expect(p7.followedAt).toBe(2000);
  });

  it("asks a person's own server only when that is allowed", async () => {
    await scan.load('me');
    const [first] = scan.state()!.people;
    expect(scan.canAskOrigin(first)).toBe(false);
    expect(await scan.askOrigin(first)).toBe(false);
    expect(lookupAccount).not.toHaveBeenCalled();

    originOfAccount.mockReturnValue('https://far.example');
    originStatuses.mockReturnValue(
      of([
        {
          id: '1',
          created_at: new Date().toISOString(),
          content: 'x',
          account: { id: '7' },
        } as Status,
      ]),
    );
    expect(await scan.askOrigin(first)).toBe(true);
    const after = scan.state()!.people.find((e) => e.account.id === first.account.id)!;
    expect(after.behaviorFrom).toBe('far.example');
    expect(after.behavior?.sample).toBe(1);
  });

  it('reads nothing until asked, then shows three verdicts with reasons per person', async () => {
    const fixture = TestBed.createComponent(NewPeoplePanel);
    fixture.componentRef.setInput('accountId', 'me');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(accountFollowersPage).not.toHaveBeenCalled();
    expect(root.querySelectorAll(':scope > button')).toHaveLength(1);
    await scan.load('me');
    fixture.detectChanges();
    const first = root.querySelector('li')!;
    expect(first.querySelectorAll('mb-badge')).toHaveLength(3);
    expect(root.querySelectorAll('li')).toHaveLength(25);
    expect(root.textContent).not.toContain('newPeople.');
  });

  it("does not show another account's list", async () => {
    await scan.load('someone-else');
    const fixture = TestBed.createComponent(NewPeoplePanel);
    fixture.componentRef.setInput('accountId', 'me');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('li')).toBeNull();
  });
});
