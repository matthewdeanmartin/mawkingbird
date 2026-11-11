/**
 * Hand-curated RSS starter kits, for the cold-start problem.
 *
 * Nobody evaluates a feed reader that opens empty and asks them to go find
 * twenty feed URLs first. These exist so `/rss` has something to show on day
 * one, in one click.
 *
 * ## Why this file is hand-edited and not generated
 *
 * The account starter kits (`bundled-starter-kits.generated.ts`) are built by a
 * script that fetches all ~132 candidate accounts and re-validates them in
 * `check:static`. That machinery exists for a specific reason: a Mastodon
 * account can ask not to be listed — `discoverable=false`, `indexable=false`,
 * `noindex=true` — and honouring that opt-out is not optional, so membership has
 * to be re-derived from live data rather than trusted to a stale file.
 *
 * **RSS has no equivalent signal.** Publishing a feed is itself the opt-in; a
 * feed carries no "please don't list me" flag for a reader to respect. So the
 * only thing a network check would buy here is early warning that a URL rotted
 * — and it would buy that at the price of a quality gate that goes red whenever
 * a publisher 404s, rate-limits, or has a bad afternoon. That is exactly the
 * failure the account-kit check was in when this was written (one dead account,
 * `rferl@mastodon.social`, and a three-week-red `check:static`).
 *
 * A dead feed here is not a crisis: the reader already renders per-feed failures
 * ("Couldn't load …") and the rest of the kit still subscribes. So the list is
 * plain data, reviewed by a human, and `check:static` never touches the network
 * on its account.
 *
 * ## Choosing feeds for this list
 *
 * Every URL below was fetched and parsed once, by hand, before being added
 * (2026-08-22). Three things were checked, in this order:
 *
 * 1. **Does it send `Access-Control-Allow-Origin: *`?** This is the big one, and
 *    it is a *selection criterion*, not a footnote. Most of the RSS web sends no
 *    CORS header at all, which means a browser cannot read it without a proxy —
 *    and a brand-new user has no proxy configured. The first draft of this file
 *    was picked on editorial merit alone and only 4 of 19 feeds were readable
 *    directly; a fresh install of the Fediverse kit subscribed 1 of 4 feeds and
 *    reported three failures. That is the exact bad first impression these kits
 *    exist to prevent, so the list was rebuilt around feeds that work with no
 *    setup. It is now 16 of 18.
 * 2. **Does it parse, and does it actually have items?** Several otherwise-fine
 *    candidates were dormant accounts serving a valid but empty feed.
 * 3. **Is the URL likely to outlive us?** Prefer large publishers and
 *    long-stable URLs; the cost of a rotted URL is paid by every new user, so
 *    longevity beats novelty here.
 *
 * A useful trick that falls out of (1): **any Mastodon account's `.rss` feed
 * sends `ACAO: *`**, because Mastodon serves it that way. So where a publisher's
 * own feed is CORS-blocked but they also post to the fediverse, the `.rss` of
 * their account is a readable substitute — that is why Ars Technica, 404 Media
 * and NPR are here as `mastodon.social/@….rss` rather than their homepage feeds.
 *
 * Rejected in that pass, so nobody re-adds them without knowing: AP (403 to
 * non-browser clients), Reuters (feed URL 404s), Nature (malformed XML), Hacker
 * News via hnrss.org (connection refused), DW News and `@BBC`/`@CERN` on
 * mastodon.social (valid feed, zero items).
 *
 * The three that still need a proxy (BBC World, The Guardian, Phys.org) are kept
 * deliberately: they are worth the occasional proxy hop, and
 * {@link RssStarterKitInstall} falls back to the proxy per feed, so they simply
 * work for anyone who has one and are reported honestly for anyone who does not.
 */

/** One feed in a starter kit. `title` seeds the subscription before first fetch. */
export interface RssStarterFeed {
  url: string;
  title: string;
}

/** A themed set of feeds offered as a single one-click subscribe. */
export interface RssStarterKit {
  slug: string;
  title: string;
  /** One line, shown under the title. Says who this kit is for. */
  blurb: string;
  /** Emoji shown on the kit card — no icon assets to ship or theme. */
  icon: string;
  /**
   * The folder these feeds are filed under when the kit is installed.
   *
   * Kits arrive pre-filed so the left rail is immediately doing its job: someone
   * who installs two kits sees the point of folders without having organised
   * anything by hand. Matches the kit title rather than the slug, since the
   * folder name is what the user actually reads.
   */
  folder: string;
  feeds: readonly RssStarterFeed[];
}

export const RSS_STARTER_KITS: readonly RssStarterKit[] = [
  {
    slug: 'news',
    title: 'World news',
    blurb: 'Public broadcasters and papers of record.',
    icon: '📰',
    folder: 'World news',
    feeds: [
      { url: 'https://mastodon.social/@NPR.rss', title: 'NPR News' },
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', title: 'NYT — World' },
      { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', title: 'BBC World' },
      { url: 'https://www.theguardian.com/world/rss', title: 'The Guardian — World' },
    ],
  },
  {
    slug: 'tech',
    title: 'Tech',
    blurb: 'Industry reporting, security, and a few good independents.',
    icon: '💻',
    folder: 'Tech',
    feeds: [
      { url: 'https://mastodon.social/@arstechnica.rss', title: 'Ars Technica' },
      { url: 'https://mastodon.social/@404mediaco.rss', title: '404 Media' },
      { url: 'https://simonwillison.net/atom/everything/', title: 'Simon Willison' },
      { url: 'https://hachyderm.io/@molly0xfff.rss', title: 'Molly White' },
      { url: 'https://github.blog/feed/', title: 'GitHub Blog' },
      { url: 'https://blog.rust-lang.org/feed.xml', title: 'Rust Blog' },
    ],
  },
  {
    slug: 'science',
    title: 'Science',
    blurb: 'Research news, from the agencies and the people doing it.',
    icon: '🔬',
    folder: 'Science',
    feeds: [
      { url: 'https://www.nasa.gov/news-release/feed/', title: 'NASA' },
      { url: 'https://www.quantamagazine.org/feed/', title: 'Quanta Magazine' },
      { url: 'https://mastodon.social/@sundogplanets.rss', title: 'Prof. Sam Lawler' },
      { url: 'https://phys.org/rss-feed/', title: 'Phys.org' },
    ],
  },
  {
    slug: 'fediverse',
    title: 'Fediverse',
    blurb: 'News about the network this app talks to.',
    icon: '🐘',
    folder: 'Fediverse',
    feeds: [
      { url: 'https://blog.joinmastodon.org/index.xml', title: 'Mastodon Blog' },
      { url: 'https://social.growyourown.services/@feditips.rss', title: 'FediTips' },
      { url: 'https://mastodon.social/@WeDistribute.rss', title: 'We Distribute' },
      { url: 'https://mastodon.archive.org/@internetarchive.rss', title: 'Internet Archive' },
    ],
  },
];

/** One kit by slug, or null when the slug is unknown. */
export function rssStarterKit(slug: string): RssStarterKit | null {
  return RSS_STARTER_KITS.find((kit) => kit.slug === slug) ?? null;
}

/** How many feeds all kits hold together — for "adds N feeds" copy. */
export function rssStarterKitFeedCount(): number {
  return RSS_STARTER_KITS.reduce((sum, kit) => sum + kit.feeds.length, 0);
}
