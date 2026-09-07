/**
 * The catalog of one-account connectors shown on Settings → Connections.
 *
 * This is deliberately inert data. A catalog entry describes a connector well
 * enough to decide whether you want it — what the service is, what connecting
 * it turns on inside Mawkingbird — and nothing about how to set it up. Setup
 * lives on the entry's own lazily-loaded child page, which is the whole point:
 * the roadmap has a dozen more connectors coming, and they cannot all keep
 * living in one template.
 *
 * Two things are intentionally *not* here:
 *
 * - **Connected state.** A `Signal<boolean>` per entry would mean importing
 *   every session service into this module, which every connections bundle
 *   then pulls in, which defeats the lazy child routes entirely. The catalog
 *   page injects the sessions and maps `id -> connected` itself.
 * - **The route.** It is always `/settings/connections/<id>`, so storing it
 *   would just be a second place to get it wrong.
 *
 * A connection is *one account*. Anything that is a list of many things (RSS
 * feeds, paste providers) is not a connection and does not belong in this
 * catalog — it gets its own settings page.
 *
 * **Two deliberate exceptions: `cors-proxy` and `link-shortener`.** Both are
 * pickers over a catalog of services, so by the rule above they belong on their
 * own pages. They live here anyway, because what the user configures *is* one
 * thing — a single proxy, or a single active shortener — that every feature
 * routes through, and because the keys they hold are credentials that must sit
 * under the same retention policy as the tokens on this page.
 *
 * Choosing one of several vendors is not the same as maintaining a list. The
 * paste providers, where all three stay live at once and a post goes to
 * whichever you pick at the time, are the case the rule is really aimed at. The
 * shortener is the near miss that proves the distinction: it *stores* a key per
 * service, so that switching back is cheap, but only one is ever active and
 * "shorten this URL" always has exactly one answer.
 */

import { FeatureFlagId } from '../../../feature-flags';

/** Route segment under `/settings/connections`, and the entry's identity. */
export type ConnectionId =
  | 'mastodon'
  | 'github'
  | 'dropbox'
  | 'raindrop'
  | 'bluesky'
  | 'openrouter'
  | 'cors-proxy'
  | 'link-shortener'
  | 'twitter'
  | 'mataroa'
  | 'blogger'
  | 'hugo'
  | 'gist';

/**
 * Who a connection belongs to — which is a question users actually ask, and
 * which the app answers three different ways.
 *
 * `browser` is the common case, and the right default: these credentials belong
 * to the *human* sitting here, not to a persona. An LLM key or a bookmarking
 * token works the same whoever you are signed in as, and re-pasting it for every
 * alt is busywork with no privacy benefit — the alt could read the other copy
 * out of the same localStorage anyway.
 *
 * `account` is the exception, for a connection that is itself an identity. A
 * Bluesky link says "this Mastodon persona is also that Bluesky handle", which
 * is a claim about *one* persona, so it is stored under {@link scopedKey} and
 * your alt gets its own or none. That includes the browser-local Anonymous
 * account, which gets one of its own too.
 *
 * `session` is also shared by every account, but never reaches localStorage —
 * it dies with the tab. Used where the provider hands out short-lived OAuth
 * tokens and there is nothing worth keeping.
 */
export type ConnectionScope = 'account' | 'browser' | 'session';

// i18n settings.connections.scope.account.label: One per account
// i18n settings.connections.scope.account.detail: Stored against the account you are signed in as — including Anonymous. Each of your accounts links its own, or none.
// i18n settings.connections.scope.browser.label: All accounts
// i18n settings.connections.scope.browser.detail: Shared by every account in this browser, including Anonymous — it belongs to you, not to one profile.
// i18n settings.connections.scope.session.label: All accounts, this tab
// i18n settings.connections.scope.session.detail: Shared by every account in this browser, but never written to long-term storage — closing the tab disconnects it.

export interface ConnectionScopeCopy {
  /** Badge text. Short enough to sit next to the connected pill. */
  label: string;
  /** One sentence, shown on the connector's own page. */
  detail: string;
}

export const CONNECTION_SCOPE_COPY: Record<ConnectionScope, ConnectionScopeCopy> = {
  account: {
    label: 'settings.connections.scope.account.label',
    detail: 'settings.connections.scope.account.detail',
  },
  browser: {
    label: 'settings.connections.scope.browser.label',
    detail: 'settings.connections.scope.browser.detail',
  },
  session: {
    label: 'settings.connections.scope.session.label',
    detail: 'settings.connections.scope.session.detail',
  },
};

/**
 * The rollout flag that gates each connector, one per vendor.
 *
 * Per-vendor rather than per-category because that is how these actually break:
 * a scraper service dies, or an API starts refusing browsers, and the answer is
 * to stop onboarding people onto *that one* while the rest keep working.
 *
 * A flagged-off connector is greyed, never hidden — see
 * {@link FeatureFlags.disabledReason}.
 */
