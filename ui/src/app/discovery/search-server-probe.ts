/**
 * Does this server actually answer anonymous search?
 *
 * A server can be perfectly reachable and still be useless as a search server:
 * many instances require a token for `/api/v2/search`, and some answer 200 with an
 * empty payload. So reachability alone proves nothing — the only honest test is to
 * run a real anonymous search for something every federated server has heard of and
 * see whether results come back.
 *
 * Two canaries, not one, because account search and post search fail *separately*.
 *
 * ## What "post search works" means here
 *
 * Measured across the ~300 servers in the bundled directory: **none of them serve
 * anonymous full-text post search.** `/api/v2/search` with a bare word returns no
 * statuses anywhere, because full-text needs Elasticsearch *and* a token. Probing
 * for it was therefore a test every candidate failed, which is a test that sorts
 * nothing.
 *
 * What does vary — and what the anonymous search page actually depends on — is what
 * a server does with a **hashtag** query. Three outcomes, all live in the wild:
 *
 *  1. Posts come back. This is the only useful one.
 *  2. Nothing comes back at all.
 *  3. Only a list of matching *hashtags* comes back, and no posts.
 *
 * Outcome 3 is the trap this file exists to catch: the server clearly recognised
 * the tag, answered 200, and handed over a payload that looks like a result set
 * until you notice it contains nothing to read. So the post canary is a hashtag,
 * and the bar is `statuses.length > 0` — a hashtags list is explicitly not
 * evidence. See `sprint/anonymous-great-1-search-truth.md`.
 */

/** Accounts big enough that any server with a populated index knows them. */
const CANARY_QUERIES = ['Gargron', 'mastodon'];

/**
 * The post canaries: common hashtags, not bare words.
 *
 * Hashtags because that is the only post query anonymous visitors get answers to
 * anywhere (see above), and common ones because a tag nobody used is indistinguishable
 * from a server that won't answer. Two of them, tried in order, so that one quiet tag
 * doesn't get a working server rejected — and rejections here are *persisted*, which
 * makes a false negative outlive the request that caused it.
 */
const POST_CANARIES = ['#mastodon', '#news'];

export type SearchServerStatus =
  | 'idle'
  | 'checking'
  /** Anonymous search works and returned results. */
  | 'ok'
  /** Answered, but with nothing — index is empty or search is quietly restricted. */
  | 'no-results'
  /** Explicitly refused anonymous search (401/403/422). */
  | 'auth-required'
  /** Couldn't be reached at all (DNS, CORS, timeout, 5xx). */
  | 'unreachable';

export interface SearchServerProbe {
  status: SearchServerStatus;
  /** How many accounts the canary query matched (0 unless status is 'ok'). */
  accounts: number;
  /**
   * How many posts the hashtag canary matched, or null when it was never run.
   *
   * Null rather than 0: "we didn't ask" and "asked, and this server returns no
   * posts" are the two facts this whole module exists to keep apart.
   */
  statuses: number | null;
  /**
   * How many hashtags that same query matched.
   *
   * Kept alongside `statuses` purely to tell outcome 2 from outcome 3 above. With
   * `statuses: 0` and this above zero, the server understood the tag and still had
   * nothing to show — worth saying out loud, because it is the case a user would
   * otherwise read as "nobody posts here".
   */
  hashtags: number | null;
}

interface SearchPayload {
  accounts?: unknown[];
  statuses?: unknown[];
  hashtags?: unknown[];
}

/** What one canary request saw. */
interface Counts {
  accounts: number;
  statuses: number;
  hashtags: number;
}

/**
 * Is this server usable as a *search server*?
 *
 * Both halves must work, and "posts" means posts: a payload carrying only matching
 * hashtag names fails this, because a hashtags list is not something the user can
 * read. Every server answers hashtag *lookup*; far fewer hand over the timeline.
 */
