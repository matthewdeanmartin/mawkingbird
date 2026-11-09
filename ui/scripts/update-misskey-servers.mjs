// Refresh public/misskey-servers.json, the server suggestions on /login/misskey.
//
// Source: the unofficial Misskey server list at https://servers.misskey.ink
// (`/api/v1/instances`). It already excludes servers on JoinMisskey's
// `ignorehosts.yml` (the official directory's blocklist) and anything that is
// not Misskey (see its `/api/v1/exclusions`). On top of that this keeps only
// servers that are alive and not suspended, ranks them by the list's own
// `recommendation_score`, and then asks each candidate's NodeInfo whether it
// runs Misskey itself, because sign-in refuses forks (owner decision
// 2026-11-09) and suggesting a server that then gets refused is worse than not
// suggesting it.
//
// Run by hand (`npm run servers:misskey`), like `servers:snapshot`; the app
// never calls servers.misskey.ink from a reader's browser.

import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://servers.misskey.ink/api/v1/instances';
const PAGE = 100;
const KEEP = 40;
/** How many top-ranked candidates to check over NodeInfo before keeping KEEP. */
const CANDIDATES = 90;
const destination = new URL('../public/misskey-servers.json', import.meta.url);

async function json(url, timeoutMs = 20_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function allInstances() {
  const items = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await json(`${SOURCE}?limit=${PAGE}&offset=${offset}`);
    if (!Array.isArray(page?.items)) throw new Error('Unexpected server list shape.');
    items.push(...page.items);
    if (page.items.length < PAGE || items.length >= page.total) return items;
  }
}

/** NodeInfo `software.name`, lowercased, or null when it cannot be read. */
async function softwareName(host) {
  try {
    const wellKnown = await json(`https://${host}/.well-known/nodeinfo`, 8000);
    const href = (wellKnown.links ?? [])
      .map((link) => link.href)
      .filter((value) => typeof value === 'string' && value.startsWith(`https://${host}/`))
      .sort()
      .pop();
    if (!href) return null;
    const info = await json(href, 8000);
    return typeof info?.software?.name === 'string' ? info.software.name.toLowerCase() : null;
  } catch {
    return null;
  }
}

const instances = await allInstances();
const candidates = instances
  .filter(
    (item) =>
      typeof item?.host === 'string' &&
      item.is_alive === true &&
      item.suspension_state === 'none' &&
      typeof item.recommendation_score === 'number',
  )
  .sort((a, b) => b.recommendation_score - a.recommendation_score)
  .slice(0, CANDIDATES);

const verified = [];
for (let i = 0; i < candidates.length; i += 8) {
  const batch = candidates.slice(i, i + 8);
  const names = await Promise.all(batch.map((item) => softwareName(item.host)));
  batch.forEach((item, index) => {
    if (names[index] === 'misskey') verified.push(item);
  });
}

const servers = verified.slice(0, KEEP).map((item) => ({
  host: item.host,
  name: item.name ?? item.host,
  language: item.language || null,
  users: item.users_count ?? 0,
  openRegistrations: item.open_registrations === true,
  iconUrl: item.icon_url ?? null,
}));
if (servers.length < 10) {
  throw new Error(`Only ${servers.length} servers survived the checks; not overwriting the list.`);
}

await writeFile(destination, `${JSON.stringify(servers, null, 2)}\n`, 'utf8');
console.log(
  `Checked ${candidates.length} of ${instances.length} servers; wrote ${servers.length} to ${destination.pathname}`,
);
