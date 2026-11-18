import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import PATHS from './youtuber-paths.generated.json';
import HUBS from './youtuber-hubs.json';
import { YOUTUBER_COPY, clipDescription } from './youtuber-copy';
import {
  hubStructuredData,
  kitStructuredData,
  loadHub,
  loadKit,
  nativeName,
  YoutuberKitPage,
} from './youtuber-pages';
import { YOUTUBER_HUB_ALTERNATES, youtuberKitAlternates, youtuberRoutes } from './youtuber-routes';
import { monthYear, YoutuberKitPublic } from './youtuber-kit';
import type { YoutuberPaths } from './youtuber-types';

const paths = PATHS as YoutuberPaths;
const hubs = HUBS as unknown as Record<string, { path: string; label: string }>;
const langs = Object.keys(paths.languages);
/** A category bundled in more than one language, to test editions. */
const shared = Object.entries(paths.kits).find(([, byLang]) => Object.keys(byLang).length > 1);

describe('YouTuber kit copy', () => {
  it('has every phrase in every bundled language, and nothing over-long for search', () => {
    for (const lang of langs) {
      const copy = YOUTUBER_COPY[lang];
      expect(copy, `${lang} copy`).toBeDefined();
      expect(copy.hubDescription.length, `${lang} hub description`).toBeLessThanOrEqual(160);
      expect(copy.faq.length).toBeGreaterThanOrEqual(3);
      expect(copy.kitHeading('X', 3)).toContain('3');
      for (const [key, value] of Object.entries(copy))
        if (typeof value === 'string') expect(value.trim(), `${lang}.${key}`).not.toBe('');
    }
  });

  it('clips meta descriptions at a word', () => {
    expect(clipDescription('word '.repeat(60)).length).toBeLessThanOrEqual(160);
    expect(clipDescription('short')).toBe('short');
  });
});

describe('YouTuber kit pages', () => {
  it('builds a hub per language listing its kits, in its own language, with its sister hubs', async () => {
    for (const lang of langs) {
      const hub = (await loadHub(lang))!;
      expect(hub.hub.path).toBe(hubs[lang].path);
      expect(hub.kits.map((kit) => kit.path).sort()).toEqual(
        Object.values(paths.kits)
          .map((byLang) => byLang[lang])
          .filter(Boolean)
          .sort(),
      );
      expect(hub.versions.map((v) => v.lang).sort()).toEqual(
        langs.filter((l) => l !== lang).sort(),
      );
      const data = hubStructuredData(hub) as { inLanguage: string; url: string };
      expect(data.inLanguage).toBe(lang);
      expect(data.url).toBe(`https://mawkingbird.com/${hubs[lang].path}/`);
    }
  });

  it('builds a kit page with a heading, a short description and its other editions', async () => {
    if (!shared) return;
    const [category, byLang] = shared;
    for (const [lang, path] of Object.entries(byLang)) {
      const page = (await loadKit(category, lang))!;
      expect(page.pack.path).toBe(path);
      expect(page.heading).toContain(String(page.pack.members.length));
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.versions.map((v) => v.lang).sort()).toEqual(
        Object.keys(byLang)
          .filter((l) => l !== lang)
          .sort(),
      );
      const data = kitStructuredData(page) as {
        mainEntity: { numberOfItems: number };
        breadcrumb: { itemListElement: unknown[] };
      };
      expect(data.mainEntity.numberOfItems).toBe(page.pack.members.length);
      expect(data.breadcrumb.itemListElement).toHaveLength(3);
    }
    expect(await loadKit(category, 'xx')).toBeNull();
    expect(await loadKit('no-such-category', 'en')).toBeNull();
  });

  it('routes every hub and kit, each indexable in its language with its alternates', () => {
    const routed = new Set(youtuberRoutes.map((route) => route.path));
    for (const lang of langs) expect(routed.has(hubs[lang].path)).toBe(true);
    for (const byLang of Object.values(paths.kits))
      for (const path of Object.values(byLang)) expect(routed.has(path)).toBe(true);
    for (const route of youtuberRoutes) {
      expect(route.data?.['seoIndexable']).toBe(true);
      expect(langs).toContain(route.data?.['lang']);
    }
    expect(YOUTUBER_HUB_ALTERNATES).toHaveLength(langs.length);
    if (shared)
      expect(youtuberKitAlternates(shared[0])).toHaveLength(Object.keys(shared[1]).length);
  });

  it('names languages in themselves and dates without locale data', () => {
    expect(nativeName('de')).toBe('Deutsch');
    expect(nativeName('fr')).toBe('Français');
    expect(monthYear('2026-11-01T00:00:00+00:00', 'en')).toMatch(/2026/);
    expect(monthYear(null, 'en')).toBe('');
    expect(monthYear('nonsense', 'de')).toBe('');
  });
});

describe('YoutuberKitPublic', () => {
  let fixture: ComponentFixture<YoutuberKitPublic>;
  afterEach(() => fixture?.destroy());

  it('renders creators with their channel, bio and videos, linking YouTube nofollow', async () => {
    const lang = langs.includes('en') ? 'en' : langs[0];
    if (!lang) return;
    const category = Object.keys(paths.kits).find((c) => paths.kits[c][lang])!;
    const page = (await loadKit(category, lang)) as YoutuberKitPage;
    TestBed.configureTestingModule({
      imports: [YoutuberKitPublic],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { data: of({ page }) } }],
    });
    fixture = TestBed.createComponent(YoutuberKitPublic);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent).toContain(page.heading);
    expect(host.querySelectorAll('.creators > li')).toHaveLength(page.pack.members.length);
    for (const link of host.querySelectorAll('a[href^="https://www.youtube.com/"]'))
      expect(link.getAttribute('rel')).toContain('nofollow');
    expect(host.querySelector('a[href^="/videos/starters"]')).not.toBeNull();
    expect(host.querySelector('main')?.getAttribute('lang')).toBe(lang);
  });
});
