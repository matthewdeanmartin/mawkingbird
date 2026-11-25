import { ResolveFn, Route, Routes } from '@angular/router';
import type { PageAlternate, PageLanguage } from '../focused-tools';
import HUBS from './podcast-hubs.json';
import PATHS from './podcast-paths.generated.json';

/**
 * Public, prerendered, indexed pages for podcasts on Mastodon: a hub per language
 * and one page per topic and language (`/podcasts-on-mastodon/technology/`,
 * `/de/podcasts-auf-mastodon/technologie/`). Only the paths load with the app; the
 * model, the copy and the kits are imported by the resolvers. Addresses are
 * permanent. See ops/engineering/seo.md, "Podcasts on Mastodon".
 */
const pages = () => import('./podcast-pages');
const kits = PATHS.kits as Record<string, Record<string, string>>;
const hubs = Object.fromEntries(
  Object.entries(HUBS as Record<string, unknown>).filter(([key]) => key !== '$comment'),
) as Record<string, { path: string; label: string }>;

const alternates = (paths: [string, string][]): PageAlternate[] =>
  paths.map(([lang, path]) => ({ lang: lang as PageLanguage, path }));

export const PODCAST_HUB_ALTERNATES = alternates(
  Object.entries(hubs).map(([lang, hub]) => [lang, hub.path]),
);

/** A topic's editions: none when it exists in one language only. */
export function podcastKitAlternates(category: string): PageAlternate[] {
  const editions = Object.entries(kits[category] ?? {});
  return editions.length > 1 ? alternates(editions) : [];
}

function hubRoute(lang: string): Route {
  const page = async () => (await pages()).loadPodcastHub(lang);
  const structuredData: ResolveFn<object | undefined> = async () => {
    const loaded = await page();
    return loaded ? (await pages()).podcastHubStructuredData(loaded) : undefined;
  };
  return {
    path: hubs[lang].path,
    pathMatch: 'full',
    title: async () => (await page())?.copy.hubHeading ?? hubs[lang].label,
    data: {
      seoIndexable: true,
      seoImage: 'communities',
      lang,
      seoAlternates: PODCAST_HUB_ALTERNATES,
    },
    resolve: {
      page,
      seoKeywordTitle: async () => hubs[lang].label,
      seoDescription: async () => (await page())?.copy.hubDescription ?? '',
      seoStructuredData: structuredData,
    },
    loadComponent: () => import('./podcast-hub').then((m) => m.PodcastHubPublic),
  };
}

function kitRoute(category: string, lang: string, path: string): Route {
  const page = async () => (await pages()).loadPodcastKit(category, lang);
  const structuredData: ResolveFn<object | undefined> = async () => {
    const loaded = await page();
    return loaded ? (await pages()).podcastKitStructuredData(loaded) : undefined;
  };
  return {
    path,
    pathMatch: 'full',
    title: async () => (await page())?.heading ?? hubs[lang].label,
    data: {
      seoIndexable: true,
      seoImage: 'communities',
      lang,
      seoAlternates: podcastKitAlternates(category),
    },
    resolve: {
      page,
      seoKeywordTitle: async () => hubs[lang].label,
      seoDescription: async () => (await page())?.description ?? '',
      seoStructuredData: structuredData,
    },
    loadComponent: () => import('./podcast-kit').then((m) => m.PodcastKitPublic),
  };
}

export const podcastRoutes: Routes = [
  ...Object.keys(hubs).map(hubRoute),
  ...Object.entries(kits).flatMap(([category, editions]) =>
    Object.entries(editions).map(([lang, path]) => kitRoute(category, lang, path)),
  ),
];
