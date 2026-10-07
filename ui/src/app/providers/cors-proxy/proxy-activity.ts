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
  readonly rssLimitDetails = signal<ProxyLimitDetails | null>(null);
  private limits = new Map<string, { until: number; upgrade: boolean; blocking: boolean }>();
  private timer?: ReturnType<typeof setTimeout>;
  private dismissed = false;
  private shown = new Set<string>();

  private promptIdentity(): string {
    const details = this.details();
    return details?.allowance === 'daily' || details?.cause === 'destination_policy'
      ? `free:${details.identity ?? 'ip'}`
      : 'legacy';
  }
  private alreadyPrompted(): boolean {
    try {
      const stored = sessionStorage.getItem(PROXY_PROMPT_KEY);
      if (stored === 'shown') this.shown.add('legacy');
      else if (stored) {
        const keys: unknown = JSON.parse(stored);
        if (Array.isArray(keys))
          for (const key of keys) if (typeof key === 'string') this.shown.add(key);
      }
    } catch {
      /* Keep the in-memory session history. */
    }
    return this.shown.has(this.promptIdentity());
  }

  setPaused(paused: boolean): void {
    this.paused.set(paused);
    try {
      localStorage.setItem(PROXY_PAUSED_KEY, String(paused));
    } catch {
      /* Keep the session preference. */
    }
    this.prompt.set(false);
  }
  assertAllowed(route?: string, own = true, notify = false): void {
    if (this.paused())
      throw new Error('Proxy features are disabled. Re-enable them in connection settings.');
    if (
      own &&
      [...this.limits].some(
        ([key, limit]) =>
          limit.blocking && limit.until > Date.now() && (key === '*' || !route || key === route),
      )
    ) {
      if (notify && this.upgradeEligible() && !this.dismissed) {
        this.notice.set(true);
        if (!this.alreadyPrompted()) this.prompt.set(true);
      }
      throw new Error('The proxy is rate-limited. Please wait before retrying.');
    }
  }
  exhausted(
    retryAfter: string | null,
    free: boolean,
    details: ProxyLimitDetails = { cause: 'legacy', scope: 'all_routes' },
    notify = true,
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
      (details.cause === 'caller_allowance' ||
        details.cause === 'destination_policy' ||
        details.cause === 'legacy');
    this.limits.set(key, {
      until: Math.max(previous?.until ?? 0, Number.isFinite(until) ? until : Date.now() + 60_000),
      upgrade: upgrade && (previous?.upgrade ?? true),
      blocking: details.cause !== 'destination_policy',
    });
    this.details.set(details);
    if (!notify) {
      this.rssLimitDetails.set(details);
      if (!previous)
        console.info(
          'RSS refresh paused: the app reached the proxy request allowance. Saved RSS items remain available; no subscriptions need to be removed.',
        );
    }
    this.refresh();
    if (!notify) return;
    this.notice.set(this.limits.size > 0 && !this.dismissed);
    if (!this.upgradeEligible() || this.paused() || this.alreadyPrompted() || this.dismissed)
      return;
    this.prompt.set(true);
  }
  dismissNotice(): void {
    this.dismissed = true;
    this.notice.set(false);
    this.prompt.set(false);
  }
  /** Membership refresh may change the caller's allowance; the server remains authoritative. */
  clearLimits(): void {
    this.limits.clear();
    this.details.set(null);
    this.refresh();
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
      this.rssLimitDetails.set(null);
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
    if (
      !this.prompt() ||
      this.alreadyPrompted() ||
      this.paused() ||
      Date.now() >= this.limitedUntil()
    )
      return false;
    this.shown.add(this.promptIdentity());
    this.prompt.set(false);
    try {
      sessionStorage.setItem(PROXY_PROMPT_KEY, JSON.stringify([...this.shown]));
    } catch {
      /* Fall back to memory. */
    }
    return true;
  }
}
