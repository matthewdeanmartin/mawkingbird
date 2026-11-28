import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkTimeline } from '../../feeds/link-timeline/link-timeline';
import { Api } from '../../platform/api/api';
import { Server } from '../../platform/http/server';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { StatusCard } from '../../posts/status-card/status-card';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';
import { post } from '../../testing/forum-fixtures';
import {
  MIN_SIDEBAR_VERSION,
  PAGE_PANEL_DRAFT_CONTEXT,
  PANEL_CHANNEL,
  PANEL_VERSION,
  PagePanel,
} from './page-panel';

@Component({ selector: 'app-compose', template: '' })
class ComposeStub {
  readonly compact = input(false);
  readonly draftContext = input('');
  readonly initialText = input('');
  readonly posted = output<Status>();
}

@Component({ selector: 'app-status-card', template: '' })
class StatusCardStub {
  readonly status = input<Status>();
  readonly filterContext = input('home');
}

@Component({ selector: 'app-link-timeline', template: '' })
class LinkTimelineStub {
  readonly link = input<string | null>(null);
}

const PAGE = 'https://news.example/story';
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
/** Search results must actually link the page; the panel drops the rest. */
const mineAbout = (url: string) => ({
  accounts: [],
  statuses: [post('7', 'me', { content: `<p><a href="${url}">${url}</a></p>` })],
  hashtags: [],
});

