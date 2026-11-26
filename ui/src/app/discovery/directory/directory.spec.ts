import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../platform/api/models';
import { Directory, DirectoryOrder } from './directory';

function makeAccount(id: string): Account {
  // `fields` and the counts are read directly by AccountResultCard's template,
  // so a thinner stub renders as a null-deref rather than a missing badge.
  return {
    id,
    username: `u${id}`,
    acct: `u${id}`,
    display_name: `User ${id}`,
    note: '',
    fields: [],
    emojis: [],
    statuses_count: 0,
    followers_count: 0,
    following_count: 0,
  } as unknown as Account;
}

/** `n` accounts with ids offset by `from`, for exercising the page boundary. */
function page(n: number, from = 0): Account[] {
  return Array.from({ length: n }, (_, i) => makeAccount(String(from + i)));
}

interface Internals {
  loading(): boolean;
  loadingMore(): boolean;
  exhausted(): boolean;
  error(): string;
  accounts(): Account[];
  order(): DirectoryOrder;
  local(): boolean;
  loadMore(): void;
  language: { set(v: string): void };
  items(): { account: Account }[];
  unknownLanguage(): { account: Account }[];
  checkLanguages(): void;
  setAdultFilter(v: 'either' | 'hide' | 'only'): void;
  adultCollapsed(id: string): unknown;
}

function internals(f: ComponentFixture<Directory>): Internals {
  return f.componentInstance as unknown as Internals;
}

