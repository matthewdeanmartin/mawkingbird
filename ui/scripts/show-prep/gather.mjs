// Gather (spec/show-prep.md): public, unauthenticated reads only. No sign-in, no writes.

import { Budget, gatherSeeds, gatherTrendingLinks } from './extras.mjs';
import { linkMatches } from './rank.mjs';

/**
 * @typedef {{ status: any, server: string, tag: string, seed?: boolean }} Candidate
 * @typedef {{ link: any, matched: string[], shares: number, servers: string[], posts: any[] }} TrendingLink
 * @typedef {{ candidates: Candidate[], links: TrendingLink[], requests: number, failures: string[] }} Gathered
 */

/**
 * Everything one episode reads, within the pack's request budget: each
 * hashtag's public timeline on each server, the seed accounts' recent posts,
 * and the servers' trending links that match the topic. One failing server,
 * tag or account is recorded, not fatal. Posts seen twice are merged later,
 * by ranking.
 *
 * @param {import('./topic.mjs').TopicPack} pack
 * @param {{ fetch?: typeof fetch, delayMs?: number }} [options]
 * @returns {Promise<Gathered>}
 */
export async function gatherTopic(pack, options = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const delayMs = options.delayMs ?? 250;
  const budget = new Budget(pack.requestBudget);
  /** @type {Candidate[]} */
  const candidates = [];
  for (const tag of pack.hashtags) {
    for (const server of pack.servers) {
      if (budget.spent) break;
      const statuses = await budget.json(
        fetchImpl,
        `https://${server}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${pack.perTagLimit}`,
        `${server} #${tag}`,
      );
      for (const status of Array.isArray(statuses) ? statuses : [])
        candidates.push({ status, server, tag });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Seeds and trends come after hashtags, so a tight budget keeps the core.
  candidates.push(...(await gatherSeeds(pack.seedAccounts ?? [], budget, fetchImpl)));
  const links =
    pack.trendingLinks === false
      ? []
      : await gatherTrendingLinks(pack, budget, fetchImpl, (link) => linkMatches(link, pack));
  if (budget.spent && !budget.failures.some((f) => f.startsWith('budget'))) {
    budget.failures.push(`budget of ${pack.requestBudget} requests reached`);
  }
  return { candidates, links, requests: budget.used, failures: budget.failures };
}

/**
 * Where a post lives: its server and its id there, from the post's URL
 * (`https://host/@user/123`, or ActivityPub's `https://host/users/u/statuses/123`).
 *
 * @param {string} url
 * @returns {{ host: string, id: string } | null}
 */
export function postAddress(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const match =
      parsed.pathname.match(/^\/@[^/]+\/(\w+)$/) ??
      parsed.pathname.match(/^\/users\/[^/]+\/statuses\/(\w+)$/);
    return match ? { host: parsed.host, id: match[1] } : null;
  } catch {
    return null;
  }
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'MawkingbirdShowPrep/0.1 (+https://mawkingbird.com/)',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
}

/**
 * One public post from its home server (two-way: the post itself).
 *
 * @param {string} url The post's address.
 * @param {{ fetch?: typeof fetch }} [options]
 */
export async function fetchPost(url, options = {}) {
  const where = postAddress(url);
  if (!where) throw new Error(`Not a Mastodon post address: ${url}`);
  return getJson(options.fetch ?? fetch, `https://${where.host}/api/v1/statuses/${where.id}`);
}

/**
 * A post's thread from its home server: the root (first ancestor, or the post
 * itself) and the direct replies to the post, most liked first. Two requests.
 *
 * @param {string} url
 * @param {{ fetch?: typeof fetch, replies?: number }} [options]
 */
export async function fetchThread(url, options = {}) {
  const where = postAddress(url);
  if (!where) throw new Error(`Not a Mastodon post address: ${url}`);
  const fetchImpl = options.fetch ?? fetch;
  const base = `https://${where.host}/api/v1/statuses/${where.id}`;
  const [post, context] = await Promise.all([
    getJson(fetchImpl, base),
    getJson(fetchImpl, `${base}/context`),
  ]);
  const root = context.ancestors?.[0] ?? post;
  const replies = (context.descendants ?? [])
    .filter((reply) => reply.in_reply_to_id === post.id)
    .sort((a, b) => (b.favourites_count ?? 0) - (a.favourites_count ?? 0))
    .slice(0, options.replies ?? 5);
  return {
    post,
    root,
    replies,
    ancestors: context.ancestors?.length ?? 0,
    descendants: context.descendants?.length ?? 0,
  };
}
