import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Relationship, Status } from '../../models';
import { Profile } from './profile';
import { Auth } from '../../auth';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { ClientPrefs } from '../../client-prefs';
import { RssProvider } from '../../providers/rss/rss-provider';
import { MataroaSettings } from '../../providers/mataroa/mataroa-settings';
import { BloggerSession } from '../../providers/blogger/blogger-session';
import { HugoSettings } from '../../providers/hugo/hugo-settings';

/** n bare statuses with descending ids starting at s<base> (timeline order). */
function makeStatuses(n: number, base: number): Status[] {
  return Array.from(
    { length: n },
    (_, i) =>
      ({
        id: `s${base + i}`,
        content: `post ${base + i}`,
        account: { id: '7', username: 'kay' },
        media_attachments: [],
      }) as unknown as Status,
  );
}

/**
 * Profile block/unblock wiring, isolated at the HTTP boundary — no live or mock server.
 * We drive the component's toggleBlock() and assert it hits the right endpoint based on the
 * current relationship, then reflects the server's updated relationship.
 */
describe('Profile block/unblock', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => localStorage.clear());

  function setUp() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: '900' })) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();

    // load() fans out five requests; satisfy them so the component settles.
    httpMock
      .expectOne('/api/v1/accounts/900')
      .flush({ id: '900', username: 'eve', fields: [] } as unknown as Account);
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/900/statuses' && !r.params.has('pinned'))
      .flush([]);
    httpMock
      .expectOne(
        (r) => r.url === '/api/v1/accounts/900/statuses' && r.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([{ id: '900', blocking: false } as Relationship]);
    httpMock.expectOne('/api/v1/accounts/900/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/900/collections').flush({ collections: [] });

    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('blocks an un-blocked account via POST /block and stores the updated relationship', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    expect(cmp.relationship().blocking).toBe(false);
    fixture.detectChanges();
    const analyticsLabels = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].filter((button) => button.textContent?.trim() === 'Analytics');
    expect(analyticsLabels).toHaveLength(1);

    cmp.toggleBlock();

    const req = httpMock.expectOne('/api/v1/accounts/900/block');
    expect(req.request.method).toBe('POST');
    req.flush({ id: '900', blocking: true } as Relationship);

    expect(cmp.relationship().blocking).toBe(true);
  });

  /**
   * The relationship reads out of exactly one control.
   *
   * A mutual used to render twice: a "Mutuals" badge next to a "Following"
   * button, saying the same thing in two places and spending the width of the
   * button row to do it. The button now carries the mutual state and the badge
   * stands down — but only for that case, because "Follows you" is genuinely
   * something the button cannot say.
   */
  describe('the follow button and the follows-you badge', () => {
    const labelsIn = (fixture: ReturnType<typeof setUp>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.profile-buttons button')].map(
        (button) => button.textContent?.trim(),
      );

    const badgeText = (fixture: ReturnType<typeof setUp>) =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('.badge.follows-you')
        ?.textContent?.trim() ?? null;

    it('says Mutuals on the button and drops the badge when the follow runs both ways', () => {
      const fixture = setUp();
      const cmp = fixture.componentInstance as any;
      cmp.relationship.set({ id: '900', following: true, followed_by: true } as Relationship);
      fixture.detectChanges();

      expect(labelsIn(fixture)).toContain('Mutuals');
      expect(labelsIn(fixture)).not.toContain('Following');
      // The duplicate. Its absence is the whole point of the change.
      expect(badgeText(fixture)).toBeNull();
    });

    it('keeps the badge when they follow you and you do not follow back', () => {
      const fixture = setUp();
      const cmp = fixture.componentInstance as any;
      cmp.relationship.set({ id: '900', following: false, followed_by: true } as Relationship);
      fixture.detectChanges();

      // Here the badge earns its place: the button says "Follow", so without it
      // there is nothing to distinguish a follower from a stranger.
      expect(badgeText(fixture)).toBe('Follows you');
      expect(labelsIn(fixture)).toContain('Follow');
    });

    it('says Following when you follow someone who does not follow back', () => {
      const fixture = setUp();
      const cmp = fixture.componentInstance as any;
      cmp.relationship.set({ id: '900', following: true, followed_by: false } as Relationship);
      fixture.detectChanges();

      expect(labelsIn(fixture)).toContain('Following');
      expect(labelsIn(fixture)).not.toContain('Mutuals');
      expect(badgeText(fixture)).toBeNull();
    });

    it('still unfollows when the button is showing Mutuals', () => {
      // The label changed; the action behind it must not have.
      const fixture = setUp();
      const cmp = fixture.componentInstance as any;
      cmp.relationship.set({ id: '900', following: true, followed_by: true } as Relationship);
      fixture.detectChanges();

      cmp.requestUnfollow();
      expect(cmp.showUnfollowConfirm()).toBe(true);
      cmp.confirmUnfollow();
      httpMock
        .expectOne('/api/v1/accounts/900/unfollow')
        .flush({ id: '900', following: false, followed_by: true } as Relationship);

      // No longer mutual, so the badge comes back to carry the other direction.
      fixture.detectChanges();
      expect(badgeText(fixture)).toBe('Follows you');
    });

    it('shortens the list button so the row fits a phone', () => {
      const fixture = setUp();
      fixture.detectChanges();
      expect(labelsIn(fixture)).not.toContain('Lists & collections');
    });
  });

  it('requires confirmation before unfollowing', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    cmp.relationship.set({ id: '900', following: true } as Relationship);

    cmp.requestUnfollow();
    expect(cmp.showUnfollowConfirm()).toBe(true);
    httpMock.expectNone('/api/v1/accounts/900/unfollow');

    cmp.confirmUnfollow();
    const request = httpMock.expectOne('/api/v1/accounts/900/unfollow');
    expect(request.request.method).toBe('POST');
    request.flush({ id: '900', following: false } as Relationship);

    expect(cmp.showUnfollowConfirm()).toBe(false);
    expect(cmp.relationship().following).toBe(false);
  });

  it('shows Requested after a locked account accepts a pending follow request', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    cmp.account.update((account: Account) => ({ ...account, locked: true }));
    cmp.relationship.set({ id: '900', following: false, requested: false } as Relationship);
    fixture.detectChanges();

    cmp.toggleFollow();
    const request = httpMock.expectOne('/api/v1/accounts/900/follow');
    expect(request.request.method).toBe('POST');
    request.flush({ id: '900', following: false, requested: true } as Relationship);
    fixture.detectChanges();

    const followButton = [
      ...fixture.nativeElement.querySelectorAll('.profile-buttons button'),
    ].find((button: HTMLButtonElement) => button.textContent.includes('Requested')) as
      | HTMLButtonElement
      | undefined;
    expect(followButton?.textContent).toContain('Requested');
    expect(followButton?.disabled).toBe(true);
  });

  it('removes a follower without blocking them', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    cmp.relationship.set({ id: '900', followed_by: true, blocking: false } as Relationship);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Remove follower');

    cmp.requestRemoveFollower();
    cmp.confirmRemoveFollower();
    const request = httpMock.expectOne('/api/v1/accounts/900/remove_from_followers');
    expect(request.request.method).toBe('POST');
    request.flush({ id: '900', followed_by: false, blocking: false } as Relationship);

    expect(cmp.relationship().followed_by).toBe(false);
    expect(cmp.relationship().blocking).toBe(false);
    httpMock.expectNone('/api/v1/accounts/900/block');
  });

  it('toggles boosts in the overflow menu and uses retweet terminology when configured', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    cmp.relationship.set({ id: '900', following: true, showing_reblogs: true } as Relationship);
    fixture.detectChanges();
    // Match on the panel's whole text rather than a positional selector: the menu's
    // ordering is deliberate (keep-actions above the rule) and may grow entries.
    const panelText = () =>
      fixture.nativeElement.querySelector('.account-danger-panel').textContent ?? '';
    expect(panelText()).toContain('Hide boosts');

    cmp.toggleAccountBoosts();
    const request = httpMock.expectOne('/api/v1/accounts/900/follow');
    expect(request.request.body).toEqual({ reblogs: false });
    request.flush({ id: '900', following: true, showing_reblogs: false } as Relationship);

    TestBed.inject(ClientPrefs).setPostNoun('tweet');
    fixture.detectChanges();
    expect(panelText()).toContain('Show retweets');
  });

  it('follows locally in Anonymous without relationship mutation requests', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: '900' })) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    const target = {
      id: '900',
      username: 'eve',
      acct: 'eve@example.social',
      display_name: 'Eve',
      note: '',
      url: 'https://example.social/@eve',
      avatar: '',
      avatar_static: '',
      header: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      bot: false,
      locked: false,
      fields: [],
    } as Account;

    httpMock.expectOne('/api/v1/accounts/900').flush(target);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/900/statuses' && !request.params.has('pinned'),
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/900/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne('/api/v1/accounts/900/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/900/collections').flush({ collections: [] });
    httpMock.expectNone((request) => request.url.includes('/relationships'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Local lists');

    (fixture.componentInstance as any).toggleFollow();

    expect(TestBed.inject(AnonymousFollows).count()).toBe(1);
    expect((fixture.componentInstance as any).relationship().following).toBe(true);
    httpMock.expectNone((request) => /\/(follow|unfollow)$/.test(request.url));
  });

  it('loads a public profile and posts from the referenced instance in Anonymous', () => {
    const routeId = anonymousAccountRouteRef({ server: 'https://social.example', id: '900' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: routeId })) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://home.example');
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    const target = {
      id: '900',
      username: 'eve',
      acct: 'eve',
      display_name: 'Eve',
      note: '',
      url: 'https://social.example/@eve',
      avatar: '',
      avatar_static: '',
      header: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 1,
      bot: false,
      locked: false,
      fields: [],
    } as Account;
    const post = {
      id: '50',
      created_at: '2026-01-01T00:00:00Z',
      edited_at: null,
      content: '<p>Public</p>',
      spoiler_text: '',
      visibility: 'public',
      url: 'https://social.example/@eve/50',
      account: target,
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

    httpMock.expectOne('https://social.example/api/v1/accounts/900').flush(target);
    httpMock
      .expectOne(
        (request) =>
          request.url === 'https://social.example/api/v1/accounts/900/statuses' &&
          !request.params.has('pinned'),
      )
      .flush([post]);
    httpMock
      .expectOne(
        (request) =>
          request.url === 'https://social.example/api/v1/accounts/900/statuses' &&
          request.params.get('max_id') === '50',
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === 'https://social.example/api/v1/accounts/900/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne('https://social.example/api/v1/accounts/900/collections').flush({
      collections: [
        {
          id: 'collection-1',
          account_id: '900',
          name: 'Video makers',
          description: 'People making great videos.',
          discoverable: true,
          sensitive: false,
          local: true,
          item_count: 25,
          items: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          uri: 'https://social.example/ap/collections/collection-1',
          url: 'https://social.example/collections/collection-1',
        },
      ],
    });
    fixture.detectChanges();

    expect((fixture.componentInstance as any).account().acct).toBe('eve@social.example');
    expect((fixture.componentInstance as any).statuses()[0].id).toBe(
      'anonymous-mastodon:social.example:50',
    );
    const filters = fixture.nativeElement.querySelectorAll('.profile-filters button');
    // Search joined this row rather than living in the ••• menu, where it sat
    // among the moderation actions instead of with the other controls that
    // change what the timeline shows. Four is this row's ceiling.
    expect(filters).toHaveLength(4);
    expect(
      Array.from(filters).map((button) => (button as HTMLButtonElement).textContent?.trim()),
    ).toEqual(['🔁 Boosts', '💬 Replies', '📌 Pinned', '🔍 Search']);
    const collectionCount = fixture.nativeElement.querySelector(
      '.collection-count-btn',
    ) as HTMLButtonElement;
    expect(collectionCount.textContent).toContain('Collections (1)');
    expect(collectionCount.querySelector('strong')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.collection-row')).toBeNull();

    (fixture.componentInstance as any).setTab('collections');
    fixture.detectChanges();
    const collection = fixture.nativeElement.querySelector('.collection-row') as HTMLAnchorElement;
    expect(collection.textContent).toContain('Video makers');
    expect(collection.getAttribute('href')).toBe('https://social.example/collections/collection-1');
    httpMock.expectNone((request) => request.url.startsWith('/api/'));
  });

  it('does not show the Collections profile count when the account has none', () => {
    const fixture = setUp();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.collection-count-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.profile-collections')).toBeNull();
  });

  it('places the Anonymous login-to-post prompt in the self profile timeline', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'anonymous' })),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();

    const loginPost = fixture.nativeElement.querySelector(
      '.profile-login-post',
    ) as HTMLAnchorElement;
    expect(loginPost.textContent).toContain(
      'Login or create an account to post content, reply and more',
    );
    expect(loginPost.getAttribute('href')).toBe('/login');
  });

  it('keeps paging older statuses until 20 accumulate (filtered pages come back short)', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '7' })) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;

    httpMock
      .expectOne('/api/v1/accounts/7')
      .flush({ id: '7', username: 'kay', fields: [] } as unknown as Account);
    httpMock.expectOne((r) => r.params.get('pinned') === 'true').flush([]);
    httpMock.expectOne((r) => r.url === '/api/v1/accounts/relationships').flush([]);
    httpMock.expectOne('/api/v1/accounts/7/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/7/collections').flush({ collections: [] });

    // Page 1: defaults exclude replies but keep boosts; 5 of 20 requested survive.
    const first = httpMock.expectOne(
      (r) => r.url === '/api/v1/accounts/7/statuses' && !r.params.has('pinned'),
    );
    expect(first.request.params.get('exclude_replies')).toBe('true');
    expect(first.request.params.get('exclude_reblogs')).toBeNull();
    expect(first.request.params.get('limit')).toBe('20');
    first.flush(makeStatuses(5, 100));

    // Page 2 must resume from the oldest id of page 1.
    const second = httpMock.expectOne(
      (r) => r.url === '/api/v1/accounts/7/statuses' && !r.params.has('pinned'),
    );
    expect(second.request.params.get('max_id')).toBe('s104');
    second.flush(makeStatuses(15, 200));

    // 5 + 15 = 20: no third page.
    httpMock.expectNone((r) => r.url === '/api/v1/accounts/7/statuses');
    expect(cmp.statuses()).toHaveLength(20);
    expect(cmp.statusesLoading()).toBe(false);
  });

  it('stops paging when the account runs out of statuses', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;

    cmp.toggleReplies(); // Refetch, now including replies.
    const first = httpMock.expectOne(
      (r) => r.url === '/api/v1/accounts/900/statuses' && !r.params.has('pinned'),
    );
    expect(first.request.params.get('exclude_replies')).toBeNull();
    first.flush(makeStatuses(3, 100));

    const second = httpMock.expectOne(
      (r) => r.url === '/api/v1/accounts/900/statuses' && !r.params.has('pinned'),
    );
    second.flush([]); // Exhausted.

    httpMock.expectNone((r) => r.url === '/api/v1/accounts/900/statuses');
    expect(cmp.statuses()).toHaveLength(3);
    expect(cmp.statusesLoading()).toBe(false);
  });

  it('toggling boosts off refetches with exclude_reblogs', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;

    cmp.toggleBoosts();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/v1/accounts/900/statuses' && !r.params.has('pinned'),
    );
    expect(req.request.params.get('exclude_reblogs')).toBe('true');
    req.flush([]);
  });

  it('renders custom profile fields, marking verified ones', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    cmp.account.set({
      id: '900',
      username: 'eve',
      acct: 'eve',
      display_name: 'Eve',
      fields: [
        { name: 'Blog', value: '<a href="https://eve.blog">eve.blog</a>', verified_at: null },
        { name: 'Site', value: '<a href="https://eve.dev">eve.dev</a>', verified_at: '2026-01-01' },
      ],
    } as Account);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('.profile-field');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Blog');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('https://eve.blog');
    expect(rows[0].classList.contains('verified')).toBe(false);
    expect(rows[1].classList.contains('verified')).toBe(true);
    expect(rows[1].querySelector('.field-check')).not.toBeNull();
  });

  it('hides pinned duplicates from the main list while the pinned strip is on', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;

    const [a, b, c] = makeStatuses(3, 100);
    cmp.statuses.set([a, b, c]);
    cmp.pinnedStatuses.set([b]);

    expect(cmp.visibleStatuses().map((s: Status) => s.id)).toEqual([a.id, c.id]);
    cmp.togglePinned(); // Strip off: the post shows in its natural position again.
    expect(cmp.visibleStatuses()).toHaveLength(3);
  });

  it('unblocks a blocked account via POST /unblock', () => {
    const fixture = setUp();
    const cmp = fixture.componentInstance as any;
    // Pretend the account is already blocked.
    cmp.relationship.set({ id: '900', blocking: true } as Relationship);

    cmp.toggleBlock();

    const req = httpMock.expectOne('/api/v1/accounts/900/unblock');
    expect(req.request.method).toBe('POST');
    req.flush({ id: '900', blocking: false } as Relationship);

    expect(cmp.relationship().blocking).toBe(false);
  });
});

