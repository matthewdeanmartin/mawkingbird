import { FeedKind } from '../feed-capability';
import { ServerFeedKind } from './list-source';

/** What kind of content a server feed renders. */
export type ServerFeedContent = 'posts' | 'links';

/** Static metadata for the built-in server feeds surfaced as lists. */
export interface ServerFeedDef {
  feed: ServerFeedKind;
  title: string;
  blurb: string;
  content: ServerFeedContent;
  /** These require an authenticated session (mastodon.social 422s them
   *  anonymously — see the mastodon.social anonymous endpoints note). */
  authRequired: boolean;
  /**
   * Which capability decides whether to offer the row, if any.
   *
   * Every server feed is now probed — the trending endpoints included, since
   * some instances serve no trending links at all and the row led straight to
   * an error page there. Answers are cached per host by {@link FeedCapability},
   * so this costs one request a day rather than one per visit.
   */
  capability: FeedKind;
}

export const SERVER_FEEDS: ServerFeedDef[] = [
  {
    feed: 'federated',
    title: 'Fediverse',
    blurb: 'Public posts from across the federated network.',
    content: 'posts',
    authRequired: true,
    capability: 'public-federated',
  },
  {
    feed: 'local',
    title: 'Local timeline',
    blurb: "Public posts from this server's own members.",
    content: 'posts',
    authRequired: true,
    capability: 'public-local',
  },
  {
    feed: 'trending',
    title: 'Trending posts',
    blurb: 'Posts getting attention right now.',
    content: 'posts',
    authRequired: false,
    capability: 'trending-statuses',
  },
  {
    feed: 'news',
    title: 'News',
    blurb: 'Links trending across the fediverse.',
    content: 'links',
    authRequired: false,
    capability: 'trending-links',
  },
];

export function serverFeedDef(feed: ServerFeedKind): ServerFeedDef | undefined {
  return SERVER_FEEDS.find((f) => f.feed === feed);
}
