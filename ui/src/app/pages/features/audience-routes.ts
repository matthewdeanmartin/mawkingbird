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
    title: 'A browser client for Bluesky users',
    data: {
      audience: 'bluesky',
      seoIndexable: true,
      seoDescription:
        'Use Mawkingbird with Bluesky for timelines, custom feeds, conversations, search and image posts, with reading tools in the same browser client.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/twitter-exodus',
    title: 'Moving from Twitter or X to Mastodon and Bluesky',
    data: {
      audience: 'twitter-exodus',
      seoIndexable: true,
      seoDescription:
        'Leaving Twitter or X? Try Mawkingbird to explore Mastodon and Bluesky, discover people through starter collections and build a familiar social feed.',
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
];
