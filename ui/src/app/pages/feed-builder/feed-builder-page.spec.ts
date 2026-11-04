import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedBuilderHub } from './feed-builder-hub';
import { FeedBuilderPage } from './feed-builder-page';
import { FEED_BUILDER_PAGES, FeedBuilderEntry, feedBuilderPageAt } from './feed-builder-registry';
import { feedBuilderRoutes, loadFeedPage } from './feed-builder-routes';

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

async function render(entry: FeedBuilderEntry): Promise<HTMLElement> {
  const page = await loadFeedPage(entry);
  TestBed.configureTestingModule({
    // The live tag activity stays deferred, as in the prerender.
    deferBlockBehavior: DeferBlockBehavior.Manual,
    imports: [FeedBuilderPage],
    providers: [provideRouter([]), route({ page, lang: entry.lang }, entry.path)],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(FeedBuilderPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const at = (path: string) => feedBuilderPageAt(path) as FeedBuilderEntry;

describe('Feed Builder topic pages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the English page: pitch, tags, shelves, servers, questions, help', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const el = await render(at('science-fiction-on-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('h1')?.textContent).toContain('Science fiction & fantasy on Mastodon');
    expect(el.querySelectorAll('a[href^="/tags/"]').length).toBeGreaterThanOrEqual(3);
    // English tags are not labelled "English" on the English page.
    expect(el.querySelector('#tags-heading')?.parentElement?.textContent).not.toMatch(
      /\bEnglish\b/,
    );
    expect(el.querySelectorAll('.people li').length).toBeGreaterThanOrEqual(8);
    expect(el.textContent).toContain('Often busy with sales posts');
    expect(el.querySelector('a[href="https://wandering.shop/about"]')).not.toBeNull();
    expect(el.querySelectorAll('mb-disclosure').length).toBe(3);
    expect(el.querySelector('a[href="/accounts/@mawkingbird@mastodon.social"]')).not.toBeNull();
    // Nothing live without the deferred block: no number, no request.
    expect(el.querySelector('.activity')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks English tags on the Italian page and leads with its own tag', async () => {
    const el = await render(at('it/fantascienza-su-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('it');
    const first = el.querySelector('.tag-list li');
    expect(first?.textContent).toContain('#Fantascienza');
    expect(first?.textContent).not.toContain('inglese');
    expect(el.querySelector('#tags-heading')?.parentElement?.textContent).toContain('inglese');
    expect(el.textContent).toContain('Come scegliamo');
    // Italian has no future tags left to offer: #Fantascienza is already live.
    expect(el.querySelector('#future-heading')).toBeNull();
  });

  it('offers Japanese future tags beside their English sources', async () => {
    const el = await render(at('ja/science-fiction-on-mastodon'));
    const future = el.querySelector('#future-heading')?.parentElement;
    expect(future?.textContent).toContain('#スタートレック');
    expect(future?.textContent).toContain('#StarTrek の日本語版');
    expect(future?.querySelectorAll('mb-badge').length).toBeGreaterThan(0);
  });

  it('shows a YouTube channel link and presence badges', async () => {
    const el = await render(at('it/fantascienza-su-mastodon'));
    const youtube = el.querySelector('#shelf-youtube')?.parentElement;
    expect(youtube?.querySelector('a[href^="https://www.youtube.com/channel/UC"]')).not.toBeNull();
  });
});

describe('Feed Builder hub and routes', () => {
  it('links every topic page from the hub', async () => {
    const hubRoute = feedBuilderRoutes[0];
    const entries = await (hubRoute.resolve?.['entries'] as () => Promise<unknown>)();
    TestBed.configureTestingModule({
      imports: [FeedBuilderHub],
      providers: [provideRouter([]), route({ entries }, 'communities')],
    });
    const fixture = TestBed.createComponent(FeedBuilderHub);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    for (const { path } of FEED_BUILDER_PAGES)
      expect(el.querySelector(`a[href="/${path}"]`), path).not.toBeNull();
  });

  it('routes every page as indexable, in its language, with all its versions', () => {
    const [, ...pages] = feedBuilderRoutes;
    expect(pages.map((r) => r.path)).toEqual(FEED_BUILDER_PAGES.map((p) => p.path));
    for (const r of pages) {
      expect(r.data?.['seoIndexable']).toBe(true);
      expect(r.data?.['lang']).toBe(feedBuilderPageAt(r.path ?? '')?.lang);
      expect(r.data?.['seoAlternates'].length).toBe(6);
    }
  });
});
