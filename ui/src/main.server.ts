import { Component } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { provideRouter, Route, RouterOutlet, TitleStrategy } from '@angular/router';
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr';
import { PageTitleStrategy } from './app/shell/a11y/page-title-strategy';
import { Features } from './app/public-pages/features/features';
import {
  ABOUT_DESCRIPTION,
  APP_STRUCTURED_DATA,
  LEGAL_DESCRIPTION,
  FEATURES_DESCRIPTION,
  FUNDING_DESCRIPTION,
  TOOLS_DESCRIPTION,
  TOOLS_INDEX_ALTERNATES,
  TOOLS_INDEXES,
} from './app/public-pages/seo';
import { Type } from '@angular/core';
import {
  FocusedTool,
  TranslatedLanguage,
  languageFolder,
  toolAlternates,
  toolComponentName,
  toolLanguage,
} from './app/public-pages/focused-tools';
import { FOCUSED_TOOLS } from './app/public-pages/focused-tools-all';
import { toolsResolver } from './app/public-pages/tool-copy';
import * as anonymousOnMastodonPage from './app/accounts/anonymous-on-mastodon/anonymous-on-mastodon';
import * as crosspostPage from './app/publishing/crosspost/crosspost';
import * as networkSearchPage from './app/discovery/network-search/network-search';
import * as downloadMastodonImagesPage from './app/reading/download-mastodon-images/download-mastodon-images';
import * as mastodonSimilarHashtagsPage from './app/discovery/mastodon-similar-hashtags/mastodon-similar-hashtags';
import * as languageLandingPage from './app/public-pages/language-landing/language-landing';
import * as exportMastodonBookmarksPage from './app/reading/export-mastodon-bookmarks/export-mastodon-bookmarks';
import * as mastodonContentWarningsPage from './app/moderation/mastodon-content-warnings/mastodon-content-warnings';
import * as mastodonHandleGeneratorPage from './app/accounts/mastodon-handle-generator/mastodon-handle-generator';
import * as mastodonMuteBlockAmnestyPage from './app/moderation/mastodon-mute-block-amnesty/mastodon-mute-block-amnesty';
import * as findContactsOnMastodonPage from './app/discovery/find-contacts-on-mastodon/find-contacts-on-mastodon';
import * as mastodonFriendsRssFeedsPage from './app/reading/mastodon-friends-rss-feeds/mastodon-friends-rss-feeds';
import * as friendBridgePage from './app/discovery/friend-bridge/friend-bridge';
import * as turnOffBoostsMastodonPage from './app/feeds/turn-off-boosts-mastodon/turn-off-boosts-mastodon';
import * as githubToMastodonPage from './app/publishing/github-to-mastodon/github-to-mastodon';
import * as mastodonAnalyticsPage from './app/accounts/mastodon-analytics/mastodon-analytics';
import * as findInteractionsPage from './app/discovery/find-interactions/find-interactions';
import * as scheduleMastodonPostsPage from './app/publishing/schedule-mastodon-posts/schedule-mastodon-posts';
import * as twitterToMastodonPage from './app/discovery/twitter-to-mastodon/twitter-to-mastodon';
import { PublicArticle, PublicArticleKind } from './app/public-pages/features/public-article';
import * as toolsIndexPage from './app/public-pages/tools/tools-index';
import { ToolsIndex } from './app/public-pages/tools/tools-index';
import { audienceRoutes } from './app/public-pages/features/audience-routes';
import { followRoutes } from './app/public-pages/features/follow-routes';
import { feedBuilderRoutes } from './app/feeds/feed-builder/feed-builder-routes';
import { providePublicPageUrls } from './app/public-pages/public-page-urls';

// Only public content executes at build time. The browser still bootstraps the
// normal client, including its existing root dispatcher. No account data or
// remote instance is needed to produce these pages; hydration is not enabled.
@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
class PublicRoot {}

// Angular's server route map requires a matching router entry for CSR paths.
// This empty server-only placeholder is never prerendered; the browser uses
// the real EntryPage and its existing preview dispatcher.
@Component({ selector: 'app-client-entry', template: '' })
class ClientEntry {}