describe('Directory', () => {
  let http: HttpTestingController;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  /** Cached posts the fake Native archive returns, per account id. */
  let archive: Map<string, unknown[]>;

  beforeEach(() => {
    archive = new Map();
    queryParams = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        // Inert unless a test signs in natively and fills `archive`.
        {
          provide: NATIVE_PROFILES,
          useValue: { accountPosts: async (_h: string, id: string) => archive.get(id) ?? [] },
        },
      ],
    });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { queryParamMap: queryParams, snapshot: { queryParamMap: convertToParamMap({}) } },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Create the page and answer its first directory call with `accounts`. */
  function open(accounts: Account[]): ComponentFixture<Directory> {
    const fixture = TestBed.createComponent(Directory);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    req.flush(accounts);
    // Anything returned triggers a relationships batch; answer it if asked.
    const rels = http.match((r) => r.url === '/api/v1/accounts/relationships');
    for (const r of rels) {
      r.flush([]);
    }
    fixture.detectChanges();
    return fixture;
  }

  it('defaults to recently-active, local-only', () => {
    const fixture = TestBed.createComponent(Directory);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    expect(req.request.params.get('order')).toBe('active');
    expect(req.request.params.get('local')).toBe('true');
    expect(req.request.params.get('limit')).toBe('80');
    req.flush([]);
    const page = internals(fixture);
    expect(page.order()).toBe('active');
    expect(page.local()).toBe(true);
  });

  it('reads order and local out of the URL', () => {
    queryParams.next(convertToParamMap({ order: 'new', local: 'false' }));
    const fixture = TestBed.createComponent(Directory);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    expect(req.request.params.get('order')).toBe('new');
    expect(req.request.params.get('local')).toBe('false');
    req.flush([]);
    expect(internals(fixture).order()).toBe('new');
    expect(internals(fixture).local()).toBe(false);
  });

  it('ignores an unrecognised order rather than passing it through', () => {
    queryParams.next(convertToParamMap({ order: 'sideways' }));
    const fixture = TestBed.createComponent(Directory);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    expect(req.request.params.get('order')).toBe('active');
    req.flush([]);
  });

  it('shows the accounts it loaded', () => {
    const fixture = open(page(3));
    expect(internals(fixture).accounts().length).toBe(3);
    expect(internals(fixture).loading()).toBe(false);
  });

  it('treats a short page as the end of the directory', () => {
    const fixture = open(page(3));
    expect(internals(fixture).exhausted()).toBe(true);
  });

  it('pages by offset and appends the next page', () => {
    const fixture = open(page(80));
    expect(internals(fixture).exhausted()).toBe(false);

    internals(fixture).loadMore();
    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    expect(req.request.params.get('offset')).toBe('80');
    req.flush(page(5, 80));
    const rels = http.match((r) => r.url === '/api/v1/accounts/relationships');
    for (const r of rels) {
      r.flush([]);
    }

    expect(internals(fixture).accounts().length).toBe(85);
    expect(internals(fixture).exhausted()).toBe(true);
  });

  it('drops accounts a shifting offset window repeats', () => {
    // `active` order reshuffles as people post, so the same account can come
    // back on the next offset. Appending it blindly would duplicate a row.
    const fixture = open(page(80));
    internals(fixture).loadMore();
    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    req.flush([makeAccount('79'), makeAccount('80')]);
    const rels = http.match((r) => r.url === '/api/v1/accounts/relationships');
    for (const r of rels) {
      r.flush([]);
    }

    const ids = internals(fixture)
      .accounts()
      .map((a) => a.id);
    expect(ids.length).toBe(81);
    expect(new Set(ids).size).toBe(81);
  });

  it('explains an unavailable directory instead of claiming it is empty', () => {
    const fixture = TestBed.createComponent(Directory);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/directory')
      .flush('', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(internals(fixture).error()).toContain("didn't return a profile directory");
    expect(internals(fixture).loading()).toBe(false);
  });

  it('stops paging when a later page errors, keeping what already loaded', () => {
    const fixture = open(page(80));
    internals(fixture).loadMore();
    http
      .expectOne((r) => r.url === '/api/v1/directory')
      .flush('', { status: 500, statusText: 'Server Error' });

    expect(internals(fixture).accounts().length).toBe(80);
    expect(internals(fixture).exhausted()).toBe(true);
    expect(internals(fixture).loadingMore()).toBe(false);
  });

  it('reloads from scratch when the URL controls change', () => {
    const fixture = open(page(80));
    queryParams.next(convertToParamMap({ order: 'new', local: 'true' }));
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === '/api/v1/directory');
    expect(req.request.params.get('order')).toBe('new');
    // A fresh view, not an append: no offset carried over from the old order.
    expect(req.request.params.get('offset')).toBeNull();
    req.flush(page(2));
    const rels = http.match((r) => r.url === '/api/v1/accounts/relationships');
    for (const r of rels) {
      r.flush([]);
    }
    expect(internals(fixture).accounts().length).toBe(2);
  });

  describe('language and adult filters', () => {
    function person(id: string, note: string): Account {
      return { ...makeAccount(id), note: `<p>${note}</p>` } as Account;
    }
    const english = 'The weather is lovely today and I went for a long walk with the dog';

    it('keeps people whose bio is in the language and hides the ones it cannot tell', () => {
      const fixture = open([person('1', english), person('2', ''), person('3', '')]);
      const state = internals(fixture);
      state.language.set('en');
      fixture.detectChanges();
      expect(state.items().map((i) => i.account.id)).toEqual(['1']);
      expect(state.unknownLanguage().length).toBe(2);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-unknown-language]')?.textContent).toContain('2 people hidden');
      expect(el.querySelector('[data-check-languages]')?.textContent).toContain('(2 requests)');
    });

    it('checks recent posts, one request each, and shows who turns out to match', () => {
      const fixture = open([person('2', ''), person('3', '')]);
      const state = internals(fixture);
      state.language.set('eo');
      state.checkLanguages();
      const requests = http.match((r) => /\/api\/v1\/accounts\/\d+\/statuses$/.test(r.url));
      expect(requests.length).toBe(2);
      requests[0].flush([
        {
          id: 'p',
          created_at: '2026-11-01T00:00:00Z',
          account: state.accounts()[0],
          language: 'eo',
          content: '<p>Saluton</p>',
          spoiler_text: '',
          sensitive: false,
          visibility: 'public',
          media_attachments: [],
          mentions: [],
          tags: [],
          emojis: [],
          reblog: null,
          replies_count: 0,
          reblogs_count: 0,
          favourites_count: 0,
        },
      ]);
      requests[1].flush(null, { status: 500, statusText: 'x' });
      // State only: rendering the checked post would fetch its author's relationship.
      expect(state.items().map((i) => i.account.id)).toEqual(['2']);
      // A failed profile counts as checked, so the offer does not loop on it.
      expect(state.unknownLanguage().length).toBe(0);
    });

    it('collapses adult profiles on Hide', () => {
      const fixture = open([person('1', '18+ MDNI'), person('2', english)]);
      const state = internals(fixture);
      state.setAdultFilter('hide');
      fixture.detectChanges();
      expect(state.adultCollapsed('1')).toBeTruthy();
      expect(state.adultCollapsed('2')).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('app-adult-collapsed'),
      ).not.toBeNull();
    });
  });

  it('uses the Native archive’s cached posts before offering to fetch any', async () => {
    archive.set('1', [
      {
        localId: 1,
        isRead: false,
        status: {
          id: 'c',
          created_at: '2026-11-01T00:00:00Z',
          account: makeAccount('1'),
          language: 'eo',
          content: '<p>x</p>',
          spoiler_text: '',
          sensitive: false,
          visibility: 'public',
          media_attachments: [],
          mentions: [],
          tags: [],
          emojis: [],
          reblog: null,
          replies_count: 0,
          reblogs_count: 0,
          favourites_count: 0,
        },
      },
    ]);
    const auth = TestBed.inject(Auth);
    auth.kind.set('mastodon');
    auth.token.set('native-mastodon:a');
    const fixture = open([makeAccount('1'), makeAccount('2')]);
    const state = internals(fixture);
    state.language.set('eo');
    await vi.waitFor(() => expect(state.items().map((i) => i.account.id)).toEqual(['1']));
    // Only the person the archive knows nothing about still needs a request.
    expect(state.unknownLanguage().map((i) => i.account.id)).toEqual(['2']);
    // The cached post renders and asks for its author's relationship.
    await fixture.whenStable();
    http.match((r) => r.url === '/api/v1/accounts/relationships').forEach((r) => r.flush([]));
  });
});
