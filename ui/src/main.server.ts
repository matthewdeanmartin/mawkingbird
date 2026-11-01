import { Component } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { provideRouter, RouterOutlet, TitleStrategy } from '@angular/router';
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr';
import { PageTitleStrategy } from './app/a11y/page-title-strategy';
import { Features } from './app/pages/features/features';
import {
  ABOUT_DESCRIPTION,
  APP_STRUCTURED_DATA,
  BLOG_DESCRIPTION,
  FEATURES_DESCRIPTION,
  FUNDING_DESCRIPTION,
  TOOLS_DESCRIPTION,
  TOOLS_DESCRIPTION_DE,
  TOOLS_DESCRIPTION_JA,
  TOOLS_INDEX_ALTERNATES,
} from './app/seo';
import { Type } from '@angular/core';
import { FOCUSED_TOOLS, toolAlternates, toolLanguage } from './app/focused-tools';
import {
  AnonymousOnMastodon,
  AnonymousOnMastodonDe,
  AnonymousOnMastodonJa,
} from './app/pages/anonymous-on-mastodon/anonymous-on-mastodon';
import { Crosspost, CrosspostDe, CrosspostJa } from './app/pages/crosspost/crosspost';
import {
  NetworkSearch,
  NetworkSearchDe,
  NetworkSearchJa,
} from './app/pages/network-search/network-search';
import { DownloadMastodonImages } from './app/pages/download-mastodon-images/download-mastodon-images';
import {
  MastodonSimilarHashtags,
  MastodonSimilarHashtagsDe,
  MastodonSimilarHashtagsJa,
} from './app/pages/mastodon-similar-hashtags/mastodon-similar-hashtags';
import { LanguageLanding } from './app/pages/language-landing/language-landing';
import {
  ExportMastodonBookmarks,
  ExportMastodonBookmarksDe,
  ExportMastodonBookmarksJa,
} from './app/pages/export-mastodon-bookmarks/export-mastodon-bookmarks';
import {
  MastodonContentWarnings,
  MastodonContentWarningsDe,
  MastodonContentWarningsJa,
} from './app/pages/mastodon-content-warnings/mastodon-content-warnings';
import {
  MastodonHandleGenerator,
  MastodonHandleGeneratorDe,
  MastodonHandleGeneratorJa,
} from './app/pages/mastodon-handle-generator/mastodon-handle-generator';
import {
  MastodonMuteBlockAmnesty,
  MastodonMuteBlockAmnestyDe,
  MastodonMuteBlockAmnestyJa,
} from './app/pages/mastodon-mute-block-amnesty/mastodon-mute-block-amnesty';
import {
  FindContactsOnMastodon,
  FindContactsOnMastodonDe,
  FindContactsOnMastodonJa,
} from './app/pages/find-contacts-on-mastodon/find-contacts-on-mastodon';
import {
  MastodonFriendsRssFeeds,
  MastodonFriendsRssFeedsDe,
  MastodonFriendsRssFeedsJa,
} from './app/pages/mastodon-friends-rss-feeds/mastodon-friends-rss-feeds';
import {
  FriendBridge,
  FriendBridgeDe,
  FriendBridgeJa,
} from './app/pages/friend-bridge/friend-bridge';
import {
  TurnOffBoostsMastodon,
  TurnOffBoostsMastodonDe,
  TurnOffBoostsMastodonJa,
} from './app/pages/turn-off-boosts-mastodon/turn-off-boosts-mastodon';
import {
  GithubToMastodon,
  GithubToMastodonDe,
  GithubToMastodonJa,
} from './app/pages/github-to-mastodon/github-to-mastodon';
import {
  MastodonAnalytics,
  MastodonAnalyticsDe,
  MastodonAnalyticsJa,
} from './app/pages/mastodon-analytics/mastodon-analytics';
import {
  ScheduleMastodonPosts,
  ScheduleMastodonPostsDe,
  ScheduleMastodonPostsJa,
} from './app/pages/schedule-mastodon-posts/schedule-mastodon-posts';
import {
  TwitterToMastodon,
  TwitterToMastodonDe,
  TwitterToMastodonJa,
} from './app/pages/twitter-to-mastodon/twitter-to-mastodon';
import { PublicArticle, PublicArticleKind } from './app/pages/features/public-article';
import { ToolsIndex, ToolsIndexDe, ToolsIndexJa } from './app/pages/tools/tools-index';
import { audienceRoutes } from './app/pages/features/audience-routes';
import { followRoutes } from './app/pages/features/follow-routes';

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
  { path: 'blog', title: 'Blog', description: BLOG_DESCRIPTION },
];

