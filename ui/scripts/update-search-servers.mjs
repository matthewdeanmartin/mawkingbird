// Probes every server in public/mastodon-servers.json once for anonymous search,
// and writes what each one supports to public/search-servers.json.
//
// Anonymous search-server choice reads that file instead of hunting through the
// whole directory live: a live hunt probed server after server, minutes at a time,
// to find what this snapshot can say up front — usually that none qualify.
//
// The bar mirrors src/app/discovery/search-server-probe.ts (keep them in step):
//  - accounts: an account search (`type=accounts`) for a canary returns results.
//  - posts: a common hashtag query returns posts, not just matching tag names.
//  - tagsOnly: the hashtag query named the tag but returned no posts.
// Keep the three capabilities independent: account or hashtag search is useful
// even if no server in this snapshot serves anonymous posts.
//
// Usage: npm run search-servers:snapshot   (read-only GET requests to each server)
import { readFile, writeFile } from 'node:fs/promises';

const directoryFile = new URL('../public/mastodon-servers.json', import.meta.url);
const destination = new URL('../public/search-servers.json', import.meta.url);
const ACCOUNT_CANARIES = ['Gargron', 'mastodon'];
const POST_CANARIES = ['#mastodon', '#news'];
const TIMEOUT_MS = 8000;
const CONCURRENCY = 8;

async function search(domain, q, type) {
  const params = new URLSearchParams({ q, limit: '5' });
  if (type) params.set('type', type);
  try {
    const response = await fetch(`https://${domain}/api/v2/search?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mawkingbird search-server snapshot' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if ([401, 403, 422].includes(response.status)) return { refused: true };
    if (!response.ok) return { unreachable: true };
    const payload = await response.json();
    return {
      accounts: payload.accounts?.length ?? 0,
      statuses: payload.statuses?.length ?? 0,
      hashtags: payload.hashtags?.length ?? 0,
    };
  } catch {
    return { unreachable: true };
  }
}

async function probe(domain) {
  let status = 'unreachable';
  let accounts = false;
  for (const q of ACCOUNT_CANARIES) {
    const result = await search(domain, q, 'accounts');
    if (result.refused) {
      status = 'auth-required';
      break;
    }
    if (result.unreachable) continue;
    if (result.accounts > 0) {
      accounts = true;
      status = 'ok';
      break;
    }
    status = 'no-results';
  }
  let hashtags = false;
  for (const tag of POST_CANARIES) {
    const result = await search(domain, tag, null);
    if (result.refused || result.unreachable) continue;
    if (result.statuses > 0) return { status: 'ok', accounts, posts: true, tagsOnly: false };
    hashtags ||= result.hashtags > 0;
  }
  return {
    status: accounts || hashtags ? 'ok' : status,
    accounts,
    posts: false,
    tagsOnly: hashtags,
  };
}

const directory = JSON.parse(await readFile(directoryFile, 'utf8'));
if (!Array.isArray(directory)) throw new Error('mastodon-servers.json is not a list.');
const domains = [...new Set(directory.map((server) => String(server.domain).toLowerCase()))];

const results = new Map();
let next = 0;
async function worker() {
  while (next < domains.length) {
    const domain = domains[next++];
    results.set(domain, await probe(domain));
    if (results.size % 25 === 0) console.log(`probed ${results.size}/${domains.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const servers = domains.map((domain) => ({ domain, ...results.get(domain) }));
const usable = servers.filter(
  (server) => server.accounts || server.tagsOnly || server.posts,
).length;
const postServers = servers.filter((server) => server.posts).length;
const snapshot = {
  version: 1,
  checkedAt: new Date().toISOString(),
  checked: servers.length,
  usable,
  postServers,
  servers,
};
await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(
  `Probed ${servers.length} servers; ${usable} allow anonymous search, ${postServers} return posts. Wrote ${destination.pathname}`,
);
