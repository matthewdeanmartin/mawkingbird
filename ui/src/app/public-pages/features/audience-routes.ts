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
      seoImage: 'audience',
      seoDescription:
        'Read news and RSS with Mawkingbird: OPML subscriptions, read tracking, bookmarks and focused article views alongside your social feeds.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/bluesky',
    title: 'Mastodon and Bluesky in one app',
    data: {
      audience: 'bluesky',
      seoIndexable: true,
      seoImage: 'audience',
      seoDescription:
        'Mastodon and Bluesky in one app: Mawkingbird gives you one Home feed for both, shared notifications, Mastodon reading without an account, and posting to both at once.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'for/twitter-exodus',
    title: 'Moving from Twitter to Mastodon and Bluesky',
    data: {
      audience: 'twitter-exodus',
      seoIndexable: true,
      seoImage: 'audience',
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
      seoImage: 'audience',
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
      seoImage: 'audience',
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
      seoImage: 'audience',
      seoDescription:
        'A Mastodon client for power users: a finite feed with Feed Doctor, Calm mode, bulk follow and mute tools, profile analytics, scheduling and private follows.',
    },
    loadComponent: loadAudience,
  },
  // Comparisons with other clients: the same page, with a dated feature table.
  {
    path: 'compare',
    pathMatch: 'full',
    title: 'Best Mastodon web clients compared',
    data: {
      audience: 'compare',
      seoIndexable: true,
      seoDescription:
        'The best Mastodon web clients compared: Mastodon’s own web app, Elk, Phanpy and Mawkingbird, with price, licence, Bluesky and RSS support side by side.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/elk',
    title: 'Mawkingbird vs Elk: Mastodon web clients compared',
    data: {
      audience: 'compare-elk',
      seoIndexable: true,
      seoDescription:
        'Elk or Mawkingbird? Both are free, open-source Mastodon web clients. Elk is Mastodon-only; Mawkingbird adds Bluesky and RSS to the same Home feed.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/phanpy',
    title: 'Mawkingbird vs Phanpy: Mastodon web clients compared',
    data: {
      audience: 'compare-phanpy',
      seoIndexable: true,
      seoDescription:
        'Phanpy or Mawkingbird? Compare two free Mastodon web clients: Phanpy’s Catch-up and columns, or Mawkingbird’s Mastodon, Bluesky and RSS in one feed.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/ivory',
    title: 'Mawkingbird vs Ivory: a browser client or an Apple app',
    data: {
      audience: 'compare-ivory',
      seoIndexable: true,
      seoDescription:
        'Ivory or Mawkingbird? A native Mastodon app for iPhone, iPad and Mac with a subscription, or a free browser client for Mastodon, Bluesky and RSS on any device.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/mastodon-vs-bluesky',
    title: 'Mastodon vs Bluesky: what is different?',
    data: {
      audience: 'compare-mastodon-vs-bluesky',
      seoIndexable: true,
      seoDescription:
        'Mastodon vs Bluesky: compare account homes, handles, discovery, post limits, quotes, private conversations and portability, then see how to read both.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/openvibe',
    title: 'Mawkingbird vs Openvibe: multi-network clients compared',
    data: {
      audience: 'compare-openvibe',
      seoIndexable: true,
      seoDescription:
        'Openvibe or Mawkingbird? Compare supported networks, RSS, price and platforms: a broad phone app or a browser client with Mastodon reading tools.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/ice-cubes',
    title: 'Mawkingbird vs Ice Cubes: a Mastodon app or browser client',
    data: {
      audience: 'compare-ice-cubes',
      seoIndexable: true,
      seoDescription:
        'Ice Cubes or Mawkingbird for Mastodon? Compare the Apple app’s live timeline and tag groups with a browser client for Mastodon, Bluesky and RSS.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/tusky',
    title: 'Mawkingbird vs Tusky: Mastodon on Android and the web',
    data: {
      audience: 'compare-tusky',
      seoIndexable: true,
      seoDescription:
        'Tusky or Mawkingbird? Compare a free Android Mastodon app with a browser client that adds Bluesky, RSS and feed management tools.',
    },
    loadComponent: loadAudience,
  },
  {
    path: 'compare/mastodon-app',
    title: 'Mawkingbird vs the official Mastodon app',
    data: {
      audience: 'compare-mastodon-app',
      seoIndexable: true,
      seoDescription:
        'The official Mastodon app or Mawkingbird? Use the same account in a free phone app and a browser client for Mastodon, Bluesky and RSS.',
    },
    loadComponent: loadAudience,
  },
];