export const CONNECTION_FLAGS: Record<ConnectionId, FeatureFlagId> = {
  mastodon: 'connector-mastodon',
  bluesky: 'connector-bluesky',
  twitter: 'connector-twitter',
  mataroa: 'connector-mataroa',
  blogger: 'connector-blogger',
  hugo: 'connector-hugo',
  openrouter: 'connector-openrouter',
  raindrop: 'connector-raindrop',
  github: 'connector-github',
  // The `pastebin` flag, not a connector flag of its own: what this turns on is
  // one more paste provider, and turning pastes off must take it with them.
  gist: 'pastebin',
  dropbox: 'connector-dropbox',
  'link-shortener': 'connector-link-shortener',
  'cors-proxy': 'connector-cors-proxy',
};

// i18n settings.connections.catalog.mastodon.label: Mastodon
// i18n settings.connections.catalog.mastodon.pitch: Read Mastodon too — with or without a Mastodon account.
// i18n settings.connections.catalog.mastodon.enables.explore: Explore, trending posts and hashtag timelines from a Mastodon server
// i18n settings.connections.catalog.mastodon.enables.anonymous: No Mastodon account needed — reading anonymously is a real option
// i18n settings.connections.catalog.mastodon.enables.signIn: Sign in later to merge Mastodon into your home timeline
// i18n settings.connections.catalog.bluesky.label: Bluesky
// i18n settings.connections.catalog.bluesky.pitch: Your Bluesky account, read and write.
// i18n settings.connections.catalog.bluesky.enables.timeline: Bluesky posts merged into your home timeline
// i18n settings.connections.catalog.bluesky.enables.interact: Reply, like and repost without leaving Mawkingbird
// i18n settings.connections.catalog.bluesky.enables.dms: Bluesky DMs in Chat
// i18n settings.connections.catalog.twitter.label: Twitter
// i18n settings.connections.catalog.twitter.pitch: Read public tweets, so the friends who never left stay in your reading.
// i18n settings.connections.catalog.twitter.enables.follow: Follow public Twitter accounts and read their posts here
// i18n settings.connections.catalog.twitter.enables.readOnly: Read-only: no Twitter login, and nothing you do is sent to Twitter
// i18n settings.connections.catalog.twitter.enables.credentials: Needs your own API key and a CORS proxy
// i18n settings.connections.catalog.mataroa.label: Blog (Mataroa)
// i18n settings.connections.catalog.mataroa.pitch: Your Mataroa blog, published from the composer.
// i18n settings.connections.catalog.mataroa.enables.publish: Publish Markdown posts from the Blog composer target
// i18n settings.connections.catalog.mataroa.enables.profile: Optionally include your blog RSS posts on your Mawkingbird profile
// i18n settings.connections.catalog.mataroa.enables.credentials: Needs your own API key and a CORS proxy
// i18n settings.connections.catalog.blogger.label: Blog (Blogger)
// i18n settings.connections.catalog.blogger.pitch: Your Google Blogger blog, published from the composer.
// i18n settings.connections.catalog.blogger.enables.publish: Publish posts from the composer, live or as a draft
// i18n settings.connections.catalog.blogger.enables.choose: Choose which of your Blogger blogs to post to
// i18n settings.connections.catalog.blogger.enables.signIn: Signs in with Google; no API key or CORS proxy needed
// i18n settings.connections.catalog.hugo.label: Blog (Hugo)
// i18n settings.connections.catalog.hugo.pitch: Your own static site on GitHub, published from the composer.
// i18n settings.connections.catalog.hugo.enables.publish: Publish Markdown posts as commits to your Hugo repository
// i18n settings.connections.catalog.hugo.enables.files: Your posts stay files in a repo you own, not on a blog service
// i18n settings.connections.catalog.hugo.enables.credentials: Needs a GitHub token; no CORS proxy, unlike the other blogs
// i18n settings.connections.catalog.openrouter.label: OpenRouter
// i18n settings.connections.catalog.openrouter.pitch: One key, hundreds of AI models, billed by usage.
// i18n settings.connections.catalog.openrouter.enables.search: Turn plain English into Mastodon search queries
// i18n settings.connections.catalog.openrouter.enables.hashtags: Suggest hashtags that actually have activity
// i18n settings.connections.catalog.raindrop.label: Raindrop.io
// i18n settings.connections.catalog.raindrop.pitch: The Raindrop.io bookmarking service.
// i18n settings.connections.catalog.raindrop.enables.bookmarks: A second place to save bookmarks
// i18n settings.connections.catalog.raindrop.enables.externalLink: Save a post's first external link instead of the post itself
// i18n settings.connections.catalog.github.label: GitHub
// i18n settings.connections.catalog.github.pitch: Your GitHub account, read-only.
// i18n settings.connections.catalog.github.enables.following: Find the people you follow on GitHub over here
// i18n settings.connections.catalog.github.enables.notifications: Read your unread notifications
// i18n settings.connections.catalog.gist.label: GitHub Gist
// i18n settings.connections.catalog.gist.pitch: Publish pastes as gists on your GitHub account.
// i18n settings.connections.catalog.gist.enables.option: A "GitHub Gist" option wherever you can post a paste
// i18n settings.connections.catalog.gist.enables.drafts: Gists you create appear in Drafts and in Write, like any other paste
// i18n settings.connections.catalog.gist.enables.edit: Edit and delete them later — they belong to your account, not to this browser
// i18n settings.connections.catalog.dropbox.label: Dropbox
// i18n settings.connections.catalog.dropbox.pitch: An app-specific folder in your Dropbox.
// i18n settings.connections.catalog.dropbox.enables.browse: Browse those files from Mawkingbird
// i18n settings.connections.catalog.linkShortener.label: Link shortener
// i18n settings.connections.catalog.linkShortener.pitch: Dub, Short.io or T.LY, for shortening the URLs you post.
// i18n settings.connections.catalog.linkShortener.enables.shorten: Shorten a URL as you write a post
// i18n settings.connections.catalog.linkShortener.enables.history: Keep a list of every link you have made, and delete old ones
// i18n settings.connections.catalog.corsProxy.label: CORS proxy
// i18n settings.connections.catalog.corsProxy.pitch: A relay for sites that refuse to talk to browsers directly.
// i18n settings.connections.catalog.corsProxy.enables.rss: Read RSS feeds whose publishers block cross-origin access
// i18n settings.connections.catalog.corsProxy.enables.proxy: Use your own proxy, or a paid one, instead of a rate-limited free service

