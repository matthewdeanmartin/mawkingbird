import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderCore } from './reader-core';
import { ReaderLibrary } from '../../../providers/read/reader-library';
import { readerRouteId } from '../reader-route-id';
import { ClientPrefs } from '../../../client-prefs';
import { Status } from '../../../models';
import { ArticleResult } from '../../../providers/article/article-models';
import { ReadToolbar } from '../read-toolbar/read-toolbar';

/**
 * A host, because `ReaderCore` takes a required input and the interesting
 * behaviour is what happens when that input *changes* — a reader moving from
 * one document to the next.
 */
@Component({
  imports: [ReaderCore],
  template: `<app-reader-core [chain]="chain()" [layout]="layout()" [routeId]="routeId()" />`,
})
class Host {
  readonly chain = signal<Status[]>([]);
  readonly layout = signal<'page' | 'pane'>('page');
  readonly routeId = signal<string>('');
}

/** `n` characters of prose, so the document-length rule can be exercised. */
function prose(n: number): string {
  return `<p>${'word '.repeat(Math.ceil(n / 5)).slice(0, n)}</p>`;
}

function post(id: string, chars: number, over: Partial<Status> = {}): Status {
  return {
    id,
    content: prose(chars),
    url: `https://example.com/${id}`,
    in_reply_to_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    account: { id: 'a', username: 'ann', acct: 'ann', display_name: 'Ann' },
    media_attachments: [],
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    ...over,
  } as unknown as Status;
}

