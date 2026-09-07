import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { FollowState } from '../../follow-state';
import { ImportFollows } from '../../import-follows';
import { Account, CollectionItem, CollectionWithAccounts, Status } from '../../models';
import {
  AnonymousFollows,
  ANONYMOUS_FOLLOW_LIMIT,
} from '../../providers/anonymous/anonymous-follows';
import { SHIPPED_STARTER_KITS } from '../../starter-kits';
import { CollectionPage } from './collection';

/** Exposes CollectionPage's protected members for white-box testing. */
interface CollectionInternals {
  data: WritableSignal<CollectionWithAccounts | null>;
  loading: WritableSignal<boolean>;
  error: WritableSignal<string>;
  tab: WritableSignal<'feed' | 'members'>;
  feed: WritableSignal<Status[]>;
  query: WritableSignal<string>;
  results: WritableSignal<Account[]>;
  members(): { itemId: string; state: string; account: Account }[];
  curator(): Account | null;
  isOwner(): boolean;
  myItem(): { itemId: string; account: Account } | null;
  setTab(tab: 'feed' | 'members'): void;
  addMember(a: Account): void;
  removeMember(m: { itemId: string }): void;
  revokeSelf(): void;
  remove(): void;
  search(): void;
  sampled: WritableSignal<boolean>;
  setSampleSize(value: string): void;
  loadSample(): void;
}

function internals(fixture: ComponentFixture<CollectionPage>): CollectionInternals {
  return fixture.componentInstance as unknown as CollectionInternals;
}

function makeAccount(id: string): Account {
  return { id, username: `u${id}`, acct: `u${id}`, display_name: `User ${id}` } as Account;
}

function makeItem(
  id: string,
  accountId: string | null,
  state: 'pending' | 'accepted',
): CollectionItem {
  return { id, account_id: accountId, state, created_at: '2026-01-01T00:00:00Z' };
}

function makeStatus(id: string, createdAt: string, accountId: string): Status {
  return {
    id,
    created_at: createdAt,
    edited_at: null,
    content: `<p>${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: makeAccount(accountId) as never,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  } as Status;
}

const OWNER = 'O';
const ACCEPTED = 'A';
const PENDING = 'P';

/**
 * A CollectionWithAccounts fixture: owner O, accepted member A, pending member P.
 * The owner is included in `accounts` (curator lookup) but is not itself an item.
 */
function makeCollection(id = 'C1'): CollectionWithAccounts {
  return {
    collection: {
      id,
      account_id: OWNER,
      name: 'Cool People',
      description: 'A curated set',
      discoverable: true,
      sensitive: false,
      local: true,
      item_count: 2,
      items: [makeItem('I-A', ACCEPTED, 'accepted'), makeItem('I-P', PENDING, 'pending')],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      uri: `https://example.social/collections/${id}`,
    },
    accounts: [makeAccount(OWNER), makeAccount(ACCEPTED), makeAccount(PENDING)],
  };
}

