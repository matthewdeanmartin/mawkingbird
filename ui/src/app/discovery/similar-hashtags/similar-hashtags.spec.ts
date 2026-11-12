import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { Status } from '../../platform/api/models';
import { AnonymousAccount } from '../../accounts/anonymous/anonymous-account';
import {
  HashtagSamples,
  parseHashtags,
  parseSimilarParam,
  rankSimilar,
  sampledPosts,
  similarParam,
} from './similar-hashtags';
import { SimilarHashtagsPanel } from './similar-hashtags-panel';

let next = 0;
function post(tags: string[], over: Partial<Status> = {}): Status {
  const id = String(++next);
  return {
    id,
    uri: `https://a.example/statuses/${id}`,
    url: `https://a.example/@x/${id}`,
    created_at: '2026-10-30T12:00:00Z',
    tags: tags.map((name) => ({ name, url: '' })),
    reblog: null,
    ...over,
  } as Status;
}

describe('parseHashtags', () => {
  it('reads free text into distinct valid hashtags, capped at eight', () => {
    expect(parseHashtags('#dog #Dogs, cats  #DOG not-a-tag')).toEqual(['dog', 'Dogs', 'cats']);
    expect(parseHashtags('a b c d e f g h i j')).toHaveLength(8);
    expect(similarParam(['dog', 'dogs'])).toBe('dog,dogs');
    expect(similarParam([])).toBeNull();
    expect(parseSimilarParam('dog,dogs')).toEqual(['dog', 'dogs']);
    expect(parseSimilarParam(null)).toEqual([]);
  });
});

describe('rankSimilar', () => {
  it('counts each other hashtag once per distinct post, most shared first', () => {
    const shared = post(['dog', 'pets', 'Pets', 'puppy']);
    const statuses = [
      shared,
      // The same post again, boosted: still one post.
      post([], { reblog: shared }),
      post(['Dogs', 'pets', 'fedidogs']),
      post(['dog', 'fedidogs']),
      post(['dog', 'adoptdontshop']),
    ];
    expect(rankSimilar(statuses, ['Dog', 'dogs'])).toEqual([
      { name: 'fedidogs', count: 2 },
      { name: 'Pets', count: 2 },
      { name: 'adoptdontshop', count: 1 },
      { name: 'puppy', count: 1 },
    ]);
    expect(sampledPosts(statuses)).toBe(4);
  });
});

