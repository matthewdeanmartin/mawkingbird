import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { OpenRouterChat } from '../../providers/openrouter/openrouter-chat';
import { SuggestionReply } from '../../providers/openrouter/json-suggestions';
import { PromptTemplateStore } from '../../providers/openrouter/prompt-templates';
import { BlueskySearch } from '../../providers/bluesky/bluesky-search';
import { BlueskyAccountSearch } from '../../providers/bluesky/bluesky-account-search';
import { parseBlueskyQuery } from './bluesky-query-serializer';

/**
 * Prose in, a runnable Mastodon search query out.
 *
 * The interesting part is the grading, and the rule is Matthew's: **try the
 * suggestions in order and stop at the first one that works.** The obvious
 * design — run all five, then decide — costs five API calls every single time,
 * in a codebase whose search page has an explicit API-call budget precisely
 * because that sort of thing adds up (`sprint/search-3-budget-and-pagination.md`).
 * Short-circuiting makes the common case one call.
 *
 * This works because the prompt asks for suggestions ordered most-to-least
 * likely. Walking that order and stopping early means the first query that
 * returns anything is also the most specific one that does — which is the one
 * the user wanted. The ordering used to be decorative; here it carries weight.
 */

/** A query "works" when it returns at least this many results. */
export const SEARCH_SUCCESS_THRESHOLD = 5;

/**
 * The same, for accounts and hashtags.
 *
 * Five is the right bar for post search, where a thin result set usually means
 * the query was over-specified. It is the wrong bar for the other two: there is
 * often exactly one account you meant, and demanding five more would reject the
 * correct answer in favour of a vaguer one.
 */
export const SEARCH_SUCCESS_THRESHOLD_NARROW = 1;

/** How many candidates to ask for, and therefore the worst-case probe count. */
export const SEARCH_QUERY_COUNT = 5;

/** Results per probe: we only need to know whether the threshold was cleared. */
const PROBE_LIMIT = SEARCH_SUCCESS_THRESHOLD;

export interface GradedQuery {
  query: string;
  /** Results returned, or null when the probe itself failed. */
  count: number | null;
}

export interface GradeOutcome {
  /** Every query actually tried, in order. Untried ones are absent by design. */
  attempts: GradedQuery[];
  /** The first query to clear the threshold, or null when none did. */
  winner: string | null;
  /** API calls spent. Equals `attempts.length`; named for the caller's benefit. */
  callsUsed: number;
}

export interface SearchHelperResult {
  /** The candidates behind the outcome — the refined set when one was needed. */
  queries: string[];
  attempts: GradedQuery[];
  winner: string | null;
  /** True when the first set all failed and the model was asked again. */
  refined: boolean;
  /** Total probes across both passes. */
  callsUsed: number;
  /** The bar a query had to clear, which varies by target. */
  threshold: number;
  /**
   * The model's objection, when it had one — "this isn't Google".
   *
   * Not an error: the request was understood and answered, just not with a
   * query. The dialog shows it and, when there are no candidates, stops there.
   */
  problem: string | null;
}

/** Which of the three search modes the page is in. */
export type SearchTargetKind = 'accounts' | 'statuses' | 'hashtags';

/**
 * The state of the search widgets, as the model needs to see it.
 *
 * Without this the helper always wrote post queries, because that is what the
 * prompt describes — so picking "Accounts" in the dropdown and asking for help
 * produced five post queries that the accounts endpoint then matched against
 * display names, badly. What the user has already set is part of the request.
 */
export interface SearchContext {
  target: SearchTargetKind;
  /** Advanced-form fields already set, as ready-to-read "Label: value" lines. */
  filters?: string[];
  /**
   * Which network the query has to run against.
   *
   * The two dialects are close enough to be confused and different enough to
   * fail: `after:` vs `since:`, `+word` vs bare words, and `has:media` — which
   * Mastodon honours and Bluesky treats as a literal search word. A model given
   * the Mastodon prompt writes Mastodon queries, so the network has to reach the
   * prompt, not just the probe.
   */
  network?: SearchNetwork;
}

/** Which engine a suggested query will be run against. */
export type SearchNetwork = 'mastodon' | 'bluesky';

/** The bar for one target. Posts want a real result set; the others want a hit. */
export function thresholdFor(target: SearchTargetKind): number {
  return target === 'statuses' ? SEARCH_SUCCESS_THRESHOLD : SEARCH_SUCCESS_THRESHOLD_NARROW;
}

