import { Account, Status } from './models';
import { stripHtml } from './sentiment';

/**
 * Client-side analytics for a *feed* — a sampled slice of a timeline (hashtag,
 * list, local, federated, home, an account's posts) rather than one account's
 * own output. The companion to `account-metrics.ts`, and it makes the same
 * bargain: every number here is a pure transform over posts the caller already
 * fetched, so adding a metric costs zero extra API calls.
 *
 * Three constraints shape the whole file:
 *
 *  - **The sample is the population.** Everything describes the ~100–200 posts
 *    that were retrieved, never "the feed" as a whole. Callers must label
 *    results that way; {@link FeedSampleMeta} exists to be shown, not stored.
 *  - **No per-post follow-up requests.** No profile lookups, no conversation
 *    contexts, no favouriters, no link previews. Where Mastodon only exposes a
 *    fact via a second request (a post's real conversation id, a card's title),
 *    we approximate from what the status payload already carries or omit it.
 *  - **Content lives on the boosted post.** For a boost, the hashtags, media,
 *    language and engagement counts all belong to `reblog`, so metrics read
 *    through {@link feedSubject}. "Who is in this feed" therefore means the
 *    *content* author, not the booster; boosters are reported separately.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** One counted category with its share (0–1) of whatever was counted. */
export interface ShareRow {
  key: string;
  count: number;
  share: number;
}

/** A counted author, carrying the account so the UI can link and show avatars. */
export interface AuthorRow {
  account: Account;
  count: number;
  share: number;
}

/** Provenance for a report — the feed it came from and when it was collected. */
export interface FeedSampleMeta {
  /** Feed kind, e.g. "hashtag", "list", "local", "federated", "home". */
  feedType: string;
  /** The query that identifies it within its kind (`#angular`, a list name). */
  feedQuery: string;
  /** How many posts were actually analyzed. */
  sampleSize: number;
  /** How many HTTP requests the sample cost. */
  apiCalls: number;
  /** ISO timestamp of collection. */
  collectedAt: string;
}

/** Optional viewer-side facts that need one extra (batched) request. */
export interface FeedViewerContext {
  /** Account ids the viewer follows, when a relationships call succeeded. */
  followingIds?: ReadonlySet<string>;
}

const MS_PER_HOUR = 3_600_000;

/** The post whose *content* a feed entry is about: the boosted one, if any. */
export function feedSubject(status: Status): Status {
  return status.reblog ?? status;
}

