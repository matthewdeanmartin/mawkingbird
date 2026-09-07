import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api';
import { TrendingTagHistory } from '../models';
import { OpenRouterChat } from '../providers/openrouter/openrouter-chat';
import { PromptTemplateStore } from '../providers/openrouter/prompt-templates';

/**
 * Hashtag suggestions that have actually been used by someone.
 *
 * Same shape as the search helper: the model proposes, the Mastodon API grades,
 * the model revises only if the grades were bad. Two differences fall out of
 * tags being a *set* rather than a single answer:
 *
 *  - We need several good tags, not one winner, so the short-circuit is "stop
 *    once {@link TAG_TARGET_LIVE} are alive" rather than "stop at the first
 *    success". Checking a fourth and fifth tag we have no room for is the same
 *    waste the search helper removed.
 *  - The probe returns *similar* tags for free, and feeding those back is what
 *    makes the refine pass worth doing. A model guessing again in the dark will
 *    probably guess wrong again; "#RustLang is dead, but Mastodon knows #rust"
 *    is a fact it can act on.
 */

/** Enough live tags to be worth inserting. Past this, stop spending calls. */
export const TAG_TARGET_LIVE = 3;

/** How many suggestions to ask for — the worst-case probe count. */
export const TAG_SUGGESTION_COUNT = 5;

/** Recent uses at or above this counts as "people actually use this". */
const MIN_USES = 1;

/** Similar tags kept per probe. Enough to be useful, few enough to stay readable. */
const MAX_SIMILAR = 3;

export interface TagCheck {
  tag: string;
  /** Recent uses, or null when the lookup failed (not the same as zero). */
  uses: number | null;
  /** Other tags Mastodon matched — free with the same request. */
  similar: string[];
}

export interface TagGradeOutcome {
  checked: TagCheck[];
  /** Tags with real traffic, in suggestion order. */
  live: string[];
  /** Whether the target was reached. When false, a refine pass is worth it. */
  enough: boolean;
  callsUsed: number;
}

export interface TagHelperResult {
  suggestions: string[];
  checked: TagCheck[];
  live: string[];
  refined: boolean;
  callsUsed: number;
}

/** Whether a checked tag has enough traffic to be worth suggesting. */
export function isLive(check: TagCheck): boolean {
  return check.uses !== null && check.uses >= MIN_USES;
}

/**
 * Check tags in order, stopping once `target` of them are alive.
 *
 * A failed probe records `uses: null` and the walk continues — one flaky
 * request should not condemn the rest, and "couldn't check" is not "dead".
 */
export async function gradeTagsUntilEnough(
  tags: string[],
  probe: (tag: string) => Promise<{ uses: number; similar: string[] }>,
  options: { target?: number; maxCalls?: number } = {},
): Promise<TagGradeOutcome> {
  const target = options.target ?? TAG_TARGET_LIVE;
  const maxCalls = options.maxCalls ?? TAG_SUGGESTION_COUNT;

  const checked: TagCheck[] = [];
  const live: string[] = [];
  for (const tag of tags) {
    if (checked.length >= maxCalls || live.length >= target) {
      break;
    }
    let check: TagCheck;
    try {
      const { uses, similar } = await probe(tag);
      check = { tag, uses, similar: similar.slice(0, MAX_SIMILAR) };
    } catch {
      check = { tag, uses: null, similar: [] };
    }
    checked.push(check);
    if (isLive(check)) {
      live.push(tag);
    }
  }
  return { checked, live, enough: live.length >= target, callsUsed: checked.length };
}

/**
 * The `{{feedback}}` block for the refine pass.
 *
 * Built only when too few tags were alive. The similar tags are the valuable
 * half — they turn "try again" into "here is what this instance actually knows".
 */
