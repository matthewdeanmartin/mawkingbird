import { inject, Injectable } from '@angular/core';
import { OpenRouterSession, openRouterError } from './openrouter-session';
import { OpenRouterModelChoice } from './openrouter-model-choice';
import {
  parseSuggestionReply,
  suggestionSchema,
  SuggestionParseError,
  SuggestionReply,
} from './json-suggestions';
import { cleanTextCompletion } from './text-completion';

/**
 * The one inference call in the app.
 *
 * Uses `POST /api/v1/chat/completions` rather than the Responses API: the
 * structured-output contract (`response_format: { type: 'json_schema', … }`) is
 * documented against chat completions, and `supported_parameters` — the filter
 * the model picker uses — describes chat-completions parameters. Filtering on
 * one API and calling another would be a quiet inconsistency.
 *
 * Everything this returns has been through {@link parseSuggestions}; callers
 * never see raw model output.
 */

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Suggestion lists are short. This is a guard against a runaway bill, not a limit. */
const MAX_TOKENS = 700;

/**
 * Prose needs more room than a list of five queries, but a Mastodon post is at most
 * a few thousand characters, so this is still a bill guard rather than a real limit.
 */
const MAX_COMPLETION_TOKENS = 1500;

/**
 * Appended on the retry when a provider rejected the schema outright, so the
 * second attempt still has a chance of being parseable.
 */
const JSON_ONLY_NUDGE =
  '\n\nReply with JSON only, in the form {"suggestions": ["...", "..."], "problem": ""}. ' +
  'No prose, no code fences.';

export interface SuggestOptions {
  /** The fully rendered prompt. */
  prompt: string;
  /** Schema name — appears in the request; useful in OpenRouter's logs. */
  schemaName: string;
  /** How many suggestions to ask for and accept. */
  max: number;
}

export interface CompleteOptions {
  /** The fully rendered prompt. */
  prompt: string;
  /** The source text, so the guard can sanity-check the reply's length. */
  source?: string;
  maxTokens?: number;
  /**
   * Return the model's text as-is, skipping the single-post guard (which
   * checks the reply against one source text). For structured replies such as
   * a batch of translations, which the caller parses and checks itself.
   */
  raw?: boolean;
}

interface ChatResponse {
  choices?: { message?: { content?: unknown } }[];
  /** With `usage: { include: true }`: what the call cost, in credits (US dollars). */
  usage?: { cost?: unknown };
}

/** A completion and what it cost, when OpenRouter said. */
export interface CostedCompletion {
  text: string;
  /** US dollars; null when the reply carried no cost. */
  costUsd: number | null;
}

@Injectable({ providedIn: 'root' })
export class OpenRouterChat {
  private session = inject(OpenRouterSession);
  private choice = inject(OpenRouterModelChoice);

  /**
   * Ask the chosen model for a list of suggestions.
   *
   * Retries once without `response_format` when the first attempt fails in a
   * way a schema could cause — a provider that rejects `json_schema`, or a
   * reply that came back unparseable. The retry carries an explicit
   * "JSON only" instruction instead.
   *
   * Returns the model's objection alongside its list: a request the DSL cannot
   * express is an answer, not a failure, and throwing would lose the sentence
   * that explains it.
   */
  async suggest(options: SuggestOptions): Promise<SuggestionReply> {
    const key = this.session.apiKey();
    if (!key) {
      throw new Error('Connect OpenRouter first.');
    }

    try {
      return await this.attempt(key, options, true);
    } catch (error: unknown) {
      if (!isRetryable(error)) {
        throw error;
      }
      return this.attempt(key, options, false);
    }
  }

  /**
   * One prompt in, the model's text out.
   *
   * A second method rather than a mode on {@link suggest}, because almost nothing is
   * shared with it beyond transport: no `response_format`, no schema, no
   * retry-without-schema (there is nothing to drop), and a completely different
   * guard. What it does share — the key check, the URL, `max_tokens` discipline and
   * {@link describeFailure} — is the part worth not duplicating.
   *
   * The returned string is **untrusted plain text**. See `text-completion.ts`: it
   * must be rendered as text, never through the `[innerHTML]` path that server
   * content uses.
   */
  async complete(options: CompleteOptions): Promise<string> {
    return (await this.completeWithCost(options)).text;
  }

