import { Account, Status } from '../platform/api/models';
import { AuthorRow, feedAuthors, feedSubject, parseContent } from './feed-metrics';
import { postingRhythm } from '../accounts/account-signals';
import { SourceOutcome } from '../accounts/anonymous/anonymous-mastodon-provider';

/**
 * Three questions a reader actually asks about their feed, answered with a verdict
 * and a button rather than a chart.
 *
 *   - Who is flooding?
 *   - Why did my feed end?
 *   - Are the sources mixing?
 *
 * This is the diagnostic companion to `feed-metrics.ts`, and the split is
 * deliberate: that module is *descriptive* ("here is the composition"), this one is
 * *prescriptive* ("here is what is wrong and here is the fix"). Merging them would
 * blunt both — descriptive stats want to show everything, a diagnosis wants to show
 * the one thing that is broken.
 *
 * Pure, like `follow-quality.ts` and `copy-collections.ts`: the interesting parts are
 * arithmetic and thresholds, and none of them need HTTP or a component to test.
 *
 * **The sample is the population.** Every verdict describes the posts that were
 * actually retrieved, never "your feed" in the abstract — `feed-metrics.ts` is
 * emphatic about this and the Doctor makes louder-sounding claims than it does, so it
 * carries the caveat harder. {@link FeedDiagnosis.sampleSize} exists to be shown.
 */

/** How alarmed to be. `ok` sections collapse to a single line. */
export type Severity = 'ok' | 'notice' | 'warn';

/**
 * One author over this share of the window is flooding it.
 *
 * A quarter is high enough that a merely prolific account does not trip it, and low
 * enough to catch the case that prompted this: one bot filling a page.
 */
export const FLOOD_SHARE = 0.25;

/**
 * Never call flooding on a sample this small.
 *
 * Without it, 4 posts out of 10 in a quiet window reads as a 40% flood — a confident
 * accusation built on nothing. Sample-size guards are the difference between a
 * diagnosis and a horoscope.
 */
export const FLOOD_MIN_POSTS = 8;

/** One source category above this share means the feed is not really mixing. */
export const THIN_SOURCE_SHARE = 0.8;

/** When this fraction of follows returned nothing, the feed's thinness has a cause. */
export const DEAD_FOLLOW_RATIO = 0.3;

/**
 * A source whose freshest post is older than this looks stalled rather than quiet.
 *
 * Generous on purpose: plenty of good RSS feeds post weekly, so this is a "has
 * the connector stopped working" test, not a liveliness contest. What makes it
 * meaningful is the comparison — one source at three days old while another is at
 * three minutes is a different claim from everything being slow.
 */
export const STALE_SOURCE_HOURS = 48;

/**
 * A source contributing less than this share is a garnish, not a section.
 *
 * Used only to decide whether a stalled source is worth mentioning; a provider
 * that supplies two posts of two hundred is not why the feed looks wrong.
 */
export const MINOR_SOURCE_SHARE = 0.02;

/** An action the page offers. Never applied automatically — the user decides. */
export interface DoctorAction {
  kind:
    | 'mute'
    | 'unfollow'
    | 'review-filters'
    | 'review-quiet'
    | 'review-window'
    | 'widen-window'
    | 'show-calm'
    | 'wait-out-cooldown'
    /** Links into Explore (spec/sprint/explore-2026-11.md): the fixes for a thin feed. */
    | 'find-kits'
    | 'find-people'
    | 'find-tags';
  label: string;
  /** The account it applies to, for the account-scoped actions. */
  account?: Account;
  /** Mute duration in seconds, for `mute`. */
  seconds?: number;
}

export interface Verdict {
  id:
    | 'flooding'
    | 'ended'
    | 'stopped'
    | 'mixing'
    | 'sources'
    | 'timespans'
    | 'following'
    | 'tags'
    | 'automated';
  severity: Severity;
  /** One sentence, already phrased for a human. */
  headline: string;
  /** Supporting rows, rendered under the headline. */
  detail: string[];
  actions: DoctorAction[];
}

export interface FeedDiagnosis {
  sampleSize: number;
  verdicts: Verdict[];
}

const MUTE_8H = 8 * 60 * 60;

function pct(share: number): number {
  return Math.round(share * 100);
}

/**
 * Who is taking up the window, and is it too much?
 *
 * Reads authorship through `feedSubject`, so a boost counts for whoever *wrote* the
 * post rather than whoever boosted it — the reader's complaint is about what fills
 * their screen, and a boosted post fills it with the author's words.
 */