/**
 * Eliza's synthetic profile. She is served entirely from ElizaService with no
 * network call, so the HTTP mock must see zero requests, and Follow toggles the
 * browser-local relationship rather than hitting the follow API.
 */
describe('Profile — Eliza', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => localStorage.clear());

  function setUp() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'eliza:self' })) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      account: () => Account | null;
      statuses: () => Status[];
      pinnedStatuses: () => Status[];
      relationship: () => Relationship | null;
      loading: () => boolean;
      toggleFollow: () => void;
    };
  }

  afterEach(() => httpMock.verify());

  it('renders her account and timeline with zero HTTP requests', () => {
    const cmp = setUp();
    expect(cmp.loading()).toBe(false);
    expect(cmp.account()?.id).toBe('eliza:self');
    expect(cmp.statuses().length).toBeGreaterThan(0);
    expect(cmp.pinnedStatuses().length).toBeGreaterThan(0);
    httpMock.verify(); // no calls made
  });

  it('Follow toggles the local relationship without hitting the follow API', () => {
    const cmp = setUp();
    expect(cmp.relationship()?.following).toBe(false);
    cmp.toggleFollow();
    expect(cmp.relationship()?.following).toBe(true);
    cmp.toggleFollow();
    expect(cmp.relationship()?.following).toBe(false);
    httpMock.verify(); // still no follow/unfollow calls
  });
});

