import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account, Status } from '../../models';
import { BlueskySearchPanel } from './bluesky-search-panel';
import { BlueskySearch, BlueskySearchPage } from '../../providers/bluesky/bluesky-search';
import {
  BlueskyAccountPage,
  BlueskyAccountSearch,
} from '../../providers/bluesky/bluesky-account-search';
import { FacetKind } from './search-refine';
import { BlueskyAccountFacetKind, BlueskyPostFacetKind } from './bluesky-refine';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { BskyRef, BskyTimeline } from '../../providers/bluesky/bluesky-types';

function makeAccount(acct: string, over: Partial<Account> = {}): Account {
  return {
    id: `bsky:${acct}`,
    username: acct,
    acct,
    display_name: acct,
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...over,
  } as Account;
}

function makeStatus(id: string, acct = 'alice.bsky.social', over: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-08-01T12:00:00.000Z',
    content: `<p>post ${id}</p>`,
    account: makeAccount(acct),
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    sensitive: false,
    spoiler_text: '',
    visibility: 'public',
    language: 'en',
    in_reply_to_id: null,
    ...over,
  } as unknown as Status;
}

/** Exposes the panel's protected members for white-box testing. */
interface PanelInternals {
  criteria: WritableSignal<{ text: string; sort?: string }>;
  statuses(): Status[];
  visible(): Status[];
  callsUsed(): number;
  apiBudget: WritableSignal<number>;
  setBudget(value: number): void;
  canLoadMore(): boolean;
  exhausted(): boolean;
  grouping: WritableSignal<'none' | 'author' | 'date'>;
  groups(): { key: string; label: string; statuses: Status[] }[];
  collapseRepeats: WritableSignal<boolean>;
  repeatsHidden(): number;
  excludedCount(): number;
  excludedAuthors(): ReadonlySet<string>;
  toggleExcludedAuthor(acct: string): void;
  isAuthorExcluded(acct: string): boolean;
  toggleFacet(kind: FacetKind, value: string): void;
  isFacetSelected(kind: FacetKind, value: string): boolean;
  loadedFilter: WritableSignal<string>;
  clearRefinements(): void;
  runQuery(): void;
  loadMore(): void;
  // Sprint: account facets + Bluesky-only post filters.
  togglePostFacet(kind: BlueskyPostFacetKind, value: string): void;
  isPostFacetSelected(kind: BlueskyPostFacetKind, value: string): boolean;
  toggleAccountFacet(kind: BlueskyAccountFacetKind, value: string): void;
  postFacets(): { kind: BlueskyPostFacetKind }[];
  accountFacets(): { kind: BlueskyAccountFacetKind }[];
  visibleAccounts(): { account: Account }[];
  accounts(): { account: Account }[];
  setEngagementBound(key: 'minLikes' | 'minReposts' | 'minReplies', raw: string): void;
  setAccountBound(key: 'followers' | 'following' | 'posts', end: 'min' | 'max', raw: string): void;
  accountBound(key: 'followers' | 'following' | 'posts', end: 'min' | 'max'): number | null;
  hasRefinements(): boolean;
  statusSorts: { value: string; label: string }[];
  canScanActivity(): boolean;
  activityScanSize(): number;
  scanActivity(): void;
  accountsMissingActivity(): { account: Account }[];
  scanCallsUsed(): number;
  hasActivityFacet(): boolean;
}

function internals(fixture: ComponentFixture<BlueskySearchPanel>): PanelInternals {
  return fixture.componentInstance as unknown as PanelInternals;
}

