import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { adminGuard } from './admin/admin.guard';
import {
  anonymousChatGuard,
  anonymousUnavailableGuard,
} from './providers/anonymous/anonymous-route.guard';
import { anonymousOnlyGuard } from './providers/anonymous/anonymous-only.guard';
import { featureFlagGuard } from './feature-flag.guard';
import { inviteAccessGuard } from './invites/invite-access.guard';
import { justMyServerUpdateCanDeactivate, justMyServerUpdateGuard } from './just-my-server.guard';
// Mock-only routes; file-replaced with an empty list in the Mocking Bird build.
import { mockOnlyChildren, mockOnlySettingsChildren } from './mock-routes';

export const routes: Routes = [
  // The front door: a dispatcher that renders nothing. It sends a signed-in or
  // already-decided visitor to /home, and a first-time one into the seeded
  // preview — the app itself, with the login question as a modal on top.
  // Unguarded and matched `full`; the guarded shell keeps its own '' child below.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/entry/entry').then((m) => m.EntryPage),
  },
  {
    path: 'anonymous',
    title: 'Browse anonymously',
    loadComponent: () =>
      import('./pages/anonymous-entry/anonymous-entry').then((m) => m.AnonymousEntry),
  },
  // `/login` is the two-door chooser AND the Mastodon OAuth callback address —
  // instances have `<base href>login` registered as the redirect_uri, so it
  // cannot move. The chooser forwards `?code=`/`?add=` to `/login/mastodon`.
  {
    path: 'login',
    pathMatch: 'full',
    title: 'Sign in',
    loadComponent: () => import('./pages/login-chooser/login-chooser').then((m) => m.LoginChooser),
  },
  {
    path: 'login/mastodon',
    title: 'Sign in with Mastodon',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'login/bluesky',
    title: 'Sign in with Bluesky',
    loadComponent: () => import('./pages/login-bluesky/login-bluesky').then((m) => m.LoginBluesky),
  },
  {
    path: 'oauth/bluesky/callback',
    title: 'Connecting Bluesky',
    loadComponent: () =>
      import('./pages/bluesky-oauth-callback/bluesky-oauth-callback').then(
        (m) => m.BlueskyOAuthCallback,
      ),
  },
  // New-user landing: bookmark this, sign up on your instance, come back and sign in.
  {
    path: 'welcome-back',
    title: 'Welcome back',
    loadComponent: () => import('./pages/welcome-back/welcome-back').then((m) => m.WelcomeBack),
  },
  {
    path: 'explore',
    title: 'Explore',
    loadComponent: () => import('./pages/explore/explore').then((m) => m.Explore),
  },
  // Public recruiting tool in the normal three-column shell. Fresh visitors
  // enter Anonymous against ?server.example (mastodon.social by default).
  {
    path: 'invites',
    title: 'Invites',
    canActivate: [inviteAccessGuard],
    canActivateChild: [justMyServerUpdateGuard],
    canDeactivate: [justMyServerUpdateCanDeactivate],
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/invites/invites').then((m) => m.Invites),
      },
    ],
  },
  // A message shared as a TinyURL short link. Un-guarded so a shared link opens
  // for anyone, signed in or not.
  {
    path: 'message/:id',
    title: 'Shared message',
    loadComponent: () => import('./pages/message/message').then((m) => m.MessagePage),
  },
  {
    path: 'message',
    title: 'Shared message',
    loadComponent: () => import('./pages/message/message').then((m) => m.MessagePage),
  },
  {
    path: 'integrations/dropbox/callback',
    title: 'Connecting Dropbox',
    loadComponent: () =>
      import('./pages/dropbox-callback/dropbox-callback').then((m) => m.DropboxCallback),
  },
  {
    path: 'integrations/blogger/callback',
    title: 'Connecting Blogger',
    loadComponent: () =>
      import('./pages/blogger-callback/blogger-callback').then((m) => m.BloggerCallback),
  },
  {
    path: 'integrations/openrouter/callback',
    title: 'Connecting OpenRouter',
    loadComponent: () =>
      import('./pages/openrouter-callback/openrouter-callback').then((m) => m.OpenRouterCallback),
  },
  {
    path: 'fail-whale',
    title: 'Something went wrong',
    loadComponent: () =>
      import('./pages/fail-whale-demo/fail-whale-demo').then((m) => m.FailWhaleDemo),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [justMyServerUpdateGuard],
    canDeactivate: [justMyServerUpdateCanDeactivate],
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    children: [
      // Unreachable via `/` now that the public front page claims that path with
      // `pathMatch: 'full'` — kept because it is what `redirectTo: ''` inside the
      // shell resolves against, and removing it would turn those into dead ends.
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        title: 'Home',
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
      },
      {
        path: 'algo',
        title: 'Algo',
        loadComponent: () => import('./pages/algo/algo').then((m) => m.Algo),
      },
      {
        path: 'public',
        title: 'Public timeline',
        loadComponent: () =>
          import('./pages/public-timeline/public-timeline').then((m) => m.PublicTimeline),
      },
      {
        path: 'notifications',
        title: 'Inbox',
        canActivate: [anonymousUnavailableGuard],
        data: { anonymousFeature: 'Inbox' },
        loadComponent: () =>
          import('./pages/notifications/notifications').then((m) => m.Notifications),
      },
      {
        path: 'conversations',
        title: 'Chat',
        canActivate: [anonymousChatGuard],
        data: { anonymousFeature: 'Chat' },
        loadComponent: () =>
          import('./pages/conversations/conversations').then((m) => m.Conversations),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./pages/settings/settings-shell').then((m) => m.SettingsShell),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          {
            path: 'profile',
            title: 'Profile',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/profile/settings-profile').then((m) => m.SettingsProfile),
          },
          {
            path: 'server',
            title: 'Server',
            canActivate: [anonymousOnlyGuard],
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/server/settings-server').then((m) => m.SettingsServer),
          },
          {
            path: 'anonymous',
            title: 'Browse anonymously',
            pathMatch: 'full',
            redirectTo: 'server',
          },
          {
            path: 'blue',
            title: 'Bluesky',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/blue/settings-blue').then((m) => m.SettingsBlue),
          },
          {
            // Sign-in lands here already authenticated: the account service
            // sets a cookie and redirects back, so there is no code to
            // exchange and no callback route. See `mawkingbird-session.ts`.
            path: 'mawkingbird-plus',
            title: 'Mawkingbird Plus',
            canActivate: [featureFlagGuard],
            data: { featureFlag: 'mawkingbird-plus', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/mawkingbird-plus/settings-mawkingbird-plus').then(
                (m) => m.SettingsMawkingbirdPlus,
              ),
          },
          {
            // Componentless parent: the catalog is the '' child and each
            // connector is a sibling, so a connector's page replaces the
            // catalog rather than nesting under it. Only the catalog is
            // preloaded — the point of the split is that you don't download
            // Bluesky's page to look at the list.
            path: 'connections',
            children: [
              {
                path: '',
                data: { preloadSettings: true },
                loadComponent: () =>
                  import('./pages/settings/connections/settings-connections').then(
                    (m) => m.SettingsConnections,
                  ),
              },
              {
                path: 'github',
                title: 'GitHub',
                loadComponent: () =>
                  import('./pages/settings/connections/github/connection-github').then(
                    (m) => m.ConnectionGitHub,
                  ),
              },
              {
                path: 'dropbox',
                title: 'Dropbox',
                loadComponent: () =>
                  import('./pages/settings/connections/dropbox/connection-dropbox').then(
                    (m) => m.ConnectionDropbox,
                  ),
              },
              {
                path: 'raindrop',
                title: 'Raindrop',
                loadComponent: () =>
                  import('./pages/settings/connections/raindrop/connection-raindrop').then(
                    (m) => m.ConnectionRaindrop,
                  ),
              },
              {
                path: 'openrouter',
                title: 'OpenRouter',
                loadComponent: () =>
                  import('./pages/settings/connections/openrouter/connection-openrouter').then(
                    (m) => m.ConnectionOpenRouter,
                  ),
              },
              {
                path: 'bluesky',
                title: 'Bluesky',
                loadComponent: () =>
                  import('./pages/settings/connections/bluesky/connection-bluesky').then(
                    (m) => m.ConnectionBluesky,
                  ),
              },
              {
                path: 'mastodon',
                title: 'Mastodon',
                loadComponent: () =>
                  import('./pages/settings/connections/mastodon/connection-mastodon').then(
                    (m) => m.ConnectionMastodon,
                  ),
              },
              {
                path: 'cors-proxy',
                title: 'CORS proxy',
                loadComponent: () =>
                  import('./pages/settings/connections/cors-proxy/connection-cors-proxy').then(
                    (m) => m.ConnectionCorsProxy,
                  ),
              },
              {
                path: 'link-shortener',
                title: 'Link shortener',
                loadComponent: () =>
                  import('./pages/settings/connections/link-shortener/connection-link-shortener').then(
                    (m) => m.ConnectionLinkShortener,
                  ),
              },
              {
                path: 'twitter',
                title: 'Twitter',
                loadComponent: () =>
                  import('./pages/settings/connections/twitter/connection-twitter').then(
                    (m) => m.ConnectionTwitter,
                  ),
              },
              {
                path: 'mataroa',
                title: 'Mataroa',
                loadComponent: () =>
                  import('./pages/settings/connections/mataroa/connection-mataroa').then(
                    (m) => m.ConnectionMataroa,
                  ),
              },
              {
                path: 'gist',
                title: 'GitHub Gist',
                loadComponent: () =>
                  import('./pages/settings/connections/gist/connection-gist').then(
                    (m) => m.ConnectionGist,
                  ),
              },
              {
                path: 'blogger',
                title: 'Blogger',
                loadComponent: () =>
                  import('./pages/settings/connections/blogger/connection-blogger').then(
                    (m) => m.ConnectionBlogger,
                  ),
              },
              {
                path: 'hugo',
                title: 'Hugo',
                loadComponent: () =>
                  import('./pages/settings/connections/hugo/connection-hugo').then(
                    (m) => m.ConnectionHugo,
                  ),
              },
              {
                // Not a connector, but it belongs under the connections tree:
                // it answers "which of these is worth setting up on this
                // network?", which is a question about all of them at once.
                path: 'doctor',
                title: 'Connection doctor',
                loadComponent: () =>
                  import('./pages/settings/connections/doctor/connection-doctor-page').then(
                    (m) => m.ConnectionDoctorPage,
                  ),
              },
            ],
          },
          {
            path: 'rss',
            title: 'RSS',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/rss/settings-rss').then((m) => m.SettingsRss),
          },
          {
            path: 'privacy',
            title: 'Privacy',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Privacy settings', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/privacy/settings-privacy').then((m) => m.SettingsPrivacy),
          },
          {
            path: 'appearance',
            title: 'Appearance',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/appearance/settings-appearance').then(
                (m) => m.SettingsAppearance,
              ),
          },
          {
            path: 'storage',
            title: 'Storage',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/storage/settings-storage').then((m) => m.SettingsStorage),
          },
          {
            // 'spotlight', not 'ads': the rail's markup already dodges `ad-*`
            // class names because blockers hide them (right-rail.spec pins it),
            // and a deep-linked path containing /ads is the same hazard one
            // layer out. The page is titled "Endorsements" where it counts.
            path: 'spotlight',
            title: 'Spotlight',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/spotlight/settings-spotlight').then(
                (m) => m.SettingsSpotlight,
              ),
          },
          {
            // Account-level cleanup of saved credentials and their local data —
            // the coarse counterpart to the key-by-key 'storage' page above.
            path: 'accounts',
            title: 'Accounts',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/accounts/settings-accounts').then((m) => m.SettingsAccounts),
          },
          {
            // The old "Posting defaults" page. Its rows now live on both
            // Writing and Privacy; Privacy is the closer match for a bookmark
            // saved when the page was called "Posting & Privacy".
            path: 'posting',
            title: 'Posting',
            pathMatch: 'full',
            redirectTo: 'privacy',
          },
          {
            // Anonymous-capable: a note can be a browser-local draft, so the
            // whole feature works without a server identity.
            path: 'writing',
            title: 'Writing',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/writing/settings-writing').then((m) => m.SettingsWriting),
          },
          {
            path: 'follows',
            title: 'Follows',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Follow request approval', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/follows/settings-follows').then((m) => m.SettingsFollows),
          },
          {
            path: 'moderation',
            title: 'Moderation',
            canActivate: [anonymousUnavailableGuard],
            data: {
              anonymousFeature: 'Muted and blocked accounts',
              kind: 'mutes',
              preloadSettings: true,
            },
            loadComponent: () =>
              import('./pages/settings/account-list/settings-account-list').then(
                (m) => m.SettingsAccountList,
              ),
          },
          {
            // No anonymous guard, unlike 'moderation' above: trusted accounts
            // and the two CW/sensitive switches are entirely client-side, so
            // they work while browsing anonymously.
            path: 'content',
            title: 'Trust: CW/Sensitive',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/content/settings-content').then((m) => m.SettingsContent),
          },
          {
            // Legacy deep links keep their selected list while the sidebar now
            // exposes a single combined destination.
            path: 'mutes',
            title: 'Mutes',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Muted accounts', kind: 'mutes' },
            loadComponent: () =>
              import('./pages/settings/account-list/settings-account-list').then(
                (m) => m.SettingsAccountList,
              ),
          },
          {
            path: 'blocks',
            title: 'Blocks',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Blocked accounts', kind: 'blocks', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/account-list/settings-account-list').then(
                (m) => m.SettingsAccountList,
              ),
          },
          {
            // Whole-account operations (retweets for every follow, mute/block
            // amnesty). Server-backed throughout, so Anonymous can't use it.
            path: 'bulk-actions',
            title: 'Bulk moderation',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Bulk actions', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/bulk-actions/settings-bulk-actions').then(
                (m) => m.SettingsBulkActions,
              ),
          },
          {
            path: 'filters',
            title: 'Filters',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Content filters', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/filters/settings-filters').then((m) => m.SettingsFilters),
          },
          {
            path: 'filters/new',
            title: 'New filter',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Content filters', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/filters/settings-filter-edit').then(
                (m) => m.SettingsFilterEdit,
              ),
          },
          {
            path: 'filters/:id',
            title: 'Edit filter',
            canActivate: [anonymousUnavailableGuard],
            data: { anonymousFeature: 'Content filters', preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/filters/settings-filter-edit').then(
                (m) => m.SettingsFilterEdit,
              ),
          },
          {
            // Reachable while anonymous, unlike its neighbours.
            //
            // This page is several tools, and only some of them need an account
            // on a server. Finding your contacts does not: account search works
            // anonymously (see `Api.search`, which drops `resolve` against a
            // search server by design) and anonymous follows are stored in this
            // browser. Guarding the whole route put the one tool that helps a
            // brand-new visitor build a timeline behind the sign-in they have
            // just declined — the exact population it exists for.
            //
            // The sections that genuinely need credentials hide themselves; see
            // `isAnonymous` in the template.
            path: 'import-export',
            title: 'Import and export',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/import-export/settings-import-export').then(
                (m) => m.SettingsImportExport,
              ),
          },
          {
            path: 'config',
            title: 'Config',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/config/settings-config').then((m) => m.SettingsConfig),
          },
          {
            path: 'i18n',
            title: 'Languages',
            data: { preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/i18n/settings-i18n').then((m) => m.SettingsI18n),
          },
          {
            path: 'feature-flags',
            title: 'Feature flags',
            data: { featureFlagSettings: true, preloadSettings: true },
            loadComponent: () =>
              import('./pages/settings/feature-flags/settings-feature-flags').then(
                (m) => m.SettingsFeatureFlags,
              ),
          },
          ...mockOnlySettingsChildren,
        ],
      },
      ...mockOnlyChildren,
      {
        path: 'offsite-directories',
        title: 'Offsite directories',
        loadComponent: () =>
          import('./pages/offsite-directories/offsite-directories').then(
            (m) => m.OffsiteDirectories,
          ),
      },
      // Was `/find-people`, which promised the same thing as the Find Friends hub
      // and split the "who to follow" links between them. Redirected rather than
      // dropped: the old path is linked from released builds and bookmarks.
      { path: 'find-people', redirectTo: 'offsite-directories', pathMatch: 'full' },
      // The server's opt-in profile directory. Public endpoint, so no auth guard:
      // browsing strangers is exactly what an anonymous visitor is here to do.
      {
        path: 'directory',
        title: 'Directory',
        loadComponent: () => import('./pages/directory/directory').then((m) => m.Directory),
      },
      // Both corpora — our starter kits and snapshots of other people's real
      // collections — now list together on one page. The distinction is real but
      // it is *ours*, and it was being asked of a newcomer before they had seen
      // a single face. The route is kept rather than removed so every link that
      // ever pointed here still works.
      { path: 'bundled-collections', redirectTo: 'bundled-starter-kits', pathMatch: 'full' },
      {
        path: 'bundled-starter-kits',
        title: 'People to follow',
        loadComponent: () =>
          import('./pages/bundled-starter-kits/bundled-starter-kits').then(
            (m) => m.BundledStarterKits,
          ),
      },
      // `/starter-kits` held both kinds at once, then briefly meant one of two
      // pages. It means the merged page again — which is what it originally was.
      { path: 'starter-kits', redirectTo: 'bundled-starter-kits', pathMatch: 'full' },
      // Feeds hub: lists, saved searches, server feeds, collections and tags in
      // one page. `/feeds/lists` and `/feeds/tags` are filtered views of the same
      // component (see Feeds.only). These literal segments MUST precede the
      // `feeds/:feed` server-feed route below so they aren't swallowed by it.
      {
        path: 'feeds',
        title: 'Feeds',
        loadComponent: () => import('./pages/lists/lists').then((m) => m.Lists),
      },
      {
        path: 'feeds/lists',
        title: 'Lists',
        data: { only: 'lists' },
        loadComponent: () => import('./pages/lists/lists').then((m) => m.Lists),
      },
      {
        path: 'feeds/tags',
        title: 'Tags',
        data: { only: 'tags' },
        loadComponent: () => import('./pages/lists/lists').then((m) => m.Lists),
      },
      // One saved Bluesky feed or list. `:ref` is `<kind>:<at-uri>`; it sits
      // above `feeds/:feed` for the same reason the two literals above do.
      {
        path: 'feeds/bluesky/:ref',
        title: 'Bluesky feed',
        loadComponent: () =>
          import('./pages/bluesky-feed/bluesky-feed').then((m) => m.BlueskyFeedPage),
      },
      // Back-compat: the old top-level Lists/Tags entries now live under Feeds.
      { path: 'lists', pathMatch: 'full', redirectTo: 'feeds/lists' },
      { path: 'tags', pathMatch: 'full', redirectTo: 'feeds/tags' },
      // The RSS *reading* surface — distinct from /settings/rss, which is feed
      // management (add/remove, OPML, proxy). Primary nav, not a Feeds section:
      // RSS has its own read/unread and headline/article postures that don't
      // fit the Feeds hub's list-of-lists model. See sprint/rss-0-overview.md.
      {
        path: 'rss',
        title: 'RSS',
        loadComponent: () => import('./pages/rss/rss-page').then((m) => m.RssPage),
      },
      {
        path: 'search',
        title: 'Search',
        loadComponent: () => import('./pages/search/search').then((m) => m.Search),
      },
      {
        path: 'favourites',
        title: 'Likes',
        canActivate: [anonymousUnavailableGuard],
        data: { anonymousFeature: 'Likes' },
        loadComponent: () => import('./pages/favourites/favourites').then((m) => m.Favourites),
      },
      {
        path: 'bookmarks',
        title: 'Bookmarks',
        loadComponent: () => import('./pages/bookmarks/bookmarks').then((m) => m.Bookmarks),
      },
      {
        path: 'analytics',
        title: 'Analytics',
        canActivate: [anonymousUnavailableGuard],
        data: { anonymousFeature: 'Analytics' },
        loadComponent: () => import('./pages/analytics/analytics').then((m) => m.Analytics),
      },
      {
        // Deliberately not anonymous-guarded: the browser-local feed is the only one
        // that can report why it ended, so an anonymous reader is the primary user.
        path: 'feed-doctor',
        title: 'Feed doctor',
        loadComponent: () =>
          import('./pages/feed-doctor/feed-doctor-page').then((m) => m.FeedDoctorPage),
      },
      {
        // The POSSE queue: interactions waiting to be recorded on the user's
        // own site. A page you act on, so it sits in the main routes rather
        // than under settings.
        path: 'posse',
        title: 'POSSE queue',
        loadComponent: () => import('./pages/posse/posse-page').then((m) => m.PossePage),
      },
      {
        path: 'observability',
        title: 'Observability',
        loadComponent: () =>
          import('./pages/observability/observability').then((m) => m.Observability),
      },
      {
        // Split out of Observability: an inventory of what is stored on this
        // device, where every destructive control on local data now lives.
        path: 'storage-diagnostics',
        title: 'Storage Diagnostics',
        loadComponent: () =>
          import('./pages/storage-diagnostics/storage-diagnostics').then(
            (m) => m.StorageDiagnostics,
          ),
      },
      // Docs hub + the "blog-post"-style pages it links to. Design lives inside
      // the shell now (rendered as a virtual tweet), so the reader keeps the top
      // nav, rails and footer instead of dropping into a bare full-page layout.
      {
        // Route is `/blog` (the user's framing: these are "blog-post"-style
        // pages), not `/docs` — the mock backend's FastAPI serves Swagger UI at
        // `/docs`, so an in-app `/docs` route would be shadowed on hard-nav.
        path: 'blog',
        title: 'Blog',
        loadComponent: () => import('./pages/docs/docs').then((m) => m.Docs),
      },
      {
        // "Design" — the project story, as a virtual tweet in the centre column.
        path: 'about',
        title: 'About',
        loadComponent: () => import('./pages/about/about').then((m) => m.About),
      },
      {
        // "Funding" — who pays for what, also a virtual tweet. Its own route
        // rather than a tail section of Design, so it can be linked to.
        path: 'funding',
        title: 'Funding',
        loadComponent: () => import('./pages/funding/funding').then((m) => m.Funding),
      },
      {
        // "Plans" — the exhaustive free/signed-in/Plus reference. Deliberately
        // outside `/settings`, and reachable signed out: it is the page the
        // upgrade pitch links to for its numbers, and someone weighing whether
        // to sign up at all must be able to read it without an account.
        // Gated with the Plus tab it prices. The page quotes a yearly figure
        // and exists to sell the subscription, so wherever Plus cannot be
        // bought this must not be readable either — otherwise the flag hides
        // the checkout and leaves the price list standing.
        path: 'plans',
        title: 'Plans',
        canActivate: [featureFlagGuard],
        data: { featureFlag: 'mawkingbird-plus' },
        loadComponent: () => import('./pages/plans/plans').then((m) => m.Plans),
      },
      {
        // The server as a profile: its identity plus every announcement it has
        // posted, dismissed ones included. The banner above the timeline shows
        // what you have not seen; this is where the rest stay findable.
        path: 'server',
        title: 'This server',
        loadComponent: () =>
          import('./pages/server-announcements/server-announcements').then(
            (m) => m.ServerAnnouncements,
          ),
      },
      {
        path: 'server-rules',
        title: 'Server rules',
        loadComponent: () => import('./pages/server-rules/server-rules').then((m) => m.ServerRules),
      },
      {
        path: 'terms',
        title: 'Terms',
        loadComponent: () => import('./pages/terms/terms').then((m) => m.Terms),
      },
      {
        path: 'credits',
        title: 'Credits',
        loadComponent: () => import('./pages/credits/credits').then((m) => m.Credits),
      },
      {
        path: 'drafts',
        title: 'Drafts',
        loadComponent: () => import('./pages/drafts/drafts-page').then((m) => m.DraftsPage),
      },
      {
        path: 'write',
        title: 'Write',
        canActivate: [featureFlagGuard],
        data: { featureFlag: 'write' },
        loadComponent: () => import('./pages/write/write-page').then((m) => m.WritePage),
      },
      {
        path: 'pastes',
        title: 'Pastes',
        canActivate: [featureFlagGuard],
        data: { featureFlag: 'pastebin' },
        loadComponent: () => import('./pages/pastes/pastes-page').then((m) => m.PastesPage),
      },
      {
        path: 'links',
        title: 'Links',
        canActivate: [featureFlagGuard],
        data: { featureFlag: 'links' },
        loadComponent: () => import('./pages/links/links-page').then((m) => m.LinksPage),
      },
      {
        path: 'find-friends',
        title: 'Find friends',
        loadComponent: () => import('./pages/find-friends/find-friends').then((m) => m.FindFriends),
      },
      {
        path: 'lists/:id',
        title: 'List',
        loadComponent: () =>
          import('./pages/list-timeline/list-timeline').then((m) => m.ListTimeline),
      },
      {
        // Client-side lists work signed out as well as signed in, so this route is
        // deliberately not behind the auth guard.
        path: 'client-lists/:id',
        title: 'List',
        loadComponent: () =>
          import('./pages/client-list/client-list-page').then((m) => m.ClientListPage),
      },
      {
        // Tag timelines are readable anonymously, so bundles work in every session.
        path: 'tag-bundles/:id',
        title: 'Tag bundle',
        loadComponent: () =>
          import('./pages/tag-bundle/tag-bundle-page').then((m) => m.TagBundlePage),
      },
      {
        path: 'feeds/:feed',
        title: 'Feed',
        loadComponent: () => import('./pages/server-feed/server-feed').then((m) => m.ServerFeed),
      },
      {
        path: 'endorsed/:accountId',
        title: 'Endorsed accounts',
        loadComponent: () =>
          import('./pages/endorsed-list/endorsed-list').then((m) => m.EndorsedList),
      },
      {
        path: 'collections/starter',
        title: 'Starter collections',
        loadComponent: () =>
          import('./pages/starter-collection/starter-collection').then((m) => m.StarterCollection),
      },
      {
        path: 'collections/starter/:slug',
        title: 'Starter collection',
        loadComponent: () =>
          import('./pages/starter-collection/starter-collection').then((m) => m.StarterCollection),
      },
      {
        path: 'collections/preview/:id',
        title: 'Collection preview',
        loadComponent: () => import('./pages/collection/collection').then((m) => m.CollectionPage),
      },
      {
        path: 'collections/:id',
        title: 'Collection',
        canActivate: [anonymousUnavailableGuard],
        data: { anonymousFeature: 'Collections' },
        loadComponent: () => import('./pages/collection/collection').then((m) => m.CollectionPage),
      },
      {
        path: 'tags/:tag',
        title: 'Tag',
        loadComponent: () => import('./pages/tag/tag').then((m) => m.Tag),
      },
      {
        path: 'unavailable',
        title: 'Unavailable',
        loadComponent: () => import('./pages/unavailable/unavailable').then((m) => m.Unavailable),
      },
      {
        path: 'statuses/:id',
        title: 'Post',
        loadComponent: () => import('./pages/thread/thread').then((m) => m.Thread),
      },
      {
        // The reader: one document, the whole screen. Takes the same ids as
        // `statuses/:id` (including the `rss:` prefix), so a link to a post and
        // a link to reading it address the same thing. `statuses/:id?reader=1`
        // redirects here. See sprint/kindle-0-overview.md.
        //
        // Deliberately not anonymous-guarded: reading is the thing a visitor
        // with no account is most likely to want, and the article pipeline
        // already works without a session.
        path: 'read/:id',
        title: 'Reader',
        loadComponent: () => import('./pages/read/read-page').then((m) => m.ReadPage),
      },
      {
        // Friendly alias for Eliza's synthetic profile (id `eliza:self`).
        path: 'eliza',
        title: 'Eliza',
        redirectTo: 'accounts/eliza:self',
        pathMatch: 'full',
      },
      {
        // The same for OpenRouter's (id `openrouter:self`). The profile itself
        // reports "not found" unless a key is connected and AI is on.
        path: 'openrouter',
        title: 'OpenRouter',
        redirectTo: 'accounts/openrouter:self',
        pathMatch: 'full',
      },
      {
        // Eliza's chat and inbox used to live on their own routes, outside the
        // ordinary chat surface. Both are gone: she is now one correspondent in
        // Conversations like any other, and her notification inbox has been
        // removed entirely. Redirected rather than deleted so old bookmarks and
        // any link still pointing here land somewhere sensible.
        path: 'eliza/chat',
        title: 'Eliza chat',
        redirectTo: 'conversations',
        pathMatch: 'full',
      },
      {
        path: 'eliza/inbox',
        title: 'Eliza inbox',
        redirectTo: 'conversations',
        pathMatch: 'full',
      },
      {
        // Two segments so the handle can ride in the path: `/accounts/123/@a@b`
        // (Elk's shape). Account ids are per-server, and a short id from one
        // server often resolves to a *different real account* on another —
        // silently. The handle is what makes that recoverable, so it must
        // survive truncation and hand-typed URLs, which a query param does not.
        path: 'accounts/:id/:handle',
        title: 'Profile',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
      {
        // One segment: either a bare id (every existing link in the app) or a
        // bare `@user@host`. See `parseAccountRoute`.
        path: 'accounts/:id',
        title: 'Profile',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'admin',
        title: 'Admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./admin/admin-shell/admin-shell').then((m) => m.AdminShell),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'accounts' },
          {
            path: 'accounts',
            title: 'Accounts',
            loadComponent: () =>
              import('./admin/accounts/admin-accounts').then((m) => m.AdminAccounts),
          },
          {
            path: 'reports',
            title: 'Reports',
            loadComponent: () =>
              import('./admin/reports/admin-reports').then((m) => m.AdminReports),
          },
          {
            path: 'domains',
            title: 'Domains',
            loadComponent: () =>
              import('./admin/domains/admin-domains').then((m) => m.AdminDomains),
          },
          {
            path: 'domain-allows',
            title: 'Allowed domains',
            loadComponent: () =>
              import('./admin/domain-allows/admin-domain-allows').then((m) => m.AdminDomainAllows),
          },
          {
            path: 'email-blocks',
            title: 'Email blocks',
            loadComponent: () =>
              import('./admin/email-blocks/admin-email-blocks').then((m) => m.AdminEmailBlocks),
          },
          {
            path: 'canonical-blocks',
            title: 'Canonical blocks',
            loadComponent: () =>
              import('./admin/canonical-blocks/admin-canonical-blocks').then(
                (m) => m.AdminCanonicalBlocks,
              ),
          },
          {
            path: 'ip-blocks',
            title: 'IP blocks',
            loadComponent: () =>
              import('./admin/ip-blocks/admin-ip-blocks').then((m) => m.AdminIpBlocks),
          },
          {
            path: 'announcements',
            title: 'Announcements',
            loadComponent: () =>
              import('./admin/announcements/admin-announcements').then((m) => m.AdminAnnouncements),
          },
          {
            path: 'trends',
            title: 'Trends',
            loadComponent: () => import('./admin/trends/admin-trends').then((m) => m.AdminTrends),
          },
          {
            path: 'metrics',
            title: 'Metrics',
            loadComponent: () =>
              import('./admin/metrics/admin-metrics').then((m) => m.AdminMetrics),
          },
        ],
      },
    ],
  },
  // Unknown URL → `/home`, not `/`: `/` is now the public pitch page, and showing
  // it to a signed-in user who merely fat-fingered a path reads as a logout. The
  // auth guard sends a visitor with no account on to `/` from here anyway.
  { path: '**', redirectTo: 'home' },
];