/**
 * "Copy account" — the menu entry and, above all, the guard on it.
 *
 * The anonymous-only rule is a safety property, not unfinished scope: cloning
 * twenty anonymous follows writes twenty localStorage rows, while the same button
 * signed in would fire twenty POST /follow calls and look exactly like a
 * follow-bot. A refactor that "tidies up" the guard must fail loudly here.
 */
describe('Profile — copy account', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // These blocks configure inside setUp(), after the previous describe has
    // already instantiated a module. Reset first, or configureTestingModule
    // throws and poisons every spec that follows.
    TestBed.resetTestingModule();
  });
  afterEach(() => httpMock.verify());

  function setUp(options: { anonymous: boolean; followingCount?: number }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: '900' })) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(Auth);
    if (options.anonymous) {
      auth.enterAnonymous('https://mastodon.social');
    } else {
      auth.setToken('a-token');
      auth.setAccount({ id: 'me', username: 'me' } as Account);
    }

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/accounts/900').flush({
      id: '900',
      username: 'eve',
      acct: 'eve@mastodon.social',
      fields: [],
      following_count: options.followingCount ?? 40,
    } as unknown as Account);
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/900/statuses' && !r.params.has('pinned'))
      .flush([]);
    // The remaining optional loads (pinned, relationships, collections, featured)
    // differ by mode; drain whatever this configuration asked for.
    for (const request of httpMock.match(() => true)) {
      request.flush([]);
    }
    fixture.detectChanges();
    return fixture;
  }

  /** The menu is rendered inline, so the label is enough to assert presence. */
  function menuHasClone(fixture: { nativeElement: unknown }): boolean {
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.account-danger-panel');
    return !!panel?.textContent?.includes('Copy account');
  }

  it('offers the entry to an anonymous viewer', () => {
    expect(menuHasClone(setUp({ anonymous: true }))).toBe(true);
  });

  it('does NOT offer it when signed in — bulk server-side following is the whole risk', () => {
    const fixture = setUp({ anonymous: false });
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.account-danger-panel');

    // Assert the menu is really there first: a test that passes because the whole
    // panel is missing would prove nothing about the guard.
    expect(panel?.textContent).toContain('Block account');
    expect(menuHasClone(fixture)).toBe(false);
  });

  it('hides it when the account follows nobody, since there is nothing to clone', () => {
    expect(menuHasClone(setUp({ anonymous: true, followingCount: 0 }))).toBe(false);
  });

  it('puts the constructive action above the ways to make someone disappear', () => {
    const fixture = setUp({ anonymous: true });
    const text =
      (fixture.nativeElement as HTMLElement).querySelector('.account-danger-panel')?.textContent ??
      '';

    expect(text.indexOf('Copy account')).toBeLessThan(text.indexOf('Block account'));
    expect(text.indexOf('Copy account')).toBeLessThan(text.indexOf('Mute for'));
  });

  /**
   * The rule is what makes the ordering legible rather than merely correct. The
   * entry was already first in this menu and still could not be found, because the
   * panel read as one undifferentiated stack — see
   * sprint/anon-office-1-copy-and-exit.md.
   */
  it('separates keeping from destroying with a real <hr>', () => {
    const panel = (setUp({ anonymous: true }).nativeElement as HTMLElement).querySelector(
      '.account-danger-panel',
    );
    const children = [...(panel?.children ?? [])];
    const ruleAt = children.findIndex((el) => el.tagName === 'HR');
    expect(ruleAt).toBeGreaterThan(-1);

    const textUpTo = (end: number) =>
      children
        .slice(0, end)
        .map((el) => el.textContent ?? '')
        .join(' ');
    expect(textUpTo(ruleAt)).toContain('Copy account');
    expect(textUpTo(ruleAt)).not.toContain('Block account');
  });
});

