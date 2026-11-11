import { buildOpml as writeOpml } from '../../../lib/rss/opml';
import { RssFeedSub } from './rss-subscriptions';

export { parseOpml } from '../../../lib/rss/opml';
export type { OpmlFeed, ParsedOpml } from '../../../lib/rss/opml';

/**
 * Mawkingbird's OPML export: every subscription, disabled ones included.
 * "Disabled" is a display state here, not an unsubscribe, so dropping those
 * feeds would make the export quietly lossy.
 */
export function buildOpml(feeds: readonly RssFeedSub[], now = new Date()): string {
  return writeOpml(feeds, now, 'Mawkingbird subscriptions');
}

/** A filename that sorts usefully and says where it came from. */
export function opmlFilename(now = new Date()): string {
  return `mawkingbird-feeds-${now.toISOString().slice(0, 10)}.opml`;
}