export function diagnoseFlooding(posts: Status[]): Verdict {
  const authors = feedAuthors(posts);
  const top = authors[0];

  if (!top || posts.length < FLOOD_MIN_POSTS || top.share < FLOOD_SHARE) {
    return {
      id: 'flooding',
      severity: 'ok',
      headline: top
        ? `No one is dominating — the loudest is @${top.account.acct} at ${pct(top.share)}%.`
        : 'Nothing in this sample yet.',
      detail: [],
      actions: [],
    };
  }

  const runnerUp = authors[1];
  return {
    id: 'flooding',
    severity: top.share >= 0.4 ? 'warn' : 'notice',
    headline: `@${top.account.acct} is ${pct(top.share)}% of this sample.`,
    detail: [
      `${top.count} of ${posts.length} posts.`,
      runnerUp
        ? `Next highest is @${runnerUp.account.acct} at ${pct(runnerUp.share)}%.`
        : 'No other account comes close.',
    ],
    actions: [
      { kind: 'mute', label: 'Mute for 8 hours', account: top.account, seconds: MUTE_8H },
      { kind: 'unfollow', label: 'Unfollow', account: top.account },
    ],
  };
}

/**
 * Why the feed stopped.
 *
 * The interesting case, and the one no other surface can report: a feed ended
 * because the reader's *own filters* emptied it. That looks exactly like an empty
 * feed, so a reader with an aggressive calm-mode or language filter concludes their
 * follows are dead when in fact they are being hidden.
 */
export function diagnoseEnding(outcomes: SourceOutcome[]): Verdict {
  if (!outcomes.length) {
    return {
      id: 'ended',
      severity: 'ok',
      headline: 'No follow sources in this sample.',
      detail: [],
      actions: [],
    };
  }

  const errored = outcomes.filter((o) => o.ending === 'error');
  const filtered = outcomes.filter((o) => o.ending === 'filtered');
  const empty = outcomes.filter((o) => o.ending === 'empty');
  const quiet = empty.length + errored.length;

  const detail: string[] = [
    `${outcomes.length} follows checked · ${empty.length} returned nothing · ${errored.length} could not be loaded`,
  ];
  for (const source of errored.slice(0, 5)) {
    detail.push(`@${source.handle} — could not be loaded`);
  }
  if (filtered.length) {
    detail.push(
      `${filtered.length} more ${filtered.length === 1 ? 'was' : 'were'} cut short by your filters.`,
    );
  }

  const actions: DoctorAction[] = [];
  if (filtered.length) {
    actions.push({ kind: 'review-filters', label: 'Review filters' });
  }
  if (quiet) {
    actions.push({ kind: 'review-quiet', label: 'Review quiet follows' });
  }

  const troubled = quiet + filtered.length;
  const severity: Severity =
    troubled === 0 ? 'ok' : troubled / outcomes.length >= DEAD_FOLLOW_RATIO ? 'warn' : 'notice';

  return {
    id: 'ended',
    severity,
    headline:
      severity === 'ok'
        ? 'Every follow returned posts.'
        : filtered.length
          ? 'Your filters ended this feed early.'
          : 'Your feed ended early.',
    detail: severity === 'ok' ? [] : detail,
    actions: severity === 'ok' ? [] : actions,
  };
}

/**
 * What is bounding the feed right now.
 *
 * This is the verdict the Doctor was missing, and the reason it kept failing at
 * its one job. `diagnoseEnding` answers "which *follow* went quiet", which only
 * the anonymous feed can even ask — so a signed-in reader whose feed stopped got
 * flooding, freshness and mixing verdicts, none of which mention the thing that
 * actually stopped their feed:
 *
 * > "feed doctor ended up only saying 'well, no single person is flooding your
 * > feed' and stuff like that. It never successfully diagnosis why a feed ended."
 *
 * The five mechanisms below can each end or thin a feed, and every one of them
 * is invisible at the point it acts. They are reported together because the
 * reader's question is singular — *why did this stop* — and answering it with
 * four separate green ticks and no red one is how the Doctor lost their trust.
 *
 * Ordered by how completely each one bounds the feed: a cooldown stops paging
 * outright, a window stops it at a date, and the filters merely thin what was
 * already fetched. The first applicable one leads, because a reader stopped by
 * the cooldown does not need to hear about their language filter yet.
 */
