import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../platform/api/models';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import { AnonymousPublicApi } from '../accounts/anonymous/anonymous-public-api';
import { BlogPost, DEFAULT_BLOG_THRESHOLDS } from './blog-classifier';
import { BlogSource } from './blog-source';
import {
  BlogSearch,
  matchRemembered,
  mightStartStorm,
  quickKind,
  STORM_CHECKS,
} from './blog-search';
import { BlogSearchPage } from './blog-search-page';

const ann = {
  id: '2',
  acct: 'ann',
  username: 'ann',
  display_name: 'Ann',
  url: 'https://home.example/@ann',
} as Account;
const bob = { ...ann, id: '3', acct: 'bob', username: 'bob', display_name: 'Bob' };

function post(id: string, content: string, extra: Partial<Status> = {}): Status {
  return {
    id,
    url: `https://home.example/@ann/${id}`,
    created_at: '2026-10-01T00:00:00Z',
    content,
    visibility: 'public',
    account: ann,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    replies_count: 0,
    reblog: null,
    ...extra,
  } as unknown as Status;
}
const long = `<p>An essay<br>${'word '.repeat(300)}</p>`;

describe('quickKind and mightStartStorm', () => {
  it('knows long, marked and storm parts without fetching', () => {
    const t = DEFAULT_BLOG_THRESHOLDS;
    expect(quickKind(post('1', long), t)).toBe('long');
    expect(quickKind(post('2', '<p>BLOG: hi</p>'), t)).toBe('marked');
    expect(
      quickKind(post('3', '<p>2/5</p>', { in_reply_to_id: '1', in_reply_to_account_id: '2' }), t),
    ).toBe('part');
    expect(
      quickKind(
        post('4', '<p>@x yes</p>', { in_reply_to_id: '9', in_reply_to_account_id: '7' }),
        t,
      ),
    ).toBeNull();
    expect(mightStartStorm(post('5', '<p>1/</p>', { replies_count: 4 }))).toBe(true);
    expect(mightStartStorm(post('6', '<p>hi</p>'))).toBe(false);
  });
});

describe('matchRemembered', () => {
  it('needs every word, in the title or excerpt, ignoring case', () => {
    const entry = (title: string, excerpt: string) => ({
      handle: 'a@b.example',
      post: { title, excerpt } as BlogPost,
    });
    const entries = [entry('On Bees', 'they dance'), entry('Wasps', 'they sting')];
    expect(matchRemembered(entries, 'bees DANCE').map((e) => e.post.title)).toEqual(['On Bees']);
    expect(matchRemembered(entries, 'they')).toHaveLength(2);
    expect(matchRemembered(entries, '  ')).toEqual([]);
  });
});

