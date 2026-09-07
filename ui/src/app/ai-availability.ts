import { computed, inject, Injectable } from '@angular/core';
import { ClientPrefs } from './client-prefs';
import { FeatureFlags } from './feature-flags';

/**
 * The one answer to "should this AI surface exist right now?".
 *
 * Two switches point at the same question and neither is redundant:
 *
 * - **The user's** ({@link ClientPrefs.aiMode}) — a preference on Mockingbird
 *   Blue. Someone who does not want generative features in their client turns
 *   them off, and that is a taste, not a fault.
 * - **The operator's** (`connector-openrouter`) — a rollout flag, for when the
 *   API is down or a key format changes. It exists to stop onboarding people
 *   into a broken experience, which is a different question from taste.
 *
 * Either being off hides the surface, so every gate has to consult both. Doing
 * that inline at each call site is how one of them eventually gets forgotten,
 * so it lives here and nothing else reads `aiMode` directly.
 *
 * **Hiding is not deleting.** Turning AI off leaves the stored OpenRouter key,
 * the conversations, and Eliza's history exactly where they are. Turning it
 * back on restores all of it — a preference that quietly destroyed data would
 * be a trap, and people toggle this to see what it does.
 */
@Injectable({ providedIn: 'root' })
export class AiAvailability {
  private prefs = inject(ClientPrefs);
  private flags = inject(FeatureFlags);

  /**
   * True when AI features should be visible at all.
   *
   * Covers Eliza as well as OpenRouter. Eliza runs no model and costs nothing —
   * she is a pattern-matcher from 1966 — but to a reader she is the chatbot in
   * the corner, and "hide all AI features" that left a chatbot on screen would
   * be a lie about what the switch did.
   */
  readonly enabled = computed(
    () => this.prefs.aiMode() === 'on' && this.flags.enabled('connector-openrouter'),
  );

  /**
   * Why AI is hidden, for a surface that wants to explain itself rather than
   * vanish. Null when it is on.
   */
  readonly disabledReason = computed<string | null>(() => {
    if (this.enabled()) {
      return null;
    }
    if (this.prefs.aiMode() === 'off') {
      return 'AI features are turned off in Appearance settings.';
    }
    return this.flags.disabledReason('connector-openrouter');
  });
}
