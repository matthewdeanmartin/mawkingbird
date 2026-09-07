import { computed, inject, Injectable, signal } from '@angular/core';
import { OpenRouterModelChoice } from '../providers/openrouter/openrouter-model-choice';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { ConversationStore } from './conversation-store';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** A chat turn is prose, not a list of five queries — but still a bill guard. */
const MAX_TOKENS = 2000;

/** How many prior messages are sent back as context. */
const CONTEXT_WINDOW = 20;

interface StreamChunk {
  choices?: { delta?: { content?: unknown } }[];
}

/**
 * A model reply, streamed and written down as it arrives.
 *
 * ## Why this is a service and not component state
 *
 * The reply has to keep arriving when the user navigates away. A component's
 * subscription dies with the component, so a half-finished answer would be lost
 * along with the tokens already billed for it — the specific thing this must
 * not do. A root-injected service outlives every route, so the `fetch` and its
 * reader keep running while the user reads something else and the conversation
 * is complete when they come back.
 *
 * No web worker, and none is needed: `fetch` and its stream reader are already
 * off the main thread as far as network work goes, and the only main-thread
 * cost is appending a string per chunk. A worker would add a serialization hop
 * and a second copy of the auth token for no benefit.
 *
 * ## Why every chunk is persisted
 *
 * Holding the text in memory and saving once at the end would still lose it if
 * the tab closes — which is the common way a long generation actually ends.
 * Each chunk is written through {@link ConversationStore.updateMessage}, so the
 * transcript on disk trails the model by at most one chunk, and a killed tab
 * keeps everything that arrived, flagged `incomplete`.
 */
@Injectable({ providedIn: 'root' })
export class LlmConversation {
  private session = inject(OpenRouterSession);
  private choice = inject(OpenRouterModelChoice);
  private store = inject(ConversationStore);

  /** Conversation id currently generating, or null. */
  private readonly streamingIn = signal<string | null>(null);
  private controller: AbortController | null = null;

  /** True while a reply is arriving for this conversation. */
  streaming(conversationId: string): boolean {
    return this.streamingIn() === conversationId;
  }

  /** True while any reply is arriving — for a global "still working" hint. */
  readonly busy = computed(() => this.streamingIn() !== null);

  readonly error = signal<string | null>(null);

  /**
   * Send a message and stream the reply into the conversation.
   *
   * Resolves when the stream ends. Callers are free to ignore the promise: the
   * conversation is updated through the store either way, which is what lets a
   * component walk away mid-generation.
   */
  async send(conversationId: string, text: string): Promise<void> {
    const key = this.session.apiKey();
    if (!key) {
      this.error.set('Connect OpenRouter first.');
      return;
    }
    if (this.streamingIn()) {
      this.error.set('Still answering the last message.');
      return;
    }

    this.error.set(null);
    this.store.append(conversationId, { from: 'me', text });

    // The placeholder exists before the first chunk so the transcript is
    // coherent at every instant, including a tab closed one millisecond in.
    const replyId = this.store.append(conversationId, {
      from: 'them',
      text: '',
      incomplete: true,
    });

    this.streamingIn.set(conversationId);
    this.controller = new AbortController();

    try {
      await this.stream(conversationId, replyId, key);
    } catch (err) {
      // Whatever arrived stays on the page, still flagged incomplete. Deleting
      // a partial answer on error would throw away tokens already paid for.
      this.error.set(err instanceof Error ? err.message : "Couldn't reach OpenRouter.");
    } finally {
      this.streamingIn.set(null);
      this.controller = null;
    }
  }

  /** Stop generating. The text so far stays, marked incomplete. */
  stop(): void {
    this.controller?.abort();
  }

  private async stream(conversationId: string, replyId: string, key: string): Promise<void> {
    const conversation = this.store.get(conversationId);
    if (!conversation) {
      return;
    }
    // Everything except the empty placeholder we just added.
    const history = conversation.messages
      .filter((m) => m.id !== replyId && m.text.trim())
      .slice(-CONTEXT_WINDOW)
      .map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text }));

    let response: Response;
    try {
      response = await fetch(CHAT_URL, {
        method: 'POST',
        signal: this.controller?.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.choice.modelId(),
          max_tokens: MAX_TOKENS,
          stream: true,
          messages: history,
        }),
      });
    } catch {
      throw new Error("Couldn't reach OpenRouter.");
    }

    if (!response.ok || !response.body) {
      throw new Error(`OpenRouter refused the request (${response.status}).`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      // Server-sent events: complete lines only. A chunk boundary can land mid
      // line, so the tail stays in the buffer until its newline arrives.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const payload = line.trim();
        if (!payload.startsWith('data:')) {
          continue;
        }
        const data = payload.slice(5).trim();
        if (data === '[DONE]') {
          continue;
        }
        try {
          const delta = (JSON.parse(data) as StreamChunk).choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            text += delta;
            this.store.updateMessage(conversationId, replyId, text, true);
          }
        } catch {
          // A malformed frame is not worth ending a good stream over.
        }
      }
    }

    this.store.updateMessage(conversationId, replyId, text, false);
  }
}