describe('ReaderCore and the library', () => {
  let fixture: ComponentFixture<Host>;
  let library: ReaderLibrary;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Host);
    library = TestBed.inject(ReaderLibrary);
  });

  function show(chain: Status[], layout: 'page' | 'pane' = 'page', routeId = ''): void {
    fixture.componentInstance.layout.set(layout);
    fixture.componentInstance.routeId.set(routeId || (chain[0]?.id ?? ''));
    fixture.componentInstance.chain.set(chain);
    fixture.detectChanges();
  }

  it('shelves a long post as a document being read', () => {
    show([post('1', 900)]);
    expect(library.get('1')?.shelf).toBe('reading');
  });

  it('does not shelve a short post', () => {
    // The operator's rule: short or never-viewed tweets are never tracked.
    show([post('1', 120)]);
    expect(library.has('1')).toBe(false);
  });

  it('shelves a storm of short posts, because it was written as one thing', () => {
    show([post('1', 80), post('2', 80, { in_reply_to_id: '1' })]);
    expect(library.has('1')).toBe(true);
  });

  it('shelves an RSS item however short its teaser', () => {
    show([post('rss:f::g', 40, { provider: 'rss' })]);
    expect(library.has('rss:f::g')).toBe(true);
  });

  it('titles a document with no headline from its first sentence', () => {
    const content = '<p>The thing about ducks. And then a second sentence entirely.</p>';
    show([post('1', 900, { content: content + prose(900) })]);
    expect(library.get('1')?.title).toBe('The thing about ducks.');
  });

  it('shelves from the RSS pane too — reading an article there is reading it', () => {
    show([post('rss:f::g', 900, { provider: 'rss' })], 'pane');
    expect(library.has('rss:f::g')).toBe(true);
  });

  it('moving to a second document shelves that one as well', () => {
    show([post('1', 900)]);
    show([post('2', 900)]);
    expect(library.has('1')).toBe(true);
    expect(library.has('2')).toBe(true);
  });

  /**
   * The feed reader widget is a different component with no library access at
   * all — Home imports `reader-toolbar` (typography) and never `ReaderCore`.
   * Asserted here rather than in `home.spec.ts`, where it could only be a test
   * that nothing happened, which passes for the wrong reasons forever.
   */
  it('only shelves through the reader core, which the feed widget does not use', () => {
    show([post('1', 900)]);
    expect(library.total()).toBe(1);
    // Every entry came from a core render; there is no other writer.
    expect(Object.keys(library.snapshot())).toEqual(['1']);
  });

  it('re-rendering the same document does not re-shelve it', () => {
    const open = vi.spyOn(library, 'open');
    show([post('1', 900)]);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('ReaderCore position saving', () => {
  let fixture: ComponentFixture<Host>;
  let library: ReaderLibrary;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Host);
    library = TestBed.inject(ReaderLibrary);
    TestBed.inject(ClientPrefs).setReaderPageFlip(true);
  });

  // Fake timers are global. Leaving them installed makes every later spec file
  // in the run see a clock that never advances — which surfaces as an unrelated
  // timing test failing for no visible reason.
  afterEach(() => {
    vi.useRealTimers();
  });

  function core(): ReaderCore {
    return fixture.debugElement.query((node) => node.componentInstance instanceof ReaderCore)
      .componentInstance as ReaderCore;
  }

  it('does not write to storage on every page turn', () => {
    // A localStorage write per arrow press is a synchronous serialization of
    // the whole library on the main thread, and paging is a held-down key.
    fixture.componentInstance.chain.set([post('1', 900)]);
    fixture.detectChanges();
    const record = vi.spyOn(library, 'recordPosition');

    core().nextPage();
    core().nextPage();
    core().nextPage();

    expect(record).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('marks a settled single-page document read without requiring a page turn', async () => {
    fixture.componentInstance.chain.set([
      post('rss:feed::one', 80, { provider: 'rss' } as Partial<Status>),
    ]);
    fixture.detectChanges();

    expect(library.get('rss:feed::one')?.shelf).toBe('reading');
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(library.get('rss:feed::one')?.shelf).toBe('read');
  });

  it('flushes an unsaved position on destroy', () => {
    // A reader who closes the tab mid-article must not lose their place, which
    // is the one thing this feature promises.
    fixture.componentInstance.chain.set([post('1', 900)]);
    fixture.detectChanges();
    const record = vi.spyOn(library, 'recordPosition');

    core().nextPage();
    fixture.destroy();

    expect(record).toHaveBeenCalled();
  });

  it('does not save a position from the RSS pane', () => {
    // The pane shelves the document but is a preview strip beside a list, not
    // the surface that owns a position.
    fixture.componentInstance.layout.set('pane');
    fixture.componentInstance.chain.set([post('1', 900)]);
    fixture.detectChanges();
    const record = vi.spyOn(library, 'recordPosition');

    core().nextPage();
    vi.runAllTimers();

    expect(record).not.toHaveBeenCalled();
  });
});

/**
 * The reader must shelve a document under **the id it was opened with**.
 *
 * Reported from the app: clicking a library row re-added the same document as a
 * new entry, over and over, "like the binary goop in the URL changes
 * constantly". It was not changing — but the reader was *re-deriving* it.
 *
 * A post read from a server we hold no account on is addressed two ways: the
 * feed's `anonymous-mastodon:<host>:<id>`, and the route's base64 blob of
 * `{server, id, originalUrl}`. `ThreadLoader` accepts both. The reader used to
 * rebuild an id from the loaded status, which meant the string it shelved under
 * was not necessarily the string in the address bar — so the row you clicked
 * and the row that got written were different rows, and the library grew by one
 * every time you opened anything.
 */
describe('ReaderCore shelving under the id it was opened with', () => {
  let fixture: ComponentFixture<Host>;
  let library: ReaderLibrary;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Host);
    library = TestBed.inject(ReaderLibrary);
  });

  afterEach(() => localStorage.clear());

  function open(routeId: string, chain: Status[]): void {
    fixture.componentInstance.layout.set('page');
    fixture.componentInstance.routeId.set(routeId);
    fixture.componentInstance.chain.set(chain);
    fixture.detectChanges();
  }

  /** The remote post as the loader hands it back, whichever id opened it. */
  const remote = (): Status[] => [
    post('anonymous-mastodon:graz.social:117', 900, {
      provider: 'anonymous-mastodon',
      providerRef: { server: 'https://graz.social', statusId: '117', accountId: '7' },
      url: 'https://graz.social/@publicvoit/117',
    } as Partial<Status>),
  ];

  it('shelves under the route id, not one rebuilt from the post', () => {
    open('anonymous-status.SOMEBLOB', remote());

    expect(Object.keys(library.snapshot())).toEqual(['anonymous-status.SOMEBLOB']);
  });

  /**
   * The reported loop, end to end.
   *
   * The route holds the blob, but the home server resolved the post, so what
   * the loader hands back is an **ordinary local status** — a different id, and
   * no `anonymous-mastodon` provider to rebuild a blob from. Deriving the key
   * from that status shelved the document under the local id while the row the
   * reader clicked pointed at the blob, so every open wrote a new entry.
   */
  it('does not add a second entry when the home server resolved the post', () => {
    const resolved = (): Status[] => [
      post('local-42', 900, { url: 'https://graz.social/@publicvoit/117' } as Partial<Status>),
    ];

    open('anonymous-status.SOMEBLOB', resolved());
    expect(Object.keys(library.snapshot())).toEqual(['anonymous-status.SOMEBLOB']);

    // Clicking the row navigates to the same blob; resolution happens again.
    fixture.componentInstance.chain.set([]);
    fixture.detectChanges();
    open('anonymous-status.SOMEBLOB', resolved());

    expect(Object.keys(library.snapshot())).toHaveLength(1);
  });

  /**
   * The card and the reader must agree on the key.
   *
   * `SaveToLibrary` on a feed row *derives* an id, which is right — it is
   * building the link it will navigate to. The reader then opens that link and
   * must shelve under the id it arrived with, or "save for later" and "open it"
   * would file the same document twice.
   */
  it('takes up the entry a feed row saved, rather than filing a second one', () => {
    const feedStatus = remote()[0];
    const savedUnder = readerRouteId(feedStatus);
    library.save({ id: savedUnder, url: feedStatus.url ?? '', title: 'Saved from the feed' });

    open(savedUnder, remote());

    expect(Object.keys(library.snapshot())).toEqual([savedUnder]);
    expect(library.get(savedUnder)?.shelf).toBe('reading');
  });

  /** Two opens of one document by one id must leave one entry, always. */
  it('does not add a second entry when the same document is reopened', () => {
    open('anonymous-mastodon:graz.social:117', remote());
    const shelved = Object.keys(library.snapshot());
    expect(shelved).toHaveLength(1);

    fixture.componentInstance.chain.set([]);
    fixture.detectChanges();
    open(shelved[0], remote());

    expect(Object.keys(library.snapshot())).toHaveLength(1);
  });
});