// The focused mini-apps' public pages (focused-tools.json; focusedAppRoutes in
// app.routes.ts). Their interactive parts are deferred and signed-in only, so
// only copy renders. A tool missing here is never prerendered, which fails
// check-seo-build.mjs.
const toolComponents: Record<string, Type<unknown>> = {
  'twitter-to-mastodon': TwitterToMastodon,
  crosspost: Crosspost,
  'mastodon-analytics': MastodonAnalytics,
  'github-to-mastodon': GithubToMastodon,
  'schedule-mastodon-posts': ScheduleMastodonPosts,
  'bluesky-to-mastodon': FriendBridge,
  'mastodon-to-bluesky': FriendBridge,
  'turn-off-boosts-mastodon': TurnOffBoostsMastodon,
  'find-contacts-on-mastodon': FindContactsOnMastodon,
  'mastodon-friends-rss-feeds': MastodonFriendsRssFeeds,
  'mastodon-mute-block-amnesty': MastodonMuteBlockAmnesty,
  'how-to-be-anonymous-on-mastodon': AnonymousOnMastodon,
  'mastodon-handle-generator': MastodonHandleGenerator,
  'turn-off-content-warnings-mastodon': MastodonContentWarnings,
  'export-mastodon-bookmarks': ExportMastodonBookmarks,
  'download-mastodon-images': DownloadMastodonImages,
  'de/mastodon-bilder-herunterladen': DownloadMastodonImages,
  'mastodon-similar-hashtags': MastodonSimilarHashtags,
  'mastodon-in-english': LanguageLanding,
  'de/mastodon-auf-deutsch': LanguageLanding,
  'learn-english-with-mastodon': LanguageLanding,
  'de/twitter-follower-zu-mastodon': TwitterToMastodonDe,
  'de/mastodon-und-bluesky-gleichzeitig-posten': CrosspostDe,
  'de/mastodon-statistik': MastodonAnalyticsDe,
  'de/github-freunde-auf-mastodon': GithubToMastodonDe,
  'de/mastodon-beitraege-planen': ScheduleMastodonPostsDe,
  'de/von-bluesky-zu-mastodon': FriendBridgeDe,
  'de/von-mastodon-zu-bluesky': FriendBridgeDe,
  'de/mastodon-boosts-ausblenden': TurnOffBoostsMastodonDe,
  'de/kontakte-auf-mastodon-finden': FindContactsOnMastodonDe,
  'de/rss-feeds-deiner-mastodon-freunde': MastodonFriendsRssFeedsDe,
  'de/mastodon-stummschaltungen-aufheben': MastodonMuteBlockAmnestyDe,
  'de/anonym-auf-mastodon': AnonymousOnMastodonDe,
  'de/mastodon-nutzernamen-generator': MastodonHandleGeneratorDe,
  'de/mastodon-inhaltswarnungen-ausschalten': MastodonContentWarningsDe,
  'de/mastodon-lesezeichen-exportieren': ExportMastodonBookmarksDe,
  'de/mastodon-suche': NetworkSearchDe,
  'de/bluesky-suche': NetworkSearchDe,
  'de/aehnliche-hashtags-mastodon': MastodonSimilarHashtagsDe,
  'ja/twitter-to-mastodon': TwitterToMastodonJa,
  'ja/crosspost': CrosspostJa,
  'ja/mastodon-analytics': MastodonAnalyticsJa,
  'ja/github-to-mastodon': GithubToMastodonJa,
  'ja/schedule-mastodon-posts': ScheduleMastodonPostsJa,
  'ja/bluesky-to-mastodon': FriendBridgeJa,
  'ja/mastodon-to-bluesky': FriendBridgeJa,
  'ja/turn-off-boosts-mastodon': TurnOffBoostsMastodonJa,
  'ja/find-contacts-on-mastodon': FindContactsOnMastodonJa,
  'ja/mastodon-friends-rss-feeds': MastodonFriendsRssFeedsJa,
  'ja/mastodon-mute-block-amnesty': MastodonMuteBlockAmnestyJa,
  'ja/how-to-be-anonymous-on-mastodon': AnonymousOnMastodonJa,
  'ja/mastodon-handle-generator': MastodonHandleGeneratorJa,
  'ja/turn-off-content-warnings-mastodon': MastodonContentWarningsJa,
  'ja/export-mastodon-bookmarks': ExportMastodonBookmarksJa,
  'ja/mastodon-search': NetworkSearchJa,
  'ja/bluesky-search': NetworkSearchJa,
  'ja/download-mastodon-images': DownloadMastodonImages,
  'ja/mastodon-similar-hashtags': MastodonSimilarHashtagsJa,
  'ja/mastodon-in-japanese': LanguageLanding,
  'ja/learn-english-with-mastodon': LanguageLanding,
  'mastodon-search': NetworkSearch,
  'bluesky-search': NetworkSearch,
};
const tools = FOCUSED_TOOLS.map((tool) => ({
  path: tool.path,
  title: tool.title,
  description: tool.description,
  lang: toolLanguage(tool),
  alternates: toolAlternates(tool),
  component: toolComponents[tool.path],
}));

