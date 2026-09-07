import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../models';
import { Auth } from '../../../auth';
import {
  ANONYMOUS_FOLLOW_LIMIT,
  AnonymousFollows,
} from '../../../providers/anonymous/anonymous-follows';
import { AnonymousLists } from '../../../providers/anonymous/anonymous-lists';
import { CopyAccountDialog } from './copy-account-dialog';

const DAY = 24 * 60 * 60 * 1000;

function account(id: string, over: Partial<Account> = {}): Account {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}@example.social`,
    display_name: `User ${id}`,
    note: '',
    url: `https://example.social/@user${id}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 100,
    following_count: 100,
    statuses_count: 900,
    last_status_at: new Date(Date.now() - DAY).toISOString(),
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

/** Dormant for over a year — the common case in a real follow list. */
function dormant(id: string): Account {
  return account(id, { last_status_at: new Date(Date.now() - 400 * DAY).toISOString() });
}

describe('CopyAccountDialog', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
  });

  function open(target = account('900')): ComponentFixture<CopyAccountDialog> {
    const fixture = TestBed.createComponent(CopyAccountDialog);
    fixture.componentRef.setInput('account', target);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Wait for the next request whose URL contains `fragment`, and hand it back.
   *
   * `match` both finds and *consumes*, so the request has to be captured inside the
   * poll rather than looked up again afterwards.
   */
  async function nextRequest(fragment: string) {
    let found!: ReturnType<HttpTestingController['match']>[number];
    await vi.waitFor(() => {
      const matches = httpMock.match((r) => r.url.includes(fragment));
      expect(matches.length).toBeGreaterThan(0);
      found = matches[0];
    });
    return found;
  }

  const nextFollowingRequest = () => nextRequest('/following');

  /**
   * Answer the canonical lookup that now precedes the walk.
   *
   * The dialog resolves the account on its *own* server first, because a relay only
   * returns the slice of the follow graph it happens to have federated.
   */
  async function flushLookup(homeId = 'home-900'): Promise<void> {
    (await nextRequest('/accounts/lookup')).flush({ ...account('900'), id: homeId });
  }

  /**
   * Flush the next `/following` page (after the lookup).
   *
   * Also settles the collections read that fires once the follows resolve, so the
   * tests below — which are about the follows half — do not each have to know that
   * the collections half exists. Tests that *are* about collections open with
   * {@link openWithCollections} instead.
   */
  async function flushPage(page: Account[]): Promise<void> {
    (await nextFollowingRequest()).flush(page);
    await settleCollections();
  }

  /**
   * Answer the collections read that runs *alongside* the confirm screen.
   *
   * Deliberately not awaited by the follows path — collections are the bonus half
   * and must never hold up the follows the user actually clicked for. The confirm
   * button is held only for as long as this is in flight, so a test asserting on
   * that button has to settle it first.
   */
  async function flushCollections(collections: unknown[] = []): Promise<void> {
    (await nextRequest('accounts/home-900/collections')).flush({ collections });
  }

  /**
   * Settle the collections read if one is pending, without requiring every existing
   * follows test to know it exists. Tests that care about collections call
   * {@link flushCollections} explicitly with a payload.
   */
  async function settleCollections(): Promise<void> {
    // Collections fire once, after the *last* follows page, so a multi-page test
    // calls this on a page where nothing is pending yet. Absence is fine; the goal
    // is only that nothing is left in flight by the time an assertion runs.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pending = httpMock.match((r) => r.url.includes('/collections'));
      if (pending.length) {
        pending.forEach((request) => request.flush({ collections: [] }));
        return;
      }
      await Promise.resolve();
    }
  }

  function text(fixture: ComponentFixture<CopyAccountDialog>): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function clickButton(fixture: ComponentFixture<CopyAccountDialog>, label: string): void {
    fixture.detectChanges();
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes(label))!
      .click();
  }

  it('lists who it will follow and what it filtered, before following anything', async () => {
    const fixture = open();
    await flushLookup();
    await flushPage([account('1'), dormant('2'), account('3')]);

    const body = text(fixture);
    expect(body).toContain('Follow 2 accounts');
    expect(body).toContain('1 skipped');
    // Nothing has happened yet — this is a confirm step, not a report.
    expect(TestBed.inject(AnonymousFollows).count()).toBe(0);
  });

  it('follows locally on confirm, with no write requests at all', async () => {
    // The safety property, asserted at the HTTP boundary: an anonymous clone is
    // localStorage writes, never POST /follow.
    const fixture = open();
    await flushLookup();
    await flushPage([account('1'), account('2')]);

    clickButton(fixture, 'Follow 2');
    await vi.waitFor(() => expect(text(fixture)).toContain('Followed 2 accounts'));

    expect(TestBed.inject(AnonymousFollows).count()).toBe(2);
    httpMock.expectNone((r) => r.method === 'POST');
  });

  it('emits how many it followed', async () => {
    const fixture = open();
    const cloned: number[] = [];
    fixture.componentInstance.cloned.subscribe((n) => cloned.push(n));
    await flushLookup();
    await flushPage([account('1')]);

    clickButton(fixture, 'Follow 1');
    await vi.waitFor(() => expect(cloned).toEqual([1]));
  });

  it('pages when the quality gate ate most of a full page', async () => {
    const fixture = open();
    await flushLookup();
    // 80 back, 79 dormant: one keeper, so it must ask for more.
    await flushPage([...Array.from({ length: 79 }, (_, i) => dormant(`d${i}`)), account('keep')]);
    await flushPage([account('good1'), account('good2')]);

    expect(text(fixture)).toContain('Follow 3 accounts');
  });

  it('stops paging when a short page proves there is no more', async () => {
    const fixture = open();
    await flushLookup();
    await flushPage([account('1')]);

    await vi.waitFor(() => expect(text(fixture)).toContain('Follow 1 account'));
    httpMock.expectNone((r) => r.url.includes('/following'));
  });

  it('says so when everything was filtered out, rather than showing an empty list', async () => {
    const fixture = open();
    await flushLookup();
    await flushPage([dormant('1'), dormant('2')]);

    expect(text(fixture)).toContain('look active enough');
  });

  it('respects the follow cap and says how many slots are left', async () => {
    const follows = TestBed.inject(AnonymousFollows);
    for (let i = 0; i < ANONYMOUS_FOLLOW_LIMIT - 3; i += 1) {
      follows.follow(account(`existing${i}`), 'https://mastodon.social');
    }
    const fixture = open();
    await flushLookup();
    await flushPage(Array.from({ length: 20 }, (_, i) => account(`new${i}`)));

    const body = text(fixture);
    expect(body).toContain('Follow 3');
    expect(body).toContain('3 of 50 follow slots left');
  });

  it('surfaces a failed load instead of an empty confirm screen', async () => {
    const fixture = open();
    await flushLookup();
    (await nextFollowingRequest()).flush('', { status: 500, statusText: 'Server Error' });

    await vi.waitFor(() => expect(text(fixture)).toContain("Couldn't load"));
  });

  it('closes on cancel without following anyone', async () => {
    const fixture = open();
    const closed: unknown[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(true));
    await flushLookup();
    await flushPage([account('1')]);

    clickButton(fixture, 'Cancel');

    expect(closed).toHaveLength(1);
    expect(TestBed.inject(AnonymousFollows).count()).toBe(0);
  });

  /**
   * The collections half of "Copy account".
   *
   * Two properties are load-bearing and easy to regress: collections must never
   * delay or break the follows the user actually clicked for, and a copied list
   * must account for every member it dropped.
   */
  describe('collections as local lists', () => {
    function collection(id: string, name: string, itemCount = 3) {
      return { id, name, item_count: itemCount, account_id: 'home-900' };
    }

    /** Reach the confirm screen with the follows settled but collections still open. */
    async function openWithFollows(): Promise<ComponentFixture<CopyAccountDialog>> {
      const fixture = open();
      await flushLookup();
      (await nextFollowingRequest()).flush([account('1')]);
      return fixture;
    }

    it('copies a collection into a local list, with its members followed', async () => {
      const fixture = await openWithFollows();
      await flushCollections([collection('c1', 'Reading list')]);
      (await nextRequest('/collections/c1')).flush({
        collection: collection('c1', 'Reading list'),
        accounts: [account('m1'), account('m2')],
      });

      await vi.waitFor(() => expect(text(fixture)).toContain('Reading list'));
      clickButton(fixture, 'Copy');
      await vi.waitFor(() => expect(text(fixture)).toContain('local list'));

      const lists = TestBed.inject(AnonymousLists).lists();
      expect(lists).toHaveLength(1);
      expect(lists[0].title).toBe('Reading list');
      expect(lists[0].memberKeys).toHaveLength(2);
      // A list member is a follow — that is how its timeline gets built.
      expect(TestBed.inject(AnonymousFollows).count()).toBe(3);
      httpMock.expectNone((r) => r.method === 'POST');
    });

    it('accounts for filtered members so a thin list is never unexplained', async () => {
      const fixture = await openWithFollows();
      await flushCollections([collection('c1', 'Quiet folks')]);
      (await nextRequest('/collections/c1')).flush({
        collection: collection('c1', 'Quiet folks'),
        accounts: [account('m1'), dormant('m2'), dormant('m3')],
      });

      await vi.waitFor(() => expect(text(fixture)).toContain('Quiet folks'));
      expect(text(fixture)).toContain('1 of 3');
      expect(text(fixture)).toContain('2 too quiet');
    });

    it('still offers the follows when the server has no collections endpoint', async () => {
      const fixture = await openWithFollows();
      (await nextRequest('accounts/home-900/collections')).flush('', {
        status: 404,
        statusText: 'Not Found',
      });

      // A pre-4.6 server is not a failure — the follows are the feature.
      await vi.waitFor(() => expect(text(fixture)).not.toContain('Checking for collections'));
      expect(text(fixture)).toContain('Follow 1');
      // No collections section at all, rather than an empty one.
      expect((fixture.nativeElement as HTMLElement).querySelector('.cf-collections')).toBeNull();
    });

    it('does not create an empty list when every member was filtered out', async () => {
      const fixture = await openWithFollows();
      await flushCollections([collection('c1', 'All dormant')]);
      (await nextRequest('/collections/c1')).flush({
        collection: collection('c1', 'All dormant'),
        accounts: [dormant('m1'), dormant('m2')],
      });

      // Wait for the read to finish, or the confirm button is still held.
      await vi.waitFor(() => expect(text(fixture)).not.toContain('Checking for collections'));
      clickButton(fixture, 'Follow 1');
      await vi.waitFor(() => expect(text(fixture)).toContain('Followed'));
      expect(TestBed.inject(AnonymousLists).lists()).toHaveLength(0);
    });

    it('holds the confirm button until collections have been read', async () => {
      const fixture = await openWithFollows();
      await vi.waitFor(() => expect(text(fixture)).toContain('Checking for collections'));

      const button = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
      ).find((b) => b.textContent?.includes('Follow 1'));
      // Confirming mid-read would copy the follows and silently drop the lists.
      expect(button?.disabled).toBe(true);
    });
  });
});

