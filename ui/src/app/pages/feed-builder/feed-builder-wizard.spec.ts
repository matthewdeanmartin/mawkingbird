import { Component, input, signal } from '@angular/core';
import { TestBed, DeferBlockBehavior } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../../api';
import { FollowButton } from '../../follow-button/follow-button';
import { HomeTopics } from '../../home-topics';
import { ImportFollows } from '../../import-follows';
import { loginDestination } from '../../login-destination';
import { Status } from '../../models';
import { AnonymousMastodonProvider } from '../../providers/anonymous/anonymous-mastodon-provider';
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

async function builder(inShell: boolean, followed: string[] = []) {
  const page = await loadFeedPage(ENTRY);
  const api = { followTag: vi.fn((name: string) => of({ name, following: true })) };
  const importer = {
    rows: signal<{ handle: string; status: string }[]>([]),
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
      route({ page, lang: ENTRY.lang, inShell }, ENTRY.path),
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
    await vi.waitFor(() => expect(instance.actions()).not.toBeNull());
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
    expect(app?.items.map((item) => item.id)).toEqual(['builder', 'preview']);
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
});

describe('Feed Builder preview', () => {
  async function preview(inShell: boolean) {
    const page = await loadFeedPage(ENTRY);
    const fetchPage = vi.fn(() =>
      of({
        statuses: [{ id: 'p1' }, { id: 'p2' }] as Status[],
        warnings: [],
        hasMore: false,
        outcomes: [],
      }),
    );
    const provider = { createFollowFeed: vi.fn(() => ({ fetchPage })) };
    TestBed.configureTestingModule({
      imports: [FeedPreview],
      providers: [
        provideRouter([]),
        route({ page, lang: ENTRY.lang, inShell }, `${ENTRY.path}/preview`),
        { provide: AnonymousMastodonProvider, useValue: provider },
      ],
    });
    TestBed.overrideComponent(FeedPreview, {
      remove: { imports: [StatusCard] },
      add: { imports: [StatusCardStub] },
    });
    return { page, provider, fetchPage };
  }

  it('reads the ticked tags and people anonymously, never Home', async () => {
    const { page, provider } = await preview(true);
    const selection = TestBed.inject(FeedSelection);
    selection.setAllTags('science-fiction.it', [], true);
    selection.setAllPeople('science-fiction.it', [], true);
    selection.setTag('science-fiction.it', 'StarWars', false);
    selection.setPerson('science-fiction.it', page.data.people[0].acct, false);
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeedPreview);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const calls = provider.createFollowFeed.mock.calls as unknown as [
      { handle: string; readRef: { accountId: string } }[],
      unknown,
      string[],
    ][];
    const [follows, , tags] = calls[0];
    expect(tags).not.toContain('StarWars');
    expect(tags).toContain('Fantascienza');
    expect(follows.length).toBe(page.data.people.length - 1);
    // Read through each person's home-server id; nothing is followed.
    expect(follows[0].readRef.accountId).toMatch(/^\d+$/);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('article').length).toBe(2);
    expect(el.querySelector('header')).toBeNull();
  });

  it('says what to do when nothing is ticked', async () => {
    const { provider, page } = await preview(false);
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
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeedPreview);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(provider.createFollowFeed).not.toHaveBeenCalled();
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
