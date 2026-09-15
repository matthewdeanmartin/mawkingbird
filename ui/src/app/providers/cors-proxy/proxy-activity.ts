import { Injectable, OnDestroy, signal } from '@angular/core';
import { ProxyLimitDetails } from './proxy-limit-details';

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
export class ProxyActivity implements OnDestroy {
  readonly paused = signal(readPaused());
  readonly limitedUntil = signal(0);
  readonly notice = signal(false);
  readonly prompt = signal(false);
  readonly remainingSeconds = signal(0);
  readonly upgradeEligible = signal(false);
  readonly details = signal<ProxyLimitDetails | null>(null);
  private limits = new Map<string, { until: number; upgrade: boolean }>();
  private timer?: ReturnType<typeof setTimeout>;
  private dismissed = false;
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
  assertAllowed(route?: string, own = true): void {
    if (this.paused())
      throw new Error('Proxy features are disabled. Re-enable them in connection settings.');
    if (
      own &&
      [...this.limits].some(
        ([key, limit]) => limit.until > Date.now() && (key === '*' || !route || key === route),
      )
    )
      throw new Error('The proxy is rate-limited. Please wait before retrying.');
  }
  exhausted(
    retryAfter: string | null,
    free: boolean,
    details: ProxyLimitDetails = { cause: 'legacy', scope: 'all_routes' },
  ): void {
    this.refresh();
    if (!this.limits.size) this.dismissed = false;
    if (details.retryAfterSeconds !== undefined) retryAfter = String(details.retryAfterSeconds);
    const seconds = Number(retryAfter);
    const until =
      retryAfter && !Number.isFinite(seconds)
        ? Date.parse(retryAfter)
        : Date.now() + (seconds > 0 ? seconds : 60) * 1000;
    const key = details.scope === 'route' && details.route ? details.route : '*';
    const previous = this.limits.get(key);
    const upgrade =
      free &&
      details.tier !== 'plus' &&
      (details.cause === 'caller_allowance' || details.cause === 'legacy');
    this.limits.set(key, {
      until: Math.max(previous?.until ?? 0, Number.isFinite(until) ? until : Date.now() + 60_000),
      upgrade: upgrade && (previous?.upgrade ?? true),
    });
    this.details.set(details);
    this.refresh();
    this.notice.set(this.limits.size > 0 && !this.dismissed);
    if (!this.upgradeEligible() || this.paused() || this.shown || this.dismissed) return;
    try {
      if (sessionStorage.getItem(PROXY_PROMPT_KEY)) return;
    } catch {
      /* Fall back to memory. */
    }
    this.prompt.set(true);
  }
  dismissNotice(): void {
    this.dismissed = true;
    this.notice.set(false);
    this.prompt.set(false);
  }
  private refresh(): void {
    clearTimeout(this.timer);
    const now = Date.now();
    for (const [key, limit] of this.limits) {
      if (limit.until <= now) this.limits.delete(key);
    }
    const limits = [...this.limits.values()];
    const until = Math.max(0, ...limits.map((limit) => limit.until));
    this.limitedUntil.set(until);
    this.remainingSeconds.set(Math.max(0, Math.ceil((until - now) / 1000)));
    this.upgradeEligible.set(limits.length > 0 && limits.every((limit) => limit.upgrade));
    if (!limits.length) {
      this.notice.set(false);
      this.prompt.set(false);
    } else {
      this.timer = setTimeout(() => this.refresh(), Math.min(1000, until - now));
    }
  }
  ngOnDestroy(): void {
    clearTimeout(this.timer);
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
