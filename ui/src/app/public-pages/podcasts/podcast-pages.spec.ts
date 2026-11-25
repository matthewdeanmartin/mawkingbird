import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PODCAST_COPY, topicInSentence } from './podcast-copy';
import { PodcastHubPublic } from './podcast-hub';
import { PodcastKitPublic } from './podcast-kit';
import {
  loadPodcastHub,
  loadPodcastKit,
  PODCAST_HUBS,
  PODCAST_PATHS,
  podcastHubStructuredData,
  podcastKitStructuredData,
} from './podcast-pages';
import { PODCAST_HUB_ALTERNATES, podcastKitAlternates, podcastRoutes } from './podcast-routes';

const langs = PODCAST_HUBS.map((hub) => hub.lang);
const editions = Object.entries(PODCAST_PATHS).flatMap(([category, byLang]) =>
  Object.entries(byLang).map(([lang, path]) => ({ category, lang, path })),
);

function render(component: typeof PodcastHubPublic | typeof PodcastKitPublic, page: unknown) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { data: of({ page }) } }],
  });
  const fixture = TestBed.createComponent<PodcastHubPublic | PodcastKitPublic>(component);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Podcast pages', () => {
  it('speaks English and German, with every phrase and no over-long description', () => {
    expect(langs).toEqual(['en', 'de']);
    for (const lang of langs) {
      const copy = PODCAST_COPY[lang];
      expect(copy.hubDescription.length, lang).toBeLessThanOrEqual(160);
      expect(copy.faq, lang).toHaveLength(PODCAST_COPY['en'].faq.length);
      for (const [key, value] of Object.entries(copy))
        if (typeof value === 'string') expect(value.trim(), `${lang}.${key}`).not.toBe('');
    }
  });

  it('routes every hub and topic, each indexable in its language', () => {
    expect(podcastRoutes.map((route) => route.path).sort()).toEqual(
      [...PODCAST_HUBS.map((hub) => hub.path), ...editions.map((entry) => entry.path)].sort(),
    );
    for (const route of podcastRoutes) {
      expect(route.data?.['seoIndexable']).toBe(true);
      expect(langs).toContain(route.data?.['lang']);
    }
    for (const { lang, path } of editions)
      expect(path.startsWith(PODCAST_HUBS.find((hub) => hub.lang === lang)!.path + '/')).toBe(true);
    expect(PODCAST_HUB_ALTERNATES.map((entry) => entry.lang)).toEqual(langs);
    expect(
      podcastKitAlternates('technology')
        .map((entry) => entry.lang)
        .sort(),
    ).toEqual(['de', 'en']);
    // One language only: nothing to alternate with.
    expect(podcastKitAlternates('music')).toEqual([]);
  });

  it('lists every topic on its hub, and every show on its topic, with room for search results', async () => {
    for (const lang of langs) {
      const hub = (await loadPodcastHub(lang))!;
      const own = editions.filter((entry) => entry.lang === lang);
      expect(hub.kits.map((kit) => kit.path).sort()).toEqual(own.map((e) => e.path).sort());
      const hubData = podcastHubStructuredData(hub) as {
        inLanguage: string;
        mainEntity: { numberOfItems: number };
      };
      expect(hubData.inLanguage).toBe(lang);
      expect(hubData.mainEntity.numberOfItems).toBe(own.length);
      for (const { category } of own) {
        const page = (await loadPodcastKit(category, lang))!;
        expect(page.description.length, `${lang} ${category}`).toBeLessThanOrEqual(160);
        expect(page.heading).toContain(String(page.kit.members.length));
        expect(page.others).toHaveLength(own.length - 1);
        const data = podcastKitStructuredData(page) as {
          mainEntity: { itemListElement: { name: string }[] };
          breadcrumb: { itemListElement: unknown[] };
        };
        expect(data.mainEntity.itemListElement.map((item) => item.name)).toEqual(
          page.kit.members.map((show) => show.displayName),
        );
        expect(data.breadcrumb.itemListElement).toHaveLength(3);
      }
    }
    expect(await loadPodcastKit('no-such-topic', 'en')).toBeNull();
    expect(await loadPodcastHub('xx')).toBeNull();
  });

  it('links the same topic in the other language, named in itself', async () => {
    const page = (await loadPodcastKit('technology', 'de'))!;
    expect(page.versions).toEqual([
      { lang: 'en', path: 'podcasts-on-mastodon/technology', name: 'English' },
    ]);
    const host = render(PodcastKitPublic, page);
    expect(host.querySelector('main')?.getAttribute('lang')).toBe('de');
    expect(host.querySelector('a[hreflang="en"]')?.textContent).toContain('English');
    expect(host.textContent).not.toMatch(/Shares on|Show website|Questions/);
  });

  it('shows no custom-emoji codes where a search result would print them', async () => {
    for (const { category, lang } of editions)
      for (const show of (await loadPodcastKit(category, lang))!.kit.members)
        expect(`${show.displayName} ${show.bio}`).not.toMatch(/(^|\s):[a-z0-9_]+:(\s|$)/i);
  });

  it('opens the same kit in the app, and says where to ask for removal', async () => {
    const page = (await loadPodcastKit('technology', 'en'))!;
    const host = render(PodcastKitPublic, page);
    expect(host.querySelector('h1')?.textContent).toContain(page.heading);
    expect(host.querySelectorAll('.creators > li')).toHaveLength(page.kit.members.length);
    const hrefs = [...host.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/singles/starter-kits?lang=en&kit=technology');
    expect(hrefs).toContain('/accounts/@mawkingbird@mastodon.social');
    for (const show of page.kit.members.filter((member) => member.showUrl))
      expect(
        [...host.querySelectorAll('a')]
          .find((link) => link.getAttribute('href') === show.showUrl)
          ?.getAttribute('rel'),
      ).toContain('nofollow');
  });

  it('keeps capitals inside a sentence', () => {
    expect(topicInSentence('Film and TV')).toBe('film and TV');
    expect(topicInSentence('Retro Computing')).toBe('retro computing');
  });

  it('links every topic from the hub, and the YouTubers in its language', async () => {
    const host = render(PodcastHubPublic, await loadPodcastHub('de'));
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    const hrefs = [...host.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    for (const { path } of editions.filter((entry) => entry.lang === 'de'))
      expect(hrefs).toContain('/' + path);
    expect(hrefs).toContain('/de/youtuber-auf-mastodon');
  });
});