describe('PagePanel', () => {
  let search: ReturnType<typeof vi.fn>;
  let loadAutosave: ReturnType<typeof vi.fn>;
  let clearAutosave: ReturnType<typeof vi.fn>;
  let auth: { isAnonymous: boolean; isForeignPrimary: boolean };

  beforeEach(() => {
    search = vi.fn((q: string) => of(mineAbout(q.replace(/^from:me /, ''))));
    loadAutosave = vi.fn(() => null);
    clearAutosave = vi.fn(() => ({ durable: true }));
    auth = { isAnonymous: false, isForeignPrimary: false };
  });

  function setUp(params: Record<string, string>): ComponentFixture<PagePanel> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { search } },
        { provide: Server, useValue: { baseUrl: () => 'https://home.example' } },
        { provide: Auth, useValue: auth },
        { provide: Drafts, useValue: { loadAutosave, clearAutosave } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
        },
      ],
    });
    TestBed.overrideComponent(PagePanel, {
      remove: { imports: [Compose, StatusCard, LinkTimeline] },
      add: { imports: [ComposeStub, StatusCardStub, LinkTimelineStub] },
    });
    const fixture = TestBed.createComponent(PagePanel);
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: ComponentFixture<PagePanel>) => f.nativeElement as HTMLElement;
  const button = (f: ComponentFixture<PagePanel>, label: string) =>
    [...el(f).querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

  it('offers actions, not a sentence, beside a tab with no web page', () => {
    const f = setUp({ url: 'about:blank' });
    expect(button(f, 'Write a post')).toBeDefined();
    expect(button(f, 'Search')).toBeDefined();
    expect(el(f).textContent).not.toContain('Open a web page');
    expect(el(f).querySelector('app-link-timeline')).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it('writes a post about nothing in particular, unseeded', () => {
    const f = setUp({});
    button(f, 'Write a post').click();
    f.detectChanges();
    const compose = f.debugElement.query((d) => d.name === 'app-compose')
      .componentInstance as ComposeStub;
    expect(compose.initialText()).toBe('');
    expect(compose.draftContext()).toBe(PAGE_PANEL_DRAFT_CONTEXT);
  });

  it('searches Mawkingbird in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const f = setUp({});
    await f.whenStable();
    const input = el(f).querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'birds';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    el(f).querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(open).toHaveBeenCalledWith('/search?q=birds', '_blank', 'noopener');
    open.mockRestore();
  });

  it('shows the page title and site above its actions', () => {
    const f = setUp({ url: PAGE, title: 'A story' });
    expect(el(f).querySelector('.panel-title')?.textContent).toContain('A story');
    expect(el(f).querySelector('.panel-host')?.textContent).toContain('news.example');
  });

  it("shows the reader's own posts about the page from one from:me search", () => {
    const f = setUp({ url: PAGE, title: 'A story' });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(`from:me ${PAGE}`, 'statuses', {
      limit: 5,
      homeServer: true,
    });
    expect(el(f).textContent).toContain('You posted about this page');
    expect(el(f).querySelectorAll('.panel-mine app-status-card')).toHaveLength(1);
    expect(el(f).querySelector('app-link-timeline')).not.toBeNull();
  });

  it('offers no Watch for a page that is not a video', () => {
    const f = setUp({ url: PAGE });
    expect(el(f).querySelector('.panel-watch')).toBeNull();
  });

  it("offers Watch for a YouTube video, and Watch with the replies to the reader's post", () => {
    const f = setUp({ url: VIDEO });
    const links = [...el(f).querySelectorAll('.panel-watch a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Watch with replies to your post',
      'Watch in Mawkingbird',
    ]);
    const replies = new URL(links[0].href, 'https://x.invalid');
    expect(replies.pathname).toBe('/watch');
    expect(Object.fromEntries(replies.searchParams)).toEqual({
      post: '7',
      server: 'https://home.example',
      youtube: 'dQw4w9WgXcQ',
    });
    expect(new URL(links[1].href, 'https://x.invalid').search).toBe('?youtube=dQw4w9WgXcQ');
    expect(links.every((a) => a.target === '_blank')).toBe(true);
  });

  it('explains how to get the replies chat before the reader has posted about the video', () => {
    search.mockReturnValue(of({ accounts: [], statuses: [], hashtags: [] }));
    const f = setUp({ url: VIDEO });
    expect(el(f).textContent).not.toContain('Watch with replies to your post');
    expect(el(f).textContent).toContain('Post about this video to watch it');
  });

  it('offers the replies chat as soon as the reader posts from the panel', () => {
    search.mockReturnValue(of({ accounts: [], statuses: [], hashtags: [] }));
    const f = setUp({ url: VIDEO });
    button(f, 'Write about this page').click();
    f.detectChanges();
    const compose = f.debugElement.query((d) => d.name === 'app-compose')
      .componentInstance as ComposeStub;
    compose.posted.emit(post('42', 'me'));
    f.detectChanges();
    expect(el(f).textContent).toContain('Posted.');
    const first = el(f).querySelector('.panel-watch a') as HTMLAnchorElement;
    expect(new URL(first.href, 'https://x.invalid').searchParams.get('post')).toBe('42');
  });

  it('does not search for its own posts without a Mastodon sign-in', () => {
    auth.isAnonymous = true;
    const f = setUp({ url: PAGE });
    expect(search).not.toHaveBeenCalled();
    expect(el(f).querySelector('.panel-mine')).toBeNull();
  });

  it('opens the composer only when asked, seeded with the title and link', () => {
    const f = setUp({ url: PAGE, title: 'A story' });
    expect(el(f).querySelector('app-compose')).toBeNull();

    button(f, 'Write about this page').click();
    f.detectChanges();
    const compose = f.debugElement.query((d) => d.name === 'app-compose')
      .componentInstance as ComposeStub;
    expect(compose.draftContext()).toBe(PAGE_PANEL_DRAFT_CONTEXT);
    expect(compose.initialText()).toBe(`A story\n\n${PAGE}`);
  });

  it('cancel closes the composer and forgets what was in it', async () => {
    const f = setUp({ url: PAGE, title: 'A story' });
    button(f, 'Write about this page').click();
    f.detectChanges();
    expect(el(f).querySelector('app-compose')).not.toBeNull();
    button(f, 'Cancel').click();
    f.detectChanges();
    await f.whenStable();
    expect(el(f).querySelector('app-compose')).toBeNull();
    expect(clearAutosave).toHaveBeenCalledWith(PAGE_PANEL_DRAFT_CONTEXT);
    expect(button(f, 'Write about this page')).toBeDefined();
  });

  it('offers to continue or discard an unsent post about another page', () => {
    loadAutosave.mockReturnValue({ segments: ['Look at https://other.example/'] });
    const f = setUp({ url: PAGE });
    expect(el(f).textContent).toContain('unsent post about another page');
    expect(el(f).textContent).not.toContain('Write about this page');

    button(f, 'Discard it').click();
    f.detectChanges();
    expect(clearAutosave).toHaveBeenCalledWith(PAGE_PANEL_DRAFT_CONTEXT);
    expect(el(f).textContent).toContain('Write about this page');
  });

  it('continues the older post without seeding over it', () => {
    loadAutosave.mockReturnValue({ segments: ['Look at https://other.example/'] });
    const f = setUp({ url: PAGE });
    button(f, 'Continue it').click();
    f.detectChanges();
    const compose = f.debugElement.query((d) => d.name === 'app-compose')
      .componentInstance as ComposeStub;
    expect(compose.initialText()).toBe('');
  });

  it('treats an unsent post about this same page as this page', () => {
    loadAutosave.mockReturnValue({ segments: [`Draft about ${PAGE}`] });
    const f = setUp({ url: PAGE });
    expect(el(f).textContent).not.toContain('another page');
  });
});