describe('Profile Mataroa RSS inclusion', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // The Blogger token lives in sessionStorage; leaving it set would connect
    // a later test that never asked to be.
    sessionStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'token');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("merges the connected blog into only the signed-in account's post feed", () => {
    const account = {
      id: 'self',
      username: 'kay',
      acct: 'kay@example.social',
      display_name: 'Kay',
      note: '',
      url: 'https://example.social/@kay',
      avatar: '',
      avatar_static: '',
      header: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 1,
      bot: false,
      locked: false,
      fields: [],
    } as Account;
    const blogStatus = {
      ...makeStatuses(1, 90)[0],
      id: 'rss:https://writer.mataroa.blog/rss/::entry',
      provider: 'rss',
      created_at: '2026-08-02T12:00:00Z',
      url: 'https://writer.mataroa.blog/blog/entry/',
    } as Status;
    const getFeed = vi.fn(() => of({ account: blogStatus.account, statuses: [blogStatus] }));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'self' })) },
        },
        { provide: RssProvider, useValue: { getFeed } },
      ],
    });
    TestBed.inject(Auth).setAccount(account);
    TestBed.inject(MataroaSettings).connect('key', 'https://writer.mataroa.blog/', true);

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('/api/v1/accounts/self').flush(account);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' && !request.params.has('pinned'),
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne((request) => request.url === '/api/v1/accounts/relationships').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/collections').flush({ collections: [] });

    const visible = (fixture.componentInstance as any).visibleStatuses() as Status[];
    expect(getFeed).toHaveBeenCalledWith('https://writer.mataroa.blog/rss/', true);
    expect(visible.map((status) => status.id)).toContain(blogStatus.id);
    expect(visible[0].account).toEqual(account);
  });

  it('merges Mataroa and Blogger at once, both through the proxy', () => {
    // Mataroa and Blogger can both be connected; one must not hide the other.
    // Both need the proxy; Hugo is the exception, covered in the next test.
    const account = {
      id: 'self',
      username: 'kay',
      acct: 'kay@example.social',
      display_name: 'Kay',
      note: '',
      url: 'https://example.social/@kay',
      avatar: '',
      avatar_static: '',
      header: '',
      header_static: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 1,
      bot: false,
      locked: false,
      fields: [],
    } as Account;
    const entry = (id: string, url: string): Status =>
      ({ ...makeStatuses(1, 90)[0], id, provider: 'rss', url }) as Status;
    const mataroaPost = entry('rss:mataroa::a', 'https://writer.mataroa.blog/blog/a/');
    const bloggerPost = entry('rss:blogger::b', 'https://mine.blogspot.com/2026/08/b.html');
    const getFeed = vi.fn((url: string) =>
      of({
        account,
        statuses: [url.includes('blogspot') ? bloggerPost : mataroaPost],
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'self' })) },
        },
        { provide: RssProvider, useValue: { getFeed } },
      ],
    });
    TestBed.inject(Auth).setAccount(account);
    TestBed.inject(MataroaSettings).connect('key', 'https://writer.mataroa.blog/', true);
    const blogger = TestBed.inject(BloggerSession);
    blogger.adoptToken('tok', 3600);
    blogger.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');
    blogger.setIncludeInProfile(true);

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('/api/v1/accounts/self').flush(account);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' && !request.params.has('pinned'),
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne((request) => request.url === '/api/v1/accounts/relationships').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/collections').flush({ collections: [] });

    // Blogger's RSS sends no ACAO and often redirects to FeedBurner, so it
    // takes the proxy route exactly as Mataroa's does.
    expect(getFeed).toHaveBeenCalledWith(
      'https://mine.blogspot.com/feeds/posts/default?alt=rss',
      true,
    );
    const ids = ((fixture.componentInstance as any).visibleStatuses() as Status[]).map((s) => s.id);
    expect(ids).toContain(mataroaPost.id);
    expect(ids).toContain(bloggerPost.id);
  });

  it('reads a Hugo blog directly, without the proxy the other two need', () => {
    const account = {
      id: 'self',
      username: 'kay',
      acct: 'kay@example.social',
      display_name: 'Kay',
      note: '',
      url: 'https://example.social/@kay',
      avatar: '',
      avatar_static: '',
      header: '',
      header_static: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 1,
      bot: false,
      locked: false,
      fields: [],
    } as Account;
    const hugoPost = {
      ...makeStatuses(1, 90)[0],
      id: 'rss:hugo::a',
      provider: 'rss',
      url: 'https://mistersql.github.io/my-blog/posts/a/',
    } as Status;
    const getFeed = vi.fn(() => of({ account, statuses: [hugoPost] }));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'self' })) },
        },
        { provide: RssProvider, useValue: { getFeed } },
      ],
    });
    TestBed.inject(Auth).setAccount(account);
    const hugo = TestBed.inject(HugoSettings);
    hugo.connect('tok', {
      owner: 'mistersql',
      repo: 'my-blog',
      branch: 'main',
      contentPath: 'content/posts',
      siteUrl: 'https://mistersql.github.io/my-blog/',
      includeInProfile: true,
    });

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('/api/v1/accounts/self').flush(account);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' && !request.params.has('pinned'),
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne((request) => request.url === '/api/v1/accounts/relationships').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/collections').flush({ collections: [] });

    // GitHub Pages sends ACAO, so routing the user's own public writing through
    // a third-party proxy would be gratuitous. This is the one blog that reads
    // directly, which is why useProxy is per feed rather than a constant.
    expect(getFeed).toHaveBeenCalledWith('https://mistersql.github.io/my-blog/index.xml', false);
    const ids = ((fixture.componentInstance as any).visibleStatuses() as Status[]).map((s) => s.id);
    expect(ids).toContain(hugoPost.id);
  });

  it('leaves the blog off the profile until it is opted in', () => {
    const account = {
      id: 'self',
      username: 'kay',
      acct: 'kay@example.social',
      display_name: 'Kay',
      note: '',
      url: 'https://example.social/@kay',
      avatar: '',
      avatar_static: '',
      header: '',
      header_static: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      bot: false,
      locked: false,
      fields: [],
    } as Account;
    const getFeed = vi.fn(() => of({ account, statuses: [] }));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'self' })) },
        },
        { provide: RssProvider, useValue: { getFeed } },
      ],
    });
    TestBed.inject(Auth).setAccount(account);
    const blogger = TestBed.inject(BloggerSession);
    blogger.adoptToken('tok', 3600);
    // Chosen for publishing, but never opted into the profile feed.
    blogger.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('/api/v1/accounts/self').flush(account);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' && !request.params.has('pinned'),
      )
      .flush([]);
    httpMock
      .expectOne(
        (request) =>
          request.url === '/api/v1/accounts/self/statuses' &&
          request.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock.expectOne((request) => request.url === '/api/v1/accounts/relationships').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/self/collections').flush({ collections: [] });

    expect(getFeed).not.toHaveBeenCalled();
  });
});

