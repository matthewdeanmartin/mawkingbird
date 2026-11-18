import { ResolveFn, Route, Routes } from '@angular/router';
import HUBS from './youtuber-hubs.json';
import PATHS from './youtuber-paths.generated.json';
import type { PageAlternate, PageLanguage } from '../focused-tools';
import type { YoutuberPaths } from './youtuber-types';

/**
 * Public, prerendered, indexed pages for YouTubers on Mastodon: one hub per
 * language with kits, and one page per kit and language
 * (`/youtubers-on-mastodon/technology/`, `/de/youtuber-auf-mastodon/technologie/`).
 * Only paths load with the app (the hubs file and the generated paths file,
 * about a kilobyte); kit data and copy are imported by the resolvers.
 * See ops/engineering/seo.md, "YouTubers on Mastodon".
 */
const paths = PATHS as YoutuberPaths;
const hubs = Object.fromEntries(
  Object.entries(HUBS as Record<string, unknown>).filter(([key]) => key !== '$comment'),
) as Record<string, { path: string; label: string }>;

const pages = () => import('./youtuber-pages');

/** Languages with both kits and a hub. */
export const YOUTUBER_LANGUAGES = Object.keys(paths.languages).filter((lang) => hubs[lang]);

/** Every hub is an alternate of every other. */
export const YOUTUBER_HUB_ALTERNATES: PageAlternate[] = YOUTUBER_LANGUAGES.map((lang) => ({
  lang: lang as PageLanguage,
  path: hubs[lang].path,
}));

/** A kit's editions: the same category in each language that has it. */
export function youtuberKitAlternates(category: string): PageAlternate[] {
  return Object.entries(paths.kits[category] ?? {})
    .filter(([lang]) => hubs[lang])
    .map(([lang, path]) => ({ lang: lang as PageLanguage, path }));
}

const hubPage = () => import('./youtuber-hub').then((m) => m.YoutuberHubPublic);
const kitPage = () => import('./youtuber-kit').then((m) => m.YoutuberKitPublic);

function hubRoute(lang: string): Route {
  const page = async () => (await pages()).loadHub(lang);
  const copy = async () => (await import('./youtuber-copy')).youtuberCopy(lang);
  const structuredData: ResolveFn<object | undefined> = async () => {
    const { hubStructuredData } = await pages();
    const loaded = await page();
    return loaded ? hubStructuredData(loaded) : undefined;
  };
  return {
    path: hubs[lang].path,
    pathMatch: 'full',
    title: async () => (await copy()).hubHeading,
    data: {
      seoIndexable: true,
      seoImage: 'communities',
      lang,
      seoAlternates: YOUTUBER_HUB_ALTERNATES,
    },
    resolve: {
      page,
      seoKeywordTitle: async () => hubs[lang].label,
      seoDescription: async () => (await copy()).hubDescription,
      seoStructuredData: structuredData,
    },
    loadComponent: hubPage,
  };
}

function kitRoute(category: string, lang: string, path: string): Route {
  const page = async () => (await pages()).loadKit(category, lang);
  const structuredData: ResolveFn<object | undefined> = async () => {
    const { kitStructuredData } = await pages();
    const loaded = await page();
    return loaded ? kitStructuredData(loaded) : undefined;
  };
  return {
    path,
    pathMatch: 'full',
    title: async () => (await page())?.heading ?? hubs[lang].label,
    data: {
      seoIndexable: true,
      seoImage: 'communities',
      lang,
      seoAlternates: youtuberKitAlternates(category),
    },
    resolve: {
      page,
      seoKeywordTitle: async () => hubs[lang].label,
      seoDescription: async () => (await page())?.description ?? '',
      seoStructuredData: structuredData,
    },
    loadComponent: kitPage,
  };
}

export const youtuberRoutes: Routes = [
  ...YOUTUBER_LANGUAGES.map(hubRoute),
  ...Object.entries(paths.kits).flatMap(([category, byLang]) =>
    Object.entries(byLang)
      .filter(([lang]) => hubs[lang])
      .map(([lang, path]) => kitRoute(category, lang, path)),
  ),
];