export interface FeedBounds {
  /** Posts held out of view by Calm mode, out of what else would have shown. */
  hiddenByCalm: number;
  /** Posts held out of view by the language filter, likewise. */
  hiddenByLanguage: number;
  /** Posts held out of view by the Boosts/Replies chips. */
  hiddenByChips: number;
  /** Posts not fetched because they fall outside the time window. */
  droppedByWindow: number;
  /** The window in words ("the last day"), or null when unbounded. */
  windowLabel: string | null;
  /** True while the reading cooldown is holding paging back. */
  cooldownActive: boolean;
  /** Minutes left on that cooldown. */
  cooldownMinutes: number;
  /** True when the feed genuinely reached the end of every source. */
  exhausted: boolean;
  /** A failed or stalled source is not evidence of exhaustion. */
  failedSources?: string[];
  /** How many posts are on screen, for phrasing. */
  shown: number;
}

export function diagnoseStopped(bounds: FeedBounds): Verdict {
  const detail: string[] = [];
  const actions: DoctorAction[] = [];

  if (bounds.failedSources?.length) {
    detail.push(
      `Sources stopped before completeness could be verified: ${bounds.failedSources.join(', ')}. Retry Home to reload these sources.`,
    );
  }

  if (bounds.cooldownActive) {
    detail.push(
      `A reading break is in force — about ${bounds.cooldownMinutes} minute${bounds.cooldownMinutes === 1 ? '' : 's'} left, or until you reload.`,
    );
    actions.push({ kind: 'wait-out-cooldown', label: 'Feed settings' });
  }
  if (bounds.droppedByWindow > 0 && bounds.windowLabel) {
    detail.push(
      `${bounds.droppedByWindow} older post${bounds.droppedByWindow === 1 ? '' : 's'} were not loaded — Home is limited to ${bounds.windowLabel}.`,
    );
    actions.push({ kind: 'widen-window', label: 'Load older posts' });
  }
  if (bounds.hiddenByCalm > 0) {
    detail.push(
      `Calm mode is holding back ${bounds.hiddenByCalm} already-loaded post${bounds.hiddenByCalm === 1 ? '' : 's'}.`,
    );
    actions.push({ kind: 'show-calm', label: 'Turn Calm off' });
  }
  if (bounds.hiddenByLanguage > 0) {
    detail.push(
      `${bounds.hiddenByLanguage} already-loaded post${bounds.hiddenByLanguage === 1 ? ' is' : 's are'} in a language you filtered out.`,
    );
  }
  if (bounds.hiddenByChips > 0) {
    detail.push(
      `The Boosts/Replies chips are hiding ${bounds.hiddenByChips} already-loaded post${bounds.hiddenByChips === 1 ? '' : 's'}.`,
    );
    actions.push({ kind: 'review-filters', label: 'Review filters' });
  }

  if (!detail.length) {
    // Nothing is bounding the feed. Say which of the two that means, because
    // "nothing is limiting you" and "you have read everything" are different
    // answers and only one of them means more will arrive.
    return {
      id: 'stopped',
      severity: 'ok',
      headline: bounds.exhausted
        ? 'Your feed ended because every source ran out — nothing is filtering it.'
        : 'Nothing is limiting your feed right now.',
      detail: [],
      actions: [],
    };
  }

  // A cooldown or a window bounds what can be *fetched*; the filters only thin
  // what already arrived. Warn on the former, note the latter.
  const severity: Severity =
    bounds.cooldownActive || bounds.droppedByWindow > 0 || bounds.failedSources?.length
      ? 'warn'
      : 'notice';

  return {
    id: 'stopped',
    severity,
    headline: bounds.cooldownActive
      ? 'Your feed stopped because of a reading break.'
      : bounds.failedSources?.length
        ? 'Your feed stopped with a source failure — you may not be caught up.'
        : bounds.droppedByWindow > 0
          ? `Your feed stopped at the edge of ${bounds.windowLabel}.`
          : 'Your feed is shorter than it looks — filters are hiding posts.',
    detail,
    actions,
  };
}

/**
 * Whether the feed is actually a mix.
 *
 * Takes counts by source label rather than posts, because "what counts as a source"
 * belongs to whoever assembled the feed (`AlgoSource` for the algo feed, follows vs
 * hashtags vs RSS for Home) and not to this module.
 */