/** What each mode wants back, in the model's terms. */
const TARGET_BRIEF: Record<SearchTargetKind, string> = {
  statuses:
    'The search box is set to Posts, so full-text post search is running and every operator above is available.',
  // Account search is NOT a name/bio lookup here, whatever Mastodon's API docs
  // imply. Mawkingbird runs two branches and merges them: a name/bio lookup, and
  // the same full-text post search the Posts tab runs, whose hits are grouped by
  // author (see `fetchAccounts`). `q` reaches both verbatim, so operators are
  // live — and telling the model otherwise made it withhold queries that work,
  // which is the whole value of "find me people who post about X".
  accounts:
    'The search box is set to Accounts. This runs TWO searches and merges them: display names, ' +
    '@handles and bios; AND a full-text post search whose results are grouped by author. ' +
    'The operators above DO apply, but only to the post half — the name/bio half matches plain ' +
    'text and ignores them. Prefer plain words when the user is naming a person; operators are ' +
    'appropriate when they are describing what someone posts about.',
  hashtags:
    'The search box is set to Hashtags, so the query is matched against tag names. ' +
    'The operators above do NOT apply here — return single words without the leading #.',
};

/**
 * The same, for Bluesky.
 *
 * Hashtags is present only because `SearchTargetKind` has three members — the
 * option is disabled in Bluesky mode (there is no tag index to search, only a
 * tag filter on post search), so this brief should never be reached. It says the
 * true thing rather than nothing, in case it ever is.
 */
const BLUESKY_TARGET_BRIEF: Record<SearchTargetKind, string> = {
  statuses:
    'The search box is set to Posts on Bluesky, so post search is running and every operator above is available.',
  accounts:
    'The search box is set to Accounts on Bluesky, so the query is matched against handles, display names and bios. ' +
    'The operators above do NOT apply here — return plain words, names, or handle fragments only.',
  hashtags:
    'Bluesky has no hashtag index to search. Return single words without the leading #, which will be matched as post text.',
};

/**
 * The `{{context}}` block: what the widgets are already set to.
 *
 * Stated as fact rather than instruction. The model is being told what is on
 * screen, and the prompt around it decides what to do about that — which keeps
 * the behaviour editable in Settings rather than compiled in here.
 */
export function describeContext(context: SearchContext): string {
  const lines = [
    context.network === 'bluesky'
      ? BLUESKY_TARGET_BRIEF[context.target]
      : TARGET_BRIEF[context.target],
  ];
  const filters = (context.filters ?? []).filter((line) => line.trim());
  if (filters.length) {
    lines.push(
      '',
      'The advanced form already sets these, so do not repeat them in the query:',
      ...filters.map((line) => `- ${line}`),
    );
  }
  return lines.join('\n');
}

/**
 * Try each query in turn, stopping at the first success.
 *
 * `run` returns the result count for one query. A probe that throws is recorded
 * as `count: null` and the walk continues — one flaky request should not
 * discard four perfectly good candidates.
 */
export async function gradeUntilSuccess(
  queries: string[],
  run: (query: string) => Promise<number>,
  options: { threshold?: number; maxCalls?: number } = {},
): Promise<GradeOutcome> {
  const threshold = options.threshold ?? SEARCH_SUCCESS_THRESHOLD;
  const maxCalls = options.maxCalls ?? SEARCH_QUERY_COUNT;

  const attempts: GradedQuery[] = [];
  for (const query of queries) {
    if (attempts.length >= maxCalls) {
      break;
    }
    let count: number | null;
    try {
      count = await run(query);
    } catch {
      count = null;
    }
    attempts.push({ query, count });
    if (count !== null && count >= threshold) {
      return { attempts, winner: query, callsUsed: attempts.length };
    }
  }
  return { attempts, winner: null, callsUsed: attempts.length };
}

/**
 * The `{{feedback}}` block for the refine pass.
 *
 * Only ever built when everything failed, so it says so plainly and hands the
 * model the counts. Naming the failure mode ("too narrow") is worth more than
 * the numbers alone — the model cannot see that `+rust +compiler +bootstrap`
 * is three ANDed terms, but it can act on "these were too narrow".
 */
