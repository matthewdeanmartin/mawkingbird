import { computed, inject, Injectable, signal } from '@angular/core';
import { PLATFORM_LOCAL_AI } from '../../platform/http/platform-http';

/** Model choice and on/off switch; the endpoint itself lives in the native host. */
const STORAGE_KEY = 'mockingbird_local_ai';

interface StoredLocalAi {
  model?: string;
  enabled?: boolean;
}

/** Presets for the two most common local servers. */
export const LOCAL_AI_PRESETS = [
  { id: 'ollama', label: 'Ollama', endpoint: 'http://127.0.0.1:11434' },
  { id: 'lmstudio', label: 'LM Studio', endpoint: 'http://127.0.0.1:1234' },
] as const;

interface ChatReply {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: unknown } | string;
}

/**
 * A local OpenAI-compatible server (Ollama, LM Studio, llama.cpp) as a free
 * alternative to OpenRouter (parity item 1). Native only: the web build has no
 * {@link PLATFORM_LOCAL_AI}, so nothing here is reachable there.
 *
 * Deliberately simple, per the owner's decision: no detection of whether a
 * model reads images or is any good — the app can't know what the user wired
 * up. Every AI action is offered; when the model fails, its own error is
 * shown as-is, and generated text is always shown for review before posting
 * (the existing rule). No budget, no cost, no upsell. Never falls back to
 * OpenRouter silently: when Local AI is on, failures are Local AI's.
 */
@Injectable({ providedIn: 'root' })
export class LocalAi {
  private readonly transport = inject(PLATFORM_LOCAL_AI);

  /** True in the native build, where the loopback transport exists. */
  readonly available = !!this.transport;
  /** The one loopback endpoint the native host allows, e.g. `http://127.0.0.1:11434`. */
  readonly endpoint = signal<string | null>(null);
  readonly model = signal<string>(this.stored().model ?? '');
  readonly enabled = signal<boolean>(this.stored().enabled ?? true);

  /** On, set up, and therefore the provider every AI action uses. */
  readonly active = computed(
    () => this.available && this.enabled() && !!this.endpoint() && !!this.model(),
  );

  constructor() {
    void this.transport?.status().then(
      (status) => this.endpoint.set(status.endpoint),
      () => this.endpoint.set(null),
    );
  }

  private stored(): StoredLocalAi {
    try {
      return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredLocalAi) ?? {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ model: this.model(), enabled: this.enabled() } satisfies StoredLocalAi),
      );
    } catch {
      /* The choice still applies for this session. */
    }
  }

  async setEndpoint(endpoint: string | null): Promise<void> {
    if (!this.transport) return;
    const status = await this.transport.setEndpoint(endpoint);
    this.endpoint.set(status.endpoint);
  }

  setModel(model: string): void {
    this.model.set(model.trim());
    this.persist();
  }

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
    this.persist();
  }

  /** `GET /v1/models`: the ids the server offers. */
  async listModels(): Promise<string[]> {
    if (!this.transport) return [];
    const reply = await this.transport.request({ path: '/v1/models', method: 'GET' });
    if (reply.status < 200 || reply.status >= 300) throw new Error(errorText(reply));
    const body = JSON.parse(reply.body) as { data?: { id?: unknown }[] };
    return (body.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string' && !!id);
  }

  /**
   * One chat completion with the chosen model. Returns the reply's text, or
   * throws with the server's own error message.
   */
  async chat(body: {
    max_tokens?: number;
    messages: { role: 'user'; content: unknown }[];
  }): Promise<string> {
    if (!this.transport) throw new Error('Local AI is only available in the desktop app.');
    const reply = await this.transport.request({
      path: '/v1/chat/completions',
      method: 'POST',
      body: JSON.stringify({ model: this.model(), ...body }),
    });
    if (reply.status < 200 || reply.status >= 300) throw new Error(errorText(reply));
    let parsed: ChatReply;
    try {
      parsed = JSON.parse(reply.body) as ChatReply;
    } catch {
      throw new Error(reply.body.slice(0, 500) || 'The local AI server sent an empty answer.');
    }
    const content = parsed.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }
}

/** The model's own error, as it wrote it ("model not found", "does not support images"…). */
function errorText(reply: { status: number; body: string }): string {
  try {
    const parsed = JSON.parse(reply.body) as ChatReply;
    const error = parsed.error;
    const message = typeof error === 'string' ? error : error?.message;
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 500);
  } catch {
    /* not JSON */
  }
  return reply.body.trim().slice(0, 500) || `Local AI answered with status ${reply.status}.`;
}
