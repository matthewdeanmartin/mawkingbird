import { inject, Injectable } from '@angular/core';
import { OpenRouterSession, openRouterError } from './openrouter-session';

/**
 * "How much credit is left?" — which OpenRouter answers two different ways
 * depending on what kind of key is asking, and sometimes doesn't answer at all.
 *
 * The documented *Get remaining credits* endpoint (`GET /api/v1/credits`)
 * requires a **management/provisioning key**. The key PKCE gives us is an
 * ordinary inference key, so that endpoint returns 403 in the normal case.
 * **A 403 here is not an error and must never surface as one** — it is simply
 * how the API says "you are an inference key", which is what we expect to be.
 *
 * The endpoint an inference key can always use is `GET /api/v1/key`, which
 * reports usage and the *per-key spending cap*. That cap is frequently `null`
 * (no cap configured), so "remaining" is not always a number that exists —
 * which is why this returns a discriminated union rather than a float. Showing
 * "$0.00 remaining" for an uncapped key would be a lie in the expensive
 * direction.
 */

const KEY_URL = 'https://openrouter.ai/api/v1/key';
const CREDITS_URL = 'https://openrouter.ai/api/v1/credits';

export type CreditsState =
  /** The key has a spending cap; we can show a true remaining figure. */
  | { kind: 'capped'; remaining: number; limit: number }
  /** No cap on this key. Usage is knowable; "remaining" is not. */
  | { kind: 'uncapped'; used: number }
  /** A management key answered: account-wide credits, the richest answer. */
  | { kind: 'account'; remaining: number; total: number }
  /** Nothing could be determined. `reason` is safe to show the user. */
  | { kind: 'unknown'; reason: string };

interface KeyResponse {
  data?: {
    usage?: number;
    limit?: number | null;
    limit_remaining?: number | null;
  };
}

interface CreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
}

@Injectable({ providedIn: 'root' })
export class OpenRouterCredits {
  private session = inject(OpenRouterSession);

  /**
   * The best answer available for the connected key.
   *
   * Tries the account-wide endpoint first *only* to upgrade the display when
   * the user happens to hold a management key; its failure is expected and
   * silent.
   */
  async load(): Promise<CreditsState> {
    const key = this.session.apiKey();
    if (!key) {
      return { kind: 'unknown', reason: 'Not connected to OpenRouter.' };
    }

    const account = await this.tryAccountCredits(key);
    if (account) {
      return account;
    }

    try {
      const response = await fetch(KEY_URL, { headers: { Authorization: `Bearer ${key}` } });
      if (response.status === 401) {
        // The key was revoked at OpenRouter. Stop claiming to be connected.
        this.session.disconnect();
        return {
          kind: 'unknown',
          reason: 'OpenRouter no longer recognises this key. Connect again.',
        };
      }
      if (!response.ok) {
        return {
          kind: 'unknown',
          reason: await openRouterError(response, "Couldn't read your OpenRouter balance."),
        };
      }
      const data = ((await response.json()) as KeyResponse).data ?? {};
      const limit = data.limit ?? null;
      const remaining = data.limit_remaining ?? null;
      if (typeof limit === 'number' && typeof remaining === 'number') {
        return { kind: 'capped', remaining, limit };
      }
      return { kind: 'uncapped', used: data.usage ?? 0 };
    } catch {
      return { kind: 'unknown', reason: "Couldn't reach OpenRouter." };
    }
  }

  /**
   * Account-wide credits, if this key happens to be a management key.
   *
   * Returns null for every failure — 403 (the normal case, an inference key),
   * anything else, or a network problem. The caller falls through to the
   * per-key endpoint. Nothing here is ever shown to the user.
   */
  private async tryAccountCredits(key: string): Promise<CreditsState | null> {
    try {
      const response = await fetch(CREDITS_URL, { headers: { Authorization: `Bearer ${key}` } });
      if (!response.ok) {
        return null;
      }
      const data = ((await response.json()) as CreditsResponse).data ?? {};
      if (typeof data.total_credits !== 'number' || typeof data.total_usage !== 'number') {
        return null;
      }
      return {
        kind: 'account',
        remaining: data.total_credits - data.total_usage,
        total: data.total_credits,
      };
    } catch {
      return null;
    }
  }
}

/** USD to two decimals, for display. */
export function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** The one-line balance sentence for each state. */
export function describeCredits(state: CreditsState): string {
  switch (state.kind) {
    case 'capped':
      return `${usd(state.remaining)} of ${usd(state.limit)} remaining on this key`;
    case 'uncapped':
      return `${usd(state.used)} used — no spending cap on this key`;
    case 'account':
      return `${usd(state.remaining)} of ${usd(state.total)} remaining on your account`;
    case 'unknown':
      return state.reason;
  }
}
