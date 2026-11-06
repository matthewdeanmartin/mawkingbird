import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, signal } from '@angular/core';
import { TestBed, DeferBlockBehavior } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { FollowButton } from '../../follow-button/follow-button';
import { FutureTagHints } from '../../future-tag-hints';
import { HomeTopics } from '../../home-topics';
import { ImportFollows } from '../../import-follows';
import { loginDestination } from '../../login-destination';
import { Status } from '../../models';
import { focusedAppFor } from '../../shell/mode-nav';
import { StatusCard } from '../../status-card/status-card';
import { FeedBuilderPage } from './feed-builder-page';
import { FeedBuilderEntry, feedBuilderPageAt } from './feed-builder-registry';
import { loadFeedPage } from './feed-builder-routes';
import { FeedPreview } from './feed-preview';
import { FeedSelection } from './feed-selection';

const ENTRY = feedBuilderPageAt('it/fantascienza-su-mastodon') as FeedBuilderEntry;

function route(data: object, path: string) {
  return {
    provide: ActivatedRoute,
    useValue: {
      snapshot: {
        data,
        pathFromRoot: [{ routeConfig: null }, { routeConfig: { path } }],
        paramMap: convertToParamMap({}),
        queryParamMap: convertToParamMap({}),
      },
      paramMap: of(convertToParamMap({})),
      queryParamMap: of(convertToParamMap({})),
    },
  };
}

@Component({ selector: 'app-follow-button', template: '<button>stub</button>' })
class FollowButtonStub {
  readonly accountId = input('');
  readonly handle = input('');
  readonly foreign = input<unknown>(null);
}

@Component({ selector: 'app-status-card', template: '<article>{{ status().id }}</article>' })
class StatusCardStub {
  readonly status = input.required<Status>();
}

async function builder(inShell: boolean, followed: string[] = [], entry = ENTRY) {
  const page = await loadFeedPage(entry);
  const api = {
    followTag: vi.fn((name: string) => of({ name, following: true })),
    lists: vi.fn(() => of([])),
    createList: vi.fn((title: string) => of({ id: 'L1', title })),
    updateList: vi.fn((list: object, exclusive: boolean) => of({ ...list, exclusive })),
    addManyToList: vi.fn(() => of({})),
  };
  const importer = {
    rows: signal<{ handle: string; status: string; account?: { id: string } }[]>([]),
    running: signal(false),
    reset: vi.fn(),
    load: vi.fn(),
    start: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
    imports: [FeedBuilderPage],
    providers: [
      provideRouter([]),
      route({ page, lang: entry.lang, inShell }, entry.path),
      { provide: Api, useValue: api },
      { provide: HomeTopics, useValue: { followed: async () => followed } },
      { provide: ImportFollows, useValue: importer },
    ],
  });
  TestBed.overrideComponent(FeedBuilderPage, {
    remove: { imports: [FollowButton] },
    add: { imports: [FollowButtonStub] },
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(FeedBuilderPage);
  fixture.detectChanges();
  await fixture.whenStable();
  if (inShell) {
    // The follow services arrive by dynamic import (never on the public page),
    // then the already-followed tags are read.
    const instance = fixture.componentInstance as unknown as { actions: () => unknown };
    // The first import in a run compiles the module graph, which can take seconds.
    await vi.waitFor(() => expect(instance.actions()).not.toBeNull(), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve));
  }
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, importer, page };
}

const buttonNamed = (el: HTMLElement, pattern: RegExp) =>
  [...el.querySelectorAll('button')].find((b) => pattern.test(b.textContent ?? '')) as
    HTMLButtonElement | undefined;

