import paths from './feed-builder-paths.json';
import hubs from './feed-builder-hubs.json';
import { PageAlternate, PageLanguage } from '../../public-pages/focused-tools';

/**
 * Feed Builder topic pages ("starter kits" in public copy): one page per topic
 * and language, at the path in feed-builder-paths.json.
 *
 * Only paths load with the app (they are needed for routes, hreflang and the
 * language menu). Page data and copy are imported lazily by the page's
 * resolver, one language at a time, so the startup bundle never carries them;
 * `report-bundle.mjs` enforces that. `scripts/import-feed-builder.mjs --check`
 * fails when a path has no bundled data or bundled data has no path.
 */
export type FeedTopic = keyof typeof paths;

export interface FeedBuilderEntry {
  topic: FeedTopic;
  lang: PageLanguage;
  path: string;
}

export const FEED_BUILDER_PAGES: readonly FeedBuilderEntry[] = (
  Object.entries(paths) as [FeedTopic, Record<string, string>][]
).flatMap(([topic, langs]) =>
  Object.entries(langs).map(([lang, path]) => ({ topic, lang: lang as PageLanguage, path })),
);

export const FEED_BUILDER_TOPICS: readonly FeedTopic[] = Object.keys(paths) as FeedTopic[];

/** Every language version of a topic page, for hreflang and the language menu. */
export function feedBuilderAlternates(topic: FeedTopic): PageAlternate[] {
  return FEED_BUILDER_PAGES.filter((page) => page.topic === topic).map(({ lang, path }) => ({
    lang,
    path,
  }));
}

export function feedBuilderPageAt(path: string): FeedBuilderEntry | undefined {
  return FEED_BUILDER_PAGES.find((page) => page.path === path);
}

/**
 * One communities hub per language that has a topic page, from
 * feed-builder-hubs.json (also read by the SEO build scripts). English, at
 * /communities/, lists every topic in every language; each other hub lists its
 * language's pages. A language with a topic page but no hub, or a hub with no
 * page, fails feed-builder-registry.spec.ts and check-seo-build.mjs.
 */
export interface FeedBuilderHub {
  lang: PageLanguage;
  path: string;
  /** The hub's name in its language, for links to it from other pages. */
  label: string;
}

export const FEED_BUILDER_HUBS: readonly FeedBuilderHub[] = (
  Object.entries(hubs) as [PageLanguage, { path: string; label: string }][]
).map(([lang, { path, label }]) => ({ lang, path, label }));

/** The English hub, which lists every topic in every language. */
export const FEED_BUILDER_HUB = hubs.en.path;

/** The hub for a page in `lang`; English when that language has none. */
export function feedBuilderHubFor(lang: string): FeedBuilderHub {
  return (
    FEED_BUILDER_HUBS.find((hub) => hub.lang === lang) ??
    FEED_BUILDER_HUBS.find((hub) => hub.lang === 'en')!
  );
}

/** Every hub, for hreflang between them. */
export function feedBuilderHubAlternates(): PageAlternate[] {
  return FEED_BUILDER_HUBS.map(({ lang, path }) => ({ lang, path }));
}

/** A topic page's preview tab, below its path: the feed it builds, read anonymously. */
export const FEED_BUILDER_PREVIEW = 'preview';

/** A topic page's flooding check, below its path: who floods the ticked hashtags. */
export const FEED_BUILDER_FLOODING = 'flooding';
