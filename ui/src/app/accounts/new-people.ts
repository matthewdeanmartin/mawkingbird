import { stripHtml } from '../feeds/sentiment';
import { Account, Status } from '../platform/api/models';
import { PostingRhythm, isLinkOnly, postingRhythm } from './account-signals';
import { hostOf } from './audience-composition';
import { daysSinceLastPost } from './effective-audience';

/**
 * "Which of my new followers are people I'd like to meet?"
 *
 * Three separate answers, never one score: are they human, are they lively,
 * and is anything spammy. Each carries its reasons, and "not enough evidence"
 * is a real answer.
 *
 * ## What counts
 *
 * Trust what is expensive to fake and what *other people* did. In order:
 *
 *  1. **Others vouch.** People you follow follow them; people reply to them;
 *     they talked with you before following. A spammer can't buy your friends.
 *  2. **Behavior.** They reply to many different people, in their own words,
 *     at irregular hours. A language model can fake this, so it never earns a
 *     confident "human" alone.
 *  3. **What the account says about itself** (bio, avatar, counts): nothing.
 *
 * The `bot` flag works one way. On, it is believed. Off, it says nothing: a
 * malicious bot leaves it off.
 *
 * ## What the server doesn't know
 *
 * A home server holds only the remote posts it happened to receive, so a
 * newcomer can look silent here and be busy at home. Silence is therefore
 * never evidence against someone, and counts and join dates of remote accounts
 * are as reported by their own server.
 */

const DAY = 86_400_000;

/** Posts from their last this-many days count as recent. */
export const RECENT_DAYS = 30;
/** Replying to this many different people is a conversation habit. */
export const TALKS_WITH = 3;
/** Fewer own posts than this and their posts say nothing about spam. */
export const MIN_OWN_POSTS = 5;

// ---------------------------------------------------------------------------
// Behavior, from one page of their posts
// ---------------------------------------------------------------------------

export interface Behavior {
  /** Posts read, boosts included. */
  sample: number;
  /** Their own posts among them. */
  own: number;
  /** Different other people they replied to, and the same in recent days. */
  repliedTo: number;
  repliedToRecent: number;
  /** Replies their posts received, their own thread replies left out. */
  repliesReceived: number;
  rhythm: PostingRhythm | null;
  /** A daily stretch of 5+ hours with no posts; null with too little to tell. */
  quietStretch: boolean | null;
  /** Own posts that are more than a link, as a percentage of everything read. */
  ownWordsPct: number;
  /** Own posts that repeat each other almost word for word, percentage. */
  repeatedPct: number;
  /** The site most of their own posts link to, when it is half or more. */
  mainLink: string | null;
  /** Different people named in posts that answer nobody, when that is a habit. */
  mentionsPeople: number;
  /** Their newest own post or boost, epoch ms. */
  last: number | null;
}

/** Remote reads namespace ids (`anonymous-mastodon:host:42`); compare the tail. */
const tail = (id: string): string => id.slice(id.lastIndexOf(':') + 1);

function plain(status: Status): string {
  return stripHtml(status.content);
}

/** Text with the parts spammers vary (links, names, numbers) taken out. */
function skeleton(status: Status): string {
  return plain(status)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@[\p{L}\p{N}_.@-]+/gu, '')
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();
}

