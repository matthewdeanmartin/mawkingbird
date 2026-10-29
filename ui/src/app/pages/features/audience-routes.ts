import { Routes } from '@angular/router';

// Only route metadata lives here; audience copy stays in the lazy page bundle.
const loadAudience = () => import('./audience-page').then((m) => m.AudiencePage);
export const audienceRoutes: Routes = [
  {
    path: 'for/readers',
    title: 'RSS, news and reading lists',
    data: {
      audience: 'readers',
      seoIndexable: true,
      seoDescription:
        'Read news and RSS with Mawkingbird: OPML subscriptions, read tracking, bookmarks and focused article views alongside your social feeds.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/bluesky',
    title: 'Bluesky and Mastodon in one client',
    data: {
      audience: 'bluesky',
      seoIndexable: true,
      seoDescription:
        'Use Bluesky and Mastodon together in Mawkingbird: one Home feed for both, shared notifications, Mastodon reading without an account, and posting to both at once.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/twitter-exodus',
    title: 'Moving from Twitter to Mastodon and Bluesky',
    data: {
      audience: 'twitter-exodus',
      seoIndexable: true,
      seoDescription:
        'Leaving Twitter? Try Mawkingbird to explore Mastodon and Bluesky, discover people through starter collections and build a familiar social feed.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/instagram',
    title: 'Photo feeds for Instagram users',
    data: {
      audience: 'instagram',
      seoIndexable: true,
      seoDescription:
        'Enjoy photo posts on Mastodon and Bluesky with Mawkingbird: media grids, full-size image viewing, swipe navigation and image descriptions.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/creators',
    title: 'Writing and photography for content creators',
    data: {
      audience: 'creators',
      seoIndexable: true,
      seoDescription:
        'Create with Mawkingbird: social posts, saved drafts, image uploads and alt text, plus a focused writing workspace and supported publishing connections.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/power-users',
    title: 'Advanced Mastodon client for power users',
    data: {
      audience: 'power-users',
      seoIndexable: true,
      seoDescription:
        'A Mastodon client for power users: a finite feed with Feed Doctor, Calm mode, bulk follow and mute tools, profile analytics, scheduling and private follows.',
    },
    loadComponent: loadAudience,
  },
];