describe('Feed Builder as a mini-app', () => {
  it('is a focused app whose root sign-in may return to', () => {
    const app = focusedAppFor('/it/fantascienza-su-mastodon/preview');
    expect(app?.root).toBe('/it/fantascienza-su-mastodon');
    expect(app?.items.map((item) => item.id)).toEqual(['builder', 'preview', 'flooding']);
    expect(loginDestination('/it/fantascienza-su-mastodon')).toBe('/it/fantascienza-su-mastodon');
  });

  it('signed out: Builder and Preview tabs, sign-in that comes back, no checkboxes', async () => {
    const { el } = await builder(false);
    expect(el.querySelector('nav a[href="/it/fantascienza-su-mastodon/preview"]')).not.toBeNull();
    const signIn = el.querySelector('header a[href^="/login/mastodon"]');
    expect(signIn?.getAttribute('href')).toContain('next=%2Fit%2Ffantascienza-su-mastodon');
    expect(el.querySelector('mb-checkbox')).toBeNull();
    // People open in Mawkingbird's profile view, not on their home server.
    const first = el.querySelector('.people li a') as HTMLAnchorElement;
    expect(first.getAttribute('href')).toMatch(/^\/accounts\/@[^@]+@[^@]+$/);
  });

  it('signed in: everything ticked by default, and untick to leave things out', async () => {
    const { fixture, el, api, page } = await builder(true, ['StarTrek']);
    expect(el.querySelector('header')).toBeNull(); // the shell supplies it
    const tagBoxes = [...el.querySelectorAll('#tags-heading ~ ul mb-checkbox input')];
    expect(tagBoxes.length).toBe(page.data.tags.filter((t) => t.kind === 'tag').length);
    expect(tagBoxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    // Already-followed tags say so, and are not counted again.
    expect(el.textContent).toContain('Seguito');
    const followTags = buttonNamed(el, /hashtag selezionati/) as HTMLButtonElement;
    expect(followTags.textContent).toContain(String(tagBoxes.length - 1));
    expect(followTags.parentElement?.textContent).toContain('1 già seguiti');

    TestBed.inject(FeedSelection).setTag('science-fiction.it', 'StarWars', false);
    fixture.detectChanges();
    expect(followTags.textContent).toContain(String(tagBoxes.length - 2));
    followTags.click();
    await fixture.whenStable();
    const followed = api.followTag.mock.calls.map(([name]) => name);
    expect(followed).not.toContain('StarWars');
    expect(followed).not.toContain('StarTrek');
    expect(followed).toContain('Fantascienza');
  });

  it('follows one hashtag on its own', async () => {
    const { fixture, el, api } = await builder(true);
    const row = [...el.querySelectorAll('.tag-list li')].find((li) =>
      li.textContent?.includes('#Fantascienza'),
    ) as HTMLElement;
    (buttonNamed(row, /^\s*Segui\s*$/) as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.followTag).toHaveBeenCalledWith('Fantascienza');
    expect(row.textContent).toContain('Seguito');
  });

  it('follows the ticked people by handle, so each resolves on the reader’s server', async () => {
    const { fixture, el, importer, page } = await builder(true);
    const selection = TestBed.inject(FeedSelection);
    selection.setAllPeople(
      'science-fiction.it',
      page.data.people.map((p) => p.acct),
      true,
    );
    const [first, ...rest] = page.data.people;
    selection.setPerson('science-fiction.it', first.acct, false);
    fixture.detectChanges();
    (buttonNamed(el, /persone selezionate/) as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(importer.load).toHaveBeenCalledWith(rest.map((p) => p.acct));
    expect(importer.start).toHaveBeenCalled();
  });

  it('follows one group from the summary table, or the ones also on YouTube', async () => {
    const { fixture, el, importer, page } = await builder(true);
    const community = page.data.people.filter((p) => p.shelf === 'community');
    const [skip, ...keep] = community;
    TestBed.inject(FeedSelection).setPerson('science-fiction.it', skip.acct, false);
    fixture.detectChanges();
    const shelfRow = [...el.querySelectorAll('.people-groups tbody tr')].find(
      (r) => r.querySelector('th')?.textContent?.trim() === page.chrome.shelves.community.heading,
    ) as Element;
    expect(shelfRow.querySelector('.count')?.textContent?.trim()).toBe(String(community.length));
    expect(shelfRow.querySelector('button')?.textContent).toContain(`Segui ${keep.length}`);
    (shelfRow.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(importer.load).toHaveBeenLastCalledWith(keep.map((p) => p.acct));

    const youtube = page.data.people.filter((p) => p.youtube && p.acct !== skip.acct);
    const also = el.querySelector('#also-youtube-heading')?.parentElement as HTMLElement;
    (buttonNamed(also, /su Mastodon/) as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(new Set(importer.load.mock.calls.at(-1)?.[0])).toEqual(
      new Set(youtube.map((p) => p.acct)),
    );
  });

  it('offers a list of the people it followed once the batch is done, hidden from Home on request', async () => {
    const { fixture, el, api, importer, page } = await builder(true);
    expect(buttonNamed(el, /lista/)).toBeUndefined();
    const [a, b, c] = page.data.people;
    importer.rows.set([
      { handle: a.acct, status: 'followed', account: { id: '11' } },
      { handle: b.acct, status: 'not_found' },
      { handle: c.acct, status: 'followed', account: { id: '33' } },
    ]);
    fixture.detectChanges();
    const make = buttonNamed(el, /Mettili in una lista: Fantascienza e fantasy/) as HTMLElement;
    const hide = el.querySelector('.list-actions mb-checkbox input') as HTMLInputElement;
    expect(hide.checked).toBe(false);
    hide.click();
    fixture.detectChanges();
    make.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.createList).toHaveBeenCalledWith('Fantascienza e fantasy');
    expect(api.updateList).toHaveBeenCalledWith(expect.objectContaining({ id: 'L1' }), true);
    expect(api.addManyToList).toHaveBeenCalledWith('L1', ['11', '33']);
    expect(el.textContent).toContain('2 persone aggiunte alla lista Fantascienza e fantasy.');
    expect(el.querySelector('.list-actions a[href="/lists/L1"]')).not.toBeNull();
  });

  it('no account yet: points at mastodon.social, the topic’s servers and the handle generator', async () => {
    const { el } = await builder(false);
    const hint = el.querySelector('.no-account') as HTMLElement;
    const servers = [...hint.querySelectorAll('a[href^="https://"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(servers[0]).toBe('https://mastodon.social/about');
    expect(servers.length).toBeGreaterThan(1);
    expect(servers.length).toBeLessThanOrEqual(4);
    expect(hint.querySelector('a[href^="/"]')?.getAttribute('href')).toMatch(/handle|utente|nome/);
    // Signed in, the step is gone.
    TestBed.resetTestingModule();
    expect((await builder(true)).el.querySelector('.no-account')).toBeNull();
  });

  it('remembers the page’s future tags for the composer once a hashtag is followed', async () => {
    const ja = feedBuilderPageAt('ja/science-fiction-on-mastodon') as FeedBuilderEntry;
    const { fixture, el } = await builder(true, [], ja);
    const hints = TestBed.inject(FutureTagHints);
    const remember = vi.spyOn(hints, 'remember').mockImplementation(() => undefined);
    (buttonNamed(el, /ハッシュタグをフォロー/) as HTMLButtonElement).click();
    await fixture.whenStable();
    const [key, topic] = remember.mock.calls.at(-1) ?? [];
    expect(key).toBe('science-fiction.ja');
    expect(topic?.lang).toBe('ja');
    expect(topic?.futures).toContainEqual({ tag: 'スタートレック', source: 'StarTrek' });
    expect(topic?.topicTags).toContain('StarTrek');
  });
});

describe('Feed Builder preview', () => {
  async function preview(inShell: boolean) {
    const page = await loadFeedPage(ENTRY);
    TestBed.configureTestingModule({
      imports: [FeedPreview],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        route({ page, lang: ENTRY.lang, inShell }, `${ENTRY.path}/preview`),
      ],
    });
    TestBed.overrideComponent(FeedPreview, {
      remove: { imports: [StatusCard] },
      add: { imports: [StatusCardStub] },
    });
    await TestBed.compileComponents();
    return { page, http: TestBed.inject(HttpTestingController) };
  }

  const answer = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${i}`,
      uri: `https://x/${prefix}${i}`,
      created_at: new Date(Date.UTC(2026, 10, 4) - i * 60_000).toISOString(),
      account: { id: '1', username: 'a', acct: 'a' },
      reblog: null,
      in_reply_to_id: null,
    }));

  /** Answer every outstanding request, and say how many there were. */
  async function flushRound(http: HttpTestingController, posts = 5): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      const pending = http.match(() => true);
      if (!pending.length) break;
      for (const request of pending) {
        urls.push(request.request.urlWithParams);
        request.flush(
          answer(`r${urls.length}-`, Number(request.request.params.get('limit') ?? posts)),
        );
      }
    }
    return urls;
  }

  it('reads a small random sample of the ticked tags and people, never Home', async () => {
    const { page, http } = await preview(true);
    const selection = TestBed.inject(FeedSelection);
    selection.setTag('science-fiction.it', 'StarWars', false);
    selection.setPerson('science-fiction.it', page.data.people[0].acct, false);
    const fixture = TestBed.createComponent(FeedPreview);
    fixture.detectChanges();
    const urls = await flushRound(http);
    await fixture.whenStable();
    fixture.detectChanges();
    const tagCalls = urls.filter((url) => url.includes('/timelines/tag/'));
    const personCalls = urls.filter((url) => url.includes('/accounts/'));
    expect(tagCalls.length).toBe(3);
    expect(personCalls.length).toBe(5);
    expect(tagCalls.every((url) => url.includes('limit=5'))).toBe(true);
    expect(personCalls.every((url) => url.includes('limit=3'))).toBe(true);
    expect(tagCalls.some((url) => url.includes('/tag/StarWars'))).toBe(false);
    const firstPerson = page.data.people[0];
    expect(personCalls.some((url) => url.includes(`/accounts/${firstPerson.id}/`))).toBe(false);
    // Each person is read from their own server by the id the page carries.
    expect(
      personCalls.every((url) => /^https:\/\/[^/]+\/api\/v1\/accounts\/\d+\/statuses/.test(url)),
    ).toBe(true);
    expect(urls.some((url) => url.includes('/timelines/home'))).toBe(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('article').length).toBe(3 * 5 + 5 * 3);
    http.verify();
  });

  it('draws a new sample on Shuffle, with a progress bar while it reads', async () => {
    const { http } = await preview(false);
    const fixture = TestBed.createComponent(FeedPreview);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
    await flushRound(http);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
    (el.querySelector('.bulk-actions button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
    const second = await flushRound(http);
    expect(second.length).toBe(8);
    http.verify();
  });

  it('says what to do when nothing is ticked, and asks no server', async () => {
    const { page, http } = await preview(false);
    const selection = TestBed.inject(FeedSelection);
    selection.setAllTags(
      'science-fiction.it',
      page.data.tags.map((t) => t.name),
      false,
    );
    selection.setAllPeople(
      'science-fiction.it',
      page.data.people.map((p) => p.acct),
      false,
    );
    const fixture = TestBed.createComponent(FeedPreview);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    http.expectNone(() => true);
    expect(el.textContent).toContain('Ancora niente da mostrare');
    expect(el.querySelector('header a[aria-current="page"]')?.textContent).toContain('Anteprima');
  });
});

describe('FeedSelection', () => {
  it('starts with everything ticked and remembers what was unticked, per page', () => {
    const selection = new FeedSelection();
    expect(selection.selectedTags('a', ['X', 'Y'])).toEqual(['X', 'Y']);
    selection.setTag('a', 'x', false);
    expect(selection.selectedTags('a', ['X', 'Y'])).toEqual(['Y']);
    expect(selection.selectedTags('b', ['X'])).toEqual(['X']);
    selection.setAllTags('a', ['X', 'Y'], false);
    expect(selection.selectedTags('a', ['X', 'Y'])).toEqual([]);
    selection.setAllTags('a', [], true);
    selection.setPerson('a', 'P@x.social', false);
    expect(selection.personOn('a', 'p@X.social')).toBe(false);
  });
});
