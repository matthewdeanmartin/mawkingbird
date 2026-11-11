import { Injectable, signal } from '@angular/core';

/**
 * The prompts behind the LLM helpers, editable by the user.
 *
 * The search and tag helpers are two-pass — the model proposes, the Mastodon API
 * grades, the model revises — which naively wants four prompts. They get two,
 * because the person editing them should have two things to read and get right, not
 * four. The second pass reuses the same template with `{{feedback}}` filled in; on
 * the first pass that placeholder is empty and the paragraph around it collapses.
 *
 * The translator is single-pass and has no `{{feedback}}` slot: there is nothing to
 * grade a translation against. It is also the only one that answers with prose
 * rather than a JSON list, which is why its reply goes through
 * `text-completion.ts` instead of `json-suggestions.ts`.
 *
 * Overrides live in one unscoped `localStorage` key, matching the OpenRouter
 * connection they belong to (see {@link OpenRouterSession} for why that is
 * unscoped). Sensitivity `setting`: a tuned prompt is exactly the kind of thing
 * worth publishing in a "here is my setup" gist.
 */

const PROMPTS_KEY = 'mockingbird_openrouter_prompts';

export type PromptTemplateId = 'search' | 'blueskySearch' | 'tag' | 'translate' | 'proofread';

export interface PromptTemplateSpec {
  id: PromptTemplateId;
  label: string;
  /** What this prompt is for, in one sentence, for the settings page. */
  description: string;
  /** Placeholder names, without braces. Shown to the user while editing. */
  placeholders: string[];
}

export const PROMPT_TEMPLATES: readonly PromptTemplateSpec[] = [
  {
    id: 'search',
    label: 'Search helper',
    description:
      'Turns what you typed into five runnable Mastodon search queries, then improves them once if they returned too little.',
    placeholders: ['request', 'context', 'feedback'],
  },
  {
    id: 'blueskySearch',
    label: 'Search helper (Bluesky)',
    description:
      'The same, for Bluesky. A separate prompt because the two dialects overlap enough to be confused: Bluesky spells the date bounds since/until, has no +word or -word, and treats an operator it does not know as a literal search word rather than ignoring it.',
    placeholders: ['request', 'context', 'feedback'],
  },
  {
    id: 'tag',
    label: 'Tag helper',
    description:
      'Suggests hashtags for a post you are writing, then improves them once if the suggested tags turn out to be dead.',
    placeholders: ['post', 'feedback'],
  },
  {
    id: 'translate',
    label: 'Translator',
    description:
      'Translates a post into your language. The only prompt here that answers with prose rather than a list, so it has no {{feedback}} pass — there is nothing to grade a translation against.',
    placeholders: ['text', 'target'],
  },
  {
    id: 'proofread',
    label: 'Writing proofreader',
    description:
      'Points out specific mistakes or reply-relevance concerns without rewriting the post or supplying replacement prose.',
    placeholders: ['text', 'replyContext'],
  },
];

/**
 * The shipped prompts.
 *
 * They spell the DSL out operator by operator because the model cannot see
 * `mastodon-query-serializer.ts`, and a query using an operator Mastodon does
 * not support fails silently by returning *more* than asked for — the same trap
 * documented in `sprint/search-2-serializer-and-explain.md`.
 */
