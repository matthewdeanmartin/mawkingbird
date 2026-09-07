import { Injectable, computed, signal } from '@angular/core';
import type { Tier } from '../providers/account/mawkingbird-session';

/**
 * Calls this browser has made to Mawkingbird's own services, split by which
 * tier paid for them.
 *
 * ## Why this is not {@link ApiMetrics}
 *
 * That service measures *a Mastodon instance's* API: its rows are endpoint
 * templates, its docs links point at joinmastodon.org, and its interceptor
 * deliberately skips foreign hosts. Mawkingbird's services are a different API
 * with a different shape, and folding them in would put rows in the endpoint
 * table that no Mastodon documentation describes while making the per-server
 * figures wrong for every server.
 *
 * The question here is also different. Nobody asks "how fast is the auth
 * service" — they ask "am I spending my allowance, and on what". So the unit is
 * the *service*, and the split that matters is paid versus free.
 *
 * ## Why the tier is recorded per call, not read at display time
 *
 * A call's tier is a property of the call: it is what the token carried, and
 * therefore what the service billed against. Reading the current tier when the
 * page renders would relabel history — every call made last week on the free
 * tier would appear as paid the moment someone subscribes, which is the one
 * question this section exists to answer.
 *
 * Anonymous and free both count as free: neither is billed, and the tier
 * recorded is the one on the token actually sent, so an anonymous call and a
 * signed-in free call are the same thing to the service.
 *
 * ## Storage
 *
 * Same discipline as {@link ApiMetrics}: nothing grows with call count. One row
 * per (service, tier) pair with counters and a duration sum, plus a bounded
 * ring of daily totals. A busy month costs a few hundred bytes.
 */

/** A Mawkingbird service, as the user would name it. */
export type MawkingbirdService = 'auth' | 'account' | 'profile' | 'proxy' | 'other';

/** What paid for a call. Anonymous and free are both `free`. */
export type BillingTier = 'free' | 'paid';

/** Aggregate counters for one (service, tier) pair. */
export interface ServiceStat {
  service: MawkingbirdService;
  tier: BillingTier;
  calls: number;
  errors: number;
  /** Total response time in ms, for a mean. */
  totalMs: number;
  /** Epoch ms of the most recent call. */
  lastAt: number;
}

/** One day's call counts, for the trend. */
export interface MawkingbirdDay {
  /** Day start, epoch ms floored to local midnight. */
  t: number;
  free: number;
  paid: number;
  errors: number;
}

const STORAGE_KEY = 'mockingbird_mawkingbird_metrics';
/** Keep a quarter of a year, matching the API metrics' daily tier. */
const MAX_DAYS = 90;
/** Debounce window for persisting after activity. */
const FLUSH_DEBOUNCE_MS = 1_500;

/** Persisted shape. Compact keys, same reasoning as the API metrics blob. */
interface StoredMawkingbird {
  v: 1;
  /** stats: [service, tier, calls, errors, totalMs, lastAt][] */
  s: [string, string, number, number, number, number][];
  /** days: [t, free, paid, errors][] */
  d: [number, number, number, number][];
}

/**
 * Which service a URL belongs to.
 *
 * Matched on the hostname's first label, so the test deployments
 * (`auth-test.mawkingbird.com`) land in the same bucket as production. They are
 * the same service and the same allowance; which environment answered is a
 * deployment detail, not something a usage figure should be split by.
 *
 * Returns null for anything that is not a Mawkingbird host, which is how the
 * callers decide whether to record at all.
 */
export function mawkingbirdService(url: string): MawkingbirdService | null {
  let host: string;
  try {
    host = new URL(url, location.origin).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.endsWith('.mawkingbird.com') && host !== 'mawkingbird.com') {
    return null;
  }
  const label = host.split('.')[0].replace(/-test$/, '');
  switch (label) {
    case 'auth':
      return 'auth';
    case 'account':
      return 'account';
    case 'profile':
      return 'profile';
    case 'cors':
      return 'proxy';
    default:
      return 'other';
  }
}

/** Collapse the session's tier vocabulary onto the billing question. */
export function billingTier(tier: Tier | null): BillingTier {
  return tier === 'plus' || tier === 'business' ? 'paid' : 'free';
}

