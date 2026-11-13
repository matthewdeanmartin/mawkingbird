import { FeedAggregator } from '../feed-aggregator';
import { HomeSession } from '../home-session';
import { ProviderRegistry } from '../../connections/provider-registry';
import { BlueskyProvider } from '../../connections/bluesky/bluesky-provider';
import { MisskeyProvider } from '../../connections/misskey/misskey-provider';
import { TwitterProvider } from '../../connections/twitter/twitter-provider';
import { PasteFeedProvider } from '../../connections/paste/paste-feed-provider';
import { AnonymousMastodonProvider } from '../../accounts/anonymous/anonymous-mastodon-provider';
import { AnonymousBlueskyProvider } from '../../accounts/anonymous/anonymous-bluesky-provider';
import { RssProvider } from '../../reading/rss/rss-provider';

/** A second Home/video visit must never reset the first visit's provider cursors. */
export const HOME_PAGING_PROVIDERS = [
  FeedAggregator,
  HomeSession,
  ProviderRegistry,
  BlueskyProvider,
  MisskeyProvider,
  TwitterProvider,
  PasteFeedProvider,
  AnonymousMastodonProvider,
  AnonymousBlueskyProvider,
  RssProvider,
];
