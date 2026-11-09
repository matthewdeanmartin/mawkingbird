import { inject, Injectable } from '@angular/core';
import { languageName } from '../ai-translate';
import { OpenRouterChat } from '../providers/openrouter/openrouter-chat';
import { TranslationUsage } from '../translation-usage';

/**
 * Batched AI translation for automatic (as-you-scroll) mode.
 *
 * Posts scroll into view a few at a time, and each one-post request repeats
 * the whole prompt and pays its per-call overhead. This collects the posts
 * that arrive within a short window (or until the batch is full) and sends
 * them in one request, asking for a JSON array back, one translation per
 * post, in order. One call per screenful instead of one per post.
 *
 * The returned cost is the whole batch's; the caller records it once.
 * Manual (pressed) translations stay single: the reader is waiting.
 */

/** How long to wait for more posts before sending. */
export const BATCH_WINDOW_MS = 500;
/** Most posts per request; keeps a malformed reply cheap and the JSON reliable. */
export const BATCH_MAX_ITEMS = 10;
/** Most characters per request, so one long post does not drag a batch out. */
export const BATCH_MAX_CHARS = 6000;

interface Pending {
  text: string;
  resolve: (result: BatchResult) => void;
  reject: (error: unknown) => void;
}

export interface BatchResult {
  text: string;
  /** This item's share of the batch's cost. */
  costUsd: number | null;
}

/** The prompt for a batch: social posts, informal Japanese in mind. */
export function batchPrompt(texts: readonly string[], target: string): string {
  return `Translate each social media post in the JSON array below into ${target}.

Reply with a JSON array of strings and nothing else: exactly ${texts.length} items,
the translation of item N at position N. No preamble, no code fences, no notes.

Rules for every item:
- Leave @handles, #hashtags, URLs, emoji and :shortcode: emoji exactly as they are.
- Keep the tone: a joke stays a joke, blunt stays blunt, casual stays casual.
- Internet slang: translate the meaning, not the letters. Japanese 草 or ｗｗｗ is
  laughter ("lol"); 〜ンゴ, 〜ゾ and similar endings are playful tone, not words.
- Keep line breaks roughly as they are. Lines starting with 🖼 (an image
  description) or ☐ (a poll choice) keep that mark at the start.
- If an item is already in ${target}, or too short or garbled to translate,
  return it unchanged.

Posts:
${JSON.stringify(texts)}`;
}

/** Parse the model's reply into exactly `count` strings, or throw. */
export function parseBatchReply(reply: string, count: number): string[] {
  const trimmed = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('The model did not reply with a JSON array.');
  const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
  if (
    !Array.isArray(parsed) ||
    parsed.length !== count ||
    !parsed.every((item) => typeof item === 'string')
  ) {
    throw new Error(`Expected ${count} translations, got something else.`);
  }
  return parsed as string[];
}

@Injectable({ providedIn: 'root' })
export class AiBatchTranslator {
  private chat = inject(OpenRouterChat);
  private usage = inject(TranslationUsage);
  /** One queue per target language. */
  private readonly queues = new Map<string, Pending[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Queue `text` for translation into `targetCode`; resolves with its translation and cost share. */
  translate(text: string, targetCode: string): Promise<BatchResult> {
    return new Promise<BatchResult>((resolve, reject) => {
      const queue = this.queues.get(targetCode) ?? [];
      queue.push({ text, resolve, reject });
      this.queues.set(targetCode, queue);
      const chars = queue.reduce((sum, item) => sum + item.text.length, 0);
      if (queue.length >= BATCH_MAX_ITEMS || chars >= BATCH_MAX_CHARS) {
        void this.flush(targetCode);
      } else if (!this.timers.has(targetCode)) {
        this.timers.set(
          targetCode,
          setTimeout(() => void this.flush(targetCode), BATCH_WINDOW_MS),
        );
      }
    });
  }

  private async flush(targetCode: string): Promise<void> {
    const timer = this.timers.get(targetCode);
    if (timer) clearTimeout(timer);
    this.timers.delete(targetCode);
    const batch = this.queues.get(targetCode) ?? [];
    this.queues.delete(targetCode);
    if (!batch.length) return;
    // One request, one call against the OpenRouter usage limits.
    this.usage.record('openrouter');
    try {
      const reply = await this.chat.completeWithCost({
        prompt: batchPrompt(
          batch.map((item) => item.text),
          languageName(targetCode),
        ),
        raw: true,
        // Room for every item's translation; still a bill guard, not a limit.
        maxTokens: Math.min(8000, 400 + batch.reduce((sum, i) => sum + i.text.length, 0) * 3),
      });
      const translations = parseBatchReply(reply.text, batch.length);
      const share = reply.costUsd === null ? null : reply.costUsd / batch.length;
      batch.forEach((item, index) => item.resolve({ text: translations[index], costUsd: share }));
    } catch (error) {
      for (const item of batch) item.reject(error);
    }
  }
}