  /**
   * {@link complete}, plus the call's cost. Asks OpenRouter for usage
   * accounting (`usage: { include: true }`), so a dollar budget can count real
   * spend rather than guess from token counts and a price table.
   */
  async completeWithCost(options: CompleteOptions): Promise<CostedCompletion> {
    const key = this.session.apiKey();
    if (!key) {
      throw new Error('Connect OpenRouter first.');
    }

    let response: Response;
    try {
      response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.choice.modelId(),
          max_tokens: options.maxTokens ?? MAX_COMPLETION_TOKENS,
          messages: [{ role: 'user', content: options.prompt }],
          usage: { include: true },
        }),
      });
    } catch {
      throw new Error("Couldn't reach OpenRouter.");
    }

    if (!response.ok) {
      throw new Error(await this.describeFailure(response));
    }

    const json = (await response.json()) as ChatResponse;
    const cost = json.usage?.cost;
    return {
      text: options.raw
        ? typeof json.choices?.[0]?.message?.content === 'string'
          ? (json.choices[0].message.content as string)
          : ''
        : cleanTextCompletion(json.choices?.[0]?.message?.content, { source: options.source }),
      costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
    };
  }

  /**
   * Describe an image as alt text, with the chosen model.
   *
   * `imageUrl` is an https URL or a `data:` URL. The model must accept image
   * input; OpenRouter refuses a text-only model, which is reported as such so
   * the reader knows to pick another model rather than retry.
   *
   * Returns **untrusted plain text**, trimmed and capped at Mastodon's
   * 1,500-character description limit.
   */
  async describeImage(imageUrl: string, language: string): Promise<string> {
    const key = this.session.apiKey();
    if (!key) {
      throw new Error('Connect OpenRouter first.');
    }
    const prompt =
      `Write alt text for this image for a social media post, in the language with code "${language}". ` +
      'Describe what matters for someone who cannot see it: the subject, setting and any ' +
      'visible text, quoted exactly. One to three plain sentences. ' +
      'Do not start with "Image of" or "Alt text:". Reply with the description only.';
    let response: Response;
    try {
      response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.choice.modelId(),
          max_tokens: 400,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
      });
    } catch {
      throw new Error("Couldn't reach OpenRouter.");
    }
    if (!response.ok) {
      const body = await response
        .clone()
        .text()
        .catch(() => '');
      if (
        /image|vision|modalit/iu.test(body) &&
        response.status !== 401 &&
        response.status !== 402
      ) {
        throw new Error(
          "Your chosen OpenRouter model can't read images. Pick one that accepts images in Settings → Connections → OpenRouter.",
        );
      }
      throw new Error(await this.describeFailure(response));
    }
    const content = ((await response.json()) as ChatResponse).choices?.[0]?.message?.content;
    return cleanAltText(typeof content === 'string' ? content : '');
  }

  private async attempt(
    key: string,
    options: SuggestOptions,
    withSchema: boolean,
  ): Promise<SuggestionReply> {
    const body: Record<string, unknown> = {
      model: this.choice.modelId(),
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: withSchema ? options.prompt : options.prompt + JSON_ONLY_NUDGE,
        },
      ],
    };
    if (withSchema) {
      body['response_format'] = {
        type: 'json_schema',
        json_schema: suggestionSchema(options.schemaName, options.max),
      };
    }

    let response: Response;
    try {
      response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("Couldn't reach OpenRouter.");
    }

    if (!response.ok) {
      throw new Error(await this.describeFailure(response));
    }

    const content = ((await response.json()) as ChatResponse).choices?.[0]?.message?.content;
    return parseSuggestionReply(content, options.max);
  }

  /** Turn an HTTP failure into something the user can act on. */
  private async describeFailure(response: Response): Promise<string> {
    if (response.status === 401) {
      // The key was revoked at OpenRouter. Stop claiming to be connected.
      this.session.disconnect();
      return 'OpenRouter no longer recognises this key. Connect again.';
    }
    if (response.status === 402) {
      return 'Your OpenRouter credits have run out. Top up at openrouter.ai, then try again.';
    }
    if (response.status === 429) {
      return 'OpenRouter is rate-limiting this key. Wait a moment and try again.';
    }
    return openRouterError(response, "OpenRouter couldn't answer that.");
  }
}

/**
 * Whether dropping the schema might help.
 *
 * A parse failure or a 400 both point at the schema; a 402 or a revoked key
 * would fail identically the second time, and retrying just burns another
 * request.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof SuggestionParseError) {
    return true;
  }
  return error instanceof Error && /response_format|json_schema|400/i.test(error.message);
}

/** Tidy a model's alt text: no wrapping quotes, labels, markdown or runaway length. */
export function cleanAltText(raw: string): string {
  const text = raw
    .trim()
    .replace(/^(?:alt[\s-]*text|description)\s*:\s*/iu, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
    .replace(/[*_`#]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > 1500 ? text.slice(0, 1500) : text;
}