export function diagnoseMixing(bySource: Record<string, number>): Verdict {
  const entries = Object.entries(bySource).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  if (!total) {
    return {
      id: 'mixing',
      severity: 'ok',
      headline: 'Nothing in this sample yet.',
      detail: [],
      actions: [],
    };
  }

  const ranked = [...entries].sort((a, b) => b[1] - a[1]);
  const detail = ranked.map(([label, count]) => `${label} ${pct(count / total)}%`);
  const [topLabel, topCount] = ranked[0];
  const topShare = topCount / total;

  if (ranked.length === 1) {
    return {
      id: 'mixing',
      severity: 'notice',
      headline: `Everything here came from ${topLabel}.`,
      detail,
      actions: [],
    };
  }

  return {
    id: 'mixing',
    severity: topShare >= THIN_SOURCE_SHARE ? 'notice' : 'ok',
    headline:
      topShare >= THIN_SOURCE_SHARE
        ? `${topLabel} is ${pct(topShare)}% of this feed.`
        : 'Sources are mixing.',
    detail,
    actions: [],
  };
}

/** One provider's contribution to the merged feed, as seen in the sample. */
export interface ProviderSlice {
  /** Provider id (`mastodon`, `bluesky`, `rss`, …) or a display label. */
  id: string;
  label: string;
  count: number;
  /** Newest and oldest post timestamps in the sample, epoch ms. */
  newest: number;
  oldest: number;
  /** Linked and visible, but contributed nothing to this sample. */
  silent?: boolean;
}

/**
 * Group a merged feed by the provider each post came from.
 *
 * Reads `status.provider`, which the aggregator stamps on every foreign post
 * (Mastodon's own posts leave it unset). `linked` names sources the user has
 * connected and made visible, so one that contributed nothing can be reported as
 * silent rather than silently omitted — "Bluesky returned nothing" is exactly the
 * finding a stalled connector produces.
 */
/**
 * Fallback display name for a provider id with no registered label.
 *
 * A verdict reading "bluesky is behind the rest of your feed" is the kind of
 * detail that makes a diagnostic look unfinished; the registry supplies proper
 * labels in the app, and this covers ids that arrive without one.
 */
function titleCase(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

export function sliceByProvider(
  posts: Status[],
  labels: Record<string, string> = {},
  linked: string[] = [],
): ProviderSlice[] {
  const byId = new Map<string, ProviderSlice>();

  for (const post of posts) {
    const subject = feedSubject(post);
    const id = post.provider ?? 'mastodon';
    const at = Date.parse(subject.created_at);
    const slice = byId.get(id) ?? {
      id,
      label: labels[id] ?? titleCase(id),
      count: 0,
      newest: 0,
      oldest: Number.POSITIVE_INFINITY,
    };
    slice.count += 1;
    if (!Number.isNaN(at) && at > 0) {
      slice.newest = Math.max(slice.newest, at);
      slice.oldest = Math.min(slice.oldest, at);
    }
    byId.set(id, slice);
  }

  for (const id of linked) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        label: labels[id] ?? titleCase(id),
        count: 0,
        newest: 0,
        oldest: 0,
        silent: true,
      });
    }
  }

  return [...byId.values()].map((slice) => ({
    ...slice,
    oldest: Number.isFinite(slice.oldest) ? slice.oldest : slice.newest,
  }));
}

/** Age of the freshest post, in hours. */
function hoursSince(at: number, now: number): number {
  return (now - at) / 3_600_000;
}

function describeAge(hours: number): string {
  if (hours < 1) {
    return 'minutes ago';
  }
  if (hours < 48) {
    return `${Math.round(hours)}h ago`;
  }
  const days = Math.round(hours / 24);
  return days > 60 ? `${Math.round(days / 30)} months ago` : `${days} days ago`;
}

/**
 * Is one of the connected sources stalled, or contributing nothing?
 *
 * Signed-in Home is not one server's timeline — `FeedAggregator` merges Mastodon
 * with Bluesky, Twitter and RSS in per-source rounds. That makes a failure mode
 * the anonymous feed never has: everything looks fine, but one source quietly
 * stopped, and the only symptom is that you have not seen a Bluesky post in two
 * days without ever noticing you stopped.
 *
 * Judged **relatively**. "Nothing since Tuesday" is not damning on its own — you
 * may simply have been away — but one source at three days old while another is
 * at three minutes is a specific, actionable claim.
 */