/**
 * Account ids belong to the server that issued them. The same person is
 * 109655875667638018 on mastodon.social and 109656717715863645 on fosstodon
 * (verified against both), so opening a profile URL under a different server
 * 404s — the reported "Loading… hangs forever" symptom, since the load had no
 * error handler at all.
 */
describe('Profile cross-server recovery', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // These blocks configure inside setUp(), after the previous describe has
    // already instantiated a module. Reset first, or configureTestingModule
    // throws and poisons every spec that follows.
    TestBed.resetTestingModule();
  });
  afterEach(() => httpMock.verify());

  interface ProfileInternals {
    loading: () => boolean;
    loadError: () => string | null;
    recovering: () => boolean;
    recoveryFailed: () => boolean;
  }

  /** Mount the profile for `id`, optionally carrying a `?handle=` hint. */
  function setUp(id: string, handle?: string) {
    const queryParamMap = convertToParamMap(handle ? { handle } : {});
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id })), snapshot: { queryParamMap } },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return fixture;
  }

  /** Satisfy the sibling requests `load()` fires alongside the account fetch. */
  function settleSiblings(id: string): void {
    httpMock.match((r) => r.url === `/api/v1/accounts/${id}/statuses`).forEach((r) => r.flush([]));
    httpMock.match((r) => r.url === '/api/v1/accounts/relationships').forEach((r) => r.flush([]));
    httpMock
      .match((r) => r.url === `/api/v1/accounts/${id}/endorsements`)
      .forEach((r) => r.flush([]));
    httpMock
      .match((r) => r.url === `/api/v1/accounts/${id}/collections`)
      .forEach((r) => r.flush({ collections: [] }));
  }

  it('stops the spinner and explains a 404 instead of hanging', () => {
    const fixture = setUp('900');
    httpMock
      .expectOne('/api/v1/accounts/900')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    settleSiblings('900');
    fixture.detectChanges();

    const internals = fixture.componentInstance as unknown as ProfileInternals;
    expect(internals.loading()).toBe(false);
    expect(internals.loadError()).toContain('not on the server');
  });

  it('re-resolves by handle and redirects to the id this server issued', () => {
    const fixture = setUp('109655875667638018', 'genxjamerican@hachyderm.io');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    httpMock
      .expectOne('/api/v1/accounts/109655875667638018')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    settleSiblings('109655875667638018');

    const lookup = httpMock.expectOne(
      (r) =>
        r.url === '/api/v1/accounts/lookup' &&
        r.params.get('acct') === 'genxjamerican@hachyderm.io',
    );
    lookup.flush({ id: '109656717715863645', username: 'genxjamerican', fields: [] });
    fixture.detectChanges();

    // Navigating (not rendering in place) keeps the URL truthful: it ends up
    // holding an id that actually works on this server — with the handle still
    // in the path, so the next server change recovers the same way.
    expect(navigate).toHaveBeenCalledWith(
      ['/accounts', '109656717715863645', '@genxjamerican@hachyderm.io'],
      expect.objectContaining({ replaceUrl: true }),
    );
  });

  it('reports an honest dead end when the handle is unknown here too', () => {
    const fixture = setUp('900', 'ghost@nowhere.example');
    httpMock
      .expectOne('/api/v1/accounts/900')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    settleSiblings('900');
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/lookup')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const internals = fixture.componentInstance as unknown as ProfileInternals;
    expect(internals.recovering()).toBe(false);
    expect(internals.recoveryFailed()).toBe(true);
    expect(internals.loadError()).toContain('ghost@nowhere.example');
  });

  it('does not attempt a lookup when the link carried no handle', () => {
    const fixture = setUp('900');
    httpMock
      .expectOne('/api/v1/accounts/900')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    settleSiblings('900');
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url === '/api/v1/accounts/lookup');
  });
});