export function isUsableSearchServer(probe: SearchServerProbe): boolean {
  return probe.status === 'ok' && probe.accounts > 0 && (probe.statuses ?? 0) > 0;
}

/** Answered the tag query, named the tag, and returned nothing to read. */
export function isTagsOnly(probe: SearchServerProbe): boolean {
  return probe.status === 'ok' && probe.statuses === 0 && (probe.hashtags ?? 0) > 0;
}

/**
 * Run one anonymous canary search against `baseUrl`. Tries a second canary only if
 * the first returns zero results, so a merely-unlucky query isn't mistaken for a
 * disabled index.
 *
 * The post canary runs only once account search has proved the server answers at
 * all: there is nothing to learn from a post probe against a host that 401s.
 */
export async function probeSearchServer(
  baseUrl: string,
  abortSignal?: AbortSignal,
  timeoutMs = 8000,
): Promise<SearchServerProbe> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;

  let lastStatus: SearchServerStatus = 'unreachable';
  for (const query of CANARY_QUERIES) {
    const result = await runCanary(baseUrl, query, 'accounts', signal);
    if (result.refused) {
      return { status: 'auth-required', accounts: 0, statuses: null, hashtags: null };
    }
    if (result.counts === null) {
      lastStatus = 'unreachable';
      continue;
    }
    if (result.counts.accounts > 0) {
      // Account search works. Only now is the post probe worth a request.
      const posts = await probePostSearch(baseUrl, signal);
      return { status: 'ok', accounts: result.counts.accounts, ...posts };
    }
    lastStatus = 'no-results';
  }
  return { status: lastStatus, accounts: 0, statuses: null, hashtags: null };
}

/**
 * Ask for a common hashtag and see whether posts come back.
 *
 * Stops at the first canary that yields posts. When none do, reports the largest
 * hashtag count seen, so a tags-only server is still distinguishable from a silent
 * one. A refused or unreachable post probe is reported as zero rather than null: the
 * host answered account search, so "no usable post search" is a finding about this
 * host and not an absence of information.
 */
async function probePostSearch(
  baseUrl: string,
  signal: AbortSignal,
): Promise<{ statuses: number; hashtags: number }> {
  let hashtags = 0;
  for (const tag of POST_CANARIES) {
    const result = await runCanary(baseUrl, tag, null, signal);
    if (result.counts === null) {
      continue;
    }
    if (result.counts.statuses > 0) {
      return { statuses: result.counts.statuses, hashtags: result.counts.hashtags };
    }
    hashtags = Math.max(hashtags, result.counts.hashtags);
  }
  return { statuses: 0, hashtags };
}

/**
 * One search request. `counts: null` means the request itself did not answer.
 *
 * A null `type` omits the parameter, which is what the post canary wants: asking for
 * `type=statuses` makes a server that would have answered with hashtag names return
 * an empty payload instead, collapsing "recognised the tag, no posts" into "nothing",
 * and those are the two cases worth telling apart.
 */
async function runCanary(
  baseUrl: string,
  query: string,
  type: 'accounts' | 'statuses' | null,
  signal: AbortSignal,
): Promise<{ counts: Counts | null; refused: boolean }> {
  const params = new URLSearchParams({ q: query, limit: '5' });
  if (type) {
    params.set('type', type);
  }
  try {
    const response = await fetch(`${baseUrl}/api/v2/search?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401 || response.status === 403 || response.status === 422) {
      // Mastodon uses 422 for "this endpoint needs a token" on some builds.
      return { counts: null, refused: true };
    }
    if (!response.ok) {
      return { counts: null, refused: false };
    }
    const payload = (await response.json()) as SearchPayload;
    return {
      counts: {
        accounts: payload.accounts?.length ?? 0,
        statuses: payload.statuses?.length ?? 0,
        hashtags: payload.hashtags?.length ?? 0,
      },
      refused: false,
    };
  } catch {
    return { counts: null, refused: false };
  }
}
