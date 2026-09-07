/**
 * Pure client-side refinement over Bluesky results we've *already* fetched — the
 * Bluesky analogue of `account-refine.ts` and `search-refine.ts`. Nothing here
 * makes an API call; it narrows and reshapes what is already in memory.
 *
 * This module exists because Bluesky's search endpoints are far thinner than
 * Mastodon's. `app.bsky.actor.searchActors` takes a bare query and no
 * parameters at all, and `app.bsky.feed.searchPosts` has no media / reply /
 * sensitive filters. So every refinement Mastodon expresses as search criteria
 * has to happen here instead, over the pages the budgeted auto-fill loaded.
 *
 * Two things follow from that constraint, and they pull in opposite directions:
 *
 *  - Some Mastodon facets simply have no Bluesky counterpart, and are omitted
 *    rather than faked. `bot` and `locked` are the clearest: AT Protocol has
 *    neither concept, `adaptProfile` hardcodes both to false, and a facet whose
 *    every value is identical tells the reader nothing.
 *
 *  - Bluesky carries data Mastodon's search results don't, and refusing to use
 *    it would be a strange kind of parity. Handles are domains; posts arrive
 *    with their like/repost/reply counts already attached; the record says
 *    whether a post is a direct reply or buried in a thread; embeds name the
 *    site being linked. Those become facets here that the Mastodon page has no
 *    way to offer.
 *
 * Counts always mean "loaded results matching this value" — never a server
 * total. That is the same contract `buildFacets` documents, and it matters more
 * here, because on Bluesky the loaded set is all we will ever be able to filter.
 */

import { Account, Status } from '../../models';
import { BskyRef } from '../../providers/bluesky/bluesky-types';
import { AccountFacetValue } from './account-refine';
import { NumericRange } from './mawkingbird-search';

// Labels here are translation keys, not English — see `account-refine.ts` for
// the shared activity/count ladders and the "indirect keys" idiom they follow.
// i18n pages.search.activity.notChecked: Not checked
// i18n pages.search.facet.handle: Handle
// i18n pages.search.facet.defaultHandle: bsky.social
// i18n pages.search.facet.customDomain: Custom domain
// i18n pages.search.facet.customDomainHint: Custom domains are self-hosted handles.
// i18n pages.search.facet.handleDomain: Handle domain
// i18n pages.search.facet.likes: Likes
// i18n pages.search.facet.reposts: Reposts
// i18n pages.search.facet.replies: Replies
// i18n pages.search.facet.threadPosition: Thread position
// i18n pages.search.thread.top: Top-level posts
// i18n pages.search.thread.direct: Replies to the thread
// i18n pages.search.thread.deep: Deeper in a thread
// i18n pages.search.facet.altText: Alt text
// i18n pages.search.facet.altTextHint: Counts only posts with images.
// i18n pages.search.facet.hasAltText: Has alt text
// i18n pages.search.facet.missingAltText: Missing alt text
// i18n pages.search.facet.quotePosts: Quote posts
// i18n pages.search.facet.notQuoting: Not quoting
// i18n pages.search.facet.linksTo: Links to
// i18n pages.search.count.none: None
// i18n pages.search.count.1to9: 1 – 9
// i18n pages.search.count.10to99: 10 – 99
// i18n pages.search.count.100to999: 100 – 999
// i18n pages.search.count.1kPlus: 1k+

/** Bluesky's default handle suffix — anything else is a custom domain. */
const DEFAULT_HANDLE_DOMAIN = 'bsky.social';

/**
 * The domain part of a Bluesky handle.
 *
 * A handle *is* a domain (`alice.bsky.social`, `mozilla.org`), so unlike
 * Mastodon's `user@host` there is no separator to split on. The first label is
 * the name and the rest is the domain — except for a bare two-label custom
 * handle like `mozilla.org`, where the handle is the domain itself and dropping
 * the first label would leave the meaningless `org`.
 */
export function handleDomain(handle: string): string {
  const clean = handle.trim().toLowerCase().replace(/^@/, '');
  if (!clean) {
    return '';
  }
  const labels = clean.split('.');
  if (labels.length <= 2) {
    // `mozilla.org` — the handle is the domain.
    return clean;
  }
  return labels.slice(1).join('.');
}

/** True when the handle sits under Bluesky's default domain. */
export function isDefaultHandle(handle: string): boolean {
  const domain = handleDomain(handle);
  return domain === DEFAULT_HANDLE_DOMAIN || domain.endsWith(`.${DEFAULT_HANDLE_DOMAIN}`);
}

