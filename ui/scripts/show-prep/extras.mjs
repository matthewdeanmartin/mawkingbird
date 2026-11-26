// Seed accounts and trending links (spec/show-prep.md, Sprint 3): two more
// public sources beside hashtag timelines. Read-only, signed out.

const AGENT = 'MawkingbirdShowPrep/0.1 (+https://mawkingbird.com/)';

/** A request counter shared by every source in one gather, so the pack's budget holds. */
export class Budget {
  constructor(limit) {
    this.limit = limit;
    this.used = 0;
    /** @type {string[]} */
    this.failures = [];
  }
  get spent() {
    return this.used >= this.limit;
  }
  async json(fetchImpl, url, label) {
    if (this.spent) {
      if (!this.failures.some((f) => f.startsWith('budget'))) {
        this.failures.push(`budget of ${this.limit} requests reached`);
      }
      return null;
    }
    this.used++;
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.failures.push(`${label}: HTTP ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      this.failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

/** `user@host` (with or without a leading @), or null. */
export function parseHandle(handle) {
  const match = String(handle ?? '')
    .trim()
    .replace(/^@/, '')
    .match(/^([A-Za-z0-9_.-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
  return match ? { user: match[1], host: match[2].toLowerCase() } : null;
}

/**
 * Seed accounts: a pack's own list of people and projects whose recent posts
 * are read whether or not they used a hashtag (release posts often don't).
 * Two requests each: look the account up on its home server, then its recent
 * posts without replies or boosts.
 *
 * @param {string[]} handles
 * @param {Budget} budget
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<import('./gather.mjs').Candidate[]>}
 */
export async function gatherSeeds(handles, budget, fetchImpl) {
  const candidates = [];
  for (const handle of handles) {
    const parsed = parseHandle(handle);
    if (!parsed) {
      budget.failures.push(`seed ${handle}: not a user@host handle`);
      continue;
    }
    const { user, host } = parsed;
    const account = await budget.json(
      fetchImpl,
      `https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`,
      `seed ${user}@${host}`,
    );
    if (!account?.id) continue;
    const statuses = await budget.json(
      fetchImpl,
      `https://${host}/api/v1/accounts/${encodeURIComponent(account.id)}/statuses?limit=20&exclude_replies=true&exclude_reblogs=true`,
      `seed ${user}@${host} posts`,
    );
    for (const status of Array.isArray(statuses) ? statuses : []) {
      candidates.push({ status, server: host, tag: `seed:${user}@${host}`, seed: true });
    }
  }
  return candidates;
}

/**
 * A trending link's people: distinct accounts sharing it over the server's
 * history window (usually a week).
 */
export function linkShares(link) {
  return (link.history ?? []).reduce((sum, day) => sum + (Number(day.accounts) || 0), 0);
}

/**
 * Trending links on each server that match the topic, with the posts people
 * wrote about each (Mastodon 4.3+'s link timeline; older servers just give the
 * link). One request per server, plus one per matching link, up to `maxLinks`.
 *
 * @param {import('./topic.mjs').TopicPack} pack
 * @param {Budget} budget
 * @param {typeof fetch} fetchImpl
 * @param {(link: any) => string[]} matches Keywords a link matches (empty: off topic).
 */
export async function gatherTrendingLinks(pack, budget, fetchImpl, matches, maxLinks = 6) {
  /** @type {Map<string, any>} */
  const byUrl = new Map();
  for (const server of pack.servers) {
    const trends = await budget.json(
      fetchImpl,
      `https://${server}/api/v1/trends/links?limit=20`,
      `${server} trending links`,
    );
    for (const link of Array.isArray(trends) ? trends : []) {
      if (!link?.url || !/^https?:\/\//.test(link.url)) continue;
      const matched = matches(link);
      if (!matched.length) continue;
      const known = byUrl.get(link.url);
      if (known) {
        known.shares += linkShares(link);
        known.servers.push(server);
      } else {
        byUrl.set(link.url, {
          link,
          matched,
          shares: linkShares(link),
          servers: [server],
          posts: [],
        });
      }
    }
  }
  const links = [...byUrl.values()].sort((a, b) => b.shares - a.shares).slice(0, maxLinks);
  for (const entry of links) {
    const posts = await budget.json(
      fetchImpl,
      `https://${entry.servers[0]}/api/v1/timelines/link?url=${encodeURIComponent(entry.link.url)}&limit=20`,
      `${entry.servers[0]} posts about ${new URL(entry.link.url).host}`,
    );
    entry.posts = Array.isArray(posts) ? posts : [];
  }
  return links;
}
