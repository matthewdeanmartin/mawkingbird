import { Injectable, signal } from '@angular/core';
import { DEFAULT_MODEL_ID } from './openrouter-models';

/**
 * Which model the prompt helpers use.
 *
 * Unscoped, like the key it goes with: the model is a property of the
 * OpenRouter connection, and that connection is shared by every account in this
 * browser (see {@link OpenRouterSession}). Registered `setting` — a chosen model
 * is exactly the kind of thing worth publishing in a "here is my setup" gist.
 */

const MODEL_KEY = 'mockingbird_openrouter_model';

@Injectable({ providedIn: 'root' })
export class OpenRouterModelChoice {
  readonly modelId = signal<string>(read());

  set(modelId: string): void {
    const trimmed = modelId.trim();
    if (!trimmed) {
      return;
    }
    try {
      localStorage.setItem(MODEL_KEY, trimmed);
    } catch {
      // Non-persistent, but honour it for this session.
    }
    this.modelId.set(trimmed);
  }

  /** Back to the shipped default. */
  reset(): void {
    try {
      localStorage.removeItem(MODEL_KEY);
    } catch {
      // The in-memory reset below still applies.
    }
    this.modelId.set(DEFAULT_MODEL_ID);
  }

  isDefault(): boolean {
    return this.modelId() === DEFAULT_MODEL_ID;
  }
}

function read(): string {
  try {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}