describe('CopyAccountDialog — where the follow list comes from', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://relay.example');
  });

  /**
   * Inputs must be set before the first `detectChanges`: the load starts in
   * `ngOnInit`, so a `publicRef` applied afterwards arrives too late to be used.
   */
  function open(
    target: Account,
    publicRef: { server: string; id: string } | null = null,
  ): ComponentFixture<CopyAccountDialog> {
    const fixture = TestBed.createComponent(CopyAccountDialog);
    fixture.componentRef.setInput('account', target);
    fixture.componentRef.setInput('publicRef', publicRef);
    fixture.detectChanges();
    return fixture;
  }

  async function next(fragment: string) {
    let found!: ReturnType<HttpTestingController['match']>[number];
    await vi.waitFor(() => {
      const matches = httpMock.match((r) => r.url.includes(fragment));
      expect(matches.length).toBeGreaterThan(0);
      found = matches[0];
    });
    return found;
  }

  function body(fixture: ComponentFixture<CopyAccountDialog>): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  const remote = account('900', { url: 'https://kolectiva.social/@admin', username: 'admin' });

  it("reads the account's own server, not the one we happen to be browsing", async () => {
    // The reported bug: browsing via a relay returned only the follows that relay
    // had federated — 5 of 800 — so the dialog reported almost nothing to follow.
    const fixture = open(remote);

    const lookup = await next('/accounts/lookup');
    expect(lookup.request.url).toContain('kolectiva.social');
    expect(lookup.request.params.get('acct')).toBe('admin');
    lookup.flush({ ...remote, id: 'kol-7' });

    const following = await next('/following');
    expect(following.request.url).toBe('https://kolectiva.social/api/v1/accounts/kol-7/following');
    following.flush([account('1')]);

    await vi.waitFor(() => expect(body(fixture)).toContain('kolectiva.social'));
  });

  it('falls back to the partial view when the home server is unreachable, and says so', async () => {
    const fixture = open(remote, { server: 'https://relay.example', id: 'relay-3' });

    (await next('/accounts/lookup')).error(new ProgressEvent('error'));
    (await next('/following')).flush([account('1')]);

    await vi.waitFor(() => {
      const text = body(fixture);
      expect(text).toContain('only the follows that server knows about');
      expect(text).toContain('relay.example');
    });
  });

  it('reports a private follow list as private, not as "nothing to follow"', async () => {
    // hide_collections: the profile advertises 800 follows and /following is empty.
    const hidden = account('900', {
      url: 'https://kolectiva.social/@admin',
      username: 'admin',
      following_count: 800,
    });
    const fixture = open(hidden);

    (await next('/accounts/lookup')).flush({ ...hidden, id: 'kol-7' });
    (await next('/following')).flush([]);

    await vi.waitFor(() => expect(body(fixture)).toContain("doesn't share who they follow"));
    expect(body(fixture)).not.toContain('Nothing new to follow');
  });

  it('does not claim privacy when the account genuinely follows nobody', async () => {
    const lonely = account('900', {
      url: 'https://kolectiva.social/@admin',
      username: 'admin',
      following_count: 0,
    });
    const fixture = open(lonely);

    (await next('/accounts/lookup')).flush({ ...lonely, id: 'kol-7' });
    (await next('/following')).flush([]);

    await vi.waitFor(() => expect(body(fixture)).toContain('Nothing new to follow'));
    expect(body(fixture)).not.toContain("doesn't share who they follow");
  });
});