// Titles match the browser routes in app.routes.ts, which take over these URLs
// once the app boots and must keep the same title and indexability.
const articles: { path: PublicArticleKind; title: string; description: string }[] = [
  { path: 'about', title: 'About', description: ABOUT_DESCRIPTION },
  { path: 'funding', title: 'Funding', description: FUNDING_DESCRIPTION },
  { path: 'legal', title: 'About & legal', description: LEGAL_DESCRIPTION },
];

// The focused mini-apps' public pages (focused-tools.json; focusedAppRoutes in
// app.routes.ts). Their interactive parts are deferred and signed-in only, so
// only copy renders. A tool missing here is never prerendered, which fails
// check-seo-build.mjs.
const toolModules: Record<string, { module: unknown; component: string; oneForAll?: true }> = {
  'twitter-to-mastodon': { module: twitterToMastodonPage, component: 'TwitterToMastodon' },
  crosspost: { module: crosspostPage, component: 'Crosspost' },
  'mastodon-analytics': { module: mastodonAnalyticsPage, component: 'MastodonAnalytics' },
  'find-interactions': { module: findInteractionsPage, component: 'FindInteractions' },
  'github-to-mastodon': { module: githubToMastodonPage, component: 'GithubToMastodon' },
  'schedule-mastodon-posts': {
    module: scheduleMastodonPostsPage,
    component: 'ScheduleMastodonPosts',
  },
  'bluesky-to-mastodon': { module: friendBridgePage, component: 'FriendBridge' },
  'mastodon-to-bluesky': { module: friendBridgePage, component: 'FriendBridge' },
  'turn-off-boosts-mastodon': {
    module: turnOffBoostsMastodonPage,
    component: 'TurnOffBoostsMastodon',
  },
  'find-contacts-on-mastodon': {
    module: findContactsOnMastodonPage,
    component: 'FindContactsOnMastodon',
  },
  'mastodon-friends-rss-feeds': {
    module: mastodonFriendsRssFeedsPage,
    component: 'MastodonFriendsRssFeeds',
  },
  'mastodon-mute-block-amnesty': {
    module: mastodonMuteBlockAmnestyPage,
    component: 'MastodonMuteBlockAmnesty',
  },
  'how-to-be-anonymous-on-mastodon': {
    module: anonymousOnMastodonPage,
    component: 'AnonymousOnMastodon',
  },
  'mastodon-handle-generator': {
    module: mastodonHandleGeneratorPage,
    component: 'MastodonHandleGenerator',
  },
  'turn-off-content-warnings-mastodon': {
    module: mastodonContentWarningsPage,
    component: 'MastodonContentWarnings',
  },
  'export-mastodon-bookmarks': {
    module: exportMastodonBookmarksPage,
    component: 'ExportMastodonBookmarks',
  },
  'download-mastodon-images': {
    module: downloadMastodonImagesPage,
    component: 'DownloadMastodonImages',
    oneForAll: true,
  },
  'mastodon-similar-hashtags': {
    module: mastodonSimilarHashtagsPage,
    component: 'MastodonSimilarHashtags',
  },
  'mastodon-in-english': {
    module: languageLandingPage,
    component: 'LanguageLanding',
    oneForAll: true,
  },
  'learn-english-with-mastodon': {
    module: languageLandingPage,
    component: 'LanguageLanding',
    oneForAll: true,
  },
  'mastodon-search': { module: networkSearchPage, component: 'NetworkSearch' },
  'bluesky-search': { module: networkSearchPage, component: 'NetworkSearch' },
};

/** A tool page's component: the original's, or its language's subclass. */
function toolComponent(tool: FocusedTool): Type<unknown> {
  const original = FOCUSED_TOOLS.find((entry) => entry.id === (tool.translationOf ?? tool.id));
  const page = original && toolModules[original.path];
  if (!page) throw new Error(`No page module for ${tool.path}`);
  const component = (page.module as Record<string, Type<unknown>>)[
    toolComponentName(page, toolLanguage(tool))
  ];
  if (!component) throw new Error(`No ${toolLanguage(tool)} component for ${tool.path}`);
  return component;
}