export interface ConnectionCatalogEntry {
  id: ConnectionId;
  /** Display name of the service, as the service spells it. */
  label: string;
  emoji: string;
  /** One sentence: what this service *is*, for someone who has never used it. */
  pitch: string;
  /**
   * Who this connection belongs to. Must match how the connector's session
   * actually stores its credential — this is a claim about storage, not a
   * preference, so changing one without the other is a lie on the card.
   */
  scope: ConnectionScope;
  /**
   * What connecting it turns on in Mawkingbird. Short phrases, not sentences —
   * they render as a list. Two to four of them; if a connector needs more than
   * four to justify itself, the extras belong on its own page.
   */
  enables: string[];
}

/**
 * Every connector, in the order they appear. Ordering is by usefulness to a
 * new user rather than alphabetical, so the two that change your timeline
 * (Bluesky) or your bookmarks (Raindrop) are not buried under the two that are
 * closer to curiosities.
 */
export const CONNECTION_CATALOG: readonly ConnectionCatalogEntry[] = [
  {
    id: 'mastodon',
    label: 'settings.connections.catalog.mastodon.label',
    emoji: '🐘',
    pitch: 'settings.connections.catalog.mastodon.pitch',
    // The mirror image of the Bluesky entry, and the only connector that is
    // *not applicable* to some accounts rather than merely unconfigured: under a
    // Mastodon-primary account, Mastodon is the identity and there is nothing to
    // connect. The catalog says so via `unavailableReason`.
    //
    // Account-scoped for the same reason Bluesky is: it asserts which Mastodon
    // server this particular persona reads, and an alt gets its own or none.
    scope: 'account',
    enables: [
      'settings.connections.catalog.mastodon.enables.explore',
      'settings.connections.catalog.mastodon.enables.anonymous',
      'settings.connections.catalog.mastodon.enables.signIn',
    ],
  },
  {
    id: 'bluesky',
    label: 'settings.connections.catalog.bluesky.label',
    emoji: '🦋',
    pitch: 'settings.connections.catalog.bluesky.pitch',
    // The one genuinely per-persona connection: it asserts who this Mastodon
    // account also is. One Bluesky handle per Mastodon account, Anonymous
    // included — see AnonymousCapabilities.canUseBluesky.
    scope: 'account',
    enables: [
      'settings.connections.catalog.bluesky.enables.timeline',
      'settings.connections.catalog.bluesky.enables.interact',
      'settings.connections.catalog.bluesky.enables.dms',
    ],
  },
  {
    id: 'twitter',
    label: 'settings.connections.catalog.twitter.label',
    emoji: '🐦',
    pitch: 'settings.connections.catalog.twitter.pitch',
    // The key belongs to whoever pays for the API credits, not to a persona —
    // same reasoning as OpenRouter and the CORS proxy. See TwitterSettings. The
    // *follows* built on top of it are account-scoped; the key is not.
    scope: 'browser',
    enables: [
      'settings.connections.catalog.twitter.enables.follow',
      'settings.connections.catalog.twitter.enables.readOnly',
      'settings.connections.catalog.twitter.enables.credentials',
    ],
  },
  {
    id: 'mataroa',
    label: 'settings.connections.catalog.mataroa.label',
    emoji: '✍️',
    pitch: 'settings.connections.catalog.mataroa.pitch',
    scope: 'account',
    enables: [
      'settings.connections.catalog.mataroa.enables.publish',
      'settings.connections.catalog.mataroa.enables.profile',
      'settings.connections.catalog.mataroa.enables.credentials',
    ],
  },
  {
    id: 'blogger',
    label: 'settings.connections.catalog.blogger.label',
    emoji: '✍️',
    pitch: 'settings.connections.catalog.blogger.pitch',
    // Sits alongside Mataroa rather than replacing it: they are different
    // blogs, and someone can reasonably keep both.
    scope: 'account',
    enables: [
      'settings.connections.catalog.blogger.enables.publish',
      'settings.connections.catalog.blogger.enables.choose',
      'settings.connections.catalog.blogger.enables.signIn',
    ],
  },
  {
    id: 'hugo',
    label: 'settings.connections.catalog.hugo.label',
    emoji: '✍️',
    pitch: 'settings.connections.catalog.hugo.pitch',
    // The third blog, and the only one where nobody hosts your writing: a post
    // is a file in a repository you own. Account-scoped like the other two —
    // a blog belongs to one public persona.
    scope: 'account',
    enables: [
      'settings.connections.catalog.hugo.enables.publish',
      'settings.connections.catalog.hugo.enables.files',
      'settings.connections.catalog.hugo.enables.credentials',
    ],
  },
  {
    id: 'openrouter',
    label: 'settings.connections.catalog.openrouter.label',
    emoji: '🧠',
    pitch: 'settings.connections.catalog.openrouter.pitch',
    // The only connector whose credential belongs to the human rather than to
    // a Mastodon persona — see OpenRouterSession for why it is unscoped.
    scope: 'browser',
    enables: [
      'settings.connections.catalog.openrouter.enables.search',
      'settings.connections.catalog.openrouter.enables.hashtags',
    ],
  },
  {
    id: 'raindrop',
    label: 'settings.connections.catalog.raindrop.label',
    emoji: '💧',
    pitch: 'settings.connections.catalog.raindrop.pitch',
    // Your bookmark drawer, not one persona's — see RaindropSession for why the
    // token is stored unscoped.
    scope: 'browser',
    enables: [
      'settings.connections.catalog.raindrop.enables.bookmarks',
      'settings.connections.catalog.raindrop.enables.externalLink',
    ],
  },
  {
    id: 'github',
    label: 'settings.connections.catalog.github.label',
    emoji: '🐙',
    pitch: 'settings.connections.catalog.github.pitch',
    scope: 'account',
    enables: [
      'settings.connections.catalog.github.enables.following',
      'settings.connections.catalog.github.enables.notifications',
    ],
  },
  {
    id: 'gist',
    label: 'settings.connections.catalog.gist.label',
    emoji: '📝',
    pitch: 'settings.connections.catalog.gist.pitch',
    // One account, one credential under the retention policy — a connection by
    // the rule above, even though what it turns on is a *paste provider*. The
    // provider list is not a connection; the account behind this one is.
    scope: 'account',
    enables: [
      'settings.connections.catalog.gist.enables.option',
      'settings.connections.catalog.gist.enables.drafts',
      'settings.connections.catalog.gist.enables.edit',
    ],
  },
  {
    id: 'dropbox',
    label: 'settings.connections.catalog.dropbox.label',
    emoji: '📦',
    pitch: 'settings.connections.catalog.dropbox.pitch',
    scope: 'session',
    enables: ['settings.connections.catalog.dropbox.enables.browse'],
  },
  {
    id: 'link-shortener',
    label: 'settings.connections.catalog.linkShortener.label',
    emoji: '🔗',
    pitch: 'settings.connections.catalog.linkShortener.pitch',
    // The subscription belongs to whoever pays for it, not to a persona — same
    // reasoning as OpenRouter and the CORS proxy. See ShortenerSettings.
    scope: 'browser',
    enables: [
      'settings.connections.catalog.linkShortener.enables.shorten',
      'settings.connections.catalog.linkShortener.enables.history',
    ],
  },
  {
    id: 'cors-proxy',
    label: 'settings.connections.catalog.corsProxy.label',
    emoji: '🔀',
    pitch: 'settings.connections.catalog.corsProxy.pitch',
    // The key belongs to whoever pays for the proxy, not to a persona — same
    // reasoning as OpenRouter. See CorsProxySettings.
    scope: 'browser',
    enables: [
      'settings.connections.catalog.corsProxy.enables.rss',
      'settings.connections.catalog.corsProxy.enables.proxy',
    ],
  },
];
