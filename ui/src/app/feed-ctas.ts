import { DISCOVERY_WAYS, DiscoveryWay } from './discovery-ways';
import { FeatureFlagId } from './feature-flags';

/** Change this one number to adjust spacing for ALL home-feed CTA cards. */
export const FEED_CTA_INTERVAL = 15;
export interface FeedCta extends DiscoveryWay {
  plus?: boolean;
  flag?: FeatureFlagId;
  vault?: boolean;
}

// i18n cta.findFriends.title: Find your people
// i18n cta.findFriends.body: Explore the different ways to find people worth following.
// i18n cta.bookmarks.title: Save something for later
// i18n cta.bookmarks.body: Keep useful posts in Bookmarks and come back when you have time.
// i18n cta.analytics.title: Get to know your feed
// i18n cta.analytics.body: See who and what make up the feed you are reading.
// i18n cta.rss.title: Bring your favorite sites along
// i18n cta.rss.body: Add RSS feeds and read updates from your favorite sites.
// i18n cta.lists.title: Make a feed for an interest
// i18n cta.lists.body: Organize accounts into lists you can read separately.
// i18n cta.tags.title: Follow a conversation
// i18n cta.tags.body: Build a feed around hashtags that matter to you.
// i18n cta.drafts.title: Pick up an unfinished thought
// i18n cta.drafts.body: Find your saved drafts and keep writing when you are ready.
// i18n cta.write.title: Give an idea more room
// i18n cta.write.body: Open the writing workspace for something longer than a quick post.
// i18n cta.appearance.title: Make yourself comfortable
// i18n cta.appearance.body: Choose how Mawkingbird looks and feels while you read.
// i18n cta.privacy.title: Make your privacy choices
// i18n cta.privacy.body: Review the controls for your privacy in Mawkingbird.
// i18n cta.feedDoctor.title: Understand your feed
// i18n cta.feedDoctor.body: See why your feed stops and what sources are contributing to it.
// i18n cta.plus.articles.title: Keep reading right here
// i18n cta.plus.articles.body: Open more full articles inside Mawkingbird with Plus.
// i18n cta.plus.feeds.title: Your RSS feeds on every device
// i18n cta.plus.feeds.body: Sync your RSS subscriptions with Plus and bring your favorite sites along.
// i18n cta.plus.lists.title: Your lists travel with you
// i18n cta.plus.lists.body: Keep your account lists available across devices with Plus.
// i18n cta.plus.trust.title: Keep your trusted accounts close
// i18n cta.plus.trust.body: Sync your trusted-account list with Plus.
// i18n cta.plus.settings.title: Set up once, carry it with you
// i18n cta.plus.settings.body: Sync your Mawkingbird settings across devices with Plus.
// i18n cta.plus.connections.title: Bring your connections along
// i18n cta.plus.connections.body: Use the encrypted connection vault with Plus to sync supported connection credentials.
// i18n cta.plus.proxy.title: More room for connected features
// i18n cta.plus.proxy.body: Plus gives the Mawkingbird proxy a higher request allowance.
// i18n cta.plus.appearance.title: Feel at home on another screen
// i18n cta.plus.appearance.body: Carry your appearance preferences to another device with Plus settings sync.
// i18n cta.plus.reading.title: Keep reading your way
// i18n cta.plus.reading.body: Carry your reading preferences across devices with Plus settings sync.
// i18n cta.plus.folders.title: Keep your RSS feeds organized
// i18n cta.plus.folders.body: Sync RSS folder paths along with your subscriptions using Plus.

function feature(id: string, route: string, options: Partial<FeedCta> = {}): FeedCta {
  const key = id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return {
    id,
    route,
    level: 'basic',
    title: `cta.${key}.title`,
    description: `cta.${key}.body`,
    ...options,
  };
}
function plus(id: string, options: Partial<FeedCta> = {}): FeedCta {
  return {
    ...feature(`plus.${id}`, '/settings/mawkingbird-plus'),
    id: `plus-${id}`,
    plus: true,
    ...options,
  };
}

export const FEATURE_CTAS: readonly FeedCta[] = [
  ...DISCOVERY_WAYS,
  feature('find-friends', '/find-friends'),
  feature('bookmarks', '/bookmarks'),
  feature('analytics', '/home', { action: 'analytics' }),
  feature('rss', '/rss'),
  feature('lists', '/feeds/lists'),
  feature('tags', '/feeds/tags'),
  feature('drafts', '/drafts'),
  feature('write', '/write', { flag: 'write' }),
  feature('appearance', '/settings/appearance'),
  feature('privacy', '/settings/privacy'),
  feature('feed-doctor', '/feed-doctor'),
];

export const PLUS_CTAS: readonly FeedCta[] = [
  plus('articles'),
  plus('feeds'),
  plus('lists'),
  plus('trust'),
  plus('settings'),
  plus('connections', { vault: true }),
  plus('proxy', { flag: 'proxy-mawkingbird-plus' }),
  plus('appearance'),
  plus('reading'),
  plus('folders'),
];
