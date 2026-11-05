import paths from './feed-builder-paths.json';
import { PageAlternate, PageLanguage } from '../../focused-tools';

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

/** The hub listing every topic page. English, like /follow/ and /tools/. */
export const FEED_BUILDER_HUB = 'communities';

/** A topic page's preview tab, below its path: the feed it builds, read anonymously. */
export const FEED_BUILDER_PREVIEW = 'preview';

/** A topic page's flooding check, below its path: who floods the ticked hashtags. */
export const FEED_BUILDER_FLOODING = 'flooding';