describe('BlogSearch', () => {
  const api = { search: vi.fn(), getContext: vi.fn() };
  const publicApi = { searchPostsByHashtags: vi.fn(), getContext: vi.fn() };
  let signedIn = true;

  beforeEach(() => {
    vi.resetAllMocks();
    signedIn = true;
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: AnonymousPublicApi, useValue: publicApi },
        {
          provide: Auth,
          useValue: {
            get lacksMastodonToken() {
              return !signedIn;
            },
            token: () => null,
          },
        },
      ],
    });
  });

  it('keeps blog posts among the hits, checking threads for short storm starts', async () => {
    const start = post('10', '<p>Thread about bees</p>', { replies_count: 3 });
    const chatter = post('11', '<p>bees!</p>');
    const boosted = post('12', long, { reblog: post('99', long) });
    const priv = post('13', long, { visibility: 'private' });
    api.search.mockReturnValue(
      of({
        statuses: [post('1', long), start, chatter, boosted, priv],
        accounts: [],
        hashtags: [],
      }),
    );
    api.getContext.mockReturnValue(
      of({
        ancestors: [],
        descendants: [
          post('20', `<p>${'word '.repeat(50)}</p>`, {
            in_reply_to_id: '10',
            in_reply_to_account_id: '2',
          }),
          post('21', '<p>nice</p>', {
            in_reply_to_id: '10',
            in_reply_to_account_id: '2',
            account: bob,
          }),
          post('22', `<p>${'word '.repeat(50)}</p>`, {
            in_reply_to_id: '20',
            in_reply_to_account_id: '2',
          }),
        ],
      }),
    );
    const hits = await TestBed.inject(BlogSearch).search('bees', DEFAULT_BLOG_THRESHOLDS);
    expect(hits.map((h) => [h.status.id, h.kind])).toEqual([
      ['1', 'long'],
      ['10', 'storm'],
    ]);
    expect(hits[1].title).toBe('Thread about bees');
    expect(api.getContext).toHaveBeenCalledTimes(1);
  });

  it(`reads at most ${STORM_CHECKS} threads per search`, async () => {
    const starts = Array.from({ length: STORM_CHECKS + 4 }, (_, i) =>
      post(String(i), '<p>maybe</p>', { replies_count: 1 }),
    );
    api.search.mockReturnValue(of({ statuses: starts, accounts: [], hashtags: [] }));
    api.getContext.mockReturnValue(of({ ancestors: [], descendants: [] }));
    await TestBed.inject(BlogSearch).search('maybe', DEFAULT_BLOG_THRESHOLDS);
    expect(api.getContext).toHaveBeenCalledTimes(STORM_CHECKS);
  });

  it('searches hashtags without an account', async () => {
    signedIn = false;
    publicApi.searchPostsByHashtags.mockReturnValue(
      of({ statuses: [post('1', long)], accounts: [], hashtags: [] }),
    );
    const search = TestBed.inject(BlogSearch);
    expect(search.byText).toBe(false);
    expect(await search.search('bees', DEFAULT_BLOG_THRESHOLDS)).toHaveLength(1);
    expect(api.search).not.toHaveBeenCalled();
  });

  it('does nothing for an empty query', async () => {
    expect(await TestBed.inject(BlogSearch).search('  ', DEFAULT_BLOG_THRESHOLDS)).toEqual([]);
    expect(api.search).not.toHaveBeenCalled();
  });
});

describe('BlogSearchPage', () => {
  const search = { search: vi.fn(), remembered: vi.fn(), byText: true };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BlogSearch, useValue: search },
        { provide: BlogSource, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: new BehaviorSubject(convertToParamMap({ q: 'bees' })) },
        },
      ],
    });
  });

  it('searches the query from the address, and the blogs already opened', async () => {
    search.remembered.mockReturnValue([
      {
        handle: 'ann@home.example',
        post: { id: '5', title: 'Opened bees', excerpt: '', root: post('5', '') },
      },
    ]);
    search.search.mockResolvedValue([{ status: post('1', long), kind: 'long', title: 'An essay' }]);
    const fixture = TestBed.createComponent(BlogSearchPage);
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    const el = fixture.nativeElement as HTMLElement;
    expect(search.search).toHaveBeenCalledWith('bees', DEFAULT_BLOG_THRESHOLDS);
    expect(el.querySelector<HTMLInputElement>('input[name="blog_q"]')!.value).toBe('bees');
    expect(el.textContent).toContain("In blogs you've opened");
    expect(el.querySelector('a[href="/blog/@ann@home.example/5"]')?.textContent).toContain(
      'Opened bees',
    );
    expect(el.querySelector('a[href="/blog/@ann@home.example/1"]')?.textContent).toContain(
      'An essay',
    );
    expect(el.textContent).toContain('long post');
  });

  it('opens a full handle from the back shed and rejects a bare one', async () => {
    search.remembered.mockReturnValue([]);
    search.search.mockResolvedValue([]);
    const fixture = TestBed.createComponent(BlogSearchPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const shed = el.querySelector('details.shed') as HTMLDetailsElement;
    expect(shed.open).toBe(false);
    const input = shed.querySelector<HTMLInputElement>('input[name="blog_handle"]')!;
    const form = shed.querySelector('form')!;
    input.value = '@alice';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Use the full handle');
    input.value = 'Alice@Far.Example';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    expect(navigate).toHaveBeenCalledWith(['/blog', '@Alice@far.example']);
  });
});
