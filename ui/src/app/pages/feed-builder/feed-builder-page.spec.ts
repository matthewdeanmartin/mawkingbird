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

  it('renders the approved English Literary Fiction edition', async () => {
    const el = await render(at('literary-fiction-on-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('h1')?.textContent).toContain('Literary fiction on Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(8);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(11);
    expect(el.querySelector('a[href="/tags/LiteraryFiction"]')).not.toBeNull();
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'literary-fiction').map(
        (page) => page.lang,
      ),
    ).toEqual(['en']);
  });

  it('renders the approved English Historical Fiction edition', async () => {
    const el = await render(at('historical-fiction-on-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('h1')?.textContent).toContain('Historical fiction on Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(10);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(12);
    expect(el.querySelector('a[href="/tags/HistoricalFiction"]')).not.toBeNull();
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'historical-fiction').map(
        (page) => page.lang,
      ),
    ).toEqual(['en']);
  });

  it('renders Dutch Politics with approved accounts and open-tag limitations', async () => {
    const el = await render(at('nl/nederlandse-politiek-op-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('nl');
    expect(el.querySelector('h1')?.textContent).toContain('Nederlandse politiek');
    expect(el.querySelectorAll('.people li')).toHaveLength(19);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(3);
    expect(el.querySelector('a[href="/tags/TweedeKamer"]')).not.toBeNull();
    expect(el.textContent).toContain('geen onafhankelijke journalistiek');
    expect(el.textContent).toContain('82%');
    expect(el.textContent).toContain('Kleine persoonlijke accounts');
    expect(el.textContent).toContain('social.overheid.nl');
    expect(el.querySelector('a[href="/nl/mastodon-gemeenschappen"]')).not.toBeNull();
  });

  it('renders Dutch Culture with native controls and honest quiet-tag guidance', async () => {
    const el = await render(at('nl/nederlandstalige-cultuur-op-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('nl');
    expect(el.querySelector('h1')?.textContent).toContain('Nederlandstalige cultuur');
    expect(el.querySelectorAll('.people li')).toHaveLength(46);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(4);
    expect(el.querySelector('a[href="/tags/Boeken"]')).not.toBeNull();
    expect(el.textContent).toContain('optionele, rustige tags');
    expect(el.textContent).toContain('Inloggen met Mastodon');
    expect(el.textContent).toContain('mastodon.nl');
    expect(el.querySelector('a[href="/nl/mastodon-gemeenschappen"]')).not.toBeNull();
  });

  it('renders the approved Vietnamese kit with native controls and inclusive language guidance', async () => {
    const el = await render(at('vi/cong-dong-viet-tren-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('vi');
    expect(el.querySelector('h1')?.textContent).toContain('Cộng đồng Việt');
    expect(el.querySelectorAll('.people li')).toHaveLength(12);
    expect(el.querySelectorAll('.tag-list li')).toHaveLength(0);
    expect(el.textContent).toContain('30 tháng');
    expect(el.textContent).toContain('ở nước ngoài');
    expect(el.querySelector('a[href="/vi/cong-dong-mastodon"]')).not.toBeNull();
  });

  it('renders the approved Malaysia regional kit with Malay controls and mixed-language guidance', async () => {
    const el = await render(at('ms/malaysia-di-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('ms');
    expect(el.querySelector('h1')?.textContent).toContain('Malaysia di Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(25);
    expect(el.querySelectorAll('.tag-list li')).toHaveLength(0);
    expect(el.textContent).toContain('bahasa Inggeris');
    expect(el.textContent).toContain('30 bulan');
    expect(el.textContent).not.toContain('Every account is checked again each month');
    expect(el.querySelector('a[href="/ms/komuniti-mastodon"]')).not.toBeNull();
  });

  it('renders the approved English Mystery and Crime edition', async () => {
    const el = await render(at('mystery-and-crime-on-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('h1')?.textContent).toContain('Mystery and crime books on Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(10);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(20);
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'mystery-and-crime').map(
        (page) => page.lang,
      ),
    ).toEqual(['en', 'de']);
  });

  it('renders the German Krimis edition with native copy', async () => {
    const el = await render(at('de/krimis-auf-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(el.querySelector('h1')?.textContent).toContain('Krimis auf Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(10);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(7);
    expect(el.textContent).toContain('noch gar keinen Beiträgen');
  });

  it('renders the approved English Romance Books edition', async () => {
    const el = await render(at('romance-books-on-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('h1')?.textContent).toContain('Romance books on Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(15);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(20);
    expect(el.querySelector('a[href="/tags/RomanceBooks"]')).not.toBeNull();
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'romance-books').map((page) => page.lang),
    ).toEqual(['en', 'de']);
  });

  it('renders German Romance Books with native copy and useful quiet tags', async () => {
    const el = await render(at('de/liebesromane-auf-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(el.querySelector('h1')?.textContent).toContain('Liebesromane auf Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(5);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(4);
    expect(el.querySelector('a[href="/tags/Liebesromane"]')).not.toBeNull();
    expect(el.textContent).toContain('noch gar keinen Beiträgen');
  });

  it('renders Buddhism with the owner-approved selection and tag holds', async () => {
    const el = await render(at('buddhism-on-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('Buddhism on Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(9);
    expect(
      el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li'),
    ).toHaveLength(37);
    for (const tag of ['Theravada', 'Mahayana', 'Nichiren', 'ZenBuddhism', 'MettaMeditation'])
      expect(el.querySelector(`a[href="/tags/${tag}"]`)).not.toBeNull();
    for (const tag of [
      'Dharma',
      'Sangha',
      'Zen',
      'Metta',
      'Thien',
      'JodoShinshu',
      'SecularBuddhism',
      'Vipassana',
    ])
      expect(el.querySelector(`a[href="/tags/${tag}"]`)).toBeNull();
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'buddhism').map((page) => page.lang),
    ).toEqual(['en']);
  });

  it('renders only the approved Bicycling editions', async () => {
    for (const [path, lang, heading, count, tag] of [
      ['bicycling-on-mastodon', 'en', 'Bicycling on Mastodon', 8, 'Cycling'],
      ['de/radfahren-auf-mastodon', 'de', 'Radfahren auf Mastodon', 10, 'Radfahren'],
      ['fr/velo-sur-mastodon', 'fr', 'Le vélo sur Mastodon', 6, 'Vélo'],
    ] as const) {
      TestBed.resetTestingModule();
      const el = await render(at(path));
      expect(el.querySelector('main')?.getAttribute('lang')).toBe(lang);
      expect(el.querySelector('h1')?.textContent).toContain(heading);
      expect(el.querySelectorAll('.people li')).toHaveLength(count);
      expect(el.querySelector('a[href="/tags/' + encodeURIComponent(tag) + '"]')).not.toBeNull();
    }
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'bicycling').map((page) => page.lang),
    ).toEqual(['en', 'de', 'fr']);
  });

  it('renders only the approved Running editions with community accounts', async () => {
    for (const [path, lang, heading, count, tag] of [
      ['running-on-mastodon', 'en', 'Running on Mastodon', 8, 'Running'],
      ['de/laufen-auf-mastodon', 'de', 'Laufen auf Mastodon', 5, 'Laufen'],
    ] as const) {
      TestBed.resetTestingModule();
      const el = await render(at(path));
      expect(el.querySelector('main')?.getAttribute('lang')).toBe(lang);
      expect(el.querySelector('h1')?.textContent).toContain(heading);
      expect(el.querySelectorAll('.people li')).toHaveLength(count);
      expect(el.querySelector(`a[href="/tags/${tag}"]`)).not.toBeNull();
    }
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'running').map((page) => page.lang),
    ).toEqual(['en', 'de']);
  });

  it('renders approved German politics with open-tag guidance', async () => {
    const el = await render(at('de/deutsche-politik-auf-mastodon'));
    expect(el.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(el.querySelector('h1')?.textContent).toContain('Deutsche Politik auf Mastodon');
    expect(el.querySelectorAll('.people li')).toHaveLength(12);
    expect(el.querySelector('a[href="/tags/Bundestag"]')).not.toBeNull();
    expect(el.textContent).toContain('Hashtags sind offene Gesprächsräume');
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'german-politics').map(
        (page) => page.lang,
      ),
    ).toEqual(['de']);
  });

  it('renders the approved French Canadian politics edition and both language choices', async () => {
    const el = await render(at('fr/politique-canadienne-sur-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('La politique canadienne sur Mastodon');
    expect(el.querySelectorAll('.people li').length).toBe(5);
    expect(el.querySelector('a[href="/tags/PolCan"]')).not.toBeNull();
    expect(el.textContent).toContain('ils ne sont pas affiliés à ces médias');
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'canadian-politics')
        .map((page) => page.lang)
        .sort(),
    ).toEqual(['en', 'fr']);
  });

  it('renders the approved English US politics selection with open-tag guidance', async () => {
    const el = await render(at('us-politics-on-mastodon'));
    expect(el.querySelector('h1')?.textContent).toContain('US politics on Mastodon');
    expect(el.querySelectorAll('.people li').length).toBe(15);
    expect(el.querySelectorAll('section[aria-labelledby="tags-heading"] .tag-list li').length).toBe(
      5,
    );
    expect(el.querySelector('a[href="/tags/CivicEngagement"]')).not.toBeNull();
    expect(el.textContent).toContain('Hashtags are open streams');
    expect(
      FEED_BUILDER_PAGES.filter((page) => page.topic === 'uspol').map((page) => page.lang),
    ).toEqual(['en']);
  });

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
    expect(
      el
        .querySelector('a[href="/ms/malaysia-di-mastodon"]')
        ?.parentElement?.querySelector('.hub-fallback')?.textContent,
    ).toContain('Melayu');
    expect(el.querySelector('select option[value="vi"]')?.textContent).toContain('Tiếng Việt');
    expect(el.querySelector('select option[value="nl"]')?.textContent).toContain('Nederlands');
    expect(el.querySelector('a[href="/nl/nederlandstalige-cultuur-op-mastodon"]')).not.toBeNull();
    expect(el.querySelector('a[href="/nl/nederlandse-politiek-op-mastodon"]')).not.toBeNull();
    expect(el.querySelector('a[href="/vi/cong-dong-viet-tren-mastodon"]')).not.toBeNull();
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
