#!/usr/bin/env node
// Fit REACH_MODEL.typicalBoosterAudience from real boosters.
//
// For each public account: one lookup, one page of recent posts, and one page
// of `reblogged_by` for up to MAX_BOOSTED boosted threads. Requests are
// sequential, spaced per server, and back off on rate-limit headers or 429, so
// even a very large account costs a handful of calls. Prints a JSON summary
// and a Markdown table for spec/analytics-calibration.md.
//
// Usage: node scripts/reach-calibration.mjs https://host/@user [...]
//        node scripts/reach-calibration.mjs --replay saved.json   (refit, no network)
//
// The recommendation is the median of each account's median booster audience,
// so every account weighs the same. A least-error fit over all threads is
// dominated by large accounts, where boosters barely move the total; it is
// reported for comparison, over booster-sensitive threads only (boosters are
// at least 10% of the potential audience).
import { readFileSync } from 'node:fs';
import { groupThreads, netReach, REACH_MODEL } from '../src/app/accounts/reach-model.ts';

const MAX_BOOSTED = 12;
const GAP_MS = 1200;
const LOW_REMAINING = 20;
const MAX_WAIT_MS = 5 * 60_000;
const lastCall = new Map();
let calls = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; attempt < 2; attempt++) {
    lastCall.set(host, Date.now());
    calls += 1;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'mawkingbird-reach-calibration' },
    });
    const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? 'NaN');
    const reset = Date.parse(res.headers.get('x-ratelimit-reset') ?? '');
    const untilReset = Number.isFinite(reset) ? Math.min(MAX_WAIT_MS, reset - Date.now()) : 60_000;
    if (res.status === 429) {
      console.error(`429 from ${host}; waiting ${Math.round(untilReset / 1000)}s`);
      await sleep(Math.max(1000, untilReset));
      continue;
    }
    if (remaining < LOW_REMAINING && untilReset > 0) {
      console.error(`${host}: ${remaining} requests left; pausing until reset`);
      await sleep(untilReset);
    }
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.json() };
  }
  return { ok: false, status: 429 };
}

function parseProfile(raw) {
  const url = new URL(raw);
  const user = url.pathname.replace(/^\/@?/, '').split('/')[0];
  return { origin: url.origin, user };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function sampleAccount(raw) {
  const { origin, user } = parseProfile(raw);
  const account = await get(`${origin}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`);
  if (!account.ok) return { profile: raw, error: `lookup HTTP ${account.status}` };
  const followers = account.body.followers_count;
  const statuses = await get(
    `${origin}/api/v1/accounts/${account.body.id}/statuses?limit=40&exclude_reblogs=true`,
  );
  if (!statuses.ok) return { profile: raw, followers, error: `statuses HTTP ${statuses.status}` };
  const threads = groupThreads(statuses.body)
    .filter((t) => t.boosts > 0)
    .slice(0, MAX_BOOSTED);
  const sampled = [];
  for (const thread of threads) {
    const boosters = new Map();
    let refused = false;
    for (const part of thread.parts.filter((p) => p.reblogs_count > 0)) {
      const page = await get(`${origin}/api/v1/statuses/${part.id}/reblogged_by?limit=80`);
      if (!page.ok) {
        refused = true;
        break;
      }
      for (const b of page.body) boosters.set(b.id, Math.max(0, b.followers_count ?? 0));
    }
    if (refused) continue;
    sampled.push({
      id: thread.root.id,
      likes: thread.likes,
      boosts: thread.boosts,
      replies: thread.replies,
      quotes: thread.quotes,
      boosterFollowers: [...boosters.values()],
    });
  }
  return { profile: raw, followers, threads: sampled };
}

/** Potential audience if every boost were worth `a` followers. */
const quickG = (f, t, a) => f + t.boosts * a;
/** Potential audience from the real boosters; unseen boosts use `a`. */
const fullG = (f, t, a) => {
  const seen = Math.min(t.boosts, t.boosterFollowers.length);
  return f + t.boosterFollowers.reduce((s, x) => s + x, 0) + (t.boosts - seen) * a;
};

/** Threads where boosters are at least 10% of the full potential audience. */
const sensitive = (r, t, a) =>
  fullG(r.followers, t, a) - r.followers >= 0.1 * fullG(r.followers, t, a);

function logError(results, a) {
  const errs = [];
  for (const r of results) {
    for (const t of r.threads ?? []) {
      if (!sensitive(r, t, a)) continue;
      const q = netReach(quickG(r.followers, t, a), t);
      const f = netReach(fullG(r.followers, t, a), t);
      if (q > 0 && f > 0) errs.push(Math.abs(Math.log(q / f)));
    }
  }
  return median(errs);
}

const args = process.argv.slice(2);
let results;
if (args[0] === '--replay') {
  results = JSON.parse(readFileSync(args[1], 'utf8')).raw;
} else {
  if (!args.length) {
    console.error('Usage: node scripts/reach-calibration.mjs https://host/@user [...]');
    process.exit(2);
  }
  results = [];
  for (const p of args) {
    console.error(`sampling ${p}`);
    results.push(await sampleAccount(p));
  }
}

// Equal weight per account: each contributes its own median booster audience.
const perAccount = results
  .filter((r) => r.threads?.length)
  .map((r) => ({
    profile: r.profile,
    followers: r.followers,
    medianBooster: median(r.threads.flatMap((t) => t.boosterFollowers)),
  }));
const recommended = Math.round(median(perAccount.map((p) => p.medianBooster)));
let leastError = { a: REACH_MODEL.typicalBoosterAudience, err: Infinity };
for (let a = 10; a <= 20_000; a = Math.round(a * 1.05) + 1) {
  const err = logError(results, a);
  if (err < leastError.err) leastError = { a, err };
}
const pooled = results.flatMap((r) => (r.threads ?? []).flatMap((t) => t.boosterFollowers));
const summary = {
  date: new Date().toISOString().slice(0, 10),
  apiCalls: calls,
  current: REACH_MODEL.typicalBoosterAudience,
  currentError: logError(results, REACH_MODEL.typicalBoosterAudience),
  recommended,
  recommendedError: logError(results, recommended),
  leastErrorFit: leastError,
  pooledMedianBooster: median(pooled),
  boostersSeen: pooled.length,
  perAccount,
  accounts: results.map((r) => ({
    profile: r.profile,
    followers: r.followers,
    error: r.error,
    boostedThreads: r.threads?.length ?? 0,
    threads: (r.threads ?? []).map((t) => ({
      boosts: t.boosts,
      attributed: t.boosterFollowers.length,
      quickNet: netReach(quickG(r.followers, t, recommended), t),
      fullNet: netReach(fullG(r.followers, t, recommended), t),
      potential: fullG(r.followers, t, recommended),
    })),
  })),
  raw: results,
};
console.log(JSON.stringify(summary, null, 2));
console.error(
  `\n${calls} API calls. Recommended typical booster audience: ${recommended} ` +
    `(median |log quick/full| on booster-sensitive threads ${summary.recommendedError.toFixed(3)})`,
);