/**
 * The handle-in-path route (`/accounts/123/@alice@host`, Elk's shape).
 *
 * The failure this prevents is not a 404 — it is worse. Account ids are
 * per-server and *short* ids frequently hit a real but different account on
 * another server, so the page loads, the name is wrong, and nothing looks
 * broken. The handle names exactly one person, so it outranks the id.
 */
describe('Profile handle-in-path route', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // These blocks configure inside setUp(), after the previous describe has
    // already instantiated a module. Reset first, or configureTestingModule
    // throws and poisons every spec that follows.
    TestBed.resetTestingModule();
  });
  afterEach(() => httpMock.verify());

  function setUp(id: string, handle: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id, handle })),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return fixture;
  }

  function settleSiblings(id: string): void {
    httpMock.match((r) => r.url === `/api/v1/accounts/${id}/statuses`).forEach((r) => r.flush([]));
    httpMock.match((r) => r.url === '/api/v1/accounts/relationships').forEach((r) => r.flush([]));
    httpMock
      .match((r) => r.url === `/api/v1/accounts/${id}/endorsements`)
      .forEach((r) => r.flush([]));
    httpMock
      .match((r) => r.url === `/api/v1/accounts/${id}/collections`)
      .forEach((r) => r.flush({ collections: [] }));
  }

  it('keeps the id when it resolves to the person the handle names', () => {
    const fixture = setUp('123', '@alice@example.social');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const alice = {
      id: '123',
      username: 'alice',
      acct: 'alice@example.social',
      url: 'https://example.social/@alice',
      fields: [],
    } as unknown as Account;
    // Two reads of the same id: the ordinary load, and the verification pass.
    httpMock.match('/api/v1/accounts/123').forEach((r) => r.flush(alice));
    settleSiblings('123');
    fixture.detectChanges();

    // Agreement means no lookup and no redirect — the id is the fast path.
    httpMock.expectNone((r) => r.url === '/api/v1/accounts/lookup');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('re-resolves when the id belongs to a different account on this server', () => {
    const fixture = setUp('123', '@alice@example.social');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    // The id is valid here — it just belongs to someone else entirely. This is
    // the silent-wrong-person case: without the handle it renders as normal.
    const someoneElse = {
      id: '123',
      username: 'bob',
      acct: 'bob',
      url: 'https://other.example/@bob',
      fields: [],
    } as unknown as Account;
    httpMock.match('/api/v1/accounts/123').forEach((r) => r.flush(someoneElse));
    settleSiblings('123');

    httpMock
      .expectOne(
        (r) =>
          r.url === '/api/v1/accounts/lookup' && r.params.get('acct') === 'alice@example.social',
      )
      .flush({ id: '456', username: 'alice', acct: 'alice@example.social', fields: [] });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(
      ['/accounts', '456', '@alice@example.social'],
      expect.objectContaining({ replaceUrl: true }),
    );
  });
});