/**
 * **Prompt text, not interface text — deliberately never translated.**
 *
 * The string this builds is fed straight back to the model as the feedback
 * half of the two-pass tag helper (see `refine` below); no reader ever sees
 * it. Translating it would change the prompt per locale, so the model would be
 * asked a different question in German than in English for no benefit. The
 * `n === 1 ? '' : 's'` below is therefore correct rather than the usual bug.
 */
export function describeTagChecks(checked: TagCheck[], target: number = TAG_TARGET_LIVE): string {
  if (checked.length === 0) {
    return '';
  }
  const lines = checked.map((check) => {
    if (check.uses === null) {
      return `- ${check.tag} → couldn't be checked`;
    }
    const usage =
      check.uses === 0
        ? 'nobody has used this'
        : `${check.uses} recent use${check.uses === 1 ? '' : 's'}`;
    const similar = check.similar.length
      ? `; related tags that do exist: ${check.similar.join(', ')}`
      : '';
    return `- ${check.tag} → ${usage}${similar}`;
  });
  return [
    `Your previous tags were checked against this Mastodon server. Fewer than ${target} of them are in real use:`,
    ...lines,
    '',
    'Suggest 5 different hashtags that people actually use. Prefer the related tags listed',
    'above where they fit, and prefer shorter, more established tags over specific ones.',
    'Do not repeat any dead tag from the list above.',
  ].join('\n');
}

/** Sum the recent uses recorded in a tag's history. */
export function recentUses(tag: { history?: TrendingTagHistory[] } | undefined): number {
  if (!tag?.history) {
    return 0;
  }
  return tag.history.reduce((total, entry) => {
    const uses = Number(entry?.uses ?? 0);
    return total + (Number.isFinite(uses) ? uses : 0);
  }, 0);
}

@Injectable({ providedIn: 'root' })
export class TagHelper {
  private chat = inject(OpenRouterChat);
  private prompts = inject(PromptTemplateStore);
  private api = inject(Api);

  async run(post: string): Promise<TagHelperResult> {
    const probe = (tag: string) => this.checkTag(tag);

    const suggestions = await this.suggest(post, '');
    const first = await gradeTagsUntilEnough(suggestions, probe);
    if (first.enough) {
      return { suggestions, ...first, refined: false };
    }

    const feedback = describeTagChecks(first.checked);
    const refined = await this.suggest(post, feedback);
    const second = await gradeTagsUntilEnough(refined, probe);
    return {
      suggestions: refined,
      checked: second.checked,
      live: second.live,
      refined: true,
      callsUsed: first.callsUsed + second.callsUsed,
    };
  }

  /**
   * The tag list, discarding the reply's `problem` field.
   *
   * A post always has *something* taggable, so an objection here is a model
   * misfiring rather than a real limit — unlike the search helper, which has to
   * surface it. An objection with no tags surfaces as an empty list, which the
   * dialog already renders as "nothing to suggest".
   */
  private async suggest(post: string, feedback: string): Promise<string[]> {
    const reply = await this.chat.suggest({
      prompt: this.prompts.render('tag', { post, feedback }),
      schemaName: 'mastodon_hashtags',
      max: TAG_SUGGESTION_COUNT,
    });
    return reply.suggestions;
  }

  /**
   * Usage and neighbours for one tag, in a single request.
   *
   * `type=hashtags` search returns the tag itself (if the server knows it) plus
   * near matches, so the "does anyone use this?" and "what else is there?"
   * questions cost one call between them rather than two.
   */
  private async checkTag(tag: string): Promise<{ uses: number; similar: string[] }> {
    const bare = tag.replace(/^#/, '');
    const results = await firstValueFrom(this.api.search(bare, 'hashtags'));
    const tags = results.hashtags ?? [];
    const exact = tags.find((t) => t.name.toLowerCase() === bare.toLowerCase());
    return {
      uses: recentUses(exact),
      similar: tags.filter((t) => t.name.toLowerCase() !== bare.toLowerCase()).map((t) => t.name),
    };
  }
}