describe('PagePanel in the Firefox extension sidebar', () => {
  const parent = { postMessage: vi.fn() };
  let search: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    parent.postMessage.mockClear();
    search = vi.fn((q: string) => of(mineAbout(q.replace(/^from:me /, ''))));
    Object.defineProperty(window, 'parent', { value: parent, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
  });

  function setUp(): ComponentFixture<PagePanel> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { search } },
        { provide: Server, useValue: { baseUrl: () => 'https://home.example' } },
        { provide: Auth, useValue: { isAnonymous: false, isForeignPrimary: false } },
        { provide: Drafts, useValue: { loadAutosave: () => null, clearAutosave: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    TestBed.overrideComponent(PagePanel, {
      remove: { imports: [Compose, StatusCard, LinkTimeline] },
      add: { imports: [ComposeStub, StatusCardStub, LinkTimelineStub] },
    });
    const fixture = TestBed.createComponent(PagePanel);
    fixture.detectChanges();
    return fixture;
  }

  function send(
    fixture: ComponentFixture<PagePanel>,
    data: unknown,
    origin = 'moz-extension://abc',
    source: unknown = parent,
  ) {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
    fixture.detectChanges();
  }
  const page = (url: string | null, title = '') => ({
    channel: PANEL_CHANNEL,
    type: 'page',
    url,
    title,
  });
  const text = (f: ComponentFixture<PagePanel>) =>
    (f.nativeElement as HTMLElement).textContent ?? '';

  it('tells the sidebar it is ready, and shows nothing until it hears which page', () => {
    const f = setUp();
    expect(parent.postMessage).toHaveBeenCalledWith(
      { channel: PANEL_CHANNEL, type: 'ready', version: PANEL_VERSION },
      '*',
    );
    expect(text(f).trim()).toBe('');
    expect(search).not.toHaveBeenCalled();
  });

  it('follows each page in place, searching once per page', () => {
    const f = setUp();
    send(f, page(PAGE, 'A story'));
    expect(text(f)).toContain('A story');
    expect(search).toHaveBeenLastCalledWith(`from:me ${PAGE}`, 'statuses', {
      limit: 5,
      homeServer: true,
    });
    send(f, page('https://other.example/b', 'Another'));
    expect(text(f)).toContain('Another');
    expect(text(f)).not.toContain('A story');
    expect(search).toHaveBeenLastCalledWith('from:me https://other.example/b', 'statuses', {
      limit: 5,
      homeServer: true,
    });
    const timeline = f.debugElement.query((d) => d.name === 'app-link-timeline')
      .componentInstance as LinkTimelineStub;
    expect(timeline.link()).toBe('https://other.example/b');
  });

  it('switches to actions when the tab has no web page', () => {
    const f = setUp();
    send(f, page(PAGE));
    send(f, page(null));
    expect(text(f)).toContain('Write a post');
  });

  it('accepts a sidebar one version older (0.7.0 sent no version)', () => {
    const f = setUp();
    send(f, page(PAGE, 'A story'));
    expect(text(f)).toContain('A story');
    expect(text(f)).not.toContain('needs a newer Mawkingbird for Firefox');
  });

  it('asks for an add-on update when the sidebar is older than it accepts', () => {
    const f = setUp();
    send(f, { ...page(PAGE, 'A story'), sidebarVersion: MIN_SIDEBAR_VERSION - 1 });
    expect(text(f)).toContain('needs a newer Mawkingbird for Firefox');
    expect(text(f)).not.toContain('A story');
  });

  it('ignores messages from anywhere but the extension page framing it', () => {
    const f = setUp();
    send(f, page(PAGE, 'From a site'), 'https://evil.example');
    send(f, page(PAGE, 'From elsewhere'), 'moz-extension://abc', {});
    send(f, { channel: 'other', type: 'page', url: PAGE });
    expect(text(f).trim()).toBe('');
  });
});
