import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from './api';
import { Auth } from './auth';
import { BulkActions, BulkTarget, bulkAction, formatEta, needsList } from './bulk-actions';
import { Account, Relationship } from './models';
import en from '../../public/i18n/en.json';

function account(id: string, acct = `user${id}`): Account {
  return { id, acct, username: acct, display_name: acct } as Account;
}

function relationship(id: string, showing_reblogs: boolean | undefined): Relationship {
  return { id, following: true, showing_reblogs } as Relationship;
}

/** A relationship expressed in terms of the follow state, for the list actions. */
function follows(id: string, following: boolean, requested = false): Relationship {
  return { id, following, requested } as Relationship;
}

const LIST: BulkTarget = { listId: '7', listTitle: 'Rocketry' };

/**
 * A stand-in Api whose calls are vi.fn()s the tests program per case. The
 * parameter lists are spelled out so `mockImplementation` can read the
 * arguments — several tests assert on which ids were requested.
 */
function fakeApi() {
  return {
    accountFollowing: vi.fn((_id: string, _maxId?: string, _limit?: number) => of([] as Account[])),
    relationships: vi.fn((_ids: string[]) => of([] as Relationship[])),
    follow: vi.fn((_id: string, _options?: { reblogs?: boolean }) => of({} as Relationship)),
    accountListPage: vi.fn((_kind: 'mutes' | 'blocks', _maxId?: string, _limit?: number) =>
      of({ accounts: [] as Account[], nextMaxId: null as string | null }),
    ),
    listAccountsPage: vi.fn((_id: string, _maxId?: string, _limit?: number) =>
      of({ accounts: [] as Account[], nextMaxId: null as string | null }),
    ),
    getCollection: vi.fn((_id: string) =>
      of({
        collection: { id: _id, items: [] as { id: string; state: string; account_id: string }[] },
        accounts: [] as Account[],
      }),
    ),
    unfollow: vi.fn((_id: string) => of({} as Relationship)),
    unmuteAccount: vi.fn((_id: string) => of({} as Relationship)),
    unblockAccount: vi.fn((_id: string) => of({} as Relationship)),
  };
}

describe('formatEta', () => {
  it('reads as an estimate at every scale', () => {
    expect(formatEta(4_000)).toBe('about 4s');
    expect(formatEta(130_000)).toBe('about 2m 10s');
    expect(formatEta(3_840_000)).toBe('about 1h 04m');
  });
});

/**
 * The English effect bullets for one action, joined.
 *
 * The registry holds translation keys now, not English — that is what lets every
 * locale make the same promises this file checks. The copy itself lives in
 * `en.json`, so these assertions read it from there and keep testing the words
 * rather than the indirection in front of them.
 */
function effectsText(id: Parameters<typeof bulkAction>[0]): string {
  const dictionary = en.bulk as Record<string, string>;
  return bulkAction(id)
    .effectKeys.map((key) => dictionary[key.replace('bulk.', '')] ?? '')
    .join(' ');
}

describe('bulkAction', () => {
  it('describes the destructive actions as recoverable only from a backup', () => {
    for (const id of ['mute-amnesty', 'block-amnesty'] as const) {
      const spec = bulkAction(id);
      expect(spec.danger).toBe(true);
      expect(spec.backup).toBeTruthy();
      expect(effectsText(id)).toContain('backed up');
    }
  });

  it('warns that unfollowing a list may empty it, without promising the list is deleted', () => {
    // The surprising consequence, and the one a user would otherwise report as a
    // bug: most servers only keep accounts you follow in a list. Hedged because
    // servers differ — our mock keeps the members.
    const effects = effectsText('list-unfollow');
    expect(effects).toContain('may end up empty');
    expect(effects).toContain('never deleted');
    expect(bulkAction('list-unfollow').danger).toBe(true);
  });

  it('marks exactly the list actions as needing a list', () => {
    expect(needsList('list-follow')).toBe(true);
    expect(needsList('list-unfollow')).toBe(true);
    expect(needsList('mute-amnesty')).toBe(false);
    expect(needsList('reblogs-on')).toBe(false);
  });

  it('promises the retweet actions do not unfollow anyone', () => {
    expect(effectsText('reblogs-off')).toContain('nobody is unfollowed');
    expect(bulkAction('reblogs-off').danger).toBe(false);
  });
});

