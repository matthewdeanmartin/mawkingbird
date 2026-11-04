import { ResolveFn, Route, Routes } from '@angular/router';
import { PageLanguage } from '../../focused-tools';
import {
  FEED_BUILDER_HUB,
  FEED_BUILDER_PAGES,
  FEED_BUILDER_PREVIEW,
  FeedBuilderEntry,
  FeedTopic,
  feedBuilderAlternates,
} from './feed-builder-registry';

/**
 * Routes for the topic pages, their previews and their hub.
 *
 * A topic page is a mini-app like the focused tools (Home · Builder ·
 * Preview): signed in to Mastodon, `app.routes.ts` puts its twin in the
 * trimmed shell with {@link feedBuilderSignedInChildren}; everyone else gets
 * the standalone page, prerendered and indexed, and its preview. Only paths
 * load with the app; data, copy and words are imported by the resolvers, so
 * the startup bundle carries none of them.
 */
export const COMMUNITIES_TITLE = 'Mastodon starter kits by interest: communities to follow';
export const COMMUNITIES_DESCRIPTION =
  'Starter kits for interests on Mastodon: the hashtags worth following, the people worth following and where each community gathers. In several languages.';

const copyOf = async (topic: FeedTopic, lang: PageLanguage) =>
  (await import('./copy/topic-copy')).loadTopicCopy(topic, lang);

/** Everything one page renders, resolved before it renders (and before prerendering). */
export async function loadFeedPage({ topic, lang, path }: FeedBuilderEntry) {
  const [{ loadPageData }, { chromeFor }, { controlsFor }, copy] = await Promise.all([
    import('./feed-builder-data'),
    import('./feed-builder-chrome'),
    import('./feed-builder-controls'),
    copyOf(topic, lang),
  ]);
  return {
    topic,
    lang,
    path,
    copy,
    chrome: chromeFor(lang),
    controls: controlsFor(lang),
    data: await loadPageData(topic, lang),
  };
}

export type FeedPage = Awaited<ReturnType<typeof loadFeedPage>>;

const builderPage = () => import('./feed-builder-page').then((m) => m.FeedBuilderPage);
const previewPage = () => import('./feed-preview').then((m) => m.FeedPreview);

function pageTitle({ topic, lang }: FeedBuilderEntry): ResolveFn<string> {
  return async () => (await copyOf(topic, lang)).title;
}

function previewTitle(entry: FeedBuilderEntry): ResolveFn<string> {
  return async () => {
    const [copy, { controlsFor }] = await Promise.all([
      copyOf(entry.topic, entry.lang),
      import('./feed-builder-controls'),
    ]);
    return `${copy.heading}: ${controlsFor(entry.lang).preview}`;
  };
}

/** The public, prerendered, indexed page. */
function pageRoute(entry: FeedBuilderEntry): Route {
  const { topic, lang, path } = entry;
  const description: ResolveFn<string> = async () => (await copyOf(topic, lang)).description;
  const structuredData: ResolveFn<object> = async () => {
    const page = await loadFeedPage(entry);
    const { collectionPage } = await import('./feed-builder-data');
    return collectionPage(page.data, page.copy, `https://mawkingbird.com/${path}/`);
  };
  return {
    path,
    pathMatch: 'full',
    title: pageTitle(entry),
    data: { seoIndexable: true, lang, seoAlternates: feedBuilderAlternates(topic) },
    resolve: {
      page: () => loadFeedPage(entry),
      seoDescription: description,
      seoStructuredData: structuredData,
    },
    loadComponent: builderPage,
  };
}

/** The public preview: client-rendered and not indexed (its posts are other people's). */
function previewRoute(entry: FeedBuilderEntry): Route {
  return {
    path: `${entry.path}/${FEED_BUILDER_PREVIEW}`,
    title: previewTitle(entry),
    data: { lang: entry.lang },
    resolve: { page: () => loadFeedPage(entry) },
    loadComponent: previewPage,
  };
}

/** The Builder and Preview tabs of a page's signed-in twin, inside the shell. */
export function feedBuilderSignedInChildren(entry: FeedBuilderEntry): Routes {
  return [
    {
      path: '',
      title: pageTitle(entry),
      data: { inShell: true, lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      loadComponent: builderPage,
    },
    {
      path: FEED_BUILDER_PREVIEW,
      title: previewTitle(entry),
      data: { inShell: true, lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      loadComponent: previewPage,
    },
  ];
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

/** The hub and every page: public, prerendered, in the sitemap. */
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

/** Every page's public preview. Browser only: never prerendered. */
export const feedBuilderPreviewRoutes: Routes = FEED_BUILDER_PAGES.map(previewRoute);