describe('BlueskySearchPanel', () => {
  /** Pages the stubbed post search will hand back, in order. */
  let postPages: BlueskySearchPage[];
  let accountPages: BlueskyAccountPage[];
  let postCalls: number;
  let accountCalls: number;
  /** did → last-post timestamp, or 'error' to make that lookup fail. */
  let authorFeeds: Record<string, string>;
  let authorFeedCalls: string[];

  beforeEach(() => {
    localStorage.clear();
    postCalls = 0;
    accountCalls = 0;
    postPages = [];
    accountPages = [];

    const postSearch = {
      search: (): Observable<BlueskySearchPage> => {
        const page = postPages[postCalls] ?? { statuses: [], cursor: null };
        postCalls += 1;
        return of(page);
      },
    };
    const accountSearch = {
      search: (): Observable<BlueskyAccountPage> => {
        const page = accountPages[accountCalls] ?? { results: [], cursor: null };
        accountCalls += 1;
        return of(page);
      },
    };

    // The activity scan's transport: one author feed per account. Keyed by the
    // bare did so a test can give different accounts different last-post dates,
    // and record every actor asked about so the cap can be asserted.
    authorFeeds = {};
    authorFeedCalls = [];
    const api = {
      getAuthorFeed: (actor: string): Observable<BskyTimeline> => {
        authorFeedCalls.push(actor);
        const when = authorFeeds[actor];
        if (when === 'error') {
          return throwError(() => new Error('nope'));
        }
        return of(
          when
            ? { feed: [{ post: { record: { createdAt: when }, indexedAt: when } }] }
            : { feed: [] },
        ) as Observable<BskyTimeline>;
      },
    };

    TestBed.configureTestingModule({
      imports: [BlueskySearchPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: BlueskySearch, useValue: postSearch },
        { provide: BlueskyAccountSearch, useValue: accountSearch },
        { provide: BlueskyApi, useValue: api },
      ],
    });
  });

  for (const target of ['accounts', 'statuses'] as const) {
    it(`hides the Bluesky ${target} rail without results unless Advanced is opened`, () => {
      const fixture = setUp(target);
      const rail = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '.search-form-box',
      )!;
      expect(rail.hidden).toBe(true);
      expect(fixture.componentInstance.twoBox()).toBe(false);
      internals(fixture).runQuery();
      fixture.detectChanges();
      expect(rail.hidden).toBe(true);
      expect(fixture.componentInstance.twoBox()).toBe(false);
      fixture.componentRef.setInput('advancedOpen', true);
      fixture.detectChanges();
      expect(rail.hidden).toBe(false);
    });

    it(`shows open facets for a single Bluesky ${target} result`, () => {
      postPages = [{ statuses: [makeStatus('1')], cursor: null }];
      accountPages = [
        {
          results: [{ account: makeAccount('alice.bsky.social'), relationship: null }],
          cursor: null,
        },
      ];
      const fixture = setUp(target);
      internals(fixture).apiBudget.set(1);
      internals(fixture).runQuery();
      fixture.detectChanges();
      expect(fixture.componentInstance.twoBox()).toBe(true);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.search-form-box')
          ?.hidden,
      ).toBe(false);
      const facets = (fixture.nativeElement as HTMLElement).querySelector<HTMLDetailsElement>(
        '.search-form-box .refine-facets',
      );
      expect(facets?.open).toBe(true);
      expect(facets!.querySelectorAll('.facet-value').length).toBeGreaterThan(0);
      const summary = facets!.querySelector('summary')!;
      summary.click();
      fixture.detectChanges();
      expect(facets?.open).toBe(false);
      summary.click();
      fixture.detectChanges();
      expect(facets?.open).toBe(true);
    });
  }

  function setUp(target: 'statuses' | 'accounts' = 'statuses') {
    const fixture = TestBed.createComponent(BlueskySearchPanel);
    fixture.componentRef.setInput('target', target);
    fixture.componentRef.setInput('query', 'angular');
    fixture.detectChanges();
    return fixture;
  }

  /** One page of N posts, with a cursor unless it is the last. */
  function page(ids: string[], cursor: string | null, acct?: string): BlueskySearchPage {
    return { statuses: ids.map((id) => makeStatus(id, acct)), cursor };
  }

  describe('API-call budget', () => {
    it('keeps paging until the budget is spent', () => {
      postPages = [page(['1'], 'c1'), page(['2'], 'c2'), page(['3'], 'c3')];
      const fixture = setUp();
      internals(fixture).apiBudget.set(2);

      internals(fixture).runQuery();

      // Two pages pulled eagerly, then it stops — the third cursor is left for
      // the reader's own "Load more".
      expect(postCalls).toBe(2);
      expect(internals(fixture).statuses().length).toBe(2);
      expect(internals(fixture).callsUsed()).toBe(2);
    });

    it('stops early when the server runs out, without spending the budget', () => {
      postPages = [page(['1'], 'c1'), page(['2'], null)];
      const fixture = setUp();
      internals(fixture).apiBudget.set(5);

      internals(fixture).runQuery();

      expect(postCalls).toBe(2);
      expect(internals(fixture).exhausted()).toBe(true);
      expect(internals(fixture).canLoadMore()).toBe(false);
    });

    it('stops when a page brings nothing new, rather than looping on duplicates', () => {
      // A shifting index can hand back the same post under a fresh cursor.
      postPages = [page(['1'], 'c1'), page(['1'], 'c2'), page(['9'], 'c3')];
      const fixture = setUp();
      internals(fixture).apiBudget.set(5);

      internals(fixture).runQuery();

      expect(postCalls).toBe(2);
      expect(internals(fixture).statuses().length).toBe(1);
    });

    it('tops up when the budget is raised after a search', () => {
      postPages = [page(['1'], 'c1'), page(['2'], 'c2'), page(['3'], 'c3')];
      const fixture = setUp();
      internals(fixture).apiBudget.set(1);
      internals(fixture).runQuery();
      expect(postCalls).toBe(1);

      internals(fixture).setBudget(3);

      // Raising it spends the new allowance rather than making the reader
      // re-run the search.
      expect(postCalls).toBe(3);
    });

    it('auto-pages account search too', () => {
      accountPages = [
        { results: [{ account: makeAccount('a'), relationship: null }], cursor: 'c1' },
        { results: [{ account: makeAccount('b'), relationship: null }], cursor: null },
      ] as unknown as BlueskyAccountPage[];
      const fixture = setUp('accounts');
      internals(fixture).apiBudget.set(3);

      internals(fixture).runQuery();

      expect(accountCalls).toBe(2);
    });

    it('resets the call counter for each new search', () => {
      postPages = [page(['1'], null)];
      const fixture = setUp();
      internals(fixture).runQuery();
      expect(internals(fixture).callsUsed()).toBe(1);

      postCalls = 0;
      internals(fixture).runQuery();

      expect(internals(fixture).callsUsed()).toBe(1);
    });
  });

  describe('client-side refinement', () => {
    function loaded(fixture: ComponentFixture<BlueskySearchPanel>, pages: BlueskySearchPage[]) {
      postPages = pages;
      internals(fixture).apiBudget.set(1);
      internals(fixture).runQuery();
    }

    it('groups by author without re-fetching', () => {
      const fixture = setUp();
      loaded(fixture, [
        {
          statuses: [
            makeStatus('1', 'alice.bsky.social'),
            makeStatus('2', 'bob.bsky.social'),
            makeStatus('3', 'alice.bsky.social'),
          ],
          cursor: null,
        },
      ]);
      const callsAfterSearch = postCalls;

      internals(fixture).grouping.set('author');

      const groups = internals(fixture).groups();
      expect(groups.length).toBe(2);
      expect(groups.every((g) => !!g.label)).toBe(true);
      // Grouping reshapes what is loaded; it must never cost a request.
      expect(postCalls).toBe(callsAfterSearch);
    });

    it('excludes a noisy author from the loaded results', () => {
      const fixture = setUp();
      loaded(fixture, [
        {
          statuses: [
            makeStatus('1', 'flooder.bsky.social'),
            makeStatus('2', 'flooder.bsky.social'),
            makeStatus('3', 'quiet.bsky.social'),
          ],
          cursor: null,
        },
      ]);

      internals(fixture).toggleExcludedAuthor('flooder.bsky.social');

      expect(
        internals(fixture)
          .visible()
          .map((s) => s.id),
      ).toEqual(['3']);
      expect(internals(fixture).excludedCount()).toBe(2);
      expect(internals(fixture).isAuthorExcluded('flooder.bsky.social')).toBe(true);
    });

    it('restores an excluded author when toggled back', () => {
      const fixture = setUp();
      loaded(fixture, [
        {
          statuses: [makeStatus('1', 'a.bsky.social'), makeStatus('2', 'b.bsky.social')],
          cursor: null,
        },
      ]);
      internals(fixture).toggleExcludedAuthor('a.bsky.social');
      expect(internals(fixture).visible().length).toBe(1);

      internals(fixture).toggleExcludedAuthor('a.bsky.social');

      expect(internals(fixture).visible().length).toBe(2);
    });

    it('collapses near-identical posts from one author', () => {
      const fixture = setUp();
      const spam = '<p>buy my thing now</p>';
      loaded(fixture, [
        {
          statuses: [
            makeStatus('1', 'flooder.bsky.social', { content: spam }),
            makeStatus('2', 'flooder.bsky.social', { content: spam }),
            makeStatus('3', 'quiet.bsky.social'),
          ],
          cursor: null,
        },
      ]);

      internals(fixture).collapseRepeats.set(true);

      expect(internals(fixture).repeatsHidden()).toBe(1);
      expect(internals(fixture).visible().length).toBe(2);
    });

    it('ORs values within a facet kind and ANDs across kinds', () => {
      const fixture = setUp();
      loaded(fixture, [
        {
          statuses: [
            makeStatus('en-alice', 'alice.bsky.social', { language: 'en' }),
            makeStatus('fr-alice', 'alice.bsky.social', { language: 'fr' }),
            makeStatus('en-bob', 'bob.bsky.social', { language: 'en' }),
          ],
          cursor: null,
        },
      ]);

      internals(fixture).toggleFacet('language', 'en');
      internals(fixture).toggleFacet('language', 'fr');

      // Two languages widen to "either" rather than replacing the first.
      expect(internals(fixture).visible().length).toBe(3);

      internals(fixture).toggleFacet('author', 'alice.bsky.social');

      // A different kind narrows: alice AND (en OR fr).
      expect(
        internals(fixture)
          .visible()
          .map((s) => s.id)
          .sort(),
      ).toEqual(['en-alice', 'fr-alice']);
    });

    it('clears every refinement at once, exclusions included', () => {
      const fixture = setUp();
      loaded(fixture, [
        {
          statuses: [makeStatus('1', 'a.bsky.social'), makeStatus('2', 'b.bsky.social')],
          cursor: null,
        },
      ]);
      internals(fixture).toggleExcludedAuthor('a.bsky.social');
      internals(fixture).loadedFilter.set('nothing matches this');

      internals(fixture).clearRefinements();

      expect(internals(fixture).excludedAuthors().size).toBe(0);
      expect(internals(fixture).visible().length).toBe(2);
    });

    it('drops refinements when a new search runs', () => {
      const fixture = setUp();
      loaded(fixture, [{ statuses: [makeStatus('1', 'a.bsky.social')], cursor: null }]);
      internals(fixture).toggleExcludedAuthor('a.bsky.social');
      internals(fixture).grouping.set('author');

      postCalls = 0;
      internals(fixture).runQuery();

      // Filters describe a result set; a new result set has none of them yet.
      expect(internals(fixture).excludedAuthors().size).toBe(0);
      expect(internals(fixture).grouping()).toBe('none');
    });
  });

  describe('Bluesky-only post filters', () => {
    function loadPosts(fixture: ComponentFixture<BlueskySearchPanel>, statuses: Status[]) {
      postPages = [{ statuses, cursor: null }];
      internals(fixture).apiBudget.set(1);
      internals(fixture).runQuery();
    }

    it('offers engagement, thread and link facets the Mastodon page cannot', () => {
      const fixture = setUp();
      loadPosts(fixture, [
        makeStatus('1', 'a.bsky.social', { favourites_count: 0 }),
        makeStatus('2', 'b.bsky.social', {
          favourites_count: 500,
          providerRef: {
            uri: 'at://2',
            cid: 'c',
            likeUri: null,
            repostUri: null,
            replyRoot: { uri: 'at://root', cid: 'r' },
            replyParentUri: 'at://root',
            externalUri: 'https://github.com/x',
          } satisfies BskyRef,
          provider: 'bluesky',
        } as Partial<Status>),
      ]);

      const kinds = internals(fixture)
        .postFacets()
        .map((f) => f.kind);
      expect(kinds).toContain('likes');
      expect(kinds).toContain('threadPosition');
    });

    it('filters loaded posts by an engagement bucket without a new request', () => {
      const fixture = setUp();
      loadPosts(fixture, [
        makeStatus('1', 'a.bsky.social', { favourites_count: 0 }),
        makeStatus('2', 'b.bsky.social', { favourites_count: 50 }),
      ]);
      const before = postCalls;

      internals(fixture).togglePostFacet('likes', '10-99');

      expect(
        internals(fixture)
          .visible()
          .map((s) => s.id),
      ).toEqual(['2']);
      // The whole point of client-side refinement: no second search.
      expect(postCalls).toBe(before);
    });

    it('applies the minimum-engagement gate as you type, inclusively', () => {
      const fixture = setUp();
      loadPosts(fixture, [
        makeStatus('1', 'a.bsky.social', { favourites_count: 5 }),
        makeStatus('2', 'b.bsky.social', { favourites_count: 10 }),
      ]);

      internals(fixture).setEngagementBound('minLikes', '10');
      expect(
        internals(fixture)
          .visible()
          .map((s) => s.id),
      ).toEqual(['2']);

      // Blank clears the gate rather than reading as zero.
      internals(fixture).setEngagementBound('minLikes', '');
      expect(internals(fixture).visible().length).toBe(2);
    });

    it('ANDs a Bluesky-only facet with a shared one', () => {
      const fixture = setUp();
      loadPosts(fixture, [
        makeStatus('1', 'a.bsky.social', { favourites_count: 50, language: 'en' }),
        makeStatus('2', 'b.bsky.social', { favourites_count: 50, language: 'fr' }),
        makeStatus('3', 'c.bsky.social', { favourites_count: 0, language: 'en' }),
      ]);

      internals(fixture).togglePostFacet('likes', '10-99');
      internals(fixture).toggleFacet('language', 'en');

      expect(
        internals(fixture)
          .visible()
          .map((s) => s.id),
      ).toEqual(['1']);
    });

    it('names the sorts after Bluesky, reusing the shared sort keys', () => {
      const fixture = setUp();
      const sorts = internals(fixture).statusSorts;
      expect(sorts.find((s) => s.value === 'favourites')?.label).toBe(
        'pages.search.sort.mostLiked',
      );
      expect(sorts.find((s) => s.value === 'reblogs')?.label).toBe(
        'pages.search.sort.mostReposted',
      );
    });

    it('clears the new filters along with everything else', () => {
      const fixture = setUp();
      loadPosts(fixture, [makeStatus('1', 'a.bsky.social', { favourites_count: 50 })]);
      internals(fixture).togglePostFacet('likes', '10-99');
      internals(fixture).setEngagementBound('minLikes', '5');
      expect(internals(fixture).hasRefinements()).toBe(true);

      internals(fixture).clearRefinements();

      expect(internals(fixture).hasRefinements()).toBe(false);
      expect(internals(fixture).isPostFacetSelected('likes', '10-99')).toBe(false);
    });
  });

  describe('account refinement', () => {
    function loadAccounts(fixture: ComponentFixture<BlueskySearchPanel>, accounts: Account[]) {
      accountPages = [
        { results: accounts.map((account) => ({ account, relationship: null })), cursor: null },
      ];
      internals(fixture).apiBudget.set(1);
      internals(fixture).runQuery();
    }

    const people = () => [
      makeAccount('alice.bsky.social', { followers_count: 50, statuses_count: 10 }),
      makeAccount('bob.bsky.social', { followers_count: 5_000, statuses_count: 2_000 }),
      makeAccount('mozilla.org', { followers_count: 50_000, statuses_count: 300 }),
    ];

    it('facets loaded accounts by handle type and follower bucket', () => {
      const fixture = setUp('accounts');
      loadAccounts(fixture, people());

      const kinds = internals(fixture)
        .accountFacets()
        .map((f) => f.kind);
      expect(kinds).toContain('handleType');
      expect(kinds).toContain('followers');
      // AT Protocol has no bots or locked accounts, so those never appear.
      expect(kinds).not.toContain('bot');
    });

    it('narrows to custom-domain handles without a new request', () => {
      const fixture = setUp('accounts');
      loadAccounts(fixture, people());
      const before = accountCalls;

      internals(fixture).toggleAccountFacet('handleType', 'custom');

      expect(
        internals(fixture)
          .visibleAccounts()
          .map((r) => r.account.acct),
      ).toEqual(['mozilla.org']);
      expect(accountCalls).toBe(before);
    });

    it('gates accounts by a numeric follower range', () => {
      const fixture = setUp('accounts');
      loadAccounts(fixture, people());

      internals(fixture).setAccountBound('followers', 'min', '1000');
      expect(internals(fixture).visibleAccounts().length).toBe(2);

      internals(fixture).setAccountBound('followers', 'max', '10000');
      expect(
        internals(fixture)
          .visibleAccounts()
          .map((r) => r.account.acct),
      ).toEqual(['bob.bsky.social']);
    });

    it('clearing one end of a range leaves the other in force', () => {
      const fixture = setUp('accounts');
      loadAccounts(fixture, people());
      internals(fixture).setAccountBound('followers', 'min', '1000');
      internals(fixture).setAccountBound('followers', 'max', '10000');

      internals(fixture).setAccountBound('followers', 'max', '');

      expect(internals(fixture).accountBound('followers', 'min')).toBe(1_000);
      expect(internals(fixture).accountBound('followers', 'max')).toBeNull();
      expect(internals(fixture).visibleAccounts().length).toBe(2);
    });

    it('an emptied range stops counting as a refinement', () => {
      const fixture = setUp('accounts');
      loadAccounts(fixture, people());
      internals(fixture).setAccountBound('followers', 'min', '1000');
      expect(internals(fixture).hasRefinements()).toBe(true);

      internals(fixture).setAccountBound('followers', 'min', '');

      expect(internals(fixture).hasRefinements()).toBe(false);
    });
  });

  describe('activity scan', () => {
    function loadAccounts(fixture: ComponentFixture<BlueskySearchPanel>, accounts: Account[]) {
      accountPages = [
        { results: accounts.map((account) => ({ account, relationship: null })), cursor: null },
      ];
      internals(fixture).apiBudget.set(1);
      internals(fixture).runQuery();
    }

    it('is offered only when some loaded account has no known date', () => {
      const fixture = setUp('accounts');
      loadAccounts(fixture, [makeAccount('a.bsky.social')]);

      expect(internals(fixture).canScanActivity()).toBe(true);
      expect(internals(fixture).activityScanSize()).toBe(1);
    });

    it('fills in last-post dates, which brings the activity facet into being', () => {
      const fixture = setUp('accounts');
      // The panel's ids are `bsky:<acct>` here, so the scan strips the prefix.
      authorFeeds = {
        'a.bsky.social': '2026-08-14T09:00:00.000Z',
        'b.bsky.social': '2025-01-01T00:00:00.000Z',
      };
      loadAccounts(fixture, [makeAccount('a.bsky.social'), makeAccount('b.bsky.social')]);
      expect(
        internals(fixture)
          .accountFacets()
          .map((f) => f.kind),
      ).not.toContain('activity');

      internals(fixture).scanActivity();

      expect(internals(fixture).accounts()[0].account.last_status_at).toBe(
        '2026-08-14T09:00:00.000Z',
      );
      expect(
        internals(fixture)
          .accountFacets()
          .map((f) => f.kind),
      ).toContain('activity');
      expect(internals(fixture).canScanActivity()).toBe(false);
    });

    it('reports its cost separately from the paging budget', () => {
      const fixture = setUp('accounts');
      authorFeeds = { 'a.bsky.social': '2026-08-01T00:00:00.000Z' };
      loadAccounts(fixture, [makeAccount('a.bsky.social'), makeAccount('b.bsky.social')]);
      const paging = internals(fixture).callsUsed();

      internals(fixture).scanActivity();

      expect(authorFeedCalls.length).toBe(2);
      expect(internals(fixture).scanCallsUsed()).toBe(2);
      // Folding these into `callsUsed` reported "27 of up to 2 API calls used",
      // because that counter is measured against a budget counted in pages.
      expect(internals(fixture).callsUsed()).toBe(paging);
    });

    it('leaves an account that fails or has never posted honestly unknown', () => {
      const fixture = setUp('accounts');
      authorFeeds = { 'a.bsky.social': 'error' };
      loadAccounts(fixture, [makeAccount('a.bsky.social'), makeAccount('b.bsky.social')]);

      internals(fixture).scanActivity();

      // One errored, one returned an empty feed: neither gets an invented date,
      // and one bad lookup does not fail the whole scan.
      expect(
        internals(fixture)
          .accounts()
          .every((r) => !r.account.last_status_at),
      ).toBe(true);
    });

    it('keeps offering the scan after a partial one, without a second heading', () => {
      const fixture = setUp('accounts');
      const many = Array.from({ length: 30 }, (_, i) => makeAccount(`u${i}.bsky.social`));
      authorFeeds = Object.fromEntries(many.map((a) => [a.acct, '2026-08-01T00:00:00.000Z']));
      loadAccounts(fixture, many);

      internals(fixture).scanActivity();

      // 30 accounts, cap 25: the ladder now exists *and* there is more to scan.
      // The offer block must not print its own "Last active" heading here, or
      // the column shows the facet name twice.
      expect(internals(fixture).hasActivityFacet()).toBe(true);
      expect(internals(fixture).canScanActivity()).toBe(true);
      expect(internals(fixture).activityScanSize()).toBe(5);
    });

    it('caps how many accounts one scan will look at', () => {
      const fixture = setUp('accounts');
      const many = Array.from({ length: 40 }, (_, i) => makeAccount(`u${i}.bsky.social`));
      loadAccounts(fixture, many);

      expect(internals(fixture).activityScanSize()).toBe(25);
      internals(fixture).scanActivity();
      expect(authorFeedCalls.length).toBe(25);
    });
  });
});