describe('HashtagSamples', () => {
  const kind = signal('anonymous');
  const token = signal<string | null>(null);
  let api: { tagTimeline: ReturnType<typeof vi.fn> };
  let http: HttpTestingController;

  beforeEach(() => {
    kind.set('anonymous');
    token.set(null);
    api = { tagTimeline: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { kind, token } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        { provide: AnonymousAccount, useValue: { server: signal('https://mastodon.social') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the union from mastodon.social signed out, paging by the native id', async () => {
    const samples = TestBed.inject(HashtagSamples);
    expect(samples.host()).toBe('mastodon.social');
    const first = firstValueFrom(samples.page(['dog', 'dogs', 'puppy']));
    const req = http.expectOne((r) => r.url === 'https://mastodon.social/api/v1/timelines/tag/dog');
    expect(req.request.params.getAll('any[]')).toEqual(['dogs', 'puppy']);
    expect(req.request.params.get('limit')).toBe('40');
    req.flush([{ ...post(['dog']), id: '99', account: { id: '1', acct: 'x', username: 'x' } }]);
    const [read] = await first;

    void firstValueFrom(samples.page(['dog', 'dogs', 'puppy'], read));
    const older = http.expectOne(
      (r) => r.url === 'https://mastodon.social/api/v1/timelines/tag/dog',
    );
    expect(older.request.params.get('max_id')).toBe('99');
    older.flush([]);
  });

  it("reads your own server's tag timeline when signed in", async () => {
    kind.set('mastodon');
    token.set('t');
    const samples = TestBed.inject(HashtagSamples);
    expect(samples.host()).toBe('home.example');
    await firstValueFrom(samples.page(['dog', 'dogs']));
    expect(api.tagTimeline).toHaveBeenCalledWith('dog', undefined, 40, false, ['dogs']);
  });
});

describe('SimilarHashtagsPanel', () => {
  let fixture: ComponentFixture<SimilarHashtagsPanel>;
  let root: HTMLElement;
  let page: ReturnType<
    typeof vi.fn<(tags: readonly string[], after?: Status) => Observable<Status[]>>
  >;
  let emitted: string[][];

  function fullPage(tags: string[]): Status[] {
    return Array.from({ length: 40 }, () => post(tags));
  }

  async function setUp(tags: string[], signedIn = false, beforeSettle?: () => void): Promise<void> {
    TestBed.configureTestingModule({
      imports: [SimilarHashtagsPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: HashtagSamples, useValue: { host: () => 'mastodon.social', page } },
        {
          provide: Auth,
          useValue: {
            kind: signal(signedIn ? 'mastodon' : 'anonymous'),
            token: signal(signedIn ? 't' : null),
            isAnonymous: false,
            lacksMastodonToken: !signedIn,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SimilarHashtagsPanel);
    fixture.componentRef.setInput('tags', tags);
    emitted = [];
    fixture.componentInstance.tagsChange.subscribe((next) => emitted.push(next));
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
    beforeSettle?.();
    await vi.waitFor(() => expect(fixture.componentInstance['reading']()).toBe(false));
    fixture.detectChanges();
  }

  const rows = () =>
    [...root.querySelectorAll('.similar-row > a')].map((a) =>
      a.textContent!.replace(/\s+/g, ' ').trim(),
    );

  it('samples 200 posts, ranks the other hashtags, and samples more on request', async () => {
    page = vi.fn(() =>
      of([
        ...fullPage(['dog', 'fedidogs']).slice(0, 30),
        ...fullPage(['dog', 'pets']).slice(0, 10),
      ]),
    );
    await setUp(['dog']);
    expect(page).toHaveBeenCalledTimes(5);
    expect(rows()).toEqual(['#fedidogs 150 posts', '#pets 50 posts']);
    expect(root.querySelector('.summary')?.textContent).toContain(
      '200 recent posts from mastodon.social',
    );

    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Sample 200 more'))!
      .click();
    await vi.waitFor(() => expect(page).toHaveBeenCalledTimes(10));
    await vi.waitFor(() => expect(fixture.componentInstance['reading']()).toBe(false));
    fixture.detectChanges();
    expect(rows()[0]).toBe('#fedidogs 300 posts');
  });

  it('marks the hashtags you already follow, which sampled posts cannot say', async () => {
    page = vi.fn(() => of([post(['dog', 'puppy', 'pets'])]));
    await setUp(['dog'], true, () => {
      TestBed.inject(HttpTestingController)
        .expectOne((req) => req.url === '/api/v1/followed_tags')
        .flush([{ name: 'Puppy', url: '', history: [] }]);
    });
    fixture.detectChanges();
    const labels = Object.fromEntries(
      [...root.querySelectorAll('.similar-row')].map((row) => [
        row.querySelector('a')!.textContent!.trim().split(' ')[0],
        row.querySelector('app-tag-actions button')?.textContent?.trim(),
      ]),
    );
    expect(labels).toEqual({ '#puppy': 'Following', '#pets': 'Follow' });
  });

  it('stops at the end of the timeline and offers no more', async () => {
    page = vi.fn(() => of([post(['dog', 'puppy'])]));
    await setUp(['dog']);
    expect(page).toHaveBeenCalledOnce();
    expect(rows()).toEqual(['#puppy 1 post']);
    expect(root.textContent).not.toContain('Sample 200 more');
  });

  it('asks the host to add, remove or switch hashtags', async () => {
    page = vi.fn(() => of([post(['dog', 'puppy'])]));
    await setUp(['dog', 'dogs']);
    const row = root.querySelector('.similar-row')!;
    const button = (label: string) =>
      [...row.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      )!;
    button('+ Add').click();
    button('Similar').click();
    root.querySelector<HTMLButtonElement>('.seed-remove')!.click();
    fixture.componentInstance['draft'].set('#cats, #Dog');
    fixture.detectChanges();
    root.querySelector<HTMLFormElement>('.seed-add')!.dispatchEvent(new Event('submit'));
    expect(emitted).toEqual([
      ['dog', 'dogs', 'puppy'],
      ['puppy'],
      ['dogs'],
      ['dog', 'dogs', 'cats'],
    ]);
  });

  it('says when the server would not answer, and retries', async () => {
    const answers = new Subject<Status[]>();
    page = vi.fn(() => throwError(() => new Error('401')));
    await setUp(['dog']);
    fixture.detectChanges();
    expect(root.querySelector('.failed')?.textContent).toContain(
      "Couldn't read recent posts from mastodon.social.",
    );
    page.mockImplementation(() => answers);
    [...root.querySelectorAll<HTMLButtonElement>('.failed button')][0].click();
    answers.next([post(['dog', 'puppy'])]);
    answers.complete();
    await vi.waitFor(() => expect(fixture.componentInstance['reading']()).toBe(false));
    fixture.detectChanges();
    expect(rows()).toEqual(['#puppy 1 post']);
  });
});
