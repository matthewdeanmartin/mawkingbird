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