// ---------------------------------------------------------------------------
// Account facets
// ---------------------------------------------------------------------------

/**
 * The account facet kinds Bluesky can actually populate.
 *
 * `followers` / `statuses` / `activity` mirror the Mastodon ladders exactly and
 * deliberately reuse their buckets, so a reader moving between networks reads
 * the same rows. `handleType` and `handleDomain` are Bluesky-only.
 */
export type BlueskyAccountFacetKind =
  | 'handleType'
  | 'handleDomain'
  | 'followers'
  | 'statuses'
  | 'activity';

export interface BlueskyAccountFacet {
  kind: BlueskyAccountFacetKind;
  labelKey: string;
  values: AccountFacetValue[];
  /** Show every row rather than truncating — see `AccountFacet.showAll`. */
  showAll?: boolean;
  /** A short line explaining a facet whose meaning isn't self-evident. */
  hint?: string;
}

interface Bucket {
  key: string;
  labelKey: string;
  test: (n: number) => boolean;
}

/** Shared with the Mastodon account ladders so the rows read identically. */
const COUNT_BUCKETS: Bucket[] = [
  { key: '0-99', labelKey: 'pages.search.count.under100', test: (n) => n < 100 },
  { key: '100-999', labelKey: 'pages.search.count.100to1k', test: (n) => n >= 100 && n < 1_000 },
  {
    key: '1000-9999',
    labelKey: 'pages.search.count.1kTo10k',
    test: (n) => n >= 1_000 && n < 10_000,
  },
  { key: '10000+', labelKey: 'pages.search.count.10kPlus', test: (n) => n >= 10_000 },
];

function bucketFor(n: number, buckets: Bucket[]): Bucket {
  return buckets.find((b) => b.test(n)) ?? buckets[buckets.length - 1];
}

const DAY_MS = 86_400_000;

interface ActivityBin {
  key: string;
  labelKey: string;
  withinDays: number;
}

/** The same ladder `account-refine.ts` uses, for the same reasons. */
const ACTIVITY_BINS: readonly ActivityBin[] = [
  { key: 'd1', labelKey: 'pages.search.activity.today', withinDays: 1 },
  { key: 'd7', labelKey: 'pages.search.activity.thisWeek', withinDays: 7 },
  { key: 'd30', labelKey: 'pages.search.activity.thisMonth', withinDays: 30 },
  { key: 'd90', labelKey: 'pages.search.activity.last3Months', withinDays: 90 },
  { key: 'd180', labelKey: 'pages.search.activity.last6Months', withinDays: 180 },
  { key: 'd365', labelKey: 'pages.search.activity.lastYear', withinDays: 365 },
  { key: 'd730', labelKey: 'pages.search.activity.oneToTwoYears', withinDays: 730 },
  { key: 'older', labelKey: 'pages.search.activity.overTwoYears', withinDays: Infinity },
];

/**
 * Where accounts land before the activity scan has run.
 *
 * On Mastodon this bin is a rare edge case, because search returns
 * `last_status_at` on every account. On Bluesky it is the *starting* state for
 * everyone: `profileViewDetailed` carries no last-post date, and finding one
 * costs a `getAuthorFeed` call per account. So the facet is absent until the
 * reader spends budget on it, and whatever the scan couldn't reach stays here
 * rather than being quietly dropped or optimistically dated.
 */
const UNKNOWN_ACTIVITY: ActivityBin = {
  key: 'unknown',
  labelKey: 'pages.search.activity.notChecked',
  withinDays: Infinity,
};

function daysSinceActivity(account: Account, now: number): number | null {
  const last = account.last_status_at;
  if (!last) {
    return null;
  }
  const parsed = Date.parse(last);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, (now - parsed) / DAY_MS);
}

function activityBinFor(account: Account, now: number): ActivityBin {
  const days = daysSinceActivity(account, now);
  if (days === null) {
    return UNKNOWN_ACTIVITY;
  }
  return ACTIVITY_BINS.find((b) => days < b.withinDays) ?? ACTIVITY_BINS[ACTIVITY_BINS.length - 1];
}

