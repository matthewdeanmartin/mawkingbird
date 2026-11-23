import { Account } from '../platform/api/models';
import { lifetimePostsPerDay } from './effective-audience';

/**
 * "Who is my audience?" — the shape of a follower or following list, from the
 * fields already on each `Account` the list endpoints return.
 *
 * Like {@link ./effective-audience}, this costs nothing beyond the paging the
 * audience scan already does: it is tallied page by page and merged, so a
 * 16,000-account list never sits in memory. It cannot say when people are
 * online or what language they read — an `Account` carries neither — so those
 * come from the people who interact instead (Sprint 3).
 */

const DAY = 86_400_000;

/** Account-size tiers by the account's own follower count. */
export type SizeTier = 'small' | 'regular' | 'large' | 'big';
export const SIZE_TIERS: readonly SizeTier[] = ['small', 'regular', 'large', 'big'];
/** Lower bounds of each tier: under 50, 50–499, 500–4,999, 5,000+. */
export const SIZE_TIER_FLOORS: Record<SizeTier, number> = {
  small: 0,
  regular: 50,
  large: 500,
  big: 5000,
};

/** Account age by `created_at`: under 90 days, 90 days–1 year, 1–3 years, 3+. */
export type AgeBand = 'new' | 'underYear' | 'oneToThree' | 'overThree' | 'unknown';
export const AGE_BANDS: readonly AgeBand[] = [
  'new',
  'underYear',
  'oneToThree',
  'overThree',
  'unknown',
];

/** Lifetime posts per day: under 0.1, 0.1–1, 1–5, 5+, or too young / unknown. */
export type CadenceBand = 'drizzle' | 'light' | 'regular' | 'heavy' | 'unknown';
export const CADENCE_BANDS: readonly CadenceBand[] = [
  'drizzle',
  'light',
  'regular',
  'heavy',
  'unknown',
];

export interface CompositionTally {
  scanned: number;
  /** Accounts per server host. */
  servers: Record<string, number>;
  tiers: Record<SizeTier, number>;
  /** Accounts with no usable follower count. */
  tierUnknown: number;
  /** Accounts flagged as automated (`bot`). */
  bots: number;
  /** Group accounts (`group`). */
  groups: number;
  age: Record<AgeBand, number>;
  cadence: Record<CadenceBand, number>;
}

export function emptyComposition(): CompositionTally {
  return {
    scanned: 0,
    servers: {},
    tiers: { small: 0, regular: 0, large: 0, big: 0 },
    tierUnknown: 0,
    bots: 0,
    groups: 0,
    age: { new: 0, underYear: 0, oneToThree: 0, overThree: 0, unknown: 0 },
    cadence: { drizzle: 0, light: 0, regular: 0, heavy: 0, unknown: 0 },
  };
}

/**
 * The server an account lives on.
 *
 * `acct` is `user@host` for remote accounts and a bare `user` for accounts on
 * the server that answered the request, so the bare case falls back to the
 * profile URL's host. Lowercased, because hosts are case-insensitive and
 * `Mastodon.Social` must not split a server in two.
 */
export function hostOf(account: Pick<Account, 'acct' | 'url'>): string | null {
  const at = account.acct?.indexOf('@') ?? -1;
  if (at >= 0) {
    return account.acct.slice(at + 1).toLowerCase() || null;
  }
  try {
    return account.url ? new URL(account.url).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function sizeTier(followers: number): SizeTier {
  if (followers >= SIZE_TIER_FLOORS.big) return 'big';
  if (followers >= SIZE_TIER_FLOORS.large) return 'large';
  if (followers >= SIZE_TIER_FLOORS.regular) return 'regular';
  return 'small';
}

export function ageBand(account: Pick<Account, 'created_at'>, now: number): AgeBand {
  const joined = account.created_at ? Date.parse(account.created_at) : NaN;
  if (Number.isNaN(joined)) return 'unknown';
  const days = (now - joined) / DAY;
  if (days < 90) return 'new';
  if (days < 365) return 'underYear';
  if (days < 3 * 365) return 'oneToThree';
  return 'overThree';
}

export function cadenceBand(account: Account, now: number): CadenceBand {
  const rate = lifetimePostsPerDay(account, now);
  if (rate === null) return 'unknown';
  if (rate < 0.1) return 'drizzle';
  if (rate < 1) return 'light';
  if (rate < 5) return 'regular';
  return 'heavy';
}

/** Tally a batch of accounts. Pure; merge batches with {@link mergeComposition}. */
export function tallyComposition(accounts: Account[], now: number = Date.now()): CompositionTally {
  const t = emptyComposition();
  for (const account of accounts) {
    t.scanned++;
    const host = hostOf(account);
    if (host) {
      t.servers[host] = (t.servers[host] ?? 0) + 1;
    }
    const followers = account.followers_count;
    if (typeof followers === 'number' && Number.isFinite(followers) && followers >= 0) {
      t.tiers[sizeTier(followers)]++;
    } else {
      t.tierUnknown++;
    }
    if (account.bot) t.bots++;
    if (account.group) t.groups++;
    t.age[ageBand(account, now)]++;
    t.cadence[cadenceBand(account, now)]++;
  }
  return t;
}

function addRecord<K extends string>(
  a: Record<K, number>,
  b: Record<K, number>,
): Record<K, number> {
  const out = { ...a };
  for (const key of Object.keys(b) as K[]) {
    out[key] = (out[key] ?? 0) + b[key];
  }
  return out;
}

export function mergeComposition(a: CompositionTally, b: CompositionTally): CompositionTally {
  return {
    scanned: a.scanned + b.scanned,
    servers: addRecord(a.servers, b.servers),
    tiers: addRecord(a.tiers, b.tiers),
    tierUnknown: a.tierUnknown + b.tierUnknown,
    bots: a.bots + b.bots,
    groups: a.groups + b.groups,
    age: addRecord(a.age, b.age),
    cadence: addRecord(a.cadence, b.cadence),
  };
}

export interface ServerSplit {
  /** The biggest servers, most accounts first (ties by name). */
  top: { host: string; count: number }[];
  /** Accounts on every other server. */
  other: number;
  /** Distinct servers seen. */
  distinct: number;
  /** Accounts on `homeHost`. */
  home: number;
  /** `home` as a percentage of accounts scanned, 0–100. */
  homePct: number;
}

/** The top `limit` servers plus an "Other" remainder. */
export function serverSplit(
  tally: CompositionTally,
  homeHost: string | null,
  limit = 8,
): ServerSplit {
  const entries = Object.entries(tally.servers)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  const top = entries.slice(0, limit);
  const other = entries.slice(limit).reduce((sum, e) => sum + e.count, 0);
  const home = homeHost ? (tally.servers[homeHost.toLowerCase()] ?? 0) : 0;
  return {
    top,
    other,
    distinct: entries.length,
    home,
    homePct: tally.scanned ? Math.round((home / tally.scanned) * 100) : 0,
  };
}

/** Who follows whom, between the two lists. Only meaningful when both are complete. */
export interface AudienceOverlap {
  /** In both lists: you follow each other. */
  mutuals: number;
  /** Follow you; you don't follow them. */
  notFollowedBack: number;
  /** You follow them; they don't follow you. */
  notFollowingBack: number;
}

export function audienceOverlap(
  followers: ReadonlySet<string>,
  following: ReadonlySet<string>,
): AudienceOverlap {
  let mutuals = 0;
  for (const id of followers) {
    if (following.has(id)) mutuals++;
  }
  return {
    mutuals,
    notFollowedBack: followers.size - mutuals,
    notFollowingBack: following.size - mutuals,
  };
}
