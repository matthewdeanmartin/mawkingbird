/**
 * Turning whatever the model said into usable prose.
 *
 * The analogue of `json-suggestions.ts`, for the one call in the app that asks for
 * text instead of a list. It exists for the same reason and is harder: there is no
 * `response_format` schema to lean on, so *every* constraint has to be checked here.
 *
 * The rule that matters most is not in this file, because it cannot be — it is at
 * the render site. **This returns untrusted plain text and it must be rendered as
 * text.** `status-card` pipes server content through `applyMinimalMarkdown` into
 * `[innerHTML]`, which is safe only because the server already sanitized it; sending
 * model output down that path would be an injection vector. AI translations get
 * their own text-interpolated block.
 */

export class TextCompletionError extends Error {}

/**
 * A translation this much longer than its source is not a translation.
 *
 * Generous on purpose: some language pairs genuinely inflate (a terse Japanese post
 * becomes a much longer English sentence), and short inputs inflate proportionally
 * more. This is a guard against the model answering a question instead of
 * translating, not a style critic.
 */
export const MAX_LENGTH_RATIO = 8;

/** Below this, ratio checks are meaningless — "hi" can legitimately become a lot. */
const RATIO_FLOOR = 40;

/**
 * Lines models open with instead of just answering.
 *
 * Matched only as a *complete* first line, and only when more text follows, so a
 * translation whose real first line happens to end in a colon survives.
 */
const PREAMBLE = /^(?:sure|certainly|of course|here(?:'s| is)|okay|ok)\b[^\n]*:\s*\n/i;

/** Wrapping quotes the model added around the whole answer. */
const WRAPPED_IN_QUOTES = /^["“'](.*)["”']$/s;

export interface TextCompletionOptions {
  /** The source text, for the length sanity check. Omit to skip it. */
  source?: string;
  maxLengthRatio?: number;
}

/**
 * Clean and validate a text reply.
 *
 * @throws TextCompletionError when the reply is empty, or so much longer than the
 *   source that the model was evidently doing something other than what we asked.
 */
export function cleanTextCompletion(content: unknown, options: TextCompletionOptions = {}): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new TextCompletionError('The model replied with nothing. Try again.');
  }

  let text = content.trim();
  text = text.replace(PREAMBLE, '').trim();

  // Only unwrap when the quotes enclose everything: a reply that merely contains a
  // quoted phrase must keep it.
  const unwrapped = WRAPPED_IN_QUOTES.exec(text);
  if (unwrapped && !/["“”]/.test(unwrapped[1])) {
    text = unwrapped[1].trim();
  }

  // Fenced blocks: the model treated prose as code.
  const fenced = /^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }

  if (!text) {
    throw new TextCompletionError('The model replied with nothing usable. Try again.');
  }

  const source = options.source?.trim();
  const limit = options.maxLengthRatio ?? MAX_LENGTH_RATIO;
  if (source && source.length >= RATIO_FLOOR && text.length > source.length * limit) {
    throw new TextCompletionError(
      'The model returned far more text than the post contained, so it probably answered the post instead of translating it. Try again, or pick a different model.',
    );
  }

  return text;
}