export function diagnoseSources(slices: ProviderSlice[], now: number = Date.now()): Verdict {
  const contributing = slices.filter((slice) => slice.count > 0);
  const silent = slices.filter((slice) => slice.silent || slice.count === 0);

  if (!contributing.length) {
    return {
      id: 'sources',
      severity: silent.length ? 'warn' : 'ok',
      headline: silent.length
        ? 'None of your connected sources returned anything.'
        : 'No connected sources.',
      detail: silent.map((slice) => `${slice.label} — nothing in this sample`),
      actions: [],
    };
  }

  // The freshest source sets the bar: it is the evidence that the app itself is
  // fetching fine, which is what makes a lagging sibling meaningful.
  const freshest = Math.max(...contributing.map((slice) => slice.newest));
  const total = contributing.reduce((sum, slice) => sum + slice.count, 0);

  const stalled = contributing.filter(
    (slice) =>
      hoursSince(slice.newest, freshest) >= STALE_SOURCE_HOURS &&
      slice.count / total >= MINOR_SOURCE_SHARE,
  );

  const detail = contributing
    .slice()
    .sort((a, b) => b.newest - a.newest)
    .map(
      (slice) =>
        `${slice.label} — ${slice.count} posts, newest ${describeAge(hoursSince(slice.newest, now))}`,
    );
  for (const slice of silent) {
    detail.push(`${slice.label} — nothing in this sample`);
  }

  if (!stalled.length && !silent.length) {
    return {
      id: 'sources',
      severity: 'ok',
      headline: `All ${contributing.length} sources are current.`,
      detail: contributing.length > 1 ? detail : [],
      actions: [],
    };
  }

  const names = [...stalled, ...silent].map((slice) => slice.label).join(', ');
  return {
    id: 'sources',
    severity: 'warn',
    headline: stalled.length
      ? `${names} ${stalled.length + silent.length === 1 ? 'is' : 'are'} behind the rest of your feed.`
      : `${names} contributed nothing.`,
    detail: [
      ...detail,
      'A source that lags far behind the others is usually a stalled connector, or nobody you follow there has posted.',
    ],
    actions: [],
  };
}

/**
 * Do the sources cover the same stretch of time, or are they stacked in layers?
 *
 * The aggregator guarantees every source at least 20 posts per round and then
 * sorts the union by date. When one source is archival — an RSS feed of a blog
 * that stopped in 2019 — the result is a clean slab of recent Mastodon followed
 * by a wall of very old posts, which reads as a broken feed rather than as two
 * sources with different clocks.
 *
 * Disjointness is the signal: a source whose *newest* post predates another
 * source's *oldest* cannot interleave with it at all.
 */
export function diagnoseTimespans(slices: ProviderSlice[], now: number = Date.now()): Verdict {
  const contributing = slices.filter((slice) => slice.count > 0 && slice.newest > 0);
  if (contributing.length < 2) {
    return {
      id: 'timespans',
      severity: 'ok',
      headline: 'Only one source in this sample, so nothing to interleave.',
      detail: [],
      actions: [],
    };
  }

  const ranked = [...contributing].sort((a, b) => b.newest - a.newest);
  const disjoint: [ProviderSlice, ProviderSlice][] = [];
  for (const recent of ranked) {
    for (const old of ranked) {
      if (recent !== old && old.newest < recent.oldest) {
        disjoint.push([recent, old]);
      }
    }
  }

  const detail = ranked.map(
    (slice) =>
      `${slice.label} — ${describeAge(hoursSince(slice.newest, now))} to ${describeAge(hoursSince(slice.oldest, now))}`,
  );

  if (!disjoint.length) {
    return {
      id: 'timespans',
      severity: 'ok',
      headline: 'Your sources cover overlapping time, so they interleave.',
      detail,
      actions: [],
    };
  }

  const [recent, old] = disjoint[0];
  return {
    id: 'timespans',
    severity: 'notice',
    headline: `${old.label} doesn't overlap ${recent.label} in time.`,
    detail: [
      ...detail,
      `Every ${old.label} post is older than every ${recent.label} post, so they stack in layers instead of mixing.`,
    ],
    actions: [{ kind: 'review-window', label: 'Feed settings' }],
  };
}