describe('CollectionPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // Override the route BEFORE any test injects a service (which would
    // instantiate the module and forbid further overrides).
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: 'C1' })) },
    });
  });

  afterEach(() => {
    // Loading a collection now also resolves follow state for its members, so
    // each row can offer Follow and say who you already follow. No test here
    // asserts on that, so settle it rather than repeating a flush everywhere.
    httpMock
      .match((req) => req.url.includes('/api/v1/accounts/relationships'))
      .forEach((req) => req.flush([]));
    httpMock.verify();
    // Reset the root Auth signal so cross-test owner state doesn't leak.
    TestBed.inject(Auth).account.set(null);
    // The follow cache is a root service; a verdict from one test must not
    // decide what the next test's buttons say.
    TestBed.inject(FollowState).reset();
  });

  /** Create the component (route id 'C1', overridden in beforeEach). */
  function setUp(): ComponentFixture<CollectionPage> {
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CollectionPage);
    fixture.detectChanges();
    return fixture;
  }

  /** Flush the initial GET and the (default feed tab) per-member statuses. */
  function flushLoad(
    fixture: ComponentFixture<CollectionPage>,
    data = makeCollection(),
    statuses: Record<string, Status[]> = {},
  ): void {
    httpMock.expectOne(`/api/v1/collections/${data.collection.id}`).flush(data);
    // Default tab is feed → one statuses request per *accepted* member.
    for (const m of internals(fixture)
      .members()
      .filter((x) => x.state === 'accepted')) {
      httpMock
        .expectOne((r) => r.url === `/api/v1/accounts/${m.account.id}/statuses`)
        .flush(statuses[m.account.id] ?? []);
    }
  }

  // ---------------------------------------------------------------- initial load

  it('loads the collection and clears loading; computes curator and members', () => {
    const fixture = setUp();
    expect(internals(fixture).loading()).toBe(true);

    flushLoad(fixture);

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).curator()?.id).toBe(OWNER);
    const members = internals(fixture).members();
    expect(members.map((m) => m.account.id)).toEqual([ACCEPTED, PENDING]);
    expect(members.find((m) => m.account.id === PENDING)?.state).toBe('pending');
  });

  it('shows a support message and does not crash on 404', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/collections/C1')
      .flush('', { status: 404, statusText: 'Not Found' });

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).error()).toContain('not support collections');
    expect(internals(fixture).data()).toBeNull();
  });

  it('opens a shipped collection preview without asking the selected home server', () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });

    const fixture = setUp();

    httpMock.expectNone(`/api/v1/collections/${kit.id}`);
    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).tab()).toBe('members');
    expect(internals(fixture).members()).toHaveLength(kit.itemCount);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(kit.title);
    const tabs = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent?.trim(),
    );
    expect(tabs).toEqual(['Collection', 'Posts']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.sample-box')).toBeNull();
  });

  /**
   * The gap this closes: a bundled *starter kit* has always offered anonymous
   * one-click follow-everyone, while the bundled *collections* — the same kind
   * of snapshot, carrying the same resolved accounts — offered nothing. The
   * server-side bulk runner cannot do it (a kit's ids are foreign), so this goes
   * through ImportFollows, which writes browser-local rows.
   */
  it('lets an anonymous visitor follow everyone in a bundled collection', async () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');

    const fixture = setUp();
    // Component-scoped provider: this page has its own importer.
    const importer = fixture.debugElement.injector.get(ImportFollows);
    importer.delayMs = 0;

    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.includes('Follow everyone in this collection'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    await vi.waitFor(() => expect(importer.running()).toBe(false));
    fixture.detectChanges();

    // The snapshot carries resolved accounts, so nothing is searched for.
    expect(TestBed.inject(AnonymousFollows).count()).toBe(
      Math.min(kit.itemCount, ANONYMOUS_FOLLOW_LIMIT),
    );
    httpMock.expectNone((request) => request.url.includes('/api/v2/search'));
  });

  // A preview used to link its members straight to the origin instance, which
  // dropped the reader out of Mawkingbird. They resolve in-app now, the way the
  // collection widget on Home already did.
  it('keeps shipped-collection member links inside the app', () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });

    const fixture = setUp();
    const links = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('a.member-link'),
    ] as HTMLAnchorElement[];

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('/accounts')).toBe(true);
      expect(href).not.toContain('https://');
    }
  });

  // Names alone say little about whether you want these people. Sampling costs
  // one request per member, so nothing loads until it is asked for.
  /**
   * The Posts tab used to open on a size dropdown and a "Show me posts" button
   * where a reader expected a preview. The page's own argument — that a list of
   * names says little about whether you want these people — is a reason to load
   * a *small* sample by default, not none. Three, spent on their behalf; the
   * controls still gate anything larger.
   */
  it('shows a few posts on the Posts tab without being asked', () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });

    const fixture = setUp();

    // Nothing is spent until the reader actually opens Posts.
    expect(internals(fixture).sampled()).toBe(false);
    httpMock.expectNone((r) => r.url.includes('/statuses'));

    internals(fixture).setTab('feed');
    fixture.detectChanges();

    const requests = httpMock.match((r) => r.url.includes('/statuses'));
    expect(requests.length).toBe(3);
    // Each goes to the member's *own* instance. Asking the home server for an
    // id it has never seen is a guaranteed 404 and an empty sample.
    for (const request of requests) {
      expect(request.request.url).toMatch(/^https:\/\//);
    }
    requests.forEach((r) => r.flush([]));
    expect(internals(fixture).sampled()).toBe(true);
    // The controls survive, for a reader who wants more than the preview.
    expect((fixture.nativeElement as HTMLElement).querySelector('.sample-box')).not.toBeNull();
  });

  it('does not spend the requests twice when the reader flips tabs', () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });

    const fixture = setUp();
    internals(fixture).setTab('feed');
    httpMock.match((r) => r.url.includes('/statuses')).forEach((r) => r.flush([]));

    internals(fixture).setTab('members');
    internals(fixture).setTab('feed');

    httpMock.expectNone((r) => r.url.includes('/statuses'));
  });

  /**
   * A sampled post must be able to open its thread. The failure mode this locks
   * out is silent: `threadLink` goes null when `providerRef` is missing any of
   * server/statusId/accountId, and a null link makes the card inert — no error,
   * no navigation, nothing to see. Reported as "clicking the post does nothing".
   */
  it('gives sampled posts everything the thread route needs', () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });

    const fixture = setUp();
    internals(fixture).loadSample();

    const requests = httpMock.match((r) => r.url.includes('/statuses'));
    requests.forEach((r, i) =>
      r.flush(
        i === 0
          ? [
              {
                id: '110',
                created_at: '2026-06-01T00:00:00Z',
                content: 'hi',
                account: { id: 'acc-1', username: 'a', acct: 'a', display_name: 'A' },
                media_attachments: [],
                replies_count: 0,
                reblogs_count: 0,
                favourites_count: 0,
              },
            ]
          : [],
      ),
    );

    const [post] = internals(fixture).feed();
    expect(post.provider).toBe('anonymous-mastodon');
    // All three, because anonymousRef refuses a partial ref and threadLink
    // refuses a missing anonymousRef.
    expect(post.providerRef).toMatchObject({
      server: expect.stringMatching(/^https:\/\//),
      statusId: '110',
      accountId: 'acc-1',
    });
  });

  it('honours a larger chosen sample size', () => {
    const kit = SHIPPED_STARTER_KITS[0];
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: kit.id })) },
    });

    const fixture = setUp();
    internals(fixture).setSampleSize('10');
    internals(fixture).loadSample();

    const requests = httpMock.match((r) => r.url.includes('/statuses'));
    expect(requests.length).toBeGreaterThan(5);
    expect(requests.length).toBeLessThanOrEqual(10);
    requests.forEach((r) => r.flush([]));
  });

  // ---------------------------------------------------------------- feed synthesis

  it('synthesizes the feed from accepted members only, sorted desc and capped', () => {
    const fixture = setUp();
    const older = makeStatus('s1', '2026-01-01T00:00:00Z', ACCEPTED);
    const newer = makeStatus('s2', '2026-06-01T00:00:00Z', ACCEPTED);
    // Only A is accepted, so exactly one statuses request (not P, not O).
    flushLoad(fixture, makeCollection(), { [ACCEPTED]: [older, newer] });

    const feed = internals(fixture).feed();
    expect(feed.map((s) => s.id)).toEqual(['s2', 's1']); // newest first
  });

  it('a per-member statuses error contributes [] without killing the feed', () => {
    const data = {
      ...makeCollection(),
    };
    // Two accepted members so we can error one and keep the other.
    data.collection = {
      ...data.collection,
      items: [makeItem('I-A', ACCEPTED, 'accepted'), makeItem('I-B', 'B', 'accepted')],
    };
    data.accounts = [makeAccount(OWNER), makeAccount(ACCEPTED), makeAccount('B')];

    const fixture = setUp();
    httpMock.expectOne('/api/v1/collections/C1').flush(data);
    httpMock
      .expectOne((r) => r.url === `/api/v1/accounts/${ACCEPTED}/statuses`)
      .flush([makeStatus('ok', '2026-01-01T00:00:00Z', ACCEPTED)]);
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/B/statuses')
      .flush('', { status: 500, statusText: 'Error' });

    expect(
      internals(fixture)
        .feed()
        .map((s) => s.id),
    ).toEqual(['ok']);
  });

  it('does not refetch the feed when switching members -> feed again', () => {
    const fixture = setUp();
    flushLoad(fixture, makeCollection(), { [ACCEPTED]: [] });

    internals(fixture).setTab('members');
    internals(fixture).setTab('feed');

    // No new statuses request for the accepted member (feedLoadedFor guard).
    httpMock.expectNone((r) => r.url === `/api/v1/accounts/${ACCEPTED}/statuses`);
  });

  // ---------------------------------------------------------------- owner actions

  it('isOwner is true for the curator, and remove() DELETEs then navigates to /feeds', () => {
    TestBed.inject(Auth).account.set(makeAccount(OWNER));
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = setUp();
    flushLoad(fixture);
    expect(internals(fixture).isOwner()).toBe(true);

    internals(fixture).remove();
    httpMock.expectOne('/api/v1/collections/C1').flush({});

    expect(nav).toHaveBeenCalledWith(['/feeds']);
  });

  it('addMember POSTs /items then re-fetches the collection', () => {
    TestBed.inject(Auth).account.set(makeAccount(OWNER));
    const fixture = setUp();
    flushLoad(fixture);

    internals(fixture).addMember(makeAccount('Z'));

    const post = httpMock.expectOne('/api/v1/collections/C1/items');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ account_id: 'Z' });
    post.flush({ collection_item: makeItem('I-Z', 'Z', 'pending') });

    // Re-fetch (load) fires the collection GET + feed again.
    flushLoad(fixture);
    expect(internals(fixture).data()).not.toBeNull();
  });

  it('removeMember DELETEs /items/:itemId then re-fetches', () => {
    TestBed.inject(Auth).account.set(makeAccount(OWNER));
    const fixture = setUp();
    flushLoad(fixture);

    const accepted = internals(fixture)
      .members()
      .find((m) => m.state === 'accepted')!;
    internals(fixture).removeMember(accepted);

    const del = httpMock.expectOne('/api/v1/collections/C1/items/I-A');
    expect(del.request.method).toBe('DELETE');
    del.flush({});

    flushLoad(fixture);
  });

  // ---------------------------------------------------------------- non-owner

  it('a featured non-owner finds myItem and revokeSelf POSTs .../revoke', () => {
    // Log in as the accepted member A (not the owner).
    TestBed.inject(Auth).account.set(makeAccount(ACCEPTED));
    const fixture = setUp();
    flushLoad(fixture);

    expect(internals(fixture).isOwner()).toBe(false);
    expect(internals(fixture).myItem()?.itemId).toBe('I-A');

    internals(fixture).revokeSelf();
    const post = httpMock.expectOne('/api/v1/collections/C1/items/I-A/revoke');
    expect(post.request.method).toBe('POST');
    post.flush({});

    flushLoad(fixture);
  });

  // ---------------------------------------------------------------- add-member search

  it('search() GETs /api/v2/search for accounts', () => {
    TestBed.inject(Auth).account.set(makeAccount(OWNER));
    const fixture = setUp();
    flushLoad(fixture);

    internals(fixture).query.set('alice');
    internals(fixture).search();

    const req = httpMock.expectOne((r) => r.url === '/api/v2/search');
    expect(req.request.params.get('type')).toBe('accounts');
    req.flush({ accounts: [makeAccount('Z')], statuses: [], hashtags: [] });

    expect(
      internals(fixture)
        .results()
        .map((a) => a.id),
    ).toEqual(['Z']);
  });
});
