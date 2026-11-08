import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedBuilderHub } from './feed-builder-hub';
import { FeedBuilderPage } from './feed-builder-page';
import {
  FEED_BUILDER_HUB,
  FEED_BUILDER_HUBS,
  FEED_BUILDER_PAGES,
  FEED_BUILDER_TOPICS,
  FeedBuilderEntry,
  feedBuilderPageAt,
} from './feed-builder-registry';
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

  it('renders the approved Ukraine edition with saved tag holds excluded', async () => {
    const el = await render(at('war-in-ukraine-on-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('War in Ukraine on Mastodon');
    expect(el.querySelectorAll('.people li').length).toBe(22);
    expect(el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li').length).toBe(
      13,
    );
    for (const tag of ['Ukraine', 'UkraineReconstruction', 'UkraineOSINT'])
      expect(el.querySelector(`a[href="/tags/${tag}"]`)).not.toBeNull();
    for (const tag of [
      'Crimea',
      'Kharkiv',
      'Kherson',
      'StandWithUkraine',
      'UkraineAid',
      'UkraineRefugees',
    ])
      expect(el.querySelector(`a[href="/tags/${tag}"]`)).toBeNull();
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'war-in-ukraine').map((page) => page.lang),
    ).toEqual(['en']);
  });

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

  it('renders the space and astronomy page in German with its own hashtags', async () => {
    const el = await render(at('de/weltraum-und-astronomie-auf-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(el.querySelector('h1')?.textContent).toContain('Weltraum und Astronomie auf Mastodon');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#Raumfahrt');
    expect(el.querySelector('a[href="https://spacey.space/about"]')).not.toBeNull();
    expect(el.querySelectorAll('.people li').length).toBeGreaterThanOrEqual(5);
  });

  it('renders the approved Plant Based Living selection with its positive outreach scope', async () => {
    const el = await render(at('plant-based-living-on-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('Plant Based Living');
    expect(el.textContent).toContain('Whether you are vegan, vegetarian or simply curious');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#VeganFood');
    expect(el.querySelector('a[href="/tags/Vegan"]')).toBeNull();
    expect(el.querySelector('a[href="/tags/Veganism"]')).toBeNull();
    expect(el.querySelector('a[href="https://veganism.social/about"]')).not.toBeNull();
    expect(el.querySelectorAll('.people li').length).toBeGreaterThanOrEqual(8);
  });

  it('renders approved English and German board communities with quiet relevant tags', async () => {
    const en = await render(at('esp32-and-single-board-computers-on-mastodon'));
    expect(en.querySelector('h1')?.textContent).toContain('ESP32 and single-board computers');
    for (const tag of ['ESP32', 'BeagleBoard', 'Radxa', 'CircuitPython', 'Adafruit'])
      expect(en.querySelector(`a[href="/tags/${tag}"]`)).not.toBeNull();
    expect(en.textContent).toContain('even with no posts');
    expect(en.querySelectorAll('.people li').length).toBe(27);
  });

  it('renders the German board community and only the approved editions', async () => {
    const de = await render(at('de/esp32-und-einplatinencomputer-auf-mastodon'));
    expect(de.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(de.querySelector('.tag-list')?.textContent).toContain('#Einplatinencomputer');
    expect(de.querySelectorAll('.people li').length).toBe(5);
    expect(
      FEED_BUILDER_PAGES.filter((p) => p.topic === 'esp32-and-single-board-computers').map(
        (p) => p.lang,
      ),
    ).toEqual(['en', 'de']);
  });

  for (const [path, lang, count, tag] of [
    ['retrocomputing-on-mastodon', 'en', 36, 'SoftwarePreservation'],
    ['de/retrocomputing-auf-mastodon', 'de', 18, 'Heimcomputer'],
    ['fr/retroinformatique-sur-mastodon', 'fr', 7, 'Rétroinformatique'],
    ['es/retroinformatica-en-mastodon', 'es', 6, 'Retroinformática'],
  ] as const) {
    it(`renders the approved ${lang} retrocomputing edition with quiet subject tags`, async () => {
      const el = await render(at(path));
      expect(el.querySelector('main')?.getAttribute('lang')).toBe(lang);
      expect(el.querySelectorAll('.people li').length).toBe(count);
      expect(el.querySelector('.tag-list')?.textContent).toContain(`#${tag}`);
      expect(el.querySelector('a[href="https://oldbytes.space/about"]')).not.toBeNull();
      expect(
        FEED_BUILDER_PAGES.filter((p) => p.topic === 'retrocomputing').map((p) => p.lang),
      ).toEqual(['en', 'de', 'fr', 'es']);
    });
  }

  it('renders the English-only DMV edition with regional posting scope and quiet local tags', async () => {
    const el = await render(at('dc-maryland-virginia-on-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('DC, Maryland and Virginia');
    expect(el.querySelectorAll('.people li').length).toBe(13);
    expect(el.textContent).toContain('not simply people who live here');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#PrinceGeorgesCounty');
    expect(el.querySelector('a[href="https://dmv.community/about"]')).not.toBeNull();
    expect(FEED_BUILDER_PAGES.filter((p) => p.topic === 'dmv').map((p) => p.lang)).toEqual(['en']);
  });

  it('renders approved gardening editions with quiet subject tags', async () => {
    const el = await render(at('gardening-and-houseplants-on-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('Gardening and houseplants');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#Succulents');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#Hydroponics');
    expect(el.textContent).toContain('even when their tags are quiet');
    expect(el.querySelectorAll('.people li').length).toBe(14);
    expect(
      FEED_BUILDER_PAGES.filter((p) => p.topic === 'gardening-and-houseplants').map((p) => p.lang),
    ).toEqual(['en', 'de', 'fr']);
  });

  it('renders approved math editions with local tags and selectable number theory', async () => {
    const el = await render(at('de/mathematik-auf-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(el.querySelector('h1')?.textContent).toContain('Mathematik auf Mastodon');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#Mathematik');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#NumberTheory');
    expect(el.querySelector('a[href="https://mathstodon.xyz/about"]')).not.toBeNull();
    expect(el.querySelectorAll('.people li').length).toBe(14);
    expect(FEED_BUILDER_PAGES.filter((p) => p.topic === 'math').map((p) => p.lang)).toEqual([
      'en',
      'de',
      'fr',
    ]);
  });

  it('renders the German plant-based edition with its local and future tags', async () => {
    const el = await render(at('de/pflanzlich-leben-auf-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(el.querySelector('h1')?.textContent).toContain('Pflanzlich leben auf Mastodon');
    expect(el.querySelector('.tag-list')?.textContent).toContain('#Vegetarisch');
    expect(el.querySelector('#future-heading')?.parentElement?.textContent).toContain(
      '#Pflanzenbasiert',
    );
    expect(
      FEED_BUILDER_PAGES.filter((p) => p.topic === 'plant-based-living').map((p) => p.lang),
    ).toEqual(['en', 'de']);
  });

  it('keeps tags seeded for other languages off the English space page', async () => {
    const el = await render(at('space-and-astronomy-on-mastodon'));
    const tags = el.querySelector('.tag-list')?.textContent ?? '';
    expect(tags).toContain('#Astronomy');
    expect(tags).not.toContain('#Spazio');
  });

  it('sums the shelves in a table and lists the YouTube creators once more at the end', async () => {
    const el = await render(at('science-fiction-on-mastodon'));
    const counts = [...el.querySelectorAll('.people-groups tbody .count')].map((td) =>
      Number(td.textContent),
    );
    const total = Number(el.querySelector('.people-groups tfoot .count')?.textContent);
    expect(counts.length).toBeGreaterThan(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
    expect(el.querySelectorAll('.people li').length).toBe(total);
    const also = el.querySelector('#also-youtube-heading')?.parentElement as HTMLElement;
    const listed = also.querySelectorAll('.youtube-people li').length;
    expect(listed).toBeGreaterThan(0);
    expect(also.textContent).toContain(`${listed} of the ${total} people above`);
    // After every shelf, not among them.
    const sections = [...el.querySelectorAll('section')];
    const shelves = sections.filter((s) => s.querySelector('[id^="shelf-"]'));
    expect(sections.indexOf(also)).toBeGreaterThan(sections.indexOf(shelves[shelves.length - 1]));
  });

  it('shows a YouTube channel link and presence badges', async () => {
    const el = await render(at('it/fantascienza-su-mastodon'));
    const youtube = el.querySelector('#shelf-youtube')?.parentElement;
    expect(youtube?.querySelector('a[href^="https://www.youtube.com/channel/UC"]')).not.toBeNull();
  });
});

describe('Feed Builder hub and routes', () => {
  it('links every topic page from the English hub, and each language hub its own', async () => {
    const hubRoutes = feedBuilderRoutes.slice(0, FEED_BUILDER_HUBS.length);
    expect(hubRoutes.map((r) => r.path)).toEqual(FEED_BUILDER_HUBS.map((hub) => hub.path));
    for (const hubRoute of hubRoutes) {
      const lang = hubRoute.data?.['lang'];
      const resolve = hubRoute.resolve as Record<string, () => Promise<unknown>>;
      const [entries, copy] = await Promise.all([resolve['entries'](), resolve['copy']()]);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [FeedBuilderHub],
        providers: [provideRouter([]), route({ entries, copy, lang }, hubRoute.path ?? '')],
      });
      const fixture = TestBed.createComponent(FeedBuilderHub);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('main')?.getAttribute('lang')).toBe(lang);
      const listed =
        lang === 'en' ? FEED_BUILDER_PAGES : FEED_BUILDER_PAGES.filter((p) => p.lang === lang);
      for (const { path } of listed)
        expect(el.querySelector(`a[href="/${path}"]`), `${lang}: ${path}`).not.toBeNull();
      if (lang !== 'en')
        expect(el.querySelector(`a[href="/${FEED_BUILDER_HUB}"]`), lang).not.toBeNull();
      expect(hubRoute.data?.['seoIndexable']).toBe(true);
      expect(hubRoute.data?.['seoAlternates'].length).toBe(FEED_BUILDER_HUBS.length);
    }
  });

  it("files topics under categories, leads with the reader's language, and opens one category", async () => {
    const hubRoute = feedBuilderRoutes[0];
    const resolve = hubRoute.resolve as Record<string, () => Promise<unknown>>;
    const [entries, copy] = await Promise.all([resolve['entries'](), resolve['copy']()]);
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'en']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FeedBuilderHub],
      providers: [provideRouter([]), route({ entries, copy, lang: 'en' }, hubRoute.path ?? '')],
    });
    const fixture = TestBed.createComponent(FeedBuilderHub);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    languages.mockRestore();
    const el = fixture.nativeElement as HTMLElement;

    // Rail: All topics, then only categories that have pages.
    const rail = [...el.querySelectorAll('.hub-side nav a')].map((a) => a.textContent?.trim());
    expect(rail[0]).toBe('All topics');
    expect(rail.some((name) => name?.startsWith('Tech'))).toBe(true);
    expect(rail.some((name) => name?.startsWith('Music'))).toBe(false);
    expect((el.querySelector('select') as HTMLSelectElement).value).toBe('de');

    // Compact first page: German pages lead, English stands in where there is none.
    const tech = [...el.querySelectorAll('#category-tech + ul li > a:first-child')];
    expect(tech.map((a) => a.getAttribute('href'))).toContain('/de/retrocomputing-auf-mastodon');
    for (const list of el.querySelectorAll('.hub-compact')) {
      const fallback = [...list.children].map((li) => !!li.querySelector('.hub-fallback'));
      expect(fallback, 'translated topics before English stand-ins').toEqual(
        [...fallback].sort((a, b) => Number(a) - Number(b)),
      );
    }
    // Plant-based living has a German page; a topic with none shows "in English".
    expect(el.querySelectorAll('.hub-fallback').length).toBe(
      FEED_BUILDER_TOPICS.filter(
        (topic) => !FEED_BUILDER_PAGES.some((p) => p.topic === topic && p.lang === 'de'),
      ).length,
    );
    // Every version is still linked, so nothing is lost to the filter.
    for (const { path } of FEED_BUILDER_PAGES)
      expect(el.querySelector(`a[href="/${path}"]`), path).not.toBeNull();

    // Opening a category shows just its topics, with descriptions.
    (el.querySelector('.hub-side nav a:nth-child(2)') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.hub-category-heading')?.textContent).toContain('Tech');
    expect(el.querySelectorAll('.hub-content .hub-topic').length).toBe(2);
    expect(el.querySelector('.hub-content .hub-topic p')?.textContent?.trim()).not.toBe('');
  });

  it('routes every page as indexable, in its language, with all its versions', () => {
    const pages = feedBuilderRoutes.slice(FEED_BUILDER_HUBS.length);
    expect(pages.map((r) => r.path)).toEqual(FEED_BUILDER_PAGES.map((p) => p.path));
    for (const r of pages) {
      const entry = feedBuilderPageAt(r.path ?? '');
      // Every version of the topic, and only those: languages differ per topic.
      const versions = FEED_BUILDER_PAGES.filter((p) => p.topic === entry?.topic);
      expect(r.data?.['seoIndexable']).toBe(true);
      expect(r.data?.['lang']).toBe(entry?.lang);
      expect(r.data?.['seoAlternates'].length).toBe(versions.length);
    }
    // Sci-fi ships in six languages; space and astronomy without Japanese.
    expect(FEED_BUILDER_PAGES.filter((p) => p.topic === 'science-fiction').length).toBe(6);
    expect(FEED_BUILDER_PAGES.filter((p) => p.topic === 'space-and-astronomy').length).toBe(5);
  });
});
