/** A feed candidate found on a page, as {@link feedLinksIn} returns it. */
export interface FeedCandidate {
  url: string;
  title: string;
  /** The `type` attribute it was declared with, lowercased. May be absent. */
  type?: string;
}

/**
 * How expressive each feed format is, higher being better.
 *
 * Atom over RSS is not a style preference. Atom requires a globally unique
 * `<id>`, mandates `<updated>` as a real RFC-3339 timestamp, and distinguishes
 * `<summary>` from `<content>` — all three of which this app actually uses:
 * dedupe keys off the id, ordering keys off the date, and the reader shows
 * content where it exists. RSS 2.0 makes `guid` optional, dates are RFC-822 and
 * widely malformed, and there is one body element whose meaning varies by
 * publisher. JSON Feed is comparably well specified and cheaper to parse, but is
 * rare enough that preferring it over Atom would mostly be untested code paths.
 *
 * Unknown or missing types score 0: never preferred, never discarded.
 */
const FORMAT_RANK: Record<string, number> = {
  'application/atom+xml': 3,
  'application/feed+json': 2,
  'application/json': 2,
  'application/rss+xml': 1,
};

/**
 * Order feed candidates so the best guess comes first.
 *
 * ## Why ranking rather than picking
 *
 * One page routinely declares several feeds — WordPress alone publishes a main
 * feed, a comments feed, and often per-category ones. Someone who pasted a site
 * root wants the site, but nothing in the markup says which of the three that
 * is: they are all `rel="alternate"` and all valid.
 *
 * So this ranks rather than chooses. The caller shows every candidate with the
 * top one pre-selected, which is what makes an imperfect heuristic survivable:
 * a wrong guess costs one extra click, not a confusing subscription the user
 * cannot explain. **If the UI ever hides the alternatives, this ranking stops
 * being good enough** — it is not accurate enough to be the only answer.
 *
 * ## Determinism
 *
 * Ties break on the URL, so the same page always produces the same pre-pick.
 * A pre-pick that moved between two visits would be worse than no pre-pick:
 * the user would have no way to learn what the app does.
 */

/** Paths and words that mark a comments feed. */
const COMMENT_HINTS = [/\/comments\/?(feed|rss|atom)?\/?$/i, /comment/i];

