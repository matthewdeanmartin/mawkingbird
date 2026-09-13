import { Injectable, signal } from '@angular/core';

export const PROXY_PAUSED_KEY = 'mockingbird_proxy_paused';
export const PROXY_PROMPT_KEY = 'mockingbird_proxy_prompt';
function readPaused(): boolean {
  try {
    return localStorage.getItem(PROXY_PAUSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class ProxyActivity {
  readonly paused = signal(readPaused());
  readonly limitedUntil = signal(0);
  readonly notice = signal(false);
  readonly prompt = signal(false);
  private shown = false;

  setPaused(paused: boolean): void {
    this.paused.set(paused);
    try {
      localStorage.setItem(PROXY_PAUSED_KEY, String(paused));
    } catch {
      /* Keep the session preference. */
    }
    this.prompt.set(false);
  }
  assertAllowed(): void {
    if (this.paused())
      throw new Error('Proxy features are disabled. Re-enable them in connection settings.');
    if (Date.now() < this.limitedUntil())
      throw new Error('The proxy is rate-limited. Please wait before retrying.');
  }
  exhausted(retryAfter: string | null, free: boolean): void {
    const seconds = Number(retryAfter);
    const until =
      retryAfter && !Number.isFinite(seconds)
        ? Date.parse(retryAfter)
        : Date.now() + (seconds > 0 ? seconds : 60) * 1000;
    this.limitedUntil.set(
      Math.max(this.limitedUntil(), Number.isFinite(until) ? until : Date.now() + 60_000),
    );
    this.notice.set(true);
    if (!free || this.paused() || this.shown) return;
    try {
      if (sessionStorage.getItem(PROXY_PROMPT_KEY)) return;
    } catch {
      /* Fall back to memory. */
    }
    this.prompt.set(true);
  }
  claimPrompt(): boolean {
    if (!this.prompt() || this.shown || this.paused() || Date.now() >= this.limitedUntil())
      return false;
    this.shown = true;
    this.prompt.set(false);
    try {
      sessionStorage.setItem(PROXY_PROMPT_KEY, 'shown');
    } catch {
      /* Fall back to memory. */
    }
    return true;
  }
}
