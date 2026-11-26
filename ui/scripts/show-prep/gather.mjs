// Gather (spec/show-prep.md): public, unauthenticated reads only. No sign-in, no writes.

/**
 * @typedef {{ status: any, server: string, tag: string }} Candidate
 * @typedef {{ candidates: Candidate[], requests: number, failures: string[] }} Gathered
 */

/**
 * Read each hashtag's public timeline on each server, within the pack's
 * request budget. One failing server or tag is recorded, not fatal. Posts seen
 * on several servers stay separate here; ranking deduplicates by URI.
 *
 * @param {import('./topic.mjs').TopicPack} pack
 * @param {{ fetch?: typeof fetch, delayMs?: number, userAgent?: string }} [options]
 * @returns {Promise<Gathered>}
 */
export async function gatherTopic(pack, options = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const delayMs = options.delayMs ?? 250;
  const userAgent = options.userAgent ?? 'MawkingbirdShowPrep/0.1 (+https://mawkingbird.com/)';
  /** @type {Candidate[]} */
  const candidates = [];
  const failures = [];
  let requests = 0;
  for (const tag of pack.hashtags) {
    for (const server of pack.servers) {
      if (requests >= pack.requestBudget) {
        failures.push(`budget of ${pack.requestBudget} requests reached`);
        return { candidates, requests, failures };
      }
      const url = `https://${server}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${pack.perTagLimit}`;
      requests++;
      try {
        const response = await fetchImpl(url, {
          headers: { accept: 'application/json', 'user-agent': userAgent },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          failures.push(`${server} #${tag}: HTTP ${response.status}`);
        } else {
          const statuses = await response.json();
          if (Array.isArray(statuses)) {
            for (const status of statuses) candidates.push({ status, server, tag });
          }
        }
      } catch (error) {
        failures.push(
          `${server} #${tag}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { candidates, requests, failures };
}