/** Path shapes that mark a narrower-than-the-site feed. */
const NARROW_HINTS = [/\/(category|categories|tag|tags|label|topic|author)\//i, /[?&]cat=/i];

/** Score one candidate. Lower sorts first. */
function score(candidate: FeedCandidate, pageTitle: string): number {
  let points = 0;
  let path: string;
  let segments: number;
  try {
    const url = new URL(candidate.url);
    path = url.pathname + url.search;
    segments = url.pathname.split('/').filter(Boolean).length;
  } catch {
    // Unparseable shouldn't reach here (feedLinksIn resolves and validates), but
    // ranking must not throw on it either — sort it last and move on.
    return Number.MAX_SAFE_INTEGER;
  }

  const haystack = `${path} ${candidate.title}`;

  // 1. Comments feeds are near-never what someone means, and are the single most
  //    common wrong pick. Heaviest demotion.
  if (COMMENT_HINTS.some((re) => re.test(haystack))) {
    points += 1000;
  }

  // 2. A feed scoped to one category or tag is a subset of the thing that was
  //    asked for.
  if (NARROW_HINTS.some((re) => re.test(path))) {
    points += 100;
  }

  // 3. Shorter paths are more likely to be the site's own feed: `/feed` beats
  //    `/blog/tech/feed`.
  points += segments * 5;

  // 4. A feed titled like the page is the page's feed. Only a nudge — many
  //    correct feeds are titled "Feed" or "RSS" and would lose rule 3 otherwise.
  if (pageTitle && titlesRelated(candidate.title, pageTitle)) {
    points -= 3;
  }

  return points;
}

/** Whether a feed title and a page title plausibly name the same publication. */
function titlesRelated(feedTitle: string, pageTitle: string): boolean {
  const normalise = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(feed|rss|atom|comments?|blog)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const feed = normalise(feedTitle);
  const page = normalise(pageTitle);
  if (!feed || !page) {
    return false;
  }
  return page.includes(feed) || feed.includes(page);
}

/**
 * Rank candidates best-first.
 *
 * `pageTitle` is the `<title>` of the page they were declared on, when known —
 * it is evidence for rule 4 and simply skipped when absent.
 */
export function rankFeeds(candidates: readonly FeedCandidate[], pageTitle = ''): FeedCandidate[] {
  return [...candidates].sort((a, b) => {
    const diff = score(a, pageTitle) - score(b, pageTitle);
    if (diff !== 0) {
      return diff;
    }
    // Deterministic tiebreak: Atom before RSS where the URL says so, then the
    // URL itself. Arbitrary, but stable — which is the property that matters.
    const atomness = Number(/atom/i.test(b.url)) - Number(/atom/i.test(a.url));
    return atomness !== 0 ? atomness : a.url.localeCompare(b.url);
  });
}

/**
 * Strip the parts of a feed URL that only say which *format* it is.
 *
 * The identity this produces is deliberately coarse: it answers "are these the
 * same content?" and nothing else. Two URLs that reduce to the same key are
 * treated as one feed published twice.
 */
function contentKey(candidate: FeedCandidate): string {
  let url: URL;
  try {
    url = new URL(candidate.url);
  } catch {
    return candidate.url;
  }
  const path = url.pathname
    // `/feed/atom/`, `/feed/rss2/` — WordPress's format suffix on a shared path.
    .replace(/\/(atom|rss2?|rdf|json)\/?$/i, '/')
    // `feed.atom`, `index.rss`, `feed.json` — the extension is the format.
    .replace(/\.(atom|rss|rdf|xml|json)$/i, '')
    // A trailing slash is not a distinction.
    .replace(/\/+$/, '');
  // `?feed=atom` / `?format=rss`, same idea in query form. Everything else in
  // the query is kept: `?cat=politics` genuinely is a different feed.
  const params = new URLSearchParams(url.search);
  for (const key of ['feed', 'format', 'type', 'alt']) {
    params.delete(key);
  }
  const query = params.toString();
  return `${url.host}${path}${query ? `?${query}` : ''}`;
}

/**
 * Collapse feeds that are the same content in different formats.
 *
 * ## The two cases, which look identical in the markup
 *
 * A page declaring several feeds means one of two very different things:
 *
 *  1. **The same feed, published twice.** `/feed/` and `/feed/atom/`, or
 *     `index.rss` beside `index.atom`. Asking which one someone wants is asking
 *     them to answer a question about serialisation formats, which is not a
 *     question a reader has an opinion about — and both answers give them the
 *     identical reading experience.
 *  2. **Genuinely different feeds.** Politics, Books, Comics. Here the app
 *     *must* ask, because picking one is picking what they read, and no
 *     heuristic can know which section someone came for.
 *
 * Collapsing case 1 is what lets case 2 be asked cleanly: a site with three
 * sections in two formats each declares six feeds, and presenting six options
 * for a three-way choice buries the real question in noise.
 *
 * Within a collapsed group the most expressive format wins ({@link FORMAT_RANK}),
 * falling back to the ranking order the caller already established.
 *
 * @param candidates already ordered by {@link rankFeeds}; order is preserved
 */
export function collapseFormats(candidates: readonly FeedCandidate[]): FeedCandidate[] {
  const best = new Map<string, FeedCandidate>();
  const order: string[] = [];
  for (const candidate of candidates) {
    const key = contentKey(candidate);
    const held = best.get(key);
    if (!held) {
      best.set(key, candidate);
      order.push(key);
      continue;
    }
    // Same content. Keep whichever format carries more of what we read.
    if (formatRank(candidate) > formatRank(held)) {
      best.set(key, candidate);
    }
  }
  return order.map((key) => best.get(key)!);
}

/**
 * How expressive this candidate's format is.
 *
 * Prefers the declared `type`, because that is the publisher stating it. Falls
 * back to the URL, which is a guess but a common one — plenty of pages declare
 * every feed as `application/rss+xml` regardless of what it serves.
 */
function formatRank(candidate: FeedCandidate): number {
  const declared = FORMAT_RANK[(candidate.type ?? '').toLowerCase().trim()];
  if (declared !== undefined) {
    return declared;
  }
  if (/atom/i.test(candidate.url)) return 3;
  if (/\.json|feed\.json/i.test(candidate.url)) return 2;
  if (/rss|rdf/i.test(candidate.url)) return 1;
  return 0;
}