function tallyValues(
  items: readonly Account[],
  pick: (a: Account) => { value: string; labelKey: string | null; text?: string } | null,
): AccountFacetValue[] {
  const counts = new Map<string, AccountFacetValue>();
  for (const a of items) {
    const hit = pick(a);
    if (!hit?.value) {
      continue;
    }
    const existing = counts.get(hit.value);
    if (existing) {
      existing.count++;
    } else {
      counts.set(hit.value, {
        value: hit.value,
        labelKey: hit.labelKey,
        text: hit.text,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function bucketValues(
  items: readonly Account[],
  buckets: Bucket[],
  pick: (a: Account) => number,
): AccountFacetValue[] {
  const counts = new Map<string, number>();
  for (const a of items) {
    const b = bucketFor(pick(a), buckets);
    counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
  }
  // Count buckets keep their natural small→large order, not popularity order.
  return buckets
    .filter((b) => counts.has(b.key))
    .map((b) => ({ value: b.key, labelKey: b.labelKey, count: counts.get(b.key)! }));
}

/**
 * Facets over loaded Bluesky accounts.
 *
 * Populated facets remain visible even when every result shares a value.
 * The activity facet stays hidden until at least one
 * account has a known date, so it doesn't appear as a lone "Not checked" row
 * before the scan runs.
 */
export function buildBlueskyAccountFacets(
  accounts: readonly Account[],
  now: number = Date.now(),
): BlueskyAccountFacet[] {
  if (!accounts.length) {
    return [];
  }

  const facets: BlueskyAccountFacet[] = [];
  const push = (
    kind: BlueskyAccountFacetKind,
    labelKey: string,
    values: AccountFacetValue[],
    extra: Partial<BlueskyAccountFacet> = {},
  ): void => {
    if (values.length > 0) {
      facets.push({ kind, labelKey, values, ...extra });
    }
  };

  // Bluesky-only: a custom domain costs money and DNS setup, so it separates
  // invested accounts (and organisations, whose handle *is* their website) from
  // the default-signup crowd. There is no Mastodon equivalent — every Mastodon
  // handle carries its server's domain whether the user chose it or not.
  push(
    'handleType',
    'pages.search.facet.handle',
    tallyValues(accounts, (a) =>
      isDefaultHandle(a.acct)
        ? { value: 'default', labelKey: 'pages.search.facet.defaultHandle' }
        : { value: 'custom', labelKey: 'pages.search.facet.customDomain' },
    ),
    { hint: 'pages.search.facet.customDomainHint' },
  );

  // The per-domain breakdown, which groups colleagues at a shared domain.
  push(
    'handleDomain',
    'pages.search.facet.handleDomain',
    tallyValues(accounts, (a) => {
      // A domain is data, identical in every language — see account-refine.
      const d = handleDomain(a.acct);
      return d ? { value: d, labelKey: null, text: d } : null;
    }),
  );

  push(
    'followers',
    'pages.search.facet.followers',
    bucketValues(accounts, COUNT_BUCKETS, (a) => a.followers_count),
  );
  push(
    'statuses',
    'pages.search.facet.posts',
    bucketValues(accounts, COUNT_BUCKETS, (a) => a.statuses_count),
  );

  const known = accounts.some((a) => !!a.last_status_at);
  if (known) {
    const counts = new Map<string, number>();
    for (const a of accounts) {
      const bin = activityBinFor(a, now);
      counts.set(bin.key, (counts.get(bin.key) ?? 0) + 1);
    }
    const values = [...ACTIVITY_BINS, UNKNOWN_ACTIVITY]
      .filter((b) => counts.has(b.key))
      .map((b) => ({ value: b.key, labelKey: b.labelKey, count: counts.get(b.key)! }));
    push('activity', 'pages.search.facet.lastActive', values, { showAll: true });
  }

  return facets;
}

/** Does an account match a chosen facet value? Mirrors the builder above. */
export function blueskyAccountMatchesFacet(
  a: Account,
  kind: BlueskyAccountFacetKind,
  value: string,
  now: number = Date.now(),
): boolean {
  switch (kind) {
    case 'handleType':
      return value === 'default' ? isDefaultHandle(a.acct) : !isDefaultHandle(a.acct);
    case 'handleDomain':
      return handleDomain(a.acct) === value;
    case 'followers':
      return bucketFor(a.followers_count, COUNT_BUCKETS).key === value;
    case 'statuses':
      return bucketFor(a.statuses_count, COUNT_BUCKETS).key === value;
    case 'activity':
      return activityBinFor(a, now).key === value;
  }
}

// ---------------------------------------------------------------------------
// Post facets — the Bluesky-only half
// ---------------------------------------------------------------------------

/**
 * Post facet kinds with no Mastodon search counterpart.
 *
 * `engagement*` exist because Bluesky returns like/repost/reply counts on every
 * search result, so "show me the posts that landed" is answerable without a
 * second call. `altText` is an accessibility signal and a decent proxy for care
 * taken. `quote` and `linkDomain` read embeds. `threadPosition` is finer than
 * Mastodon's binary is:reply — the record distinguishes a reply to the thread
 * starter from one buried six deep, which is the difference between a
 * conversation and a pile-on.
 */
export type BlueskyPostFacetKind =
  | 'likes'
  | 'reposts'
  | 'replyCount'
  | 'altText'
  | 'quote'
  | 'linkDomain'
  | 'threadPosition';

export interface BlueskyPostFacet {
  kind: BlueskyPostFacetKind;
  labelKey: string;
  values: AccountFacetValue[];
  hint?: string;
}

/**
 * Engagement ladder.
 *
 * Starts with an explicit zero bucket because "nobody engaged at all" is the
 * single most useful cut on a busy search, and folding it into "< 10" would
 * hide it. The upper bounds are decimal rather than tuned to any corpus, for
 * the same reason the activity bins are a fixed ladder: readable labels beat
 * perfectly balanced ones.
 */
const ENGAGEMENT_BUCKETS: Bucket[] = [
  { key: '0', labelKey: 'pages.search.count.none', test: (n) => n <= 0 },
  { key: '1-9', labelKey: 'pages.search.count.1to9', test: (n) => n < 10 },
  { key: '10-99', labelKey: 'pages.search.count.10to99', test: (n) => n < 100 },
  { key: '100-999', labelKey: 'pages.search.count.100to999', test: (n) => n < 1_000 },
  { key: '1000+', labelKey: 'pages.search.count.1kPlus', test: () => true },
];

function bskyRef(s: Status): BskyRef | null {
  return s.provider === 'bluesky' ? (s.providerRef as BskyRef | null) : null;
}

/** Where a post sits in its thread. */
export type ThreadPosition = 'top' | 'direct' | 'deep';

/**
 * Top-level post, a direct reply to the thread starter, or deeper in.
 *
 * Read off the record's own refs: no reply block means top-level, and a parent
 * equal to the root means the post replies to the thread starter itself.
 * Anything else is further down. Falls back to the Mastodon-shaped
 * `in_reply_to_id` when the raw refs aren't present, so a post that reached us
 * some other way still classifies as reply-or-not rather than throwing.
 */
export function threadPosition(s: Status): ThreadPosition {
  const ref = bskyRef(s);
  if (!ref) {
    return s.in_reply_to_id ? 'direct' : 'top';
  }
  if (!ref.replyParentUri) {
    return 'top';
  }
  return ref.replyParentUri === ref.replyRoot.uri ? 'direct' : 'deep';
}

const THREAD_LABELS: Record<ThreadPosition, string> = {
  top: 'pages.search.thread.top',
  direct: 'pages.search.thread.direct',
  deep: 'pages.search.thread.deep',
};

/** Registrable-ish domain of a url, with `www.` dropped. Null when unparseable. */
export function linkDomain(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** True when the post carries at least one image and every image has alt text. */
function altTextState(s: Status): { value: string; labelKey: string } | null {
  const media = s.media_attachments ?? [];
  if (!media.length) {
    // Text-only posts aren't "missing" alt text; they'd swamp the facet.
    return null;
  }
  const described = media.every((m) => !!m.description?.trim());
  return described
    ? { value: 'yes', labelKey: 'pages.search.facet.hasAltText' }
    : { value: 'no', labelKey: 'pages.search.facet.missingAltText' };
}

function tallyStatuses(
  statuses: readonly Status[],
  pick: (s: Status) => { value: string; labelKey: string | null; text?: string } | null,
): AccountFacetValue[] {
  const counts = new Map<string, AccountFacetValue>();
  for (const s of statuses) {
    const hit = pick(s);
    if (!hit?.value) {
      continue;
    }
    const existing = counts.get(hit.value);
    if (existing) {
      existing.count++;
    } else {
      counts.set(hit.value, {
        value: hit.value,
        labelKey: hit.labelKey,
        text: hit.text,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function bucketStatuses(
  statuses: readonly Status[],
  pick: (s: Status) => number,
): AccountFacetValue[] {
  const counts = new Map<string, number>();
  for (const s of statuses) {
    const b = bucketFor(pick(s), ENGAGEMENT_BUCKETS);
    counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
  }
  return ENGAGEMENT_BUCKETS.filter((b) => counts.has(b.key)).map((b) => ({
    value: b.key,
    labelKey: b.labelKey,
    count: counts.get(b.key)!,
  }));
}

/**
 * The Bluesky-only post facets, to be rendered *after* the shared ones from
 * `buildFacets` (language / author / media / type). Single-valued facets remain
 * visible, as with the shared facets.
 */
export function buildBlueskyPostFacets(statuses: readonly Status[]): BlueskyPostFacet[] {
  if (!statuses.length) {
    return [];
  }

  const facets: BlueskyPostFacet[] = [];
  const push = (
    kind: BlueskyPostFacetKind,
    labelKey: string,
    values: AccountFacetValue[],
    hint?: string,
  ): void => {
    if (values.length > 0) {
      facets.push({ kind, labelKey, values, ...(hint ? { hint } : {}) });
    }
  };

  push(
    'likes',
    'pages.search.facet.likes',
    bucketStatuses(statuses, (s) => s.favourites_count),
  );
  push(
    'reposts',
    'pages.search.facet.reposts',
    bucketStatuses(statuses, (s) => s.reblogs_count),
  );
  push(
    'replyCount',
    'pages.search.facet.replies',
    bucketStatuses(statuses, (s) => s.replies_count),
  );

  push(
    'threadPosition',
    'pages.search.facet.threadPosition',
    tallyStatuses(statuses, (s) => {
      const pos = threadPosition(s);
      return { value: pos, labelKey: THREAD_LABELS[pos] };
    }),
  );

  push(
    'altText',
    'pages.search.facet.altText',
    tallyStatuses(statuses, altTextState),
    'pages.search.facet.altTextHint',
  );

  push(
    'quote',
    'pages.search.facet.quotePosts',
    tallyStatuses(statuses, (s) =>
      s.quote
        ? { value: 'yes', labelKey: 'pages.search.facet.quotePosts' }
        : { value: 'no', labelKey: 'pages.search.facet.notQuoting' },
    ),
  );

  push(
    'linkDomain',
    'pages.search.facet.linksTo',
    tallyStatuses(statuses, (s) => {
      const d = linkDomain(bskyRef(s)?.externalUri);
      return d ? { value: d, labelKey: null, text: d } : null;
    }),
  );

  return facets;
}

/** Does a status match a chosen Bluesky-only facet value? Mirrors the builder. */
export function blueskyPostMatchesFacet(
  s: Status,
  kind: BlueskyPostFacetKind,
  value: string,
): boolean {
  switch (kind) {
    case 'likes':
      return bucketFor(s.favourites_count, ENGAGEMENT_BUCKETS).key === value;
    case 'reposts':
      return bucketFor(s.reblogs_count, ENGAGEMENT_BUCKETS).key === value;
    case 'replyCount':
      return bucketFor(s.replies_count, ENGAGEMENT_BUCKETS).key === value;
    case 'threadPosition':
      return threadPosition(s) === value;
    case 'altText':
      return altTextState(s)?.value === value;
    case 'quote':
      return value === 'yes' ? !!s.quote : !s.quote;
    case 'linkDomain':
      return linkDomain(bskyRef(s)?.externalUri) === value;
  }
}

// ---------------------------------------------------------------------------
// Numeric gates
// ---------------------------------------------------------------------------

/**
 * Minimum-engagement gates, applied together (AND).
 *
 * The precise counterpart to the clickable buckets, mirroring the account
 * numeric bounds on the Mastodon side. These are minimums rather than ranges
 * because the question people actually ask is "hide the posts nobody reacted
 * to" — an upper bound on likes has no equivalent use.
 */
export interface BlueskyEngagementBounds {
  minLikes?: number;
  minReposts?: number;
  minReplies?: number;
}

function atLeast(value: number, min: number | undefined): boolean {
  return min == null || value >= min;
}

/** True when every set minimum accepts this status. */
export function statusMeetsEngagement(s: Status, bounds: BlueskyEngagementBounds): boolean {
  return (
    atLeast(s.favourites_count, bounds.minLikes) &&
    atLeast(s.reblogs_count, bounds.minReposts) &&
    atLeast(s.replies_count, bounds.minReplies)
  );
}

/** Account-side numeric gates, reusing the shared range shape. */
export interface BlueskyAccountBounds {
  followers?: NumericRange;
  following?: NumericRange;
  posts?: NumericRange;
}

function inRange(value: number, range: NumericRange | undefined): boolean {
  if (!range) {
    return true;
  }
  if (range.min != null && value < range.min) {
    return false;
  }
  if (range.max != null && value > range.max) {
    return false;
  }
  return true;
}

/** True when every set account gate accepts this account. */
export function accountMeetsBounds(a: Account, bounds: BlueskyAccountBounds): boolean {
  return (
    inRange(a.followers_count, bounds.followers) &&
    inRange(a.following_count, bounds.following) &&
    inRange(a.statuses_count, bounds.posts)
  );
}