/** Local midnight for a timestamp. See `dayStart` in api-metrics for why local. */
function dayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function statKey(service: MawkingbirdService, tier: BillingTier): string {
  return `${service}:${tier}`;
}

@Injectable({ providedIn: 'root' })
export class MawkingbirdMetrics {
  private stats = new Map<string, ServiceStat>();
  private days: MawkingbirdDay[] = [];
  private readonly version = signal(0);
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
    }
  }

  /**
   * Record one completed call to a Mawkingbird service.
   *
   * `tier` is the tier of the token that was sent, which the caller knows and
   * this service deliberately does not look up — see the class comment.
   */
  record(service: MawkingbirdService, tier: BillingTier, durationMs: number, ok: boolean): void {
    const key = statKey(service, tier);
    const ms = Math.max(0, Math.round(durationMs));
    const now = Date.now();
    const prev = this.stats.get(key);
    if (prev) {
      prev.calls++;
      prev.totalMs += ms;
      prev.lastAt = now;
      if (!ok) {
        prev.errors++;
      }
    } else {
      this.stats.set(key, {
        service,
        tier,
        calls: 1,
        errors: ok ? 0 : 1,
        totalMs: ms,
        lastAt: now,
      });
    }
    this.bumpDay(tier, !ok);
    this.version.update((v) => v + 1);
    this.scheduleFlush();
  }

  private bumpDay(tier: BillingTier, isError: boolean): void {
    const t = dayStart(Date.now());
    let day = this.days[this.days.length - 1];
    if (!day || day.t !== t) {
      day = { t, free: 0, paid: 0, errors: 0 };
      this.days.push(day);
      if (this.days.length > MAX_DAYS) {
        this.days = this.days.slice(-MAX_DAYS);
      }
    }
    if (tier === 'paid') {
      day.paid++;
    } else {
      day.free++;
    }
    if (isError) {
      day.errors++;
    }
  }

  // ------------------------------------------------------------------- views

  /** All (service, tier) rows, busiest first. */
  readonly rows = computed<ServiceStat[]>(() => {
    this.version();
    return [...this.stats.values()].sort((a, b) => b.calls - a.calls);
  });

  readonly daily = computed<MawkingbirdDay[]>(() => {
    this.version();
    return [...this.days];
  });

  /** Totals, split the way the section is read: paid versus free. */
  readonly totals = computed(() => {
    this.version();
    let free = 0;
    let paid = 0;
    let errors = 0;
    let totalMs = 0;
    for (const s of this.stats.values()) {
      if (s.tier === 'paid') {
        paid += s.calls;
      } else {
        free += s.calls;
      }
      errors += s.errors;
      totalMs += s.totalMs;
    }
    const calls = free + paid;
    return {
      calls,
      free,
      paid,
      errors,
      avgMs: calls ? Math.round(totalMs / calls) : 0,
      errorRate: calls ? errors / calls : 0,
    };
  });

  /** Mean response time for one row (ms). */
  static mean(s: ServiceStat): number {
    return s.calls ? s.totalMs / s.calls : 0;
  }

  reset(): void {
    this.stats.clear();
    this.days = [];
    this.version.update((v) => v + 1);
    this.flush();
  }

  // ----------------------------------------------------------------- persist

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  private flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const blob: StoredMawkingbird = {
      v: 1,
      s: [...this.stats.values()].map((s) => [
        s.service,
        s.tier,
        s.calls,
        s.errors,
        s.totalMs,
        s.lastAt,
      ]),
      d: this.days.map((d) => [d.t, d.free, d.paid, d.errors]),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    } catch {
      // Counters are diagnostics; losing them costs nothing, and must never
      // interfere with the request that was being made.
    }
  }

  private load(): void {
    let blob: StoredMawkingbird | null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      blob = raw ? (JSON.parse(raw) as StoredMawkingbird) : null;
    } catch {
      blob = null;
    }
    if (!blob || blob.v !== 1) {
      return;
    }
    for (const [service, tier, calls, errors, totalMs, lastAt] of blob.s ?? []) {
      const s: ServiceStat = {
        service: service as MawkingbirdService,
        tier: tier as BillingTier,
        calls,
        errors,
        totalMs,
        lastAt,
      };
      this.stats.set(statKey(s.service, s.tier), s);
    }
    this.days = (blob.d ?? []).map(([t, free, paid, errors]) => ({ t, free, paid, errors }));
  }
}
