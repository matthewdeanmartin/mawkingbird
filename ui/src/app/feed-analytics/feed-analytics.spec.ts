import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { Status } from '../models';
import { FeedAnalytics, FeedSource } from './feed-analytics';

function makeStatus(id: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-03-10T12:00:00Z',
    edited_at: null,
    content: `<p>post ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: {
      id: 'acct-alice',
      username: 'alice',
      acct: 'alice',
      display_name: 'Alice',
      url: 'https://local.example/@alice',
      avatar: '',
      avatar_static: '',
      bot: false,
    } as never,
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
    ...overrides,
  };
}

/** A source that serves `pages` in order and records the cursors it was asked for. */
function makeSource(pages: Status[][], pageSize = 40) {
  const cursors: (string | null)[] = [];
  let call = 0;
  const source: FeedSource = {
    type: 'hashtag',
    query: '#test',
    pageSize,
    fetch: (after) => {
      cursors.push(after?.id ?? null);
      return of(pages[call++] ?? []);
    },
  };
  return { source, cursors, calls: () => call };
}

interface Internals {
  posts: () => Status[];
  loading: () => boolean;
  error: () => boolean;
  apiCalls: () => number;
  report: () => { accounts: { followedAuthors: number | null }; meta: { sampleSize: number } };
}

function internals(fixture: ComponentFixture<FeedAnalytics>): Internals {
  return fixture.componentInstance as unknown as Internals;
}

describe('FeedAnalytics', () => {
  let http: HttpTestingController;
  let anonymous: boolean;

  function mount(source: FeedSource): ComponentFixture<FeedAnalytics> {
    const fixture = TestBed.createComponent(FeedAnalytics);
    fixture.componentRef.setInput('source', source);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    anonymous = true;
    TestBed.configureTestingModule({
      imports: [FeedAnalytics],
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
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('pages until the requested sample size is reached', () => {
    const pages = [
      Array.from({ length: 40 }, (_, i) => makeStatus('a' + i)),
      Array.from({ length: 40 }, (_, i) => makeStatus('b' + i)),
      Array.from({ length: 40 }, (_, i) => makeStatus('c' + i)),
    ];
    const { source, cursors, calls } = makeSource(pages);
    const fixture = mount(source);

    expect(calls()).toBe(3);
    expect(cursors).toEqual([null, 'a39', 'b39']);
    // Trimmed to exactly the sample size, not the 120 fetched.
    expect(internals(fixture).posts()).toHaveLength(100);
    expect(internals(fixture).loading()).toBe(false);
  });

  it('stops early when a short page shows the feed is exhausted', () => {
    const { source, calls } = makeSource([[makeStatus('1'), makeStatus('2')]]);
    const fixture = mount(source);

    expect(calls()).toBe(1);
    expect(internals(fixture).posts()).toHaveLength(2);
    expect(internals(fixture).report().meta.sampleSize).toBe(2);
  });

  it('drops posts a later page repeats, so nothing is double-counted', () => {
    const first = Array.from({ length: 40 }, (_, i) => makeStatus('a' + i));
    const overlapping = [
      ...first.slice(38),
      ...Array.from({ length: 38 }, (_, i) => makeStatus('b' + i)),
    ];
    const { source } = makeSource([first, overlapping, []]);
    const fixture = mount(source);

    const ids = internals(fixture)
      .posts()
      .map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps a partial sample when a page fails mid-collection', () => {
    let call = 0;
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 40,
      fetch: (): Observable<Status[]> =>
        call++ === 0
          ? of(Array.from({ length: 40 }, (_, i) => makeStatus('a' + i)))
          : throwError(() => new Error('boom')),
    };
    const fixture = mount(source);

    expect(internals(fixture).posts()).toHaveLength(40);
    expect(internals(fixture).error()).toBe(false);
    expect(internals(fixture).loading()).toBe(false);
  });

  it('reports an error only when nothing at all could be fetched', () => {
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 40,
      fetch: () => throwError(() => new Error('boom')),
    };
    const fixture = mount(source);

    expect(internals(fixture).error()).toBe(true);
    expect(internals(fixture).posts()).toEqual([]);
  });

  it('makes no relationships call for anonymous viewers', () => {
    mount(makeSource([[makeStatus('1')]]).source);
    http.expectNone((req) => req.url.includes('relationships'));
  });

  it('resolves follows in one batched call when signed in', () => {
    anonymous = false;
    const fixture = mount(makeSource([[makeStatus('1'), makeStatus('2')]]).source);

    const req = http.expectOne((r) => r.url.includes('/api/v1/accounts/relationships'));
    // Both posts share an author, so the batch asks about them once.
    expect(req.request.params.getAll('id[]')).toEqual(['acct-alice']);
    req.flush([{ id: 'acct-alice', following: true }]);
    fixture.detectChanges();

    expect(internals(fixture).report().accounts.followedAuthors).toBe(1);
  });

  it('leaves the follow row unresolved when relationships fail', () => {
    anonymous = false;
    const fixture = mount(makeSource([[makeStatus('1')]]).source);

    http
      .expectOne((r) => r.url.includes('relationships'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(internals(fixture).report().accounts.followedAuthors).toBeNull();
  });

  it('re-collects at the new size when the sample size changes', () => {
    const pages = Array.from({ length: 6 }, (_, page) =>
      Array.from({ length: 40 }, (_, i) => makeStatus(`p${page}-${i}`)),
    );
    const { source, calls } = makeSource(pages);
    const fixture = mount(source);
    expect(internals(fixture).posts()).toHaveLength(100);

    const before = calls();
    fixture.componentInstance.setSampleSize(50);
    fixture.detectChanges();

    expect(calls()).toBeGreaterThan(before);
    expect(internals(fixture).posts()).toHaveLength(50);
  });

  it('does not re-collect when the size is set to what it already is', () => {
    const { source, calls } = makeSource([[makeStatus('1')]]);
    const fixture = mount(source);
    const before = calls();

    fixture.componentInstance.setSampleSize(100);
    fixture.detectChanges();

    expect(calls()).toBe(before);
  });

  it('counts every request it made, including the relationships batch', () => {
    anonymous = false;
    const fixture = mount(makeSource([[makeStatus('1')]]).source);
    http.expectOne((r) => r.url.includes('relationships')).flush([]);

    expect(internals(fixture).apiCalls()).toBe(2);
  });

  it('renders the sampled-not-whole-feed caveat', () => {
    const fixture = mount(makeSource([[makeStatus('1')]]).source);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('posts sampled');
    expect(text).toContain('not the whole feed');
  });

  it('refresh collects a fresh sample from the same feed', () => {
    const { source, calls } = makeSource([[makeStatus('1')], [makeStatus('2')]]);
    const fixture = mount(source);
    const before = calls();

    fixture.componentInstance.refresh();
    fixture.detectChanges();

    expect(calls()).toBe(before + 1);
  });

  it('shows a preview of long tables until expanded', () => {
    const posts = Array.from({ length: 20 }, (_, i) =>
      makeStatus('p' + i, {
        account: { ...makeStatus('x').account, id: 'a' + i, acct: 'user' + i } as never,
      }),
    );
    const fixture = mount(makeSource([posts]).source);
    const component = fixture.componentInstance;

    expect(component.visible('authors', posts)).toHaveLength(8);
    component.toggleExpanded('authors');
    expect(component.isExpanded('authors')).toBe(true);
    expect(component.visible('authors', posts)).toHaveLength(20);
  });
});

describe('FeedAnalytics — synthetic feeds', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FeedAnalytics],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth, useValue: { isAnonymous: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function mountSupplied(posts: Status[]): ComponentFixture<FeedAnalytics> {
    const fixture = TestBed.createComponent(FeedAnalytics);
    fixture.componentRef.setInput('source', { type: 'home', query: 'home', posts });
    fixture.detectChanges();
    return fixture;
  }

  it('analyzes the posts it was handed, without paging or requests', () => {
    const fixture = mountSupplied([makeStatus('1'), makeStatus('2'), makeStatus('3')]);

    expect(internals(fixture).posts()).toHaveLength(3);
    expect(internals(fixture).apiCalls()).toBe(0);
    expect(internals(fixture).report().meta.sampleSize).toBe(3);
    http.expectNone(() => true);
  });

  it('hides the sample-size controls, since paging means nothing here', () => {
    const fixture = mountSupplied([makeStatus('1')]);
    const html = fixture.nativeElement as HTMLElement;

    expect(html.querySelector('.sample-controls')).toBeNull();
    expect(html.textContent).toContain('posts currently loaded');
    expect(html.textContent).toContain('not the whole feed');
  });

  it('re-analyzes when the supplied posts change', () => {
    const fixture = TestBed.createComponent(FeedAnalytics);
    fixture.componentRef.setInput('source', {
      type: 'home',
      query: 'home',
      posts: [makeStatus('1')],
    });
    fixture.detectChanges();
    expect(internals(fixture).posts()).toHaveLength(1);

    fixture.componentRef.setInput('source', {
      type: 'home',
      query: 'home',
      posts: [makeStatus('1'), makeStatus('2')],
    });
    fixture.detectChanges();
    expect(internals(fixture).posts()).toHaveLength(2);
  });
});