describe('BulkActions', () => {
  let bulk: BulkActions;
  let api: ReturnType<typeof fakeApi>;

  beforeEach(() => {
    api = fakeApi();
    TestBed.configureTestingModule({
      providers: [
        BulkActions,
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { account: () => account('me') } },
      ],
    });
    bulk = TestBed.inject(BulkActions);
    // No spacing and no real waiting; the pacing itself is not under test here.
    bulk.delayMs = 0;
    bulk.maxWaitMs = 1;
  });

  // ------------------------------------------------------------- retweets

  it('writes only to the follows whose retweet setting is actually wrong', async () => {
    const follows = [account('1'), account('2'), account('3')];
    api.accountFollowing.mockReturnValueOnce(of(follows));
    api.relationships.mockReturnValueOnce(
      of([relationship('1', true), relationship('2', false), relationship('3', true)]),
    );

    const preview = await bulk.preview('reblogs-off');

    expect(preview.targets).toBe(2);
    expect(preview.alreadyCorrect).toBe(1);

    await bulk.start('reblogs-off');

    expect(api.follow).toHaveBeenCalledTimes(2);
    expect(api.follow).toHaveBeenCalledWith('1', { reblogs: false });
    expect(api.follow).toHaveBeenCalledWith('3', { reblogs: false });
    expect(bulk.job()).toMatchObject({ phase: 'done', done: 2, changed: 2, skipped: 1, failed: 0 });
  });

  it('scopes the retweet actions to your follows even when a list is passed', async () => {
    // The settings page hands the dialog its list picker's selection, and used
    // to do so for these account-wide actions too — which made the dialog read
    // as list-scoped. It never was, and must not become so.
    api.accountFollowing.mockReturnValueOnce(of([account('1')]));
    api.relationships.mockReturnValueOnce(of([relationship('1', true)]));

    const preview = await bulk.preview('reblogs-off', { listId: 'L1', listTitle: 'Friends' });

    expect(preview.targets).toBe(1);
    expect(api.accountFollowing).toHaveBeenCalled();
    expect(api.listAccountsPage).not.toHaveBeenCalled();
  });

  it('treats an absent showing_reblogs as "on", matching Mastodon default', async () => {
    api.accountFollowing.mockReturnValueOnce(of([account('1')]));
    api.relationships.mockReturnValueOnce(of([relationship('1', undefined)]));

    // Turning them OFF must still reach this account...
    expect((await bulk.preview('reblogs-off')).targets).toBe(1);

    api.accountFollowing.mockReturnValueOnce(of([account('1')]));
    api.relationships.mockReturnValueOnce(of([relationship('1', undefined)]));
    // ...and turning them ON must skip it, since they are already on.
    expect((await bulk.preview('reblogs-on')).targets).toBe(0);
  });

  it('pages the follow list and batches the relationship lookups', async () => {
    const page1 = Array.from({ length: 80 }, (_, i) => account(`a${i}`));
    const page2 = [account('b0')];
    api.accountFollowing.mockReturnValueOnce(of(page1)).mockReturnValueOnce(of(page2));
    api.relationships.mockImplementation((ids: string[]) =>
      of(ids.map((id) => relationship(id, true))),
    );

    const preview = await bulk.preview('reblogs-off');

    expect(api.accountFollowing).toHaveBeenCalledTimes(2);
    // 81 accounts at 40 ids per request.
    expect(api.relationships).toHaveBeenCalledTimes(3);
    expect(preview.targets).toBe(81);
  });

  it('does no work when everyone is already correct', async () => {
    api.accountFollowing.mockReturnValueOnce(of([account('1')]));
    api.relationships.mockReturnValueOnce(of([relationship('1', false)]));

    const preview = await bulk.preview('reblogs-off');

    expect(preview.targets).toBe(0);
    await bulk.start('reblogs-off');
    expect(api.follow).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------- amnesty

  it('unmutes everyone and stops when the list comes back empty', async () => {
    api.accountListPage
      .mockReturnValueOnce(of({ accounts: [account('1'), account('2')], nextMaxId: null }))
      .mockReturnValue(of({ accounts: [], nextMaxId: null }));

    await bulk.start('mute-amnesty');

    expect(api.unmuteAccount).toHaveBeenCalledTimes(2);
    expect(bulk.job()).toMatchObject({ phase: 'done', changed: 2, total: 2 });
    expect(bulk.percent()).toBe(1);
  });

  it('follows Link cursors so a multi-page list is read in full', async () => {
    api.accountListPage
      .mockReturnValueOnce(of({ accounts: [account('1')], nextMaxId: '99' }))
      .mockReturnValueOnce(of({ accounts: [account('2')], nextMaxId: null }));

    const preview = await bulk.preview('block-amnesty');

    expect(preview.targets).toBe(2);
    expect(preview.approximate).toBe(false);
    expect(api.accountListPage).toHaveBeenLastCalledWith('blocks', '99', 80);
  });

  it('stops instead of looping when a pass changes nothing', async () => {
    // A server that accepts the unblock but keeps listing the account.
    api.accountListPage.mockReturnValue(of({ accounts: [account('1')], nextMaxId: null }));
    api.unblockAccount.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    await bulk.start('block-amnesty');

    expect(bulk.job()?.phase).toBe('done');
    expect(bulk.job()?.failed).toBe(1);
    expect(api.unblockAccount).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------- errors

  it('records a failure and carries on to the next account', async () => {
    api.accountListPage
      .mockReturnValueOnce(
        of({ accounts: [account('1'), account('2'), account('3')], nextMaxId: null }),
      )
      .mockReturnValue(of({ accounts: [], nextMaxId: null }));
    api.unmuteAccount
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })))
      .mockReturnValue(of({} as Relationship));

    await bulk.start('mute-amnesty');

    expect(api.unmuteAccount).toHaveBeenCalledTimes(3);
    expect(bulk.job()).toMatchObject({ phase: 'done', failed: 1, changed: 2 });
  });

  it('pauses on a 429 and retries the same account rather than failing it', async () => {
    const rateLimited = new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'Retry-After': '0' }),
    });
    api.accountListPage
      .mockReturnValueOnce(of({ accounts: [account('1')], nextMaxId: null }))
      .mockReturnValue(of({ accounts: [], nextMaxId: null }));
    api.unmuteAccount
      .mockReturnValueOnce(throwError(() => rateLimited))
      .mockReturnValue(of({} as Relationship));

    await bulk.start('mute-amnesty');

    expect(api.unmuteAccount).toHaveBeenCalledTimes(2);
    expect(bulk.job()).toMatchObject({ phase: 'done', changed: 1, failed: 0 });
  });

  it('reports a preview failure instead of pretending there is nothing to do', async () => {
    api.accountListPage.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

    const preview = await bulk.preview('mute-amnesty');

    expect(preview.error).toContain('503');
    expect(preview.targets).toBe(0);
  });

  // ------------------------------------------------------- control + state

  it('refuses to start a second job while one is running', async () => {
    api.accountListPage.mockReturnValue(of({ accounts: [], nextMaxId: null }));
    const first = bulk.start('mute-amnesty');
    await bulk.start('block-amnesty');
    await first;
    expect(bulk.job()?.action).toBe('mute-amnesty');
  });

  it('stops after the in-flight write when cancelled', async () => {
    api.accountListPage
      .mockReturnValueOnce(of({ accounts: [account('1'), account('2')], nextMaxId: null }))
      .mockReturnValue(of({ accounts: [], nextMaxId: null }));
    api.unmuteAccount.mockImplementation(() => {
      bulk.cancel();
      return of({} as Relationship);
    });

    await bulk.start('mute-amnesty');

    expect(api.unmuteAccount).toHaveBeenCalledTimes(1);
    expect(bulk.job()?.phase).toBe('cancelled');
  });

  it('keeps a finished job visible until dismissed, and never drops a running one', async () => {
    api.accountListPage.mockReturnValue(of({ accounts: [], nextMaxId: null }));
    await bulk.start('mute-amnesty');
    expect(bulk.job()).not.toBeNull();
    bulk.dismiss();
    expect(bulk.job()).toBeNull();
  });

  it('builds a Mastodon-compatible CSV backup from the whole list', async () => {
    api.accountListPage
      .mockReturnValueOnce(of({ accounts: [account('1', 'bob@a.test')], nextMaxId: '7' }))
      .mockReturnValueOnce(of({ accounts: [account('2', 'eve@b.test')], nextMaxId: null }));

    const { csv, count } = await bulk.backupCsv('mute-amnesty');

    expect(count).toBe(2);
    expect(csv.split('\n')).toEqual([
      'Account address,Hide notifications',
      'bob@a.test,true',
      'eve@b.test,true',
    ]);
  });

  // -------------------------------------------------------- planning progress

  it('reports counting progress while the plan is being read', async () => {
    // The count is the slow half — hundreds of requests on a big account — and
    // it used to be invisible outside the browser's network tab.
    const seen: { stage: string; accounts: number; apiCalls: number }[] = [];
    api.accountFollowing.mockReturnValueOnce(of([account('1'), account('2')]));
    api.relationships.mockImplementationOnce(() => {
      // Sampled mid-read: the follow page has landed, the relationship check
      // has not, which is exactly the state the dialog needs to describe.
      const progress = bulk.planning();
      if (progress) {
        seen.push({ ...progress });
      }
      return of([relationship('1', false), relationship('2', true)]);
    });

    await bulk.preview('reblogs-on');

    expect(seen[0]).toMatchObject({ stage: 'checking', accounts: 2, apiCalls: 1 });
    // Cleared when the pass ends, so the dialog stops claiming to be busy.
    expect(bulk.planning()).toBeNull();
  });

  it('stopping the count produces no plan rather than a partial one', async () => {
    api.accountFollowing.mockImplementationOnce(() => {
      // The user hits "Stop counting" while the first page is in flight.
      bulk.cancelPlanning();
      return of([account('1'), account('2')]);
    });

    const preview = await bulk.preview('reblogs-on');

    // A partial count presented as the plan would be the worst outcome: a
    // confident total that is really just where the read stopped.
    expect(preview).toMatchObject({ cancelled: true, targets: 0 });
    expect(bulk.planning()).toBeNull();
  });

  it('a cancelled count does not poison the next one', async () => {
    api.accountFollowing.mockImplementationOnce(() => {
      bulk.cancelPlanning();
      return of([account('1')]);
    });
    await bulk.preview('reblogs-on');

    api.accountFollowing.mockReturnValueOnce(of([account('1')]));
    api.relationships.mockReturnValueOnce(of([relationship('1', false)]));
    const second = await bulk.preview('reblogs-on');

    expect(second.cancelled).toBeUndefined();
    expect(second.targets).toBe(1);
  });

  // ----------------------------------------------------------- collections

  it('reads a collection whole instead of paging it, and skips pending members', async () => {
    // A collection comes back from one GET with no cursor, and carries members
    // who have not accepted being listed — following those would act on an
    // invitation they have not answered.
    api.getCollection.mockReturnValueOnce(
      of({
        collection: {
          id: 'C1',
          items: [
            { id: 'i1', state: 'accepted', account_id: '1' },
            { id: 'i2', state: 'accepted', account_id: '2' },
            { id: 'i3', state: 'pending', account_id: '3' },
          ],
        },
        accounts: [account('1'), account('2'), account('3')],
      }),
    );
    api.relationships.mockReturnValueOnce(of([follows('1', false), follows('2', true)]));

    const preview = await bulk.preview('list-follow', {
      listId: 'C1',
      listTitle: 'Good people',
      kind: 'collection',
    });

    expect(preview).toMatchObject({ targets: 1, alreadyCorrect: 1 });
    expect(api.listAccountsPage).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- lists

  it('follows only the list members that are not already followed', async () => {
    api.listAccountsPage.mockReturnValueOnce(
      of({ accounts: [account('1'), account('2'), account('3')], nextMaxId: null }),
    );
    api.relationships.mockReturnValueOnce(
      of([follows('1', false), follows('2', true), follows('3', false)]),
    );

    const preview = await bulk.preview('list-follow', LIST);
    expect(preview).toMatchObject({ targets: 2, alreadyCorrect: 1 });

    await bulk.start('list-follow', LIST);

    expect(api.follow).toHaveBeenCalledTimes(2);
    expect(api.follow).toHaveBeenCalledWith('1');
    expect(api.follow).toHaveBeenCalledWith('3');
    expect(bulk.job()).toMatchObject({ phase: 'done', changed: 2, skipped: 1 });
  });

  it('unfollows only the list members that are actually followed', async () => {
    api.listAccountsPage.mockReturnValueOnce(
      of({ accounts: [account('1'), account('2')], nextMaxId: null }),
    );
    api.relationships.mockReturnValueOnce(of([follows('1', true), follows('2', false)]));

    const preview = await bulk.preview('list-unfollow', LIST);
    expect(preview).toMatchObject({ targets: 1, alreadyCorrect: 1 });

    await bulk.start('list-unfollow', LIST);

    expect(api.unfollow).toHaveBeenCalledExactlyOnceWith('1');
  });

  it('treats a pending follow request as followed, so it is not re-sent', async () => {
    api.listAccountsPage.mockReturnValue(of({ accounts: [account('1')], nextMaxId: null }));
    api.relationships.mockReturnValue(of([follows('1', false, true)]));

    expect((await bulk.preview('list-follow', LIST)).targets).toBe(0);
    // ...but withdrawing it is real work.
    expect((await bulk.preview('list-unfollow', LIST)).targets).toBe(1);
  });

  it('reads every page of a long list', async () => {
    api.listAccountsPage
      .mockReturnValueOnce(of({ accounts: [account('1')], nextMaxId: '30' }))
      .mockReturnValueOnce(of({ accounts: [account('2')], nextMaxId: null }));
    api.relationships.mockImplementation((ids: string[]) =>
      of(ids.map((id) => follows(id, false))),
    );

    expect((await bulk.preview('list-follow', LIST)).targets).toBe(2);
    expect(api.listAccountsPage).toHaveBeenLastCalledWith('7', '30', 80);
  });

  it('records the list name on the job so the progress panel can show it', async () => {
    api.listAccountsPage.mockReturnValue(of({ accounts: [], nextMaxId: null }));
    await bulk.start('list-follow', LIST);
    expect(bulk.job()?.targetLabel).toBe('Rocketry');
  });

  it('refuses a list action with no list rather than acting on the wrong one', async () => {
    expect((await bulk.preview('list-follow')).error).toBeTruthy();
    await bulk.start('list-unfollow');
    expect(bulk.job()).toMatchObject({ phase: 'failed' });
    expect(api.unfollow).not.toHaveBeenCalled();
  });

  it('does not reuse a plan built for a different list', async () => {
    api.listAccountsPage.mockReturnValueOnce(of({ accounts: [account('1')], nextMaxId: null }));
    api.relationships.mockReturnValue(of([follows('1', false)]));
    await bulk.preview('list-follow', LIST);

    // Same action, different list: the plan must be re-derived from that list.
    api.listAccountsPage.mockReturnValueOnce(
      of({ accounts: [account('9'), account('8')], nextMaxId: null }),
    );
    api.relationships.mockReturnValueOnce(of([follows('9', false), follows('8', false)]));
    await bulk.start('list-follow', { listId: '99', listTitle: 'Other' });

    expect(api.follow).toHaveBeenCalledTimes(2);
    expect(api.follow).toHaveBeenCalledWith('9');
    expect(api.follow).not.toHaveBeenCalledWith('1');
  });

  it('reports no percentage until the total is known', async () => {
    expect(bulk.percent()).toBeNull();
    expect(bulk.etaMs()).toBeNull();
  });
});
