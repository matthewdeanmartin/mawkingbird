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
  CROSSPOST_DESCRIPTION,
  GITHUB_TO_MASTODON_DESCRIPTION,
  MASTODON_ANALYTICS_DESCRIPTION,
  TWITTER_TO_MASTODON_DESCRIPTION,
} from './app/seo';
import { Type } from '@angular/core';
import { Crosspost } from './app/pages/crosspost/crosspost';
import { GithubToMastodon } from './app/pages/github-to-mastodon/github-to-mastodon';
import { MastodonAnalytics } from './app/pages/mastodon-analytics/mastodon-analytics';
import { TwitterToMastodon } from './app/pages/twitter-to-mastodon/twitter-to-mastodon';
import { PublicArticle, PublicArticleKind } from './app/pages/features/public-article';
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

// The focused mini-apps' public pages (focusedAppRoutes in app.routes.ts).
// Their interactive parts are deferred and signed-in only, so only copy renders.
const tools: { path: string; title: string; description: string; component: Type<unknown> }[] = [
  {
    path: 'twitter-to-mastodon',
    title: 'Import your Twitter follows to Mastodon',
    description: TWITTER_TO_MASTODON_DESCRIPTION,
    component: TwitterToMastodon,
  },
  {
    path: 'crosspost',
    title: 'Post to Mastodon and Bluesky at the same time',
    description: CROSSPOST_DESCRIPTION,
    component: Crosspost,
  },
  {
    path: 'mastodon-analytics',
    title: 'Mastodon analytics for your account',
    description: MASTODON_ANALYTICS_DESCRIPTION,
    component: MastodonAnalytics,
  },
  {
    path: 'github-to-mastodon',
    title: 'Find your GitHub friends on Mastodon',
    description: GITHUB_TO_MASTODON_DESCRIPTION,
    component: GithubToMastodon,
  },
];

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
          ...tools.map(({ path, title, description, component }) => ({
            path,
            component,
            title,
            data: { seoIndexable: true, seoDescription: description },
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