function share(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

/** Format a 0–1 share as a rounded percent. Unlike `sharePct`, 0 stays 0. */
export function pct(value: number): number {
  return Math.round(value * 100);
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Counts → rows sorted by count desc, shares taken against `total`. */
function rank(counts: Map<string, number>, total: number): ShareRow[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: share(count, total) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function bump(counts: Map<string, number>, key: string, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

// ---------------------------------------------------------------------------
// Content parsing — hashtags, mentions and links out of status HTML
// ---------------------------------------------------------------------------

/**
 * Mastodon's `Status` as this app models it carries neither `tags` nor `card`,
 * so hashtags and links are recovered from the rendered HTML. That HTML is
 * server-generated and highly regular: hashtags are anchors with a `hashtag`
 * class (or a `/tags/<name>` href), mentions carry a `mention` class, and
 * everything else that is an anchor is a real outbound link.
 */
const ANCHOR_RE = /<a\b[^>]*>/gi;
const HREF_RE = /\bhref\s*=\s*"([^"]*)"/i;
const CLASS_RE = /\bclass\s*=\s*"([^"]*)"/i;
const TAG_PATH_RE = /\/tags?\/([^/?#"]+)/i;
/** Bare `#hashtag` in plain text, for providers that don't linkify. */
const BARE_TAG_RE = /(?:^|[\s(])#([\p{L}\p{N}_]{2,})/gu;

/** What the anchors in one post's content resolved to. */
export interface ParsedContent {
  /** Lowercased hashtag names, de-duplicated within the post. */
  hashtags: string[];
  /** Absolute URLs of outbound links, de-duplicated within the post. */
  links: string[];
  /** Links that point back into a Mastodon-ish instance (profiles, posts). */
  internalLinks: string[];
}

/** Paths that mark a URL as pointing back into the fediverse, not out of it. */
const INTERNAL_PATH_RE = /^\/(@|users\/|web\/|statuses\/|notice\/|tags?\/)/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** Split one post's HTML into hashtags, outbound links and internal links. */
export function parseContent(html: string): ParsedContent {
  const hashtags = new Set<string>();
  const links = new Set<string>();
  const internal = new Set<string>();

  for (const anchor of html.match(ANCHOR_RE) ?? []) {
    const href = anchor.match(HREF_RE)?.[1];
    if (!href) {
      continue;
    }
    const classes = (anchor.match(CLASS_RE)?.[1] ?? '').toLowerCase();
    const tagInPath = href.match(TAG_PATH_RE)?.[1];
    if (classes.includes('hashtag') || tagInPath) {
      if (tagInPath) {
        hashtags.add(decodeURIComponent(tagInPath).toLowerCase());
      }
      continue;
    }
    if (classes.includes('mention')) {
      continue;
    }
    if (!/^https?:/i.test(href)) {
      continue;
    }
    if (INTERNAL_PATH_RE.test(pathOf(href))) {
      internal.add(href);
    } else {
      links.add(href);
    }
  }

  // Providers that hand us plain text (RSS bridges, some mocks) still write
  // hashtags the human way, so recover those too.
  if (!hashtags.size) {
    const text = stripHtml(html);
    for (const match of text.matchAll(BARE_TAG_RE)) {
      hashtags.add(match[1].toLowerCase());
    }
  }

  return { hashtags: [...hashtags], links: [...links], internalLinks: [...internal] };
}

/**
 * The instance an account belongs to. `acct` is `user` locally and
 * `user@host` for remote accounts; the profile URL is the fallback for
 * providers that don't follow that convention.
 */
export function accountInstance(account: Account, localHost: string): string {
  const at = account.acct.indexOf('@');
  if (at > -1) {
    return account.acct.slice(at + 1).toLowerCase();
  }
  return hostOf(account.url) ?? localHost;
}

/** True when the account is native to the instance the feed was read from. */
export function isLocalAccount(account: Account): boolean {
  return !account.acct.includes('@');
}

// ---------------------------------------------------------------------------
// Section: composition
// ---------------------------------------------------------------------------

export interface CompositionMetrics {
  total: number;
  original: number;
  boosts: number;
  replies: number;
  standalone: number;
  withMedia: number;
  withLinks: number;
  withPolls: number;
  withContentWarning: number;
  /** Declared post languages, most common first. */
  languages: ShareRow[];
  avgLength: number;
  medianLength: number;
}

// ---------------------------------------------------------------------------
// Section: accounts
// ---------------------------------------------------------------------------

export interface AccountMetrics {
  uniqueAuthors: number;
  /** Every author in the sample, most posts first. */
  authors: AuthorRow[];
  postsPerAuthor: number;
  top5Share: number;
  top10Share: number;
  /** Share of authors that appear exactly once. */
  singletonAuthorShare: number;
  /** Null when no relationships call was made (anonymous viewers). */
  followedAuthors: number | null;
  unfollowedAuthors: number | null;
  botAuthors: number;
  humanAuthors: number;
  postsFromBots: number;
  /** Posts the viewer has muted or that matched one of their filters. */
  mutedOrFilteredPosts: number;
  /** Who boosted things into this feed, when the feed contains boosts. */
  boosters: AuthorRow[];
}

// ---------------------------------------------------------------------------
// Section: instances
// ---------------------------------------------------------------------------

export interface InstanceMetrics {
  uniqueInstances: number;
  localPosts: number;
  remotePosts: number;
  instances: ShareRow[];
  largestShare: number;
  /** Unique instances per 100 posts — a scale-free diversity read. */
  diversityPer100: number;
}

// ---------------------------------------------------------------------------
// Section: hashtags
// ---------------------------------------------------------------------------

/** One hashtag with how many distinct authors used it. */
export interface HashtagRow extends ShareRow {
  authors: number;
  /** Set when a single author produced ≥80% of this tag's posts. */
  dominatedBy: Account | null;
}

export interface HashtagMetrics {
  postsWithHashtags: number;
  hashtagShare: number;
  tags: HashtagRow[];
  uniqueTags: number;
  /** Tags used by more than one author — the genuinely shared topics. */
  sharedTags: HashtagRow[];
  /** Tags one author has effectively to themselves. */
  dominatedTags: HashtagRow[];
  /** Tag pairs that co-occur in the same post, most frequent first. */
  pairs: { a: string; b: string; count: number }[];
  /** Effective number of distinct topics (1/HHI over tag uses). */
  topicDiversity: number;
}

// ---------------------------------------------------------------------------
// Section: links
// ---------------------------------------------------------------------------

export interface DomainRow extends ShareRow {
  authors: number;
}

export interface LinkMetrics {
  postsWithLinks: number;
  linkShare: number;
  domains: DomainRow[];
  uniqueDomains: number;
  /** The same URL posted more than once in the sample. */
  repeatedUrls: { url: string; count: number; authors: number }[];
  /** Repeated URLs shared by two or more different authors. */
  crossAuthorUrls: number;
  /** Authors who link in most of what they post (≥3 posts, ≥60% linked). */
  linkHeavyAuthors: AuthorRow[];
  internalLinks: number;
  externalLinks: number;
}

// ---------------------------------------------------------------------------
// Section: media
// ---------------------------------------------------------------------------

export interface MediaMetrics {
  postsWithMedia: number;
  mediaShare: number;
  attachments: number;
  byType: ShareRow[];
  described: number;
  undescribed: number;
  /** Share of media posts whose every attachment has alt text. */
  fullyDescribedShare: number;
  topMediaAuthors: AuthorRow[];
}

// ---------------------------------------------------------------------------
// Section: engagement
// ---------------------------------------------------------------------------

/** Mean engagement for one slice of the sample, plus how big the slice was. */
export interface EngagementSlice {
  label: string;
  posts: number;
  avgEngagement: number;
}

export interface EngagementMetrics {
  avgFavourites: number;
  medianFavourites: number;
  avgBoosts: number;
  medianBoosts: number;
  avgReplies: number;
  medianReplies: number;
  /** Highest total engagement first; only posts with engagement > 0. */
  topPosts: Status[];
  /** Original-vs-boost, media-vs-text, link-vs-none, CW-vs-none. */
  slices: EngagementSlice[];
  zeroEngagementShare: number;
}

// ---------------------------------------------------------------------------
// Section: conversations
// ---------------------------------------------------------------------------

export interface ConversationMetrics {
  replies: number;
  replyShare: number;
  /** Connected components of the in-sample reply graph. */
  distinctConversations: number;
  /** Conversations contributing more than one sampled post. */
  multiPostConversations: number;
  avgPostsPerConversation: number;
  /** Authors appearing most often in multi-post conversations. */
  topParticipants: AuthorRow[];
  /** Share of the sample sitting inside conversations of ≥4 sampled posts. */
  longChainShare: number;
}

// ---------------------------------------------------------------------------
// Section: recency
// ---------------------------------------------------------------------------

export interface RecencyMetrics {
  /** Age in hours of the newest and oldest sampled post. */
  newestAgeHours: number;
  oldestAgeHours: number;
  medianAgeHours: number;
  spanHours: number;
  /** Posts per local hour-of-day, index 0–23. */
  byHour: number[];
  /** Posts per calendar day, oldest first; empty when the span is under a day. */
  byDay: { label: string; dayIso: string; posts: number }[];
  /** Windows of {@link BURST_WINDOW_MIN} minutes holding ≥{@link BURST_MIN_POSTS} posts. */
  bursts: number;
  /** Authors who posted repeatedly inside a burst window. */
  burstAuthors: AuthorRow[];
  /** Share of the sample that landed in its single busiest clock hour. */
  busiestHourShare: number;
}

/** Length of the sliding window used to detect posting bursts. */
export const BURST_WINDOW_MIN = 15;
/** How many posts inside one window make it a burst. */
export const BURST_MIN_POSTS = 5;

// ---------------------------------------------------------------------------
// Section: concentration
// ---------------------------------------------------------------------------

/** How concentrated one dimension of the feed is. */
export interface ConcentrationRow {
  label: string;
  /** Share held by the single largest category. */
  largestShare: number;
  /** Name of that largest category. */
  largest: string;
  /** Effective number of categories (1/HHI): 1 = monoculture, higher = varied. */
  effectiveCount: number;
  /** How many categories exist at all. */
  categories: number;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface FeedReport {
  meta: FeedSampleMeta;
  composition: CompositionMetrics;
  accounts: AccountMetrics;
  instances: InstanceMetrics;
  hashtags: HashtagMetrics;
  links: LinkMetrics;
  media: MediaMetrics;
  engagement: EngagementMetrics;
  conversations: ConversationMetrics;
  recency: RecencyMetrics;
  concentration: ConcentrationRow[];
  /** Plain-language observations worth leading with. */
  highlights: string[];
}

/**
 * Effective number of categories, 1/HHI over a distribution. A feed split
 * evenly across 5 instances scores 5; one where a single instance holds 90%
 * scores ~1.2. Reported instead of a raw index because "about three sources"
 * is legible in a way that "HHI 0.31" is not.
 */
export function effectiveCategories(counts: number[]): number {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (!total) {
    return 0;
  }
  const hhi = counts.reduce((sum, c) => sum + (c / total) ** 2, 0);
  return hhi > 0 ? round1(1 / hhi) : 0;
}

/**
 * Compute every metric for a sampled feed. Pure and synchronous: `posts` is
 * expected newest-first (Mastodon's order), `meta` describes where it came
 * from, and `viewer` carries the one optional fact — who the viewer follows —
 * that needs a request the caller may not have been able to make.
 */
export function analyzeFeed(
  posts: Status[],
  meta: Omit<FeedSampleMeta, 'sampleSize'>,
  viewer: FeedViewerContext = {},
  now: number = Date.now(),
): FeedReport {
  const total = posts.length;
  const subjects = posts.map(feedSubject);
  const parsed = subjects.map((s) => parseContent(s.content));
  const localHost = guessLocalHost(subjects);

  const fullMeta: FeedSampleMeta = { ...meta, sampleSize: total };
  const composition = analyzeComposition(posts, subjects, parsed);
  const accounts = analyzeAccounts(posts, subjects, viewer);
  const instances = analyzeInstances(subjects, localHost);
  const hashtags = analyzeHashtags(subjects, parsed);
  const links = analyzeLinks(subjects, parsed);
  const media = analyzeMedia(subjects);
  const engagement = analyzeEngagement(posts, subjects, parsed);
  const conversations = analyzeConversations(posts, subjects);
  const recency = analyzeRecency(subjects, now);
  const concentration = analyzeConcentration(composition, accounts, instances, hashtags, links);

  return {
    meta: fullMeta,
    composition,
    accounts,
    instances,
    hashtags,
    links,
    media,
    engagement,
    conversations,
    recency,
    concentration,
    highlights: buildHighlights({
      composition,
      accounts,
      instances,
      hashtags,
      links,
      media,
      engagement,
      conversations,
    }),
  };
}

/**
 * The instance the feed was read from, inferred as the commonest host among
 * accounts with no `@` in their acct. Only used to name the local instance in
 * output — remote accounts carry their host explicitly.
 */
function guessLocalHost(subjects: Status[]): string {
  const counts = new Map<string, number>();
  for (const s of subjects) {
    if (isLocalAccount(s.account)) {
      const host = hostOf(s.account.url);
      if (host) {
        bump(counts, host);
      }
    }
  }
  return rank(counts, 1)[0]?.key ?? 'this server';
}

function analyzeComposition(
  posts: Status[],
  subjects: Status[],
  parsed: ParsedContent[],
): CompositionMetrics {
  const total = posts.length;
  const boosts = posts.filter((p) => p.reblog).length;
  const replies = subjects.filter((s) => s.in_reply_to_id).length;
  const lengths = subjects.map((s) => stripHtml(s.content).trim().length);
  const langs = new Map<string, number>();
  for (const s of subjects) {
    bump(langs, (s.language ?? 'und').toLowerCase());
  }

  return {
    total,
    original: total - boosts,
    boosts,
    replies,
    standalone: total - replies,
    withMedia: subjects.filter((s) => s.media_attachments.length > 0).length,
    withLinks: parsed.filter((p) => p.links.length > 0).length,
    withPolls: subjects.filter((s) => s.poll).length,
    withContentWarning: subjects.filter((s) => s.spoiler_text.trim().length > 0).length,
    languages: rank(langs, total),
    avgLength: Math.round(mean(lengths)),
    medianLength: Math.round(median(lengths)),
  };
}

/**
 * Who wrote the posts, ranked by how many they contributed. Exported because
 * "the accounts in this feed" is useful on its own — a hashtag or a synthetic
 * feed has no membership list, so its members *are* the people posting in it.
 * Reads through boosts, so a boosted post credits whoever wrote it.
 */
export function feedAuthors(posts: Status[]): AuthorRow[] {
  const total = posts.length;
  const byAuthor = new Map<string, { account: Account; count: number }>();
  for (const post of posts) {
    const author = feedSubject(post).account;
    const entry = byAuthor.get(author.id);
    if (entry) {
      entry.count += 1;
    } else {
      byAuthor.set(author.id, { account: author, count: 1 });
    }
  }
  return [...byAuthor.values()]
    .map((a) => ({ ...a, share: share(a.count, total) }))
    .sort((a, b) => b.count - a.count || a.account.acct.localeCompare(b.account.acct));
}

function analyzeAccounts(
  posts: Status[],
  subjects: Status[],
  viewer: FeedViewerContext,
): AccountMetrics {
  const total = posts.length;
  const authors = feedAuthors(posts);

  const topN = (n: number) =>
    authors.slice(0, n).reduce((sum, a) => sum + a.count, 0) / Math.max(1, total);

  const boosterCounts = new Map<string, { account: Account; count: number }>();
  for (const p of posts) {
    if (!p.reblog) {
      continue;
    }
    const entry = boosterCounts.get(p.account.id);
    if (entry) {
      entry.count += 1;
    } else {
      boosterCounts.set(p.account.id, { account: p.account, count: 1 });
    }
  }
  const boostTotal = posts.filter((p) => p.reblog).length;

  const following = viewer.followingIds;
  return {
    uniqueAuthors: authors.length,
    authors,
    postsPerAuthor: authors.length ? round1(total / authors.length) : 0,
    top5Share: topN(5),
    top10Share: topN(10),
    singletonAuthorShare: share(
      authors.filter((a) => a.count === 1).length,
      Math.max(1, authors.length),
    ),
    followedAuthors: following ? authors.filter((a) => following.has(a.account.id)).length : null,
    unfollowedAuthors: following
      ? authors.filter((a) => !following.has(a.account.id)).length
      : null,
    botAuthors: authors.filter((a) => a.account.bot).length,
    humanAuthors: authors.filter((a) => !a.account.bot).length,
    postsFromBots: subjects.filter((s) => s.account.bot).length,
    mutedOrFilteredPosts: posts.filter((p) => p.muted || (p.filtered?.length ?? 0) > 0).length,
    boosters: [...boosterCounts.values()]
      .map((b) => ({ ...b, share: share(b.count, Math.max(1, boostTotal)) }))
      .sort((a, b) => b.count - a.count),
  };
}

function analyzeInstances(subjects: Status[], localHost: string): InstanceMetrics {
  const total = subjects.length;
  const counts = new Map<string, number>();
  let local = 0;
  for (const s of subjects) {
    bump(counts, accountInstance(s.account, localHost));
    if (isLocalAccount(s.account)) {
      local += 1;
    }
  }
  const instances = rank(counts, total);
  return {
    uniqueInstances: instances.length,
    localPosts: local,
    remotePosts: total - local,
    instances,
    largestShare: instances[0]?.share ?? 0,
    diversityPer100: total ? round1((instances.length / total) * 100) : 0,
  };
}

/** A tag's usage: posts, and which authors produced them. */
interface TagUsage {
  count: number;
  authors: Map<string, { account: Account; count: number }>;
}

/** Share of a tag's posts one author must hold for the tag to count as theirs. */
const TAG_DOMINANCE = 0.8;
/** How many tags the co-occurrence scan considers, to keep it O(k²) on k small. */
const PAIR_TAG_LIMIT = 25;
/** Joins two tags into one map key. A space can't occur inside a hashtag. */
const PAIR_SEP = ' ';

function analyzeHashtags(subjects: Status[], parsed: ParsedContent[]): HashtagMetrics {
  const total = subjects.length;
  const usage = new Map<string, TagUsage>();
  const pairs = new Map<string, number>();
  let postsWith = 0;
  let tagUses = 0;

  subjects.forEach((s, i) => {
    const tags = parsed[i].hashtags;
    if (!tags.length) {
      return;
    }
    postsWith += 1;
    tagUses += tags.length;
    for (const tag of tags) {
      let entry = usage.get(tag);
      if (!entry) {
        entry = { count: 0, authors: new Map() };
        usage.set(tag, entry);
      }
      entry.count += 1;
      const author = entry.authors.get(s.account.id);
      if (author) {
        author.count += 1;
      } else {
        entry.authors.set(s.account.id, { account: s.account, count: 1 });
      }
    }
    const sorted = [...tags].sort().slice(0, PAIR_TAG_LIMIT);
    for (let a = 0; a < sorted.length; a++) {
      for (let b = a + 1; b < sorted.length; b++) {
        bump(pairs, sorted[a] + PAIR_SEP + sorted[b]);
      }
    }
  });

  const rows: HashtagRow[] = [...usage.entries()]
    .map(([key, entry]) => {
      const top = [...entry.authors.values()].sort((a, b) => b.count - a.count)[0];
      const dominated = top && top.count / entry.count >= TAG_DOMINANCE && entry.count > 1;
      return {
        key,
        count: entry.count,
        share: share(entry.count, total),
        authors: entry.authors.size,
        dominatedBy: dominated ? top.account : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    postsWithHashtags: postsWith,
    hashtagShare: share(postsWith, total),
    tags: rows,
    uniqueTags: rows.length,
    sharedTags: rows.filter((r) => r.authors > 1),
    dominatedTags: rows.filter((r) => r.dominatedBy),
    pairs: [...pairs.entries()]
      .map(([key, count]) => {
        const [a, b] = key.split(PAIR_SEP);
        return { a, b, count };
      })
      .filter((p) => p.count > 1)
      .sort((x, y) => y.count - x.count),
    topicDiversity: effectiveCategories(rows.map((r) => r.count)) || (tagUses ? 1 : 0),
  };
}

/** Minimum posts before an author can be called "link-heavy". */
const LINK_HEAVY_MIN_POSTS = 3;
/** Share of an author's posts that must carry links to earn the label. */
const LINK_HEAVY_SHARE = 0.6;

function analyzeLinks(subjects: Status[], parsed: ParsedContent[]): LinkMetrics {
  const total = subjects.length;
  const domainCounts = new Map<string, number>();
  const domainAuthors = new Map<string, Set<string>>();
  const urlCounts = new Map<string, number>();
  const urlAuthors = new Map<string, Set<string>>();
  const authorPosts = new Map<string, { account: Account; posts: number; linked: number }>();
  let postsWith = 0;
  let internal = 0;
  let external = 0;

  subjects.forEach((s, i) => {
    const { links, internalLinks } = parsed[i];
    internal += internalLinks.length;
    external += links.length;

    let stats = authorPosts.get(s.account.id);
    if (!stats) {
      stats = { account: s.account, posts: 0, linked: 0 };
      authorPosts.set(s.account.id, stats);
    }
    stats.posts += 1;
    if (!links.length) {
      return;
    }
    stats.linked += 1;
    postsWith += 1;

    for (const url of links) {
      const host = hostOf(url);
      if (host) {
        bump(domainCounts, host);
        (domainAuthors.get(host) ?? domainAuthors.set(host, new Set()).get(host)!).add(
          s.account.id,
        );
      }
      const normalized = url.split('#')[0];
      bump(urlCounts, normalized);
      (urlAuthors.get(normalized) ?? urlAuthors.set(normalized, new Set()).get(normalized)!).add(
        s.account.id,
      );
    }
  });

  const linkTotal = [...domainCounts.values()].reduce((sum, c) => sum + c, 0);
  const domains: DomainRow[] = rank(domainCounts, Math.max(1, linkTotal)).map((row) => ({
    ...row,
    authors: domainAuthors.get(row.key)?.size ?? 0,
  }));

  const repeatedUrls = [...urlCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, count, authors: urlAuthors.get(url)?.size ?? 1 }))
    .sort((a, b) => b.count - a.count);

  return {
    postsWithLinks: postsWith,
    linkShare: share(postsWith, total),
    domains,
    uniqueDomains: domains.length,
    repeatedUrls,
    crossAuthorUrls: repeatedUrls.filter((u) => u.authors > 1).length,
    linkHeavyAuthors: [...authorPosts.values()]
      .filter((a) => a.posts >= LINK_HEAVY_MIN_POSTS && a.linked / a.posts >= LINK_HEAVY_SHARE)
      .map((a) => ({ account: a.account, count: a.linked, share: a.linked / a.posts }))
      .sort((a, b) => b.count - a.count),
    internalLinks: internal,
    externalLinks: external,
  };
}

function analyzeMedia(subjects: Status[]): MediaMetrics {
  const total = subjects.length;
  const typeCounts = new Map<string, number>();
  const byAuthor = new Map<string, { account: Account; count: number }>();
  let postsWith = 0;
  let attachments = 0;
  let described = 0;
  let fullyDescribed = 0;

  for (const s of subjects) {
    const media = s.media_attachments;
    if (!media.length) {
      continue;
    }
    postsWith += 1;
    attachments += media.length;
    const withAlt = media.filter((m) => (m.description ?? '').trim().length > 0).length;
    described += withAlt;
    if (withAlt === media.length) {
      fullyDescribed += 1;
    }
    for (const m of media) {
      bump(typeCounts, m.type || 'unknown');
    }
    const entry = byAuthor.get(s.account.id);
    if (entry) {
      entry.count += media.length;
    } else {
      byAuthor.set(s.account.id, { account: s.account, count: media.length });
    }
  }

  return {
    postsWithMedia: postsWith,
    mediaShare: share(postsWith, total),
    attachments,
    byType: rank(typeCounts, Math.max(1, attachments)),
    described,
    undescribed: attachments - described,
    fullyDescribedShare: share(fullyDescribed, Math.max(1, postsWith)),
    topMediaAuthors: [...byAuthor.values()]
      .map((a) => ({ ...a, share: share(a.count, Math.max(1, attachments)) }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Total visible engagement on a post: favourites + boosts + replies. */
export function statusEngagement(status: Status): number {
  return status.favourites_count + status.reblogs_count + status.replies_count;
}

/** How many top posts the engagement section surfaces. */
const TOP_POST_LIMIT = 3;

function analyzeEngagement(
  posts: Status[],
  subjects: Status[],
  parsed: ParsedContent[],
): EngagementMetrics {
  const favs = subjects.map((s) => s.favourites_count);
  const boosts = subjects.map((s) => s.reblogs_count);
  const replies = subjects.map((s) => s.replies_count);
  const engagements = subjects.map(statusEngagement);

  const sliceFor = (label: string, keep: (i: number) => boolean): EngagementSlice => {
    const values = engagements.filter((_, i) => keep(i));
    return { label, posts: values.length, avgEngagement: round1(mean(values)) };
  };

  return {
    avgFavourites: round1(mean(favs)),
    medianFavourites: median(favs),
    avgBoosts: round1(mean(boosts)),
    medianBoosts: median(boosts),
    avgReplies: round1(mean(replies)),
    medianReplies: median(replies),
    topPosts: [...subjects]
      .sort((a, b) => statusEngagement(b) - statusEngagement(a))
      .slice(0, TOP_POST_LIMIT)
      .filter((s) => statusEngagement(s) > 0),
    slices: [
      sliceFor('Original posts', (i) => !posts[i].reblog),
      sliceFor('Boosted posts', (i) => !!posts[i].reblog),
      sliceFor('With media', (i) => subjects[i].media_attachments.length > 0),
      sliceFor('Text only', (i) => subjects[i].media_attachments.length === 0),
      sliceFor('With links', (i) => parsed[i].links.length > 0),
      sliceFor('No links', (i) => parsed[i].links.length === 0),
      sliceFor('Behind a CW', (i) => subjects[i].spoiler_text.trim().length > 0),
      sliceFor('No CW', (i) => subjects[i].spoiler_text.trim().length === 0),
    ].filter((s) => s.posts > 0),
    zeroEngagementShare: share(
      engagements.filter((e) => e === 0).length,
      Math.max(1, engagements.length),
    ),
  };
}

/** Conversations of at least this many sampled posts count as a long chain. */
const LONG_CHAIN_POSTS = 4;

/**
 * Group the sample into conversations using only `in_reply_to_id`. Posts whose
 * parent is also in the sample join it; a post replying to something outside
 * the sample is grouped with its (unseen) parent, so two sampled replies to the
 * same absent post are correctly recognised as one conversation. This is a
 * union-find over ids, and deliberately never fetches a status context.
 */
function analyzeConversations(posts: Status[], subjects: Status[]): ConversationMetrics {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    let walk = id;
    while (parent.get(walk) !== undefined && parent.get(walk) !== walk) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const add = (id: string) => {
    if (!parent.has(id)) {
      parent.set(id, id);
    }
  };
  const union = (a: string, b: string) => {
    add(a);
    add(b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  };

  for (const s of subjects) {
    add(s.id);
    if (s.in_reply_to_id) {
      union(s.id, s.in_reply_to_id);
    }
  }

  const groups = new Map<string, { posts: number; authors: Map<string, AuthorRow> }>();
  for (const s of subjects) {
    const root = find(s.id);
    let group = groups.get(root);
    if (!group) {
      group = { posts: 0, authors: new Map() };
      groups.set(root, group);
    }
    group.posts += 1;
    const author = group.authors.get(s.account.id);
    if (author) {
      author.count += 1;
    } else {
      group.authors.set(s.account.id, { account: s.account, count: 1, share: 0 });
    }
  }

  const total = subjects.length;
  const multi = [...groups.values()].filter((g) => g.posts > 1);
  const longChainPosts = [...groups.values()]
    .filter((g) => g.posts >= LONG_CHAIN_POSTS)
    .reduce((sum, g) => sum + g.posts, 0);

  const participants = new Map<string, AuthorRow>();
  for (const group of multi) {
    for (const author of group.authors.values()) {
      const entry = participants.get(author.account.id);
      if (entry) {
        entry.count += author.count;
      } else {
        participants.set(author.account.id, { ...author });
      }
    }
  }
  const participantTotal = [...participants.values()].reduce((sum, p) => sum + p.count, 0);
  const replies = subjects.filter((s) => s.in_reply_to_id).length;

  return {
    replies,
    replyShare: share(replies, Math.max(1, total)),
    distinctConversations: groups.size,
    multiPostConversations: multi.length,
    avgPostsPerConversation: groups.size ? round1(total / groups.size) : 0,
    topParticipants: [...participants.values()]
      .map((p) => ({ ...p, share: share(p.count, Math.max(1, participantTotal)) }))
      .sort((a, b) => b.count - a.count),
    longChainShare: share(longChainPosts, Math.max(1, total)),
  };
}

const DAY_LABEL_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

function analyzeRecency(subjects: Status[], now: number): RecencyMetrics {
  const times = subjects.map((s) => new Date(s.created_at).getTime()).sort((a, b) => a - b);
  if (!times.length) {
    return {
      newestAgeHours: 0,
      oldestAgeHours: 0,
      medianAgeHours: 0,
      spanHours: 0,
      byHour: new Array(24).fill(0),
      byDay: [],
      bursts: 0,
      burstAuthors: [],
      busiestHourShare: 0,
    };
  }

  const ages = times.map((t) => (now - t) / MS_PER_HOUR);
  const byHour = new Array<number>(24).fill(0);
  const byDayCounts = new Map<string, number>();
  for (const s of subjects) {
    const d = new Date(s.created_at);
    byHour[d.getHours()] += 1;
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    bump(byDayCounts, key);
  }

  // Bursts: slide a window over the chronological times; every window that
  // opens on a post and holds enough of them counts once, then we skip past it
  // so one flurry isn't reported as N overlapping bursts.
  const windowMs = BURST_WINDOW_MIN * 60_000;
  const chronological = [...subjects].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  let bursts = 0;
  const burstCounts = new Map<string, { account: Account; count: number }>();
  for (let i = 0; i < chronological.length; ) {
    const start = new Date(chronological[i].created_at).getTime();
    let end = i;
    while (
      end + 1 < chronological.length &&
      new Date(chronological[end + 1].created_at).getTime() - start <= windowMs
    ) {
      end += 1;
    }
    const size = end - i + 1;
    if (size >= BURST_MIN_POSTS) {
      bursts += 1;
      const inWindow = new Map<string, number>();
      for (let k = i; k <= end; k++) {
        bump(inWindow, chronological[k].account.id);
      }
      for (let k = i; k <= end; k++) {
        const account = chronological[k].account;
        if ((inWindow.get(account.id) ?? 0) < 2) {
          continue;
        }
        const entry = burstCounts.get(account.id);
        if (entry) {
          entry.count += 1;
        } else {
          burstCounts.set(account.id, { account, count: 1 });
        }
      }
      i = end + 1;
    } else {
      i += 1;
    }
  }

  const busiest = Math.max(...byHour);
  const spanHours = (times[times.length - 1] - times[0]) / MS_PER_HOUR;
  const burstTotal = [...burstCounts.values()].reduce((sum, b) => sum + b.count, 0);

  return {
    newestAgeHours: round1(Math.min(...ages)),
    oldestAgeHours: round1(Math.max(...ages)),
    medianAgeHours: round1(median(ages)),
    spanHours: round1(spanHours),
    byHour,
    byDay:
      spanHours >= 24
        ? [...byDayCounts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dayIso, posts]) => ({
              dayIso,
              label: new Date(dayIso).toLocaleDateString([], DAY_LABEL_OPTS),
              posts,
            }))
        : [],
    bursts,
    burstAuthors: [...burstCounts.values()]
      .map((b) => ({ ...b, share: share(b.count, Math.max(1, burstTotal)) }))
      .sort((a, b) => b.count - a.count),
    busiestHourShare: share(busiest, Math.max(1, subjects.length)),
  };
}

function concentrationRow(label: string, rows: { key: string; count: number }[]): ConcentrationRow {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return {
    label,
    largest: rows[0]?.key ?? '—',
    largestShare: share(rows[0]?.count ?? 0, Math.max(1, total)),
    effectiveCount: effectiveCategories(rows.map((r) => r.count)),
    categories: rows.length,
  };
}

function analyzeConcentration(
  composition: CompositionMetrics,
  accounts: AccountMetrics,
  instances: InstanceMetrics,
  hashtags: HashtagMetrics,
  links: LinkMetrics,
): ConcentrationRow[] {
  const contentTypes = [
    { key: 'Media', count: composition.withMedia },
    { key: 'Links', count: composition.withLinks },
    { key: 'Polls', count: composition.withPolls },
    {
      key: 'Plain text',
      count: Math.max(
        0,
        composition.total - composition.withMedia - composition.withLinks - composition.withPolls,
      ),
    },
  ].filter((row) => row.count > 0);

  return [
    concentrationRow(
      'Authors',
      accounts.authors.map((a) => ({ key: a.account.acct, count: a.count })),
    ),
    concentrationRow('Instances', instances.instances),
    concentrationRow('Hashtags', hashtags.tags),
    concentrationRow('Domains', links.domains),
    concentrationRow('Languages', composition.languages),
    concentrationRow('Content types', contentTypes),
  ].filter((row) => row.categories > 0);
}

/**
 * Turn the numbers into a handful of sentences a human would actually say.
 * Only genuinely notable facts qualify — a feed with no concentration, no
 * media problem and healthy engagement should produce few or none.
 */
function buildHighlights(report: {
  composition: CompositionMetrics;
  accounts: AccountMetrics;
  instances: InstanceMetrics;
  hashtags: HashtagMetrics;
  links: LinkMetrics;
  media: MediaMetrics;
  engagement: EngagementMetrics;
  conversations: ConversationMetrics;
}): string[] {
  const { composition, accounts, instances, hashtags, links, media, engagement, conversations } =
    report;
  const out: string[] = [];
  if (!composition.total) {
    return out;
  }

  if (accounts.top5Share >= 0.3 && accounts.uniqueAuthors > 5) {
    out.push(
      `${Math.min(5, accounts.uniqueAuthors)} accounts produced ${pct(accounts.top5Share)}% of this feed.`,
    );
  }
  if (instances.uniqueInstances > 1 && instances.instances.slice(0, 3).length === 3) {
    const topThree = instances.instances.slice(0, 3).reduce((sum, i) => sum + i.share, 0);
    if (topThree >= 0.6) {
      out.push(`Most posts came from three instances.`);
    }
  } else if (instances.largestShare >= 0.6) {
    out.push(`${pct(instances.largestShare)}% of posts came from ${instances.instances[0].key}.`);
  }
  if (conversations.replyShare > 0.5) {
    out.push('This feed is primarily replies rather than standalone posts.');
  }
  if (media.mediaShare >= 0.25 && media.undescribed > 0) {
    out.push(
      `Media is common, but ${pct(share(media.undescribed, media.attachments))}% of media attachments lack descriptions.`,
    );
  }
  if (links.domains.length >= 2) {
    const topTwo = links.domains.slice(0, 2).reduce((sum, d) => sum + d.share, 0);
    if (topTwo >= 0.5) {
      out.push(`Links to two domains account for half of all shared links.`);
    }
  }
  if (hashtags.dominatedTags.length) {
    const worst = hashtags.dominatedTags[0];
    out.push(`#${worst.key} is dominated by one author, @${worst.dominatedBy!.acct}.`);
  }
  if (engagement.zeroEngagementShare >= 0.5) {
    out.push(
      `Only ${100 - pct(engagement.zeroEngagementShare)}% of sampled posts have any visible engagement.`,
    );
  }
  if (accounts.postsFromBots >= composition.total * 0.2) {
    out.push(`${pct(share(accounts.postsFromBots, composition.total))}% of posts came from bots.`);
  }
  return out;
}