export const DEFAULT_PROMPTS: Record<PromptTemplateId, string> = {
  search: `You write search queries for Mastodon, using its search syntax.

Supported operators — use ONLY these:
  +word            the word must appear
  "exact phrase"   the phrase must appear
  -word            the word must NOT appear
  from:@user@host  posted by this account
  before:YYYY-MM-DD / after:YYYY-MM-DD
  language:xx      two-letter language code
  has:media        has an image, video or audio
  has:poll         has a poll
  is:reply / -is:reply
  is:sensitive / -is:sensitive
  in:public        search all public posts
  in:library       search only posts you wrote or interacted with

Rules:
- Return exactly 5 queries, ordered most to least likely to be what they meant.
- Vary them: a narrow one, a couple of middling ones, and a broad fallback.
- Never invent an operator that is not listed above.
- Do not guess an account handle unless the request names one.
- Bare words are fine; not every query needs an operator.
- Respect the current state of the search form, described below.

If you cannot answer, say so in "problem" and return no queries. Do that when
the request asks for another service (Google, the web, YouTube), for something
this search cannot express (sorting, counting, anything about a specific user's
followers), or is too vague to guess at. One short sentence, addressed to the
person, saying what this search can do instead. Otherwise leave "problem" empty
— never use it to add commentary to a working answer.

The current state of the search form:
{{context}}

What the person is looking for:
{{request}}

{{feedback}}`,

  blueskySearch: `You write search queries for Bluesky, using its search syntax.

Supported operators — use ONLY these:
  word word            all of these words must appear
  "exact phrase"       the phrase must appear
  from:handle          posted by this account (e.g. from:pfrazee.com)
  mentions:handle      mentions this account
  #tag                 tagged with this hashtag; two tags must BOTH be present
  lang:xx              two-letter language code
  domain:host          links to this domain
  url:address          links to this exact URL
  since:YYYY-MM-DD     posted on or after this date
  until:YYYY-MM-DD     posted before this date

Rules:
- Return exactly 5 queries, ordered most to least likely to be what they meant.
- Vary them: a narrow one, a couple of middling ones, and a broad fallback.
- Never invent an operator that is not listed above. Bluesky does NOT support
  +word, -word, has:media, is:reply, is:sensitive, in:public or before:/after:.
  An operator it does not know is searched for as literal TEXT, so a wrong one
  returns nothing at all rather than being ignored.
- Bluesky handles are domain names (pfrazee.com, jay.bsky.team), not @user@host.
  Do not guess one unless the request names it.
- Bare words are fine; not every query needs an operator.
- Respect the current state of the search form, described below.

If you cannot answer, say so in "problem" and return no queries. Do that when
the request asks for another service (Google, the web, YouTube), for something
this search cannot express (sorting, counting, anything about a specific user's
followers), or is too vague to guess at. One short sentence, addressed to the
person, saying what this search can do instead. Otherwise leave "problem" empty
— never use it to add commentary to a working answer.

The current state of the search form:
{{context}}

What the person is looking for:
{{request}}

{{feedback}}`,

  tag: `You suggest hashtags for a post being written on Mastodon.

On Mastodon, hashtags are the main way people find posts outside their follows,
so a good tag is one that other people actually browse.

Rules:
- Return exactly 5 hashtags, without the leading #.
- Prefer established, general tags over clever or invented ones.
- CamelCase multi-word tags (e.g. NaturePhotography) — it helps screen readers.
- No punctuation, spaces or emoji inside a tag.
- Suggest tags for what the post is *about*, not words that merely appear in it.

The post:
{{post}}

{{feedback}}`,

  translate: `Translate the social media post below into {{target}}.

Rules:
- Reply with the translation and nothing else: no preamble, no notes, no quotes
  around it, no explanation of your choices.
- Leave @handles, #hashtags, URLs and emoji exactly as they are. They are not words.
- Keep the tone. A blunt post stays blunt; a joke stays a joke. Do not smooth it out
  and do not make it more polite than the original.
- Keep the line breaks roughly as they are.
- Leave every line containing only --- exactly unchanged; it is a post boundary.
- If the post is already in {{target}}, reply with it unchanged rather than
  paraphrasing it.
- If it is too short or too garbled to translate, reply with it unchanged.

The post:
{{text}}`,

  proofread: `Proofread the social-media post below. Return only short diagnostic findings.

This is a critic, not a ghostwriter. It is imperative that you do not rewrite the
post, paraphrase it, polish it, continue it, or provide replacement text someone
might copy and paste. Do not say "here is a revised version". Do not quote more
than the few words needed to identify an issue.

Good findings name a concrete problem:
- "daguerotype appears misspelled; the usual spelling is daguerreotype"
- "cat should be plural in the phrase 'three cat'"
- "This answers the original poster's question directly."

Rules:
- Each finding must be one short sentence and under 240 characters.
- Point to spelling, grammar, ambiguity, accidental repetition, or likely factual
  inconsistency. Suggestions are advisory, not commands.
- If original-post context is supplied, say whether the reply answers it or misses
  its question. Do not compose a better reply.
- Return no findings when there is nothing useful to say.
- Never return the full post or a rewritten version of any sentence.

Original-post context, when this is a reply:
{{replyContext}}

The post being proofread:
{{text}}`,
};

/**
 * Fill `{{placeholders}}` in a template.
 *
 * Unknown placeholders are deliberately left intact: a typo should show up as a
 * visible `{{requst}}` in the preview, not vanish into an empty prompt that
 * quietly produces worse results. Blank values collapse surrounding whitespace
 * so the empty first-pass `{{feedback}}` does not leave a hole in the prompt.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const filled = template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? vars[name] : match,
  );
  return filled.replace(/\n{3,}/g, '\n\n').trim();
}

@Injectable({ providedIn: 'root' })
export class PromptTemplateStore {
  private overrides = signal<Partial<Record<PromptTemplateId, string>>>(read());

  readonly templates = PROMPT_TEMPLATES;

  /** The active text: the user's version if they have one, else the default. */
  text(id: PromptTemplateId): string {
    return this.overrides()[id] ?? DEFAULT_PROMPTS[id];
  }

  /** Whether this template has been edited away from the shipped text. */
  isCustom(id: PromptTemplateId): boolean {
    return this.overrides()[id] !== undefined;
  }

  set(id: PromptTemplateId, text: string): void {
    const trimmed = text.trim();
    // Saving the default back is a reset, not a customisation — otherwise the
    // "customised" marker lies and the user can never get rid of it.
    if (!trimmed || trimmed === DEFAULT_PROMPTS[id].trim()) {
      this.reset(id);
      return;
    }
    this.write({ ...this.overrides(), [id]: trimmed });
  }

  reset(id: PromptTemplateId): void {
    const next = { ...this.overrides() };
    delete next[id];
    this.write(next);
  }

  /** The rendered prompt for one helper, ready to send. */
  render(id: PromptTemplateId, vars: Record<string, string>): string {
    return renderTemplate(this.text(id), vars);
  }

  private write(next: Partial<Record<PromptTemplateId, string>>): void {
    try {
      if (Object.keys(next).length === 0) {
        localStorage.removeItem(PROMPTS_KEY);
      } else {
        localStorage.setItem(PROMPTS_KEY, JSON.stringify(next));
      }
    } catch {
      // Non-persistent, but honour it for this session.
    }
    this.overrides.set(next);
  }
}

function read(): Partial<Record<PromptTemplateId, string>> {
  try {
    const raw = localStorage.getItem(PROMPTS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<PromptTemplateId, string>> = {};
    for (const spec of PROMPT_TEMPLATES) {
      const value = parsed[spec.id];
      if (typeof value === 'string' && value.trim()) {
        out[spec.id] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}
