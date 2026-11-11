export type FeedSection =
  | 'all'
  | 'mk-timelines'
  | 'mk-antennas'
  | 'mk-lists'
  | 'mk-channels'
  | 'mk-clips'
  | 'lists'
  | 'client-lists'
  | 'searches'
  | 'server'
  | 'other-servers'
  | 'tags'
  | 'tag-bundles'
  | 'featured-tags'
  | 'collections'
  | 'endorsements'
  | 'rss'
  | 'videos'
  | 'twitter'
  | 'bsky-pinned'
  | 'bsky-feeds'
  | 'bsky-lists'
  | 'bsky-popular';

/**
 * Which network a section's feeds come from. A section is offered only when
 * the account can read that network: a Misskey account has no Mastodon
 * lists, and a Bluesky account without a Mastodon connector has no Mastodon
 * server feeds, so those would only ever be empty (owner report, 2026-11-10).
 * `any` reads from no account at all (RSS, videos, other servers' public feeds).
 */
export type FeedNetwork = 'mastodon' | 'bluesky' | 'misskey' | 'any';

/** Picker options, in the order the sections appear down the page. */
export const FEED_SECTIONS: readonly { id: FeedSection; key: string; network: FeedNetwork }[] = [
  { id: 'all', key: 'pages.lists.sections.all', network: 'any' },
  // Misskey first: for a Misskey account these are its own feeds, and for
  // every other account they are not offered at all.
  { id: 'mk-timelines', key: 'pages.lists.misskey.timelines', network: 'misskey' },
  { id: 'mk-antennas', key: 'pages.lists.misskey.antennas', network: 'misskey' },
  { id: 'mk-lists', key: 'pages.lists.misskey.lists', network: 'misskey' },
  { id: 'mk-channels', key: 'pages.lists.misskey.channels', network: 'misskey' },
  { id: 'mk-clips', key: 'pages.lists.misskey.clips', network: 'misskey' },
  { id: 'lists', key: 'pages.lists.title.lists', network: 'mastodon' },
  // Browser-local, but read through the Mastodon API (`ListFeedResolver`).
  { id: 'client-lists', key: 'pages.lists.clientList.heading', network: 'mastodon' },
  { id: 'searches', key: 'pages.lists.savedSearches.heading', network: 'mastodon' },
  { id: 'server', key: 'pages.lists.serverFeeds.heading', network: 'mastodon' },
  { id: 'other-servers', key: 'otherServers.heading', network: 'any' },
  { id: 'tags', key: 'pages.lists.tags.heading', network: 'mastodon' },
  { id: 'tag-bundles', key: 'pages.lists.tagBundles.heading', network: 'mastodon' },
  { id: 'featured-tags', key: 'pages.lists.sections.featuredTags', network: 'mastodon' },
  { id: 'collections', key: 'pages.lists.collections.heading', network: 'mastodon' },
  { id: 'endorsements', key: 'pages.lists.endorsements.heading', network: 'mastodon' },
  { id: 'rss', key: 'pages.lists.rss.heading', network: 'any' },
  { id: 'videos', key: 'videos.title', network: 'any' },
  { id: 'twitter', key: 'pages.lists.twitter.heading', network: 'any' },
  // Pinned is its own section rather than a sort order, because that is what
  // pinning means upstream: promoted to a top-level tab, not merged into a
  // stream. An entry appears here or under its kind, never both.
  { id: 'bsky-pinned', key: 'pages.lists.bsky.pinnedHeading', network: 'bluesky' },
  { id: 'bsky-feeds', key: 'pages.lists.bsky.feedsHeading', network: 'bluesky' },
  { id: 'bsky-lists', key: 'pages.lists.bsky.listsHeading', network: 'bluesky' },
  // Last: it is discovery rather than something the reader owns, and every
  // other section on this page is theirs.
  { id: 'bsky-popular', key: 'pages.lists.bsky.popularHeading', network: 'bluesky' },
];
