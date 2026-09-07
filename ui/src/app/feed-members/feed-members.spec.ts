import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { Account, Status } from '../models';
import { FeedSource } from '../feed-sample';
import { FeedMembers } from './feed-members';

function makeAccount(acct: string, overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-' + acct,
    username: acct,
    acct,
    display_name: acct,
    url: `https://local.example/@${acct}`,
    avatar: '',
    avatar_static: '',
    bot: false,
    ...overrides,
  } as Account;
}

function makeStatus(id: string, acct = 'alice', overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-03-10T12:00:00Z',
    content: `<p>${id}</p>`,
    spoiler_text: '',
    account: makeAccount(acct),
    reblog: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    media_attachments: [],
    ...overrides,
  } as Status;
}

interface Internals {
  authors: () => { account: Account; count: number; share: number }[];
  posts: () => Status[];
  loading: () => boolean;
  error: () => boolean;
  paged: () => boolean;
}

function internals(fixture: ComponentFixture<FeedMembers>): Internals {
  return fixture.componentInstance as unknown as Internals;
}

describe('FeedMembers', () => {
  let http: HttpTestingController;
  let anonymous: boolean;

  function mount(source: FeedSource): ComponentFixture<FeedMembers> {
    const fixture = TestBed.createComponent(FeedMembers);
    fixture.componentRef.setInput('source', source);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    anonymous = true;
    TestBed.configureTestingModule({
      imports: [FeedMembers],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            get isAnonymous() {
              return anonymous;
            },
            // The follow button on each row asks who "me" is, so it can decline
            // to offer following yourself.
            account: () => (anonymous ? null : { id: 'me' }),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const supplied = (posts: Status[]): FeedSource => ({ type: 'home', query: 'home', posts });

  it('ranks the accounts posting in the feed by how much they posted', () => {
    const fixture = mount(
      supplied([
        makeStatus('1', 'alice'),
        makeStatus('2', 'bob'),
        makeStatus('3', 'alice'),
        makeStatus('4', 'alice'),
      ]),
    );

    const authors = internals(fixture).authors();
    expect(authors.map((a) => a.account.acct)).toEqual(['alice', 'bob']);
    expect(authors[0].count).toBe(3);
    expect(authors[0].share).toBeCloseTo(0.75);
  });

  it('credits a boost to whoever wrote the original', () => {
    const fixture = mount(
      supplied([makeStatus('boost', 'booster', { reblog: makeStatus('orig', 'writer') })]),
    );
    expect(
      internals(fixture)
        .authors()
        .map((a) => a.account.acct),
    ).toEqual(['writer']);
  });

  it('takes a synthetic feed as given, without paging or requests', () => {
    const fixture = mount(supplied([makeStatus('1'), makeStatus('2')]));
    expect(internals(fixture).paged()).toBe(false);
    expect(internals(fixture).posts()).toHaveLength(2);
    http.expectNone(() => true);
  });

  it('pages a real timeline until the sample is full', () => {
    let call = 0;
    const pages = [
      Array.from({ length: 40 }, (_, i) => makeStatus('a' + i, 'u' + i)),
      Array.from({ length: 40 }, (_, i) => makeStatus('b' + i, 'v' + i)),
      Array.from({ length: 40 }, (_, i) => makeStatus('c' + i, 'w' + i)),
    ];
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 40,
      fetch: () => of(pages[call++] ?? []),
    };
    const fixture = mount(source);

    expect(internals(fixture).paged()).toBe(true);
    expect(internals(fixture).posts()).toHaveLength(100);
    expect(internals(fixture).authors()).toHaveLength(100);
  });

  it('renders one row per account with its post count', () => {
    const fixture = mount(supplied([makeStatus('1', 'alice'), makeStatus('2', 'alice')]));
    const html = fixture.nativeElement as HTMLElement;

    expect(html.querySelectorAll('.member-row')).toHaveLength(1);
    expect(html.textContent).toContain('@alice');
    expect(html.textContent).toContain('2 posts');
  });

  it('says plainly that membership here is emergent, not a roster', () => {
    const fixture = mount(supplied([makeStatus('1')]));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "There's no membership list",
    );
  });

  it('shows an empty state rather than an error for an empty feed', () => {
    const fixture = mount(supplied([]));
    expect(internals(fixture).error()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nobody has posted here');
  });

  it('offers Follow per row, reflecting who the viewer already follows', async () => {
    anonymous = false;
    const fixture = mount(supplied([makeStatus('1', 'alice'), makeStatus('2', 'bob')]));

    const req = http.expectOne((r) => r.url.includes('/api/v1/accounts/relationships'));
    expect(req.request.params.getAll('id[]')).toEqual(['acct-alice', 'acct-bob']);
    req.flush([
      { id: 'acct-alice', following: true },
      { id: 'acct-bob', following: false },
    ]);
    // The resolve is promise-based, so let it settle before reading the DOM.
    await fixture.whenStable();
    fixture.detectChanges();

    // This list used to print the word "following" and stop there. Each row now
    // carries the button, so the answer is actionable rather than trivia.
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.follow-btn'),
    ).map((button) => button.textContent?.trim());
    expect(labels).toEqual(['Following', 'Follow']);
  });

  it('makes no relationships call for anonymous viewers', () => {
    mount(supplied([makeStatus('1')]));
    http.expectNone((req) => req.url.includes('relationships'));
  });

  it('flags bot accounts', () => {
    const fixture = mount(
      supplied([makeStatus('1', 'botty', { account: makeAccount('botty', { bot: true }) })]),
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('.bot-tag')).not.toBeNull();
  });
});