// ---------------------------------------------------------------------------
// Crafting the feed (spec/sprint/explore-2026-11.md, Sprint 2): is Home built
// from enough people and tags, and how much of it is written by machines?
// Thresholds are the owner's proposed first guesses, to calibrate with use.
// ---------------------------------------------------------------------------

/** Following fewer people than this is worth a word. */
export const FOLLOW_NOTICE = 100;
/** Following fewer than this, Home is almost certainly thin. */
export const FOLLOW_WARN = 30;
/** A full sample reaching back further than this many hours is a quiet feed. */
export const SPAN_NOTICE_HOURS = 12;
export const SPAN_WARN_HOURS = 48;
/**
 * A sample this many posts or larger is "full" enough for its span to mean
 * something. A smaller one ran out of posts, which is its own answer.
 */
export const SPAN_MIN_POSTS = 40;
/** Fewer followed hashtags than this is worth a word; none is a warning. */
export const TAGS_NOTICE = 5;
/** Never judge an author's replying or rhythm on fewer of their posts than this. */
export const AUTOMATED_MIN_POSTS = 8;
/** "Mostly links": the share of an author's posts that carry an outbound link. */
export const LINK_HEAVY_SHARE = 0.8;
export const AUTOMATED_NOTICE_SHARE = 0.15;
export const AUTOMATED_WARN_SHARE = 0.3;
/** How many automated accounts get their own buttons. */
const AUTOMATED_LISTED = 5;

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, notice: 1, warn: 2 };

