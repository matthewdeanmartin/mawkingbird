import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Account, Status, TrendLink } from '../../models';
import { ServerFeed } from './server-feed';
import { JustMyServer } from '../../just-my-server';
import { RecentFeeds } from '../../recent-feeds';
import { Server } from '../../server';
import { parseAnonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';

function makeAccount(id: string): Account {
  return { id, username: `u${id}`, acct: `u${id}`, display_name: `User ${id}` } as Account;
}

function makeStatus(id: string, accountId: string): Status {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    account: makeAccount(accountId),
    reblog: null,
  } as Status;
}

interface Internals {
  loading(): boolean;
  isLinks(): boolean;
  statuses(): Status[];
  links(): TrendLink[];
  members(): Account[];
  notice(): string;
  tab(): 'posts' | 'members';
  setTab(t: 'posts' | 'members'): void;
}

function internals(f: ComponentFixture<ServerFeed>): Internals {
  return f.componentInstance as unknown as Internals;
}

describe('ServerFeed', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    localStorage.clear();
    params = new BehaviorSubject(convertToParamMap({ feed: 'trending' }));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.overrideProvider(ActivatedRoute, { useValue: { paramMap: params } });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    const auth = TestBed.inject(Auth);
    auth.account.set(null);
    auth.mode.set(null);
  });

  function setUp(feed: string): ComponentFixture<ServerFeed> {
    params.next(convertToParamMap({ feed }));
    const fixture = TestBed.createComponent(ServerFeed);
    fixture.detectChanges();
    return fixture;
  }

  function remote(feed: string, server = 'foobar.social'): ComponentFixture<ServerFeed> {
    params.next(convertToParamMap({ feed, server }));
    const fixture = TestBed.createComponent(ServerFeed);
    fixture.detectChanges();
    return fixture;
  }

  it('records a home server feed on arrival and pins and unpins it from the page', () => {
    const fixture = setUp('trending');
    http.expectOne('/api/v1/trends/statuses').flush([]);
    const recent = TestBed.inject(RecentFeeds);
    expect(recent.entries()).toEqual([
      { url: '/feeds/trending', label: 'Trending posts', pinned: false },
    ]);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.page-head button',
    )!;
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    const restored = new RecentFeeds();
    restored.refresh();
    expect(restored.entries()[0].pinned).toBe(true);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(recent.entries()[0].pinned).toBe(false);
  });

  it('browses another server anonymously, pins its distinct label, and pages using native ids', () => {
    TestBed.inject(Auth).enterAnonymous();
    TestBed.inject(Server).setBaseUrl('https://home.example');
    const fixture = remote('local');
    http
      .expectOne((req) => req.url === 'https://foobar.social/api/v1/timelines/public')
      .flush([makeStatus('100', 'a')]);
    expect(internals(fixture).statuses()[0].id).toContain('foobar.social:100');
    const component = fixture.componentInstance as unknown as {
      togglePin(): void;
      loadMore(): void;
      memberLink(account: Account): string[];
    };
    component.togglePin();
    expect(TestBed.inject(RecentFeeds).entries()[0]).toEqual({
      url: '/feeds/servers/foobar.social/local',
      label: 'Local timeline · foobar.social',
      pinned: true,
    });
    component.loadMore();
    const more = http.expectOne(
      (req) => req.url === 'https://foobar.social/api/v1/timelines/public',
    );
    expect(more.request.params.get('max_id')).toBe('100');
    more.flush([]);
    expect(TestBed.inject(Server).baseUrl()).toBe('https://home.example');
    const link = component.memberLink(makeAccount('a'));
    expect(parseAnonymousAccountRouteRef(link[1])).toEqual({
      server: 'https://foobar.social',
      id: 'a',
    });
  });

  it('explains a remote feed restriction and can retry without altering the signed-in server', () => {
    const fixture = remote('federated');
    http
      .expectOne((req) => req.url.includes('foobar.social/api/v1/timelines/public'))
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(internals(fixture).notice()).toContain('foobar.social requires its own account');
    fixture.componentInstance.load();
    http.expectOne((req) => req.url.includes('foobar.social/api/v1/timelines/public')).flush([]);
    expect(internals(fixture).notice()).toBe('');
  });

  it('cancels an old server request when navigation selects another server', () => {
    const fixture = remote('trending');
    const first = http.expectOne(
      (req) => req.url === 'https://foobar.social/api/v1/trends/statuses',
    );
    params.next(convertToParamMap({ server: 'second.social', feed: 'trending' }));
    expect(first.cancelled).toBe(true);
    http
      .expectOne((req) => req.url === 'https://second.social/api/v1/trends/statuses')
      .flush([makeStatus('10', 'b')]);
    expect(internals(fixture).statuses()[0].id).toContain('second.social');
  });

  it('does not fall back to a home-server request for an invalid foreign host', () => {
    const fixture = remote('local', 'bad/path');
    http.expectNone(() => true);
    expect(internals(fixture).notice()).toContain('invalid');
  });

  it('trending loads statuses and does NOT compute members until the tab opens', () => {
    const fixture = setUp('trending');
    http
      .expectOne('/api/v1/trends/statuses')
      .flush([makeStatus('1', 'a'), makeStatus('2', 'a'), makeStatus('3', 'b')]);

    // Members are lazy: empty until the Members tab is opened.
    expect(internals(fixture).members()).toEqual([]);

    internals(fixture).setTab('members');
    expect(
      internals(fixture)
        .members()
        .map((m) => m.id),
    ).toEqual(['a', 'b']);
  });

  it('news loads trending links and reports a links feed (no members tab)', () => {
    const fixture = setUp('news');
    expect(internals(fixture).isLinks()).toBe(true);
    http
      .expectOne('/api/v1/trends/links')
      .flush([
        { url: 'https://x/1', title: 'Headline', description: 'd', provider_name: 'X' },
      ] as TrendLink[]);

    expect(
      internals(fixture)
        .links()
        .map((l) => l.title),
    ).toEqual(['Headline']);
    // No statuses/timeline requests are made — verify() asserts this.
  });

  it('federated fetches the public timeline when not anonymous', () => {
    const fixture = setUp('federated');
    http.expectOne((r) => r.url === '/api/v1/timelines/public').flush([makeStatus('1', 'a')]);
    expect(
      internals(fixture)
        .statuses()
        .map((s) => s.id),
    ).toEqual(['1']);
  });

  it('federated shows a sign-in notice for anonymous sessions without fetching', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    const fixture = setUp('federated');
    expect(internals(fixture).notice()).toContain('Sign in');
    expect(internals(fixture).loading()).toBe(false);
    // No timeline request — verify() asserts this.
  });

  it('offers Server Friends instead of Local Feed on the local feed while server mode is on', () => {
    TestBed.inject(Auth).mode.set('mastodon');
    const fixture = setUp('local');
    http.expectOne((request) => request.url === '/api/v1/timelines/public').flush([]);
    const serverMode = TestBed.inject(JustMyServer);
    serverMode.ready.set(true);
    serverMode.enabled.set(true);
    TestBed.flushEffects();
    fixture.detectChanges();

    const shortcut = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.feed-shortcuts a[href="/home"]',
    );
    expect(shortcut?.textContent).toContain('Server Friends');
    expect(shortcut?.textContent).not.toContain('Local Feed');
  });
});
