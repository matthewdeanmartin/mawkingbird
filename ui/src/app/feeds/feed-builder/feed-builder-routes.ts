import { ResolveFn, Route, Routes } from '@angular/router';
import { PageLanguage } from '../../public-pages/focused-tools';
import {
  FEED_BUILDER_HUBS,
  FeedBuilderHub,
  feedBuilderHubAlternates,
  feedBuilderHubFor,
  FEED_BUILDER_PAGES,
  FEED_BUILDER_FLOODING,
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
export const COMMUNITIES_TITLE = 'Mastodon communities by interest: hashtags, people and servers';
export const COMMUNITIES_DESCRIPTION =
  'Find Mastodon communities by interest: the hashtags worth following, the people worth following and the servers where each community gathers. In several languages.';

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
const floodingPage = () => import('./feed-flooding').then((m) => m.FeedFlooding);

function pageTitle({ topic, lang }: FeedBuilderEntry): ResolveFn<string> {
  return async () => (await copyOf(topic, lang)).title;
}

function tabTitle(entry: FeedBuilderEntry, tab: 'preview' | 'flooding'): ResolveFn<string> {
  return async () => {
    const [copy, { controlsFor }] = await Promise.all([
      copyOf(entry.topic, entry.lang),
      import('./feed-builder-controls'),
    ]);
    return `${copy.heading}: ${controlsFor(entry.lang)[tab]}`;
  };
}

/** The public, prerendered, indexed page. */
function pageRoute(entry: FeedBuilderEntry): Route {
  const { topic, lang, path } = entry;
  const description: ResolveFn<string> = async () => (await copyOf(topic, lang)).description;
  const structuredData: ResolveFn<object> = async () => {
    const page = await loadFeedPage(entry);
    const { collectionPage } = await import('./feed-builder-data');
    const hub = feedBuilderHubFor(lang);
    return collectionPage(page.data, page.copy, `https://mawkingbird.com/${path}/`, [
      { name: 'Mawkingbird', path: '' },
      { name: hub.label, path: hub.path },
      { name: page.copy.heading, path },
    ]);
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

/**
 * The public Preview and Flooding tabs: client-rendered and not indexed (what
 * they show is other people's posts, read live).
 */
function tabRoutes(entry: FeedBuilderEntry): Routes {
  return [
    {
      path: `${entry.path}/${FEED_BUILDER_PREVIEW}`,
      title: tabTitle(entry, 'preview'),
      data: { lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      loadComponent: previewPage,
    },
    {
      path: `${entry.path}/${FEED_BUILDER_FLOODING}`,
      title: tabTitle(entry, 'flooding'),
      data: { lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      loadComponent: floodingPage,
    },
  ];
}

/** The Builder, Preview and Flooding tabs of a page's signed-in twin, inside the shell. */
export function feedBuilderSignedInChildren(entry: FeedBuilderEntry): Routes {
  return [
    {
      path: '',
      title: pageTitle(entry),
      data: { inShell: true, lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      // Not while a "Follow all" is running: leaving would hide its progress.
      canDeactivate: [(page: { canLeave: () => boolean }) => page.canLeave()],
      loadComponent: builderPage,
    },
    {
      path: FEED_BUILDER_PREVIEW,
      title: tabTitle(entry, 'preview'),
      data: { inShell: true, lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      loadComponent: previewPage,
    },
    {
      path: FEED_BUILDER_FLOODING,
      title: tabTitle(entry, 'flooding'),
      data: { inShell: true, lang: entry.lang },
      resolve: { page: () => loadFeedPage(entry) },
      loadComponent: floodingPage,
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

const hubCopy = async (lang: PageLanguage) => (await import('./copy/hub-copy')).hubCopyFor(lang);

/**
 * One hub per language with topic pages (feed-builder-hubs.json). English
 * lists every topic in every language; the others list their own language's
 * pages. All are hreflang alternates of one another.
 */
function hubRoute({ lang, path }: FeedBuilderHub): Route {
  const english = lang === 'en';
  return {
    path,
    pathMatch: 'full',
    title: english ? COMMUNITIES_TITLE : async () => (await hubCopy(lang)).title,
    data: {
      seoIndexable: true,
      lang,
      seoAlternates: feedBuilderHubAlternates(),
      ...(english ? { seoDescription: COMMUNITIES_DESCRIPTION } : {}),
    },
    resolve: {
      entries: loadHub,
      copy: () => hubCopy(lang),
      ...(english ? {} : { seoDescription: async () => (await hubCopy(lang)).description }),
    },
    loadComponent: () => import('./feed-builder-hub').then((m) => m.FeedBuilderHub),
  };
}

/** The hubs and every page: public, prerendered, in the sitemap. */
export const feedBuilderRoutes: Routes = [
  ...FEED_BUILDER_HUBS.map(hubRoute),
  ...FEED_BUILDER_PAGES.map(pageRoute),
];

/** Every page's public Preview and Flooding tabs. Browser only: never prerendered. */
export const feedBuilderPreviewRoutes: Routes = FEED_BUILDER_PAGES.flatMap(tabRoutes);