export function describeAttempts(
  attempts: GradedQuery[],
  threshold: number = SEARCH_SUCCESS_THRESHOLD,
): string {
  if (attempts.length === 0) {
    return '';
  }
  const lines = attempts.map((attempt) => {
    const outcome =
      attempt.count === null
        ? 'the search failed'
        : `${attempt.count} result${attempt.count === 1 ? '' : 's'}`;
    return `- ${attempt.query} → ${outcome}`;
  });
  return [
    `Your previous suggestions were tried in order. None returned ${threshold} or more results:`,
    ...lines,
    '',
    'They were too narrow. Suggest 5 different queries that are broader: drop the least',
    'important terms, remove operators that may not match, and prefer plain words.',
    'Do not repeat any query from the list above.',
  ].join('\n');
}

@Injectable({ providedIn: 'root' })
export class SearchHelper {
  private chat = inject(OpenRouterChat);
  private prompts = inject(PromptTemplateStore);
  private api = inject(Api);
  private blueskySearch = inject(BlueskySearch);
  private blueskyAccounts = inject(BlueskyAccountSearch);

  /**
   * Suggest, grade, and refine once if nothing worked.
   *
   * Refining is conditional on purpose: when the first pass already found a
   * query that returns results, a second round trip buys nothing and costs a
   * request plus a wait.
   */
  async run(request: string, context: SearchContext): Promise<SearchHelperResult> {
    const threshold = thresholdFor(context.target);
    const network = context.network ?? 'mastodon';
    const probe = (query: string) => this.countResults(query, context.target, network);
    const grade = (queries: string[]) => gradeUntilSuccess(queries, probe, { threshold });

    const first = await this.suggest(request, context, '');
    // An objection ends it. Grading queries the model already disowned would
    // spend API calls to confirm what it just said.
    if (first.problem && !first.suggestions.length) {
      return {
        queries: [],
        attempts: [],
        winner: null,
        refined: false,
        callsUsed: 0,
        threshold,
        problem: first.problem,
      };
    }

    const queries = first.suggestions;
    const firstPass = await grade(queries);
    if (firstPass.winner) {
      return { queries, ...firstPass, refined: false, threshold, problem: first.problem };
    }

    const feedback = describeAttempts(firstPass.attempts, threshold);
    const second = await this.suggest(request, context, feedback);
    const secondPass = await grade(second.suggestions);
    return {
      queries: second.suggestions,
      attempts: secondPass.attempts,
      winner: secondPass.winner,
      refined: true,
      callsUsed: firstPass.callsUsed + secondPass.callsUsed,
      threshold,
      problem: second.problem ?? first.problem,
    };
  }

  private suggest(
    request: string,
    context: SearchContext,
    feedback: string,
  ): Promise<SuggestionReply> {
    return this.chat.suggest({
      prompt: this.prompts.render(context.network === 'bluesky' ? 'blueskySearch' : 'search', {
        request,
        feedback,
        context: describeContext(context),
      }),
      schemaName:
        context.network === 'bluesky' ? 'bluesky_search_queries' : 'mastodon_search_queries',
      max: SEARCH_QUERY_COUNT,
    });
  }

  /**
   * How many results one query returns, capped at the threshold we care about.
   *
   * Probes the endpoint the user is actually searching: grading an account
   * query against post search would fail every candidate for the wrong reason,
   * and grading a Bluesky query against Mastodon would fail all five.
   */
  private async countResults(
    query: string,
    target: SearchTargetKind,
    network: SearchNetwork,
  ): Promise<number> {
    if (network === 'bluesky') {
      return this.countBlueskyResults(query, target);
    }
    const results = await firstValueFrom(this.api.search(query, target, { limit: PROBE_LIMIT }));
    if (target === 'accounts') {
      return results.accounts?.length ?? 0;
    }
    if (target === 'hashtags') {
      return results.hashtags?.length ?? 0;
    }
    return results.statuses?.length ?? 0;
  }

  /**
   * The same probe against Bluesky.
   *
   * The typed query is parsed into criteria first, exactly as the panel does —
   * so a suggestion using `from:` is graded as the filtered search it will
   * actually become, not as five words of free text that match nothing.
   */
  private async countBlueskyResults(query: string, target: SearchTargetKind): Promise<number> {
    if (target === 'accounts') {
      const page = await firstValueFrom(this.blueskyAccounts.search(query.trim(), null));
      return page.results.length;
    }
    const page = await firstValueFrom(this.blueskySearch.search(parseBlueskyQuery(query), null));
    return page.statuses.length;
  }
}