export default (context: BootstrapContext) =>
  bootstrapApplication(
    PublicRoot,
    {
      providers: [
        provideRouter([
          ...audienceRoutes,
          ...followRoutes,
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
              seoDescription: TOOLS_DESCRIPTION,
              lang: 'en',
              seoAlternates: TOOLS_INDEX_ALTERNATES,
            },
          },
          {
            path: 'de',
            pathMatch: 'full',
            component: ToolsIndexDe,
            title: 'Kostenlose Werkzeuge für Mastodon und Bluesky',
            data: {
              seoIndexable: true,
              seoDescription: TOOLS_DESCRIPTION_DE,
              lang: 'de',
              seoAlternates: TOOLS_INDEX_ALTERNATES,
            },
          },
          {
            path: 'ja',
            pathMatch: 'full',
            component: ToolsIndexJa,
            title: 'Mastodon と Bluesky の無料ツール',
            data: {
              seoIndexable: true,
              seoDescription: TOOLS_DESCRIPTION_JA,
              lang: 'ja',
              seoAlternates: TOOLS_INDEX_ALTERNATES,
            },
          },
          ...tools.map(({ path, title, description, lang, alternates, component }) => ({
            path,
            component,
            title,
            data: {
              seoIndexable: true,
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
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
        provideServerRendering(
          withRoutes([
            { path: '', renderMode: RenderMode.Client },
            { path: 'features', renderMode: RenderMode.Prerender },
            { path: 'tools', renderMode: RenderMode.Prerender },
            { path: 'de', renderMode: RenderMode.Prerender },
            { path: 'ja', renderMode: RenderMode.Prerender },
            ...articles.map(({ path }) => ({ path, renderMode: RenderMode.Prerender as const })),
            ...tools.map(({ path }) => ({ path, renderMode: RenderMode.Prerender as const })),
            { path: 'follow', renderMode: RenderMode.Prerender },
            {
              path: 'follow/:slug',
              renderMode: RenderMode.Prerender,
              getPrerenderParams: async () =>
                (await import('./app/pages/features/follow-kits')).PUBLIC_KITS.map(({ slug }) => ({
                  slug,
                })),
            },
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