function linkHost(status: Status): string | null {
  const url = status.card?.url ?? plain(status).match(/https?:\/\/\S+/)?.[0];
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

/** Longest run of hours of the day (wrapping midnight) with no posts. */
function longestQuiet(times: number[]): number {
  const busy = new Set(times.map((t) => new Date(t).getUTCHours()));
  let longest = 0;
  let run = 0;
  for (let h = 0; h < 48; h++) {
    run = busy.has(h % 24) ? 0 : run + 1;
    longest = Math.max(longest, Math.min(24, run));
  }
  return longest;
}

/** What a page of their posts shows. Boosts count only as activity. */
export function behaviorOf(statuses: Status[], now: number = Date.now()): Behavior {
  const own = statuses.filter((s) => !s.reblog);
  const at = (s: Status) => Date.parse(s.created_at);
  const isReplyToOther = (s: Status) =>
    !!s.in_reply_to_id &&
    !!s.in_reply_to_account_id &&
    tail(s.in_reply_to_account_id) !== tail(s.account.id);

  const people = new Set<string>();
  const recentPeople = new Set<string>();
  const selfReplies = new Map<string, number>();
  for (const s of own) {
    if (isReplyToOther(s)) {
      people.add(s.in_reply_to_account_id!);
      if (now - at(s) <= RECENT_DAYS * DAY) recentPeople.add(s.in_reply_to_account_id!);
    } else if (s.in_reply_to_id) {
      selfReplies.set(s.in_reply_to_id, (selfReplies.get(s.in_reply_to_id) ?? 0) + 1);
    }
  }
  const repliesReceived = own.reduce(
    (sum, s) => sum + Math.max(0, (s.replies_count ?? 0) - (selfReplies.get(s.id) ?? 0)),
    0,
  );

  const texts = new Map<string, number>();
  const hosts = new Map<string, number>();
  const named = new Set<string>();
  let naming = 0;
  for (const s of own) {
    const text = skeleton(s);
    if (text.length >= 20) texts.set(text, (texts.get(text) ?? 0) + 1);
    const host = linkHost(s);
    if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
    const others = (s.mentions ?? []).filter((m) => tail(m.id) !== tail(s.account.id));
    if (!s.in_reply_to_id && others.length) {
      naming++;
      others.forEach((m) => named.add(m.id));
    }
  }
  const repeated = [...texts.values()].filter((n) => n >= 3).reduce((a, b) => a + b, 0);
  const [mainLink] = [...hosts.entries()].sort((a, b) => b[1] - a[1]);
  const times = own.map(at).filter((t) => !Number.isNaN(t));
  const span = times.length ? Math.max(...times) - Math.min(...times) : 0;
  const all = statuses.map(at).filter((t) => !Number.isNaN(t));
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  return {
    sample: statuses.length,
    own: own.length,
    repliedTo: people.size,
    repliedToRecent: recentPeople.size,
    repliesReceived,
    rhythm: postingRhythm(own),
    quietStretch: times.length >= 15 && span >= 5 * DAY ? longestQuiet(times) >= 5 : null,
    ownWordsPct: pct(own.filter((s) => !isLinkOnly(s)).length, statuses.length),
    repeatedPct: pct(repeated, own.length),
    mainLink: mainLink && mainLink[1] >= 5 && mainLink[1] * 2 >= own.length ? mainLink[0] : null,
    mentionsPeople: named.size >= 5 && naming * 10 >= own.length * 3 ? named.size : 0,
    last: all.length ? Math.max(...all) : null,
  };
}

// ---------------------------------------------------------------------------
// Evidence and verdicts
// ---------------------------------------------------------------------------

/** Everything known about one new follower. */
export interface Evidence {
  account: Account;
  /** People you follow who follow them; null when the server couldn't say. */
  familiar: Account[] | null;
  /** They replied to one of your posts, and whether that came before following. */
  repliedToYou: boolean;
  repliedBeforeFollowing: boolean;
  /** When they followed you, if that notification was read. */
  followedAt: number | null;
  /** Their posts, once checked. */
  behavior: Behavior | null;
  /** The server their posts were read from, when it is their own. */
  behaviorFrom: string | null;
  /** New accounts on their server that arrived together, including them. */
  arrivedTogether: number;
  /** On another server, so this server's copy may be incomplete. */
  remote: boolean;
}

export interface Reason {
  key: string;
  params?: Record<string, string | number>;
}

export type HumanVerdict = 'vouched' | 'likely' | 'unclear' | 'automated' | 'group';
export type LivelyVerdict = 'talking' | 'posting' | 'quiet' | 'unknown';
export type SpamVerdict = 'clear' | 'caution' | 'warning' | 'unknown';

export interface Verdicts {
  human: { verdict: HumanVerdict; reasons: Reason[] };
  lively: { verdict: LivelyVerdict; reasons: Reason[] };
  spam: { verdict: SpamVerdict; reasons: Reason[] };
}

const nameOf = (a: Account) => a.display_name || a.username || a.acct;

function human(e: Evidence): Verdicts['human'] {
  if (e.account.bot) return { verdict: 'automated', reasons: [{ key: 'saysAutomated' }] };
  if (e.account.group) return { verdict: 'group', reasons: [{ key: 'isGroup' }] };
  const reasons: Reason[] = [];
  const vouches = e.familiar?.length ?? 0;
  if (vouches) {
    reasons.push({
      key: vouches === 1 ? 'vouched.one' : 'vouched.other',
      params: { count: vouches, names: e.familiar!.slice(0, 2).map(nameOf).join(', ') },
    });
  }
  if (e.repliedBeforeFollowing) reasons.push({ key: 'repliedBefore' });
  else if (e.repliedToYou) reasons.push({ key: 'repliedToYou' });
  const b = e.behavior;
  const clockwork = b?.rhythm?.verdict === 'botLike';
  // Talking and being answered: the second half is other people's doing.
  const conversation = !!b && b.repliedTo >= TALKS_WITH && b.repliesReceived > 0;
  if (b) {
    if (b.repliedTo) {
      reasons.push({
        key: b.repliedTo === 1 ? 'talksWith.one' : 'talksWith.other',
        params: { count: b.repliedTo },
      });
    }
    if (b.repliesReceived) reasons.push({ key: 'answered', params: { count: b.repliesReceived } });
    if (clockwork) reasons.push({ key: 'clockwork', params: { pct: b.rhythm!.regularPct } });
    else if (b.rhythm?.verdict === 'human') reasons.push({ key: 'irregular' });
    if (b.quietStretch) reasons.push({ key: 'sleeps' });
    else if (b.quietStretch === false) reasons.push({ key: 'neverSleeps' });
    if (b.own >= MIN_OWN_POSTS) reasons.push({ key: 'ownWords', params: { pct: b.ownWordsPct } });
  }
  const site = (e.account.fields ?? []).some((f) => f.verified_at);
  if (site) reasons.push({ key: 'verifiedSite' });
  if (!reasons.length || (!b && !vouches && !e.repliedToYou)) {
    reasons.push({ key: b ? 'littleToGoOn' : 'postsNotChecked' });
  }
  const verdict: HumanVerdict = clockwork
    ? 'unclear'
    : vouches >= 2 && conversation
      ? 'vouched'
      : vouches || conversation || e.repliedToYou
        ? 'likely'
        : 'unclear';
  return { verdict, reasons };
}

function lively(e: Evidence, now: number): Verdicts['lively'] {
  const b = e.behavior;
  const partial: Reason[] = e.remote && !e.behaviorFrom ? [{ key: 'asServerKnows' }] : [];
  if (b?.sample) {
    if (b.repliedToRecent >= TALKS_WITH) {
      return {
        verdict: 'talking',
        reasons: [{ key: 'talkedRecently', params: { count: b.repliedToRecent } }],
      };
    }
    const days = b.last === null ? null : Math.floor((now - b.last) / DAY);
    if (days !== null && days <= RECENT_DAYS) {
      return { verdict: 'posting', reasons: [{ key: 'postedDays', params: { days } }] };
    }
    return {
      verdict: 'quiet',
      reasons: [...(days === null ? [] : [{ key: 'postedDays', params: { days } }]), ...partial],
    };
  }
  const silent = daysSinceLastPost(e.account, now);
  if (b || silent === null) {
    return !e.account.statuses_count
      ? { verdict: 'quiet', reasons: [{ key: 'noPosts' }] }
      : { verdict: 'unknown', reasons: [{ key: 'noneVisible' }] };
  }
  const days = Math.floor(silent);
  return {
    verdict: days <= RECENT_DAYS ? 'posting' : 'quiet',
    reasons: [{ key: 'postedDays', params: { days } }, ...(days <= RECENT_DAYS ? [] : partial)],
  };
}

function spam(e: Evidence, now: number): Verdicts['spam'] {
  const warnings: Reason[] = [];
  const a = e.account;
  const following = a.following_count ?? 0;
  const followers = a.followers_count ?? 0;
  const joined = a.created_at ? Date.parse(a.created_at) : NaN;
  const age = Number.isNaN(joined) ? null : Math.max(1, Math.floor((now - joined) / DAY));
  // Mass-following is how follow spam works, so it is the one thing it can't hide.
  if (age !== null && following >= 500 && following / age >= 50) {
    warnings.push({ key: 'followRate', params: { following, days: age } });
  }
  if (following >= 1000 && followers * 10 < following && !e.repliedToYou) {
    warnings.push({ key: 'lopsided', params: { following, followers } });
  }
  const b = e.behavior;
  if (b && b.own >= MIN_OWN_POSTS) {
    if (b.repeatedPct >= 30) warnings.push({ key: 'repeats', params: { pct: b.repeatedPct } });
    const verified = (a.fields ?? []).some(
      (f) => f.verified_at && b.mainLink && f.value.toLowerCase().includes(b.mainLink),
    );
    // Linking to your own proven site is normal; so is linking with a comment.
    if (b.mainLink && !verified && b.ownWordsPct < 50) {
      warnings.push({ key: 'sameLink', params: { host: b.mainLink } });
    }
    if (b.mentionsPeople) {
      warnings.push({ key: 'namesPeople', params: { count: b.mentionsPeople } });
    }
  }
  const together: Reason[] =
    e.arrivedTogether > 1 ? [{ key: 'arrivedTogether', params: { count: e.arrivedTogether } }] : [];
  if (warnings.length) return { verdict: 'warning', reasons: [...warnings, ...together] };
  if (together.length) return { verdict: 'caution', reasons: together };
  if (b && b.own >= MIN_OWN_POSTS) {
    return { verdict: 'clear', reasons: [{ key: 'nothingFound', params: { count: b.own } }] };
  }
  return { verdict: 'unknown', reasons: [{ key: b ? 'fewPosts' : 'postsNotChecked' }] };
}

export function judge(e: Evidence, now: number = Date.now()): Verdicts {
  return { human: human(e), lively: lively(e, now), spam: spam(e, now) };
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/** Accounts younger than this can be part of a batch. */
const BATCH_AGE_DAYS = 30;
/** Join dates this close together make a batch. */
const BATCH_WINDOW_MS = 3 * DAY;
/** This many together is worth mentioning. */
export const BATCH_SIZE = 4;

/**
 * Account id → how many young accounts on the same server joined within three
 * days of it. Real migrations look the same, so it is only ever a caution.
 */
export function batches(accounts: Account[], now: number = Date.now()): Map<string, number> {
  const byHost = new Map<string, { id: string; joined: number }[]>();
  for (const a of accounts) {
    const host = hostOf(a);
    const joined = a.created_at ? Date.parse(a.created_at) : NaN;
    if (!host || Number.isNaN(joined) || now - joined > BATCH_AGE_DAYS * DAY) continue;
    byHost.set(host, [...(byHost.get(host) ?? []), { id: a.id, joined }]);
  }
  const out = new Map<string, number>();
  for (const group of byHost.values()) {
    for (const one of group) {
      const near = group.filter((o) => Math.abs(o.joined - one.joined) <= BATCH_WINDOW_MS).length;
      if (near >= BATCH_SIZE) out.set(one.id, near);
    }
  }
  return out;
}

const HUMAN_ORDER: HumanVerdict[] = ['vouched', 'likely', 'unclear', 'group', 'automated'];
const LIVELY_ORDER: LivelyVerdict[] = ['talking', 'posting', 'unknown', 'quiet'];

/**
 * Best introductions first: warnings last, then human, then how many people
 * you follow vouch, then lively. Ties keep the newest follower first.
 */
export function rank(list: Evidence[], now: number = Date.now()): Evidence[] {
  return list
    .map((e, i) => ({ e, i, v: judge(e, now) }))
    .sort(
      (a, b) =>
        Number(a.v.spam.verdict === 'warning') - Number(b.v.spam.verdict === 'warning') ||
        HUMAN_ORDER.indexOf(a.v.human.verdict) - HUMAN_ORDER.indexOf(b.v.human.verdict) ||
        (b.e.familiar?.length ?? 0) - (a.e.familiar?.length ?? 0) ||
        LIVELY_ORDER.indexOf(a.v.lively.verdict) - LIVELY_ORDER.indexOf(b.v.lively.verdict) ||
        a.i - b.i,
    )
    .map((x) => x.e);
}