/**
 * Account search, at the HTTP boundary.
 *
 * The two halves are covered as pure functions in profile-search.spec.ts; what
 * matters here is the wiring — that the server is asked with `from:`, that its
 * answer is checked rather than trusted, and that the two merge.
 */
describe('Profile account search', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => localStorage.clear());
  afterEach(() => httpMock.verify());

  interface SearchInternals {
    searchCriteria: { set(v: { words: string }): void };
    searchResults(): Status[] | null;
    searchUsedServer(): boolean;
    runSearch(): Promise<void>;
    statuses: { set(v: Status[]): void };
    exhausted: { set(v: boolean): void };
  }

  function setUp() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: '900' })) },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/accounts/900').flush({
      id: '900',
      username: 'eve',
      acct: 'eve@remote.social',
      url: 'https://remote.social/@eve',
      fields: [],
    } as unknown as Account);
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/900/statuses' && !r.params.has('pinned'))
      .flush([]);
    httpMock
      .expectOne(
        (r) => r.url === '/api/v1/accounts/900/statuses' && r.params.get('pinned') === 'true',
      )
      .flush([]);
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([{ id: '900' } as Relationship]);
    httpMock.expectOne('/api/v1/accounts/900/endorsements').flush([]);
    httpMock.expectOne('/api/v1/accounts/900/collections').flush({ collections: [] });

    return fixture;
  }

  function post(id: string, content: string, accountId = '900'): Status {
    return {
      id,
      content: `<p>${content}</p>`,
      created_at: `2026-06-${id.padStart(2, '0')}T00:00:00Z`,
      account: { id: accountId, username: 'eve' },
      media_attachments: [],
      spoiler_text: '',
      in_reply_to_id: null,
      poll: null,
    } as unknown as Status;
  }

  it('asks the server with from:, and merges its hits with the local scan', async () => {
    const fixture = setUp();
    const inner = fixture.componentInstance as unknown as SearchInternals;
    // Already loaded locally, and the history ends here so no deepening runs.
    inner.statuses.set([post('10', 'local angular note')]);
    inner.exhausted.set(true);
    inner.searchCriteria.set({ words: 'angular' });

    const run = inner.runSearch();
    // runSearch awaits the sample-deepening step before it asks the server, so
    // the request does not exist until the microtask queue drains.
    await Promise.resolve();
    const req = httpMock.expectOne((r) => r.url === '/api/v2/search');
    expect(req.request.params.get('q')).toBe('from:@eve@remote.social angular');
    req.flush({ accounts: [], statuses: [post('20', 'server angular note')], hashtags: [] });
    await run;

    // Both halves, newest first.
    expect(inner.searchResults()?.map((s) => s.id)).toEqual(['20', '10']);
    expect(inner.searchUsedServer()).toBe(true);
  });

  it('drops server hits by other authors rather than trusting from:', async () => {
    const fixture = setUp();
    const inner = fixture.componentInstance as unknown as SearchInternals;
    inner.statuses.set([]);
    inner.exhausted.set(true);
    inner.searchCriteria.set({ words: 'angular' });

    const run = inner.runSearch();
    await Promise.resolve();
    // A server that ignores `from:` answers on the words alone; taking that at
    // face value would show a stranger's posts on this profile.
    httpMock
      .expectOne((r) => r.url === '/api/v2/search')
      .flush({
        accounts: [],
        statuses: [post('30', 'someone else', 'other-account')],
        hashtags: [],
      });
    await run;

    expect(inner.searchResults()).toEqual([]);
  });

  it('still searches locally when the server has no index to offer', async () => {
    const fixture = setUp();
    const inner = fixture.componentInstance as unknown as SearchInternals;
    inner.statuses.set([post('10', 'local angular note'), post('11', 'unrelated')]);
    inner.exhausted.set(true);
    inner.searchCriteria.set({ words: 'angular' });

    const run = inner.runSearch();
    await Promise.resolve();
    httpMock
      .expectOne((r) => r.url === '/api/v2/search')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await run;

    // The local half is the whole point of the hybrid.
    expect(inner.searchResults()?.map((s) => s.id)).toEqual(['10']);
    expect(inner.searchUsedServer()).toBe(false);
  });
});
