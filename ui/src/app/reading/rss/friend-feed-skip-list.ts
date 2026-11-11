/**
 * Hosts a friend-feed scan will not probe.
 *
 * ## Why a skip list earns its upkeep here
 *
 * Profile fields are mostly not blogs. The same dozen platforms appear over and
 * over — a shop, a tip jar, a link aggregator, another social account — and none
 * of them publishes a per-profile feed that this app could subscribe to. Probing
 * them costs a full cross-origin fetch each, on the budget the user agreed to
 * spend on *finding their friends' writing*.
 *
 * Skipping them is therefore not a cosmetic filter. On a typical following list
 * it is the difference between spending the cap on candidate blogs and spending
 * a third of it re-confirming that linktr.ee has no feed.
 *
 * ## Why this is small, and stays small
 *
 * The negative cache in `friend-feed-cache.ts` already means any given feedless
 * site is probed at most once, ever. So this list is not here to prevent repeat
 * cost — that is handled — but to stop the *first* scan wasting its budget on
 * hosts whose answer is known in advance and identical for everybody.
 *
 * That is the entry test: a host belongs here only when it will be on many
 * users' following lists *and* certainly has no usable per-profile feed. A site
 * that merely usually lacks one does not qualify, because a wrong entry here is
 * invisible — the feed is never found and nothing says why.
 *
 * Deliberately excluded for that reason:
 *
 *   - **medium.com, substack.com, tumblr.com, wordpress.com** — all publish
 *     per-author feeds, and are exactly what this feature exists to find.
 *   - **youtube.com** — `paste-resolve.ts` already turns a channel URL into a
 *     feed; skipping it would throw away a hit it can get.
 *   - **github.com** — user and repo pages both expose Atom feeds.
 */

/**
 * Registrable domains never worth probing.
 *
 * Matched on the host and any parent domain, so `www.instagram.com` and
 * `open.spotify.com` are both covered by their entry.
 */
const SKIP_HOSTS = new Set([
  // Social platforms with no public per-profile feed.
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'threads.net',
  'linkedin.com',
  'tiktok.com',
  'snapchat.com',
  'discord.com',
  'discord.gg',
  'reddit.com',
  'twitch.tv',
  'telegram.me',
  't.me',
  'whatsapp.com',
  'signal.me',
  // Link aggregators: a page of links to other pages.
  'linktr.ee',
  'bio.link',
  'carrd.co',
  'about.me',
  'beacons.ai',
  // Funding and commerce.
  'patreon.com',
  'ko-fi.com',
  'buymeacoffee.com',
  'liberapay.com',
  'gofundme.com',
  'paypal.com',
  'paypal.me',
  'venmo.com',
  'cash.app',
  'etsy.com',
  'gumroad.com',
  'amazon.com',
  'kickstarter.com',
  // Media and profile hosts without per-user feeds.
  'spotify.com',
  'soundcloud.com',
  'bandcamp.com',
  'vimeo.com',
  'flickr.com',
  'pinterest.com',
  'goodreads.com',
  'letterboxd.com',
  'strava.com',
  'calendly.com',
  // Fediverse and adjacent: followed as accounts, not as feeds.
  'bsky.app',
  'mastodon.social',
]);

/**
 * Whether this URL is on the skip list.
 *
 * Checks the host and every parent domain, so a subdomain is covered by its
 * registrable domain without needing its own entry.
 */
export function isSkippedHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (SKIP_HOSTS.has(parts.slice(i).join('.'))) {
      return true;
    }
  }
  return false;
}