const tools = FOCUSED_TOOLS.map((tool) => ({
  path: tool.path,
  title: tool.title,
  description: tool.description,
  lang: toolLanguage(tool),
  alternates: toolAlternates(tool),
  component: toolComponent(tool),
}));

const publicRoutes: Route[] = [
  ...audienceRoutes,
  ...followRoutes,
  ...feedBuilderRoutes,
  { path: '', pathMatch: 'full', component: ClientEntry },
  {
    path: 'features',
    component: Features,
    title: 'Mastodon, reading and writing features',
    data: {
      seoIndexable: true,
      seoDescription: FEATURES_DESCRIPTION,
      seoStructuredData: APP_STRUCTURED_DATA,
    },
  },
  {
    path: 'tools',
    component: ToolsIndex,
    title: 'Free tools for Mastodon and Bluesky',
    data: {
      seoIndexable: true,
      seoImage: 'tools',
      seoDescription: TOOLS_DESCRIPTION,
      lang: 'en',
      seoAlternates: TOOLS_INDEX_ALTERNATES,
    },
  },
  ...(Object.keys(TOOLS_INDEXES) as TranslatedLanguage[]).map((lang): Route => ({
    path: languageFolder(lang),
    pathMatch: 'full',
    component: (toolsIndexPage as Record<string, Type<unknown>>)[
      toolComponentName({ component: 'ToolsIndex' }, lang)
    ],
    title: TOOLS_INDEXES[lang].title,
    data: {
      seoIndexable: true,
      seoImage: 'tools',
      seoDescription: TOOLS_INDEXES[lang].description,
      lang,
      seoAlternates: TOOLS_INDEX_ALTERNATES,
    },
    resolve: { tools: toolsResolver(lang) },
  })),
  ...tools.map(({ path, title, description, lang, alternates, component }) => ({
    path,
    component,
    title,
    data: {
      seoIndexable: true,
      seoImage: 'tools',
      seoDescription: description,
      lang,
      seoAlternates: alternates,
    },
  })),
  ...articles.map(({ path, title, description }) => ({
    path,
    component: PublicArticle,
    title,
    data: { article: path, seoIndexable: true, seoDescription: description },
  })),
];

export default (context: BootstrapContext) =>
  bootstrapApplication(
    PublicRoot,
    {
      providers: [
        provideRouter(publicRoutes),
        providePublicPageUrls(publicRoutes),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
        provideServerRendering(
          withRoutes([
            { path: '', renderMode: RenderMode.Client },
            { path: 'features', renderMode: RenderMode.Prerender },
            { path: 'tools', renderMode: RenderMode.Prerender },
            ...(Object.keys(TOOLS_INDEXES) as TranslatedLanguage[]).map((lang) => ({
              path: languageFolder(lang),
              renderMode: RenderMode.Prerender as const,
            })),
            ...articles.map(({ path }) => ({ path, renderMode: RenderMode.Prerender as const })),
            ...tools.map(({ path }) => ({ path, renderMode: RenderMode.Prerender as const })),
            { path: 'follow', renderMode: RenderMode.Prerender },
            {
              path: 'follow/:slug',
              renderMode: RenderMode.Prerender,
              getPrerenderParams: async () =>
                (await import('./app/public-pages/features/follow-kits')).PUBLIC_KITS.map(
                  ({ slug }) => ({
                    slug,
                  }),
                ),
            },
            ...feedBuilderRoutes.map((route) => ({
              path: route.path ?? '',
              renderMode: RenderMode.Prerender as const,
            })),
            ...audienceRoutes.map((route) => ({
              path: route.path ?? '',
              renderMode: RenderMode.Prerender as const,
            })),
            { path: '**', renderMode: RenderMode.Client },
          ]),
        ),
      ],
    },
    context,
  );