function worse(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** Hours between the newest and oldest post in the sample; null when under two posts. */
export function sampleSpanHours(posts: Status[]): number | null {
  const times = posts.map((p) => new Date(p.created_at).getTime()).filter(Number.isFinite);
  if (times.length < 2) return null;
  return (Math.max(...times) - Math.min(...times)) / 3_600_000;
}

/** "3 hours", "2 days": coarse on purpose, because the thresholds are coarse. */
export function spanLabel(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  return `${Math.round(hours / 24)} days`;
}

/**
 * Are you following enough people for Home to be worth opening?
 *
 * Two readings, and the worse one wins. The follow count is the cause; how far
 * back a full sample reaches is the symptom, and the symptom is what the reader
 * feels. Someone following 40 chatty people can have a lively Home, and someone
 * following 300 quiet ones a dead one.
 *
 * @param people accounts followed, or null when the count is not known.
 */
export function diagnoseFollowing(posts: Status[], people: number | null): Verdict {
  const span = sampleSpanHours(posts);
  const countSeverity: Severity =
    people === null
      ? 'ok'
      : people < FOLLOW_WARN
        ? 'warn'
        : people < FOLLOW_NOTICE
          ? 'notice'
          : 'ok';
  const spanSeverity: Severity =
    posts.length < SPAN_MIN_POSTS
      ? posts.length === 0
        ? 'warn'
        : 'notice'
      : span === null || span <= SPAN_NOTICE_HOURS
        ? 'ok'
        : span > SPAN_WARN_HOURS
          ? 'warn'
          : 'notice';
  const severity = worse(countSeverity, spanSeverity);

  const followLine =
    people === null ? null : `You follow ${people} ${people === 1 ? 'account' : 'accounts'}.`;
  const reachLine =
    posts.length === 0
      ? 'No posts reached your Home.'
      : posts.length < SPAN_MIN_POSTS
        ? `Only ${posts.length} posts reached your Home.`
        : span === null
          ? null
          : `The last ${posts.length} posts in your Home go back ${spanLabel(span)}.`;
  const lines = [followLine, reachLine].filter((line): line is string => !!line);

  if (severity === 'ok') {
    return {
      id: 'following',
      severity,
      headline: lines.join(' ') || 'Your Home is well supplied.',
      detail: [],
      actions: [],
    };
  }
  return {
    id: 'following',
    severity,
    headline: spanSeverity !== 'ok' ? 'Your Home is thin.' : 'You follow only a few accounts.',
    detail: [
      ...lines,
      'Starter kits are the quickest way to fill it: a whole set of active people at once.',
    ],
    actions: [
      { kind: 'find-kits', label: 'Browse starter kits' },
      { kind: 'find-people', label: 'Find people' },
    ],
  };
}

/**
 * Are you following hashtags? They are the one source that brings in people
 * you don't follow yet, and the one the Feeds hub hides best.
 *
 * Returns null when hashtags cannot be followed (Bluesky, Misskey): saying
 * nothing beats a warning the reader cannot act on.
 */
export function diagnoseTags(tags: number | null): Verdict | null {
  if (tags === null) return null;
  const severity: Severity = tags === 0 ? 'warn' : tags < TAGS_NOTICE ? 'notice' : 'ok';
  const count = `You follow ${tags} ${tags === 1 ? 'hashtag' : 'hashtags'}.`;
  if (severity === 'ok') {
    return { id: 'tags', severity, headline: count, detail: [], actions: [] };
  }
  return {
    id: 'tags',
    severity,
    headline: tags === 0 ? 'You don’t follow any hashtags.' : count,
    detail: [
      'A followed hashtag brings posts on that topic into Home, from people you don’t follow yet.',
    ],
    actions: [{ kind: 'find-tags', label: 'Find hashtags' }],
  };
}

/** Why an account reads as automated. At least one is always present. */
export type AutomatedReason = 'botFlag' | 'schedule' | 'neverReplies';

export interface AutomatedAuthor {
  account: Account;
  /** Their posts in the sample, by content author (boosts count for the writer). */
  count: number;
  share: number;
  reasons: AutomatedReason[];
}

const REASON_TEXT: Record<AutomatedReason, string> = {
  botFlag: 'says it is a bot',
  schedule: 'posts on a fixed schedule',
  neverReplies: 'never replies, mostly links',
};

/**
 * Accounts in the sample that read as automated, loudest first.
 *
 * Three signals, any one enough:
 *
 *  - the account's own **bot setting**;
 *  - a **fixed schedule** (`postingRhythm` says bot-like);
 *  - **never replies, mostly links**: RSS cross-posters cannot reply, because
 *    they only relay a feed (owner, 2026-11-26). "Never replies" alone is not
 *    enough here: Home hides replies to people the reader doesn't follow, so a
 *    talkative human can look silent in a Home sample. Pairing it with "mostly
 *    links" is what makes it the RSS-relay pattern rather than a quirk of the
 *    timeline.
 */
export function automatedAuthors(posts: Status[]): AutomatedAuthor[] {
  const byAuthor = new Map<string, { account: Account; posts: Status[] }>();
  const seen = new Set<string>();
  for (const post of posts) {
    const subject = feedSubject(post);
    if (seen.has(subject.id)) continue;
    seen.add(subject.id);
    const key = subject.account.acct;
    const entry = byAuthor.get(key) ?? { account: subject.account, posts: [] };
    entry.posts.push(subject);
    byAuthor.set(key, entry);
  }

  const total = seen.size;
  const found: AutomatedAuthor[] = [];
  for (const { account, posts: theirs } of byAuthor.values()) {
    const reasons: AutomatedReason[] = [];
    if (account.bot) reasons.push('botFlag');
    if (theirs.length >= AUTOMATED_MIN_POSTS) {
      if (postingRhythm(theirs)?.verdict === 'botLike') reasons.push('schedule');
      const repliesToOthers = theirs.filter(
        (p) => !!p.in_reply_to_account_id && p.in_reply_to_account_id !== account.id,
      ).length;
      const linked = theirs.filter(
        (p) => !!p.card || parseContent(p.content ?? '').links.length > 0,
      ).length;
      if (repliesToOthers === 0 && linked / theirs.length >= LINK_HEAVY_SHARE) {
        reasons.push('neverReplies');
      }
    }
    if (reasons.length) {
      found.push({ account, count: theirs.length, share: theirs.length / total, reasons });
    }
  }
  return found.sort((a, b) => b.count - a.count);
}

/**
 * How much of Home is written by machines, and by whom.
 *
 * Every fix is one account and one click: there is deliberately no "unfollow
 * every bot" button. Some bots are wanted (a weather feed, a favourite comic),
 * and a bulk unfollow is a kind of tool this app does not build.
 */
export function diagnoseAutomated(posts: Status[]): Verdict {
  const authors = automatedAuthors(posts);
  const total = new Set(posts.map((p) => feedSubject(p).id)).size;
  const share = total ? authors.reduce((sum, a) => sum + a.count, 0) / total : 0;

  if (!authors.length) {
    return {
      id: 'automated',
      severity: 'ok',
      headline: total ? 'No automated accounts stand out.' : 'Nothing in this sample yet.',
      detail: [],
      actions: [],
    };
  }
  const severity: Severity =
    share >= AUTOMATED_WARN_SHARE ? 'warn' : share >= AUTOMATED_NOTICE_SHARE ? 'notice' : 'ok';
  const headline = `Automated accounts wrote ${pct(share)}% of this sample.`;
  if (severity === 'ok') {
    return { id: 'automated', severity, headline, detail: [], actions: [] };
  }
  const listed = authors.slice(0, AUTOMATED_LISTED);
  const reasons = (a: AutomatedAuthor) => a.reasons.map((r) => REASON_TEXT[r]).join(', ');
  return {
    id: 'automated',
    severity,
    headline,
    detail: [
      ...listed.map((a) => `@${a.account.acct}: ${pct(a.share)}% of the sample; ${reasons(a)}.`),
      ...(authors.length > listed.length ? [`And ${authors.length - listed.length} more.`] : []),
    ],
    actions: listed.flatMap((a): DoctorAction[] => [
      {
        kind: 'mute',
        label: `Mute @${a.account.acct} for 8 hours`,
        account: a.account,
        seconds: MUTE_8H,
      },
      { kind: 'unfollow', label: `Unfollow @${a.account.acct}`, account: a.account },
    ]),
  };
}

export interface DiagnoseOptions {
  posts: Status[];
  outcomes: SourceOutcome[];
  bySource: Record<string, number>;
  /**
   * Per-provider stats for the signed-in aggregated feed. Absent for the
   * anonymous feed, which has one kind of source and its own `outcomes`.
   */
  slices?: ProviderSlice[];
  /**
   * What is bounding the feed. Available to both feeds — unlike `outcomes`,
   * every mechanism in it applies whoever you are signed in as — and it is what
   * answers "why did my feed end" when there are no per-follow outcomes.
   */
  bounds?: FeedBounds;
  /**
   * Feed-crafting facts (Explore's Feed tab). `following`: accounts followed;
   * `followedTags`: hashtags followed, null where hashtags cannot be followed.
   * Leaving both out keeps the original Feed Doctor checks only.
   */
  crafting?: { following: number | null; followedTags: number | null };
  now?: number;
}

/**
 * Run every check that has data behind it.
 *
 * Both feeds get flooding and mixing — those questions are identical whoever you
 * are. The rest depends on what the feed can actually report:
 *
 *  - **Anonymous** builds Home from per-follow reads, so it can say *which
 *    follow* went quiet or was filtered away (`outcomes`).
 *  - **Signed in**, Home is `FeedAggregator` merging Mastodon, Bluesky, Twitter
 *    and RSS. There are no per-follow outcomes, but there is something the
 *    anonymous feed has no equivalent for: per-provider freshness and time
 *    spans, which is where the signed-in feed actually goes wrong.
 *
 * `bounds` is the exception to that split: cooldowns, windows and filters bound
 * both feeds identically, so {@link diagnoseStopped} runs for whoever supplies
 * it. It is what a signed-in reader gets instead of {@link diagnoseEnding}, and
 * without it the Doctor cannot answer the question it exists for.
 *
 * A verdict with nothing behind it is omitted rather than rendered as a
 * reassuring green tick — claiming "every follow returned posts" when nothing was
 * measured is worse than saying nothing.
 */
export function diagnoseFeed(options: DiagnoseOptions): FeedDiagnosis {
  const now = options.now ?? Date.now();
  const verdicts: Verdict[] = [diagnoseFlooding(options.posts)];

  if (options.slices?.length) {
    verdicts.push(diagnoseSources(options.slices, now), diagnoseTimespans(options.slices, now));
  }
  if (options.bounds) {
    verdicts.push(diagnoseStopped(options.bounds));
  }
  if (options.outcomes.length) {
    verdicts.push(diagnoseEnding(options.outcomes));
  }
  verdicts.push(diagnoseMixing(options.bySource));

  if (options.crafting) {
    const tags = diagnoseTags(options.crafting.followedTags);
    verdicts.push(
      diagnoseFollowing(options.posts, options.crafting.following),
      ...(tags ? [tags] : []),
      diagnoseAutomated(options.posts),
    );
    // Problems first, worst first; healthy lines collapse at the bottom.
    // Stable, so equal severities keep the order above. Only for the crafting
    // page: the classic Doctor keeps its order.
    verdicts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  }

  return { sampleSize: options.posts.length, verdicts };
}

/** Re-exported so the page can render author rows without importing two modules. */
export type { AuthorRow };
export { feedSubject };
