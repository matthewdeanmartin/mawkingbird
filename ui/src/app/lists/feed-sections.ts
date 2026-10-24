export type FeedSection =
  | 'all'
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

/** Picker options, in the order the sections appear down the page. */
export const FEED_SECTIONS: readonly { id: FeedSection; key: string }[] = [
  { id: 'all', key: 'pages.lists.sections.all' },
  { id: 'lists', key: 'pages.lists.title.lists' },
  { id: 'client-lists', key: 'pages.lists.clientList.heading' },
  { id: 'searches', key: 'pages.lists.savedSearches.heading' },
  { id: 'server', key: 'pages.lists.serverFeeds.heading' },
  { id: 'other-servers', key: 'otherServers.heading' },
  { id: 'tags', key: 'pages.lists.tags.heading' },
  { id: 'tag-bundles', key: 'pages.lists.tagBundles.heading' },
  { id: 'featured-tags', key: 'pages.lists.sections.featuredTags' },
  { id: 'collections', key: 'pages.lists.collections.heading' },
  { id: 'endorsements', key: 'pages.lists.endorsements.heading' },
  { id: 'rss', key: 'pages.lists.rss.heading' },
  { id: 'videos', key: 'videos.title' },
  { id: 'twitter', key: 'pages.lists.twitter.heading' },
  // Pinned is its own section rather than a sort order, because that is what
  // pinning means upstream: promoted to a top-level tab, not merged into a
  // stream. An entry appears here or under its kind, never both.
  { id: 'bsky-pinned', key: 'pages.lists.bsky.pinnedHeading' },
  { id: 'bsky-feeds', key: 'pages.lists.bsky.feedsHeading' },
  { id: 'bsky-lists', key: 'pages.lists.bsky.listsHeading' },
  // Last: it is discovery rather than something the reader owns, and every
  // other section on this page is theirs.
  { id: 'bsky-popular', key: 'pages.lists.bsky.popularHeading' },
];
