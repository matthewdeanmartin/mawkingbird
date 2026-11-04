import { ResolveFn, Route, Routes } from '@angular/router';
import { PageLanguage } from '../../focused-tools';
import {
  FEED_BUILDER_HUB,
  FEED_BUILDER_PAGES,
  FeedBuilderEntry,
  FeedTopic,
  feedBuilderAlternates,
} from './feed-builder-registry';

/**
 * Routes for the topic pages and their hub. Only paths load with the app; a
 * page's data, copy and shared words are imported by its resolvers, so the
 * startup bundle carries none of them. The browser (`app.routes.ts`) and the
 * prerender (`main.server.ts`) use these same routes.
 */
export const COMMUNITIES_TITLE = 'Mastodon starter kits by interest: communities to follow';
export const COMMUNITIES_DESCRIPTION =
  'Starter kits for interests on Mastodon: the hashtags worth following, the people worth following and where each community gathers. In several languages.';

const copyOf = async (topic: FeedTopic, lang: PageLanguage) =>
  (await import('./copy/topic-copy')).loadTopicCopy(topic, lang);

/** Everything one page renders, resolved before it renders (and before prerendering). */
export async function loadFeedPage({ topic, lang, path }: FeedBuilderEntry) {
  const [{ loadPageData }, { chromeFor }, copy] = await Promise.all([
    import('./feed-builder-data'),
    import('./feed-builder-chrome'),
    copyOf(topic, lang),
  ]);
  return {
    topic,
    lang,
    path,
    copy,
    chrome: chromeFor(lang),
    data: await loadPageData(topic, lang),
  };
}

export type FeedPage = Awaited<ReturnType<typeof loadFeedPage>>;

function pageRoute(entry: FeedBuilderEntry): Route {
  const { topic, lang, path } = entry;
  const title: ResolveFn<string> = async () => (await copyOf(topic, lang)).title;
  const description: ResolveFn<string> = async () => (await copyOf(topic, lang)).description;
  const structuredData: ResolveFn<object> = async () => {
    const page = await loadFeedPage(entry);
    const { collectionPage } = await import('./feed-builder-data');
    return collectionPage(page.data, page.copy, `https://mawkingbird.com/${path}/`);
  };
  return {
    path,
    title,
    data: { seoIndexable: true, lang, seoAlternates: feedBuilderAlternates(topic) },
    resolve: {
      page: () => loadFeedPage(entry),
      seoDescription: description,
      seoStructuredData: structuredData,
    },
    loadComponent: () => import('./feed-builder-page').then((m) => m.FeedBuilderPage),
  };
}

/** Each topic with its language versions, for the hub. */
async function loadHub() {
  return Promise.all(
    FEED_BUILDER_PAGES.map(async (entry) => ({
      ...entry,
      copy: await copyOf(entry.topic, entry.lang),
    })),
  );
}

export type FeedHubEntry = Awaited<ReturnType<typeof loadHub>>[number];

export const feedBuilderRoutes: Routes = [
  {
    path: FEED_BUILDER_HUB,
    title: COMMUNITIES_TITLE,
    data: { seoIndexable: true, seoDescription: COMMUNITIES_DESCRIPTION, lang: 'en' },
    resolve: { entries: loadHub },
    loadComponent: () => import('./feed-builder-hub').then((m) => m.FeedBuilderHub),
  },
  ...FEED_BUILDER_PAGES.map(pageRoute),
];