/**
 * Page mode has to actually produce pages you can turn, with something to click.
 *
 * The operator's report: "Page: still have to scroll, the text is taller than
 * the viewport. Also nothing visible to click on." Both were true. A page was
 * ~500 words — "about a screenful and a half" by `article-pages.ts`'s own
 * comment — so page mode still scrolled, and the only page-turn controls were
 * two small arrows at the top of the screen.
 */

/**
 * Page mode on a tweetstorm — the document this reader was built for, and the
 * one page mode used to miss entirely.
 *
 * The operator's report: "Page: still have to scroll... nothing visible to
 * click on." Both followed from the same cause. `pages()` was derived from the
 * *fetched article*, so a storm with nothing to fetch had zero pages, the
 * toolbar's pager was hidden, and page mode was identical to scrolling.
 */
describe('ReaderCore paging a post chain', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Host);
  });

  afterEach(() => localStorage.clear());

  const core = (): ReaderCore =>
    fixture.debugElement.query((node) => node.componentInstance instanceof ReaderCore)
      .componentInstance as ReaderCore;

  const storm = (n: number): Status[] => Array.from({ length: n }, (_, i) => post(`${i + 1}`, 300));

  const rectAt = (top: number): DOMRect =>
    ({
      x: 0,
      y: top,
      top,
      left: 0,
      right: 600,
      bottom: top + 100,
      width: 600,
      height: 100,
      toJSON: () => ({}),
    }) as DOMRect;

  it('sizes an RSS page independently of how far down the feed its item sits', () => {
    fixture.componentInstance.layout.set('pane');
    fixture.componentInstance.chain.set(storm(2));
    fixture.detectChanges();
    const instance = core();
    const host = fixture.nativeElement.querySelector('app-reader-core') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.reader-posts') as HTMLElement;
    const toolbar = host.querySelector('.read-toolbar-outer') as HTMLElement;
    const banner = document.createElement('div');
    banner.className = 'test-build-banner';
    document.body.appendChild(banner);
    const viewport = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700);
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(rectAt(2_000));
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(rectAt(2_150));
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(rectAt(0));
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue(rectAt(0));

    (instance as unknown as { measure(): void }).measure();
    // The outer viewport excludes only persistent chrome. The CSS grid gives
    // the toolbar its own row, so its height is never guessed or deducted twice.
    expect(host.style.getPropertyValue('--reader-viewport-height')).toBe('700px');
    expect(host.style.getPropertyValue('--reader-outer-chrome')).toBe('100px');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(rectAt(4_000));
    (instance as unknown as { measure(): void }).measure();
    expect(host.style.getPropertyValue('--reader-viewport-height')).toBe('700px');
    banner.remove();
    viewport.mockRestore();
  });

  /**
   * jsdom reports every height as zero, so the measured path cannot run and the
   * component falls back to one page — which is the documented behaviour for an
   * unmeasurable viewport, and is what a server-rendered pass gets too.
   */
  it('falls back to a single page when nothing can be measured', () => {
    fixture.componentInstance.chain.set(storm(8));
    fixture.detectChanges();

    expect(core().pageCountForTest()).toBe(1);
    // And it still renders every prose block, rather than hiding the overflow.
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.reader-posts .reader-post'),
    ).toHaveLength(8);
  });

  it('turns the native viewport without replacing or losing document text', () => {
    fixture.componentInstance.chain.set(storm(2));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const viewport = element.querySelector<HTMLElement>('.reader-viewport')!;
    const body = element.querySelector<HTMLElement>('.reader-posts')!;
    const text = body.textContent;
    const internal = core() as unknown as {
      columnText: { set(pages: string[]): void };
      columnLayout: { stride: number };
    };
    internal.columnText.set(['first', 'second', 'third']);
    internal.columnLayout.stride = 648;
    core().nextPage();
    expect(viewport.scrollLeft).toBe(648);
    core().nextPage();
    core().nextPage();
    expect(viewport.scrollLeft).toBe(1296);
    core().prevPage();
    expect(viewport.scrollLeft).toBe(648);
    expect(body.textContent).toBe(text);
    expect(element.querySelector('.reader-posts')).toBe(body);
  });

  it('keeps the progress line inside the sticky toolbar box', () => {
    const toolbar = TestBed.createComponent(ReadToolbar);
    toolbar.componentRef.setInput('page', 2);
    toolbar.componentRef.setInput('pageCount', 3);
    toolbar.detectChanges();

    const progress = (toolbar.nativeElement as HTMLElement).querySelector('.progress-track');
    expect(progress?.parentElement?.classList.contains('read-toolbar-outer')).toBe(true);
  });

  it('measures the live article after an asynchronous fetch inserts it', () => {
    fixture.componentInstance.chain.set([post('1', 900)]);
    fixture.detectChanges();
    const instance = core();
    const internal = instance as unknown as {
      expansion: { result: { set(value: ArticleResult): void } };
      measure(): void;
    };
    const originalMeasure = internal.measure.bind(instance);
    const measuredBlockCounts: number[] = [];
    internal.measure = () => {
      measuredBlockCounts.push(
        fixture.nativeElement.querySelector('.reader-article-body')?.children.length ?? 0,
      );
      originalMeasure();
    };

    internal.expansion.result.set({
      requestedUrl: 'https://example.com/story',
      finalUrl: 'https://example.com/story',
      card: null,
      diagnosis: 'ok',
      fetchedAt: '2026-09-04T00:00:00.000Z',
      article: {
        title: 'A fetched story',
        byline: null,
        siteName: 'Example',
        markdown: `${'First paragraph. '.repeat(80)}\n\n${'Second paragraph. '.repeat(80)}`,
        images: [],
        quality: 'good',
        metrics: {
          wordCount: 320,
          linkDensity: 0,
          paragraphCount: 2,
          textToMarkupRatio: 1,
        },
      },
    });
    fixture.detectChanges();

    expect(measuredBlockCounts).toContain(2);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.reader-article-body'),
    ).not.toBeNull();
    const element = fixture.nativeElement as HTMLElement;
    const body = element.querySelector('.reader-article-body');
    expect(element.querySelectorAll('.reader-article-body')).toHaveLength(1);
    expect(element.querySelector('.reader-posts')).toBeNull();
    expect(element.querySelector('.reader-expand')).toBeNull();
    core().nextPage();
    fixture.detectChanges();
    expect(element.querySelector('.reader-article-body')).toBe(body);
    expect(element.querySelectorAll('.reader-article-body')).toHaveLength(1);
  });

  it('remeasures when a retained core receives another library document', () => {
    fixture.componentInstance.chain.set(storm(2));
    fixture.detectChanges();
    const instance = core();
    const internal = instance as unknown as {
      measure(): void;
    };
    const originalMeasure = internal.measure.bind(instance);
    let measurements = 0;
    internal.measure = () => {
      measurements++;
      originalMeasure();
    };

    fixture.componentInstance.routeId.set('replacement');
    fixture.componentInstance.chain.set([
      post('replacement', 300),
      post('replacement-reply', 300, { in_reply_to_id: 'replacement' }),
    ]);
    fixture.detectChanges();

    expect(measurements).toBeGreaterThan(0);
  });

  it('names the configured Twitter mirror rather than calling Sotwe Nitter', () => {
    fixture.componentInstance.chain.set([
      post('tweet', 300, {
        provider: 'twitter',
        url: 'https://x.com/NASA/status/2095947707605266436',
      }),
    ]);
    fixture.detectChanges();

    const source = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.reader-source a',
    );
    expect(source?.textContent).toContain('www.sotwe.com');
    expect(source?.textContent).not.toContain('Nitter');
    expect(source?.href).toContain('sotwe.com/tweet/2095947707605266436');
  });

  it('shows the whole chain in scroll mode, whatever the measurements say', () => {
    TestBed.inject(ClientPrefs).setReaderPageFlip(false);
    fixture.componentInstance.chain.set(storm(8));
    fixture.detectChanges();

    expect(core().pageCountForTest()).toBe(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.reader-posts .reader-post'),
    ).toHaveLength(8);
  });

  /** jsdom cannot measure it, but one long post is still prepared for paging. */
  it('falls back safely for a long document of one post', () => {
    fixture.componentInstance.chain.set(storm(1));
    fixture.detectChanges();

    expect(core().pageCountForTest()).toBe(1);
  });

  /** A single paragraph needs native fragmentation just as much as a storm. */
  it('uses the bounded viewport for both one long post and a storm', () => {
    fixture.componentInstance.chain.set(storm(1));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-reader-core.reader-paged .reader-viewport .reader',
      ),
    ).not.toBeNull();

    fixture.componentInstance.chain.set(storm(5));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.reader-viewport .reader-post'),
    ).toHaveLength(5);
  });

  it('renders only one document copy for assistive technology', () => {
    fixture.componentInstance.chain.set(storm(5));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.reader-gauge')).toBeNull();
    expect(element.querySelectorAll('.reader-posts')).toHaveLength(1);
    expect(element.querySelector('.reader-posts')?.getAttribute('aria-hidden')).not.toBe('true');
  });

  it('turns pages for horizontal touch swipes but leaves taps, links and vertical gestures alone', () => {
    fixture.componentInstance.chain.set(storm(3));
    fixture.detectChanges();
    const instance = core();
    const internal = instance as unknown as {
      columnText: { set(value: string[]): void };
      onPagePointerDown(event: PointerEvent): void;
      onPagePointerUp(event: PointerEvent): void;
    };
    internal.columnText.set(['one', 'two']);
    const next = vi.spyOn(instance, 'nextPage').mockImplementation(() => undefined);
    const prev = vi.spyOn(instance, 'prevPage').mockImplementation(() => undefined);
    const body = fixture.nativeElement.querySelector('.reader-posts');
    const event = (x: number, y: number, target = body): PointerEvent =>
      ({
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 1,
        clientX: x,
        clientY: y,
        target,
      }) as PointerEvent;
    internal.onPagePointerDown(event(250, 150));
    internal.onPagePointerUp(event(80, 155));
    expect(next).toHaveBeenCalledTimes(1);
    internal.onPagePointerDown(event(80, 150));
    internal.onPagePointerUp(event(250, 155));
    expect(prev).toHaveBeenCalledTimes(1);
    internal.onPagePointerDown(event(250, 150));
    internal.onPagePointerUp(event(240, 150));
    internal.onPagePointerDown(event(250, 150));
    internal.onPagePointerUp(event(220, 280));
    const link = document.createElement('a');
    internal.onPagePointerDown(event(250, 150, link));
    internal.onPagePointerUp(event(80, 150, link));
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledTimes(1);
  });
});
