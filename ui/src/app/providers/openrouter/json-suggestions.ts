/**
 * Turning whatever the model said into a `string[]`.
 *
 * This is the only place in the app that treats model output as hostile.
 * Everything downstream — the search dialog, the tag dialog — receives a clean
 * array of trimmed, deduped, bounded strings, or an error with a sentence a
 * human can act on.
 *
 * We ask for a JSON schema (`strict: true`, `{ suggestions: string[] }`), and
 * the default model advertises `structured_outputs`, so the happy path is a
 * well-formed object. The guard still exists because "advertises" is not
 * "guarantees":
 *
 *  - `strict` is honoured by the *provider*, and OpenRouter routes across many.
 *  - The model picker lets the user drop the structured-output filter, which
 *    surfaces the `:free` variants that only promise `response_format`.
 *  - Wrapping the object in a ```json fence is a normal, frequent failure.
 *
 * So: accept the object, a JSON string, or a fenced block. Refuse the rest.
 *
 * The schema also carries a `problem` string, which is how the model says "I
 * can't do this" without lying. Asked to search Google, or for something the
 * Mastodon DSL simply cannot express, a model with only a `suggestions` field
 * has no honest move left and invents five plausible-looking queries. Giving it
 * somewhere to put the objection is cheaper than grading nonsense afterwards.
 */

/** Hard ceiling on how many suggestions we will hand back, whatever was sent. */
export const MAX_SUGGESTIONS = 10;

export class SuggestionParseError extends Error {}

export interface SuggestionReply {
  suggestions: string[];
  /** The model's objection to the request, or null when it had none. */
  problem: string | null;
}

/** Keys a model plausibly uses for its objection. `problem` is what we ask for. */
const PROBLEM_KEYS = ['problem', 'error', 'refusal', 'reason', 'note'];

/** A problem longer than this is prose, not an objection — models ramble. */
const MAX_PROBLEM_LENGTH = 400;

/**
 * Extract the suggestion list and any objection from a model's reply.
 *
 * `content` is whatever sat at `choices[0].message.content` — an object when
 * structured output worked, a string otherwise.
 *
 * An empty list is not a failure when the model explained itself: "this isn't
 * Google" is a useful answer, and the caller shows it instead of results.
 *
 * @param max Cap on returned items. Defaults to {@link MAX_SUGGESTIONS}.
 * @throws SuggestionParseError when neither a list nor an objection is there.
 */
export function parseSuggestionReply(
  content: unknown,
  max: number = MAX_SUGGESTIONS,
): SuggestionReply {
  const payload = coerceToObject(content);
  const problem = extractProblem(payload);
  const raw = extractArray(payload);
  if (raw === null) {
    if (problem) {
      return { suggestions: [], problem };
    }
    throw new SuggestionParseError(
      "The model didn't reply with a list of suggestions. Try again, or pick a model that supports structured output.",
    );
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const text = normalizeEntry(entry);
    // Case-insensitive dedupe: "Rust" and "rust" are one suggestion, and the
    // tag helper in particular gets near-duplicates constantly.
    const fingerprint = text.toLowerCase();
    if (!text || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }

  if (out.length === 0 && !problem) {
    throw new SuggestionParseError('The model returned an empty list of suggestions.');
  }
  return { suggestions: out, problem };
}

/**
 * The suggestion list alone, for callers with nothing to do with an objection.
 *
 * A problem with no suggestions still throws here: a caller that cannot show
 * the objection is better off with an error it already knows how to render than
 * with an empty array it will silently treat as "no ideas".
 */
export function parseSuggestions(content: unknown, max: number = MAX_SUGGESTIONS): string[] {
  const reply = parseSuggestionReply(content, max);
  if (reply.suggestions.length === 0) {
    throw new SuggestionParseError(reply.problem ?? 'The model returned no suggestions.');
  }
  return reply.suggestions;
}

/**
 * The model's objection, if it made one.
 *
 * Whitespace-only and over-long values are dropped: `problem` is a required
 * field in the schema precisely so strict providers accept it, which means the
 * happy path sends `""` on every successful call and an empty string must never
 * read as an objection.
 */
function extractProblem(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  for (const key of PROBLEM_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, MAX_PROBLEM_LENGTH);
    }
  }
  return null;
}

/**
 * Get to a parsed value, from an object, a JSON string, or a fenced block.
 *
 * Returns `null` when nothing parseable is there — the caller turns that into
 * the user-facing error, so the failure has one wording rather than three.
 */
function coerceToObject(content: unknown): unknown {
  if (content !== null && typeof content === 'object') {
    return content;
  }
  if (typeof content !== 'string') {
    return null;
  }

  const text = content.trim();
  if (!text) {
    return null;
  }

  // Straight JSON first — the common case when structured output is honoured
  // but the transport hands it back as a string.
  const direct = tryParse(text);
  if (direct !== undefined) {
    return direct;
  }

  // ```json … ``` or a bare ``` fence.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) {
    const inner = tryParse(fenced[1].trim());
    if (inner !== undefined) {
      return inner;
    }
  }

  // Last resort: the first {...} or [...] embedded in prose. Models like to
  // introduce themselves before answering.
  const embedded = /(\{[\s\S]*\}|\[[\s\S]*\])/.exec(text);
  if (embedded) {
    const inner = tryParse(embedded[1]);
    if (inner !== undefined) {
      return inner;
    }
  }
  return null;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Find the array of suggestions in a parsed payload.
 *
 * The schema asks for `{ suggestions: [...] }`, but a bare array is such a
 * common and unambiguous answer that rejecting it would be pedantry. A
 * single-key object wrapping an array is accepted for the same reason — models
 * rename the key to `queries` or `tags` surprisingly often, and the shape is
 * unmistakable.
 */
function extractArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record['suggestions'])) {
    return record['suggestions'];
  }
  const arrays = Object.values(record).filter(Array.isArray);
  return arrays.length === 1 ? (arrays[0] as unknown[]) : null;
}

/**
 * One entry as a string.
 *
 * Entries arrive as plain strings, or as objects when the model decided to
 * annotate them (`{ query: "...", why: "..." }`). For an object we take the
 * first string field, which is reliably the payload and not the commentary.
 */
function normalizeEntry(entry: unknown): string {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  if (typeof entry === 'number') {
    return String(entry);
  }
  if (entry !== null && typeof entry === 'object') {
    for (const value of Object.values(entry as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return '';
}

/**
 * The JSON schema sent with the request. Kept next to the parser that guards it.
 *
 * `problem` is a required plain string rather than an optional or nullable one:
 * `strict: true` requires every property to appear in `required`, and nullable
 * unions are the part of the JSON-schema surface providers disagree about most.
 * A required string that is usually `""` works everywhere.
 */
export function suggestionSchema(name: string, max: number) {
  return {
    name,
    strict: true,
    schema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          description: `Between 1 and ${max} suggestions, most useful first. Empty only when "problem" is set.`,
          items: { type: 'string' },
        },
        problem: {
          type: 'string',
          description:
            'Empty string when the request was fine. Otherwise one short sentence saying why it cannot be answered — the request asks for a different service, or for something this search cannot express.',
        },
      },
      required: ['suggestions', 'problem'],
      additionalProperties: false,
    },
  };
}
