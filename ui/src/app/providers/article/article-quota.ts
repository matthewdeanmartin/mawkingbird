import { computed, inject, Injectable, signal } from '@angular/core';
import { PlusSession } from '../account/plus-session';
import { PageDiagnostics } from '../../page-diagnostics';

/**
 * How many articles a free reader may expand per day.
 *
 * ## What this is and is not
 *
 * It is a nudge, not an enforcement boundary. The counter lives in
 * `localStorage`, so anyone who wants more can clear it, and that is fine — it
 * is consistent with the rest of this app, which is anonymous by design and has
 * no server that could count on the user's behalf. Real enforcement would mean
 * per-account counting in the proxy, and the proxy deliberately does not do that
 * (see the note in `plus/usage.ts` about an approximate counter never becoming
 * a ceiling).
 *
 * What it does buy is an honest answer to "does this work?" before anyone pays
 * for it. Two articles is enough to find out; it is not enough to read a feed
 * with.
 *
 * ## What does not count
 *
 * Only a rendered article. Specifically **not**:
 *
 * - a cache hit, because re-reading something already fetched must be free or
 *   the feature feels punitive;
 * - a failure of any kind, because spending one of two daily articles on a
 *   Cloudflare challenge page is the fastest way to make a paid feature feel
 *   like a scam;
 * - a result the quality gate rejected, because the reader got a card, not an
 *   article, and charging for that invites a refund request.
 *
 * The call site therefore consumes *after* a successful render, never before
 * the fetch.
 */

/** Registered in `storage-registry.ts` as `cache`. */
export const ARTICLE_QUOTA_KEY = 'mockingbird_article_quota';

/** Free expansions per calendar day. */
export const FREE_DAILY_ARTICLES = 2;

interface StoredQuota {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Successful rendered articles charged against the free allowance. */
  count: number;
  /** Fetch actions started after a free-tier entitlement decision. */
  freeFetches: number;
  /** Fetch actions started after a Plus entitlement decision. */
  plusFetches: number;
  /**
   * Articles opened in the reader on this browser, ever. Never reset by the day
   * rollover.
   *
   * Every other number here is a *quota* number, and a quota is only meaningful
   * for today. But the Plus page also has to answer "what has my subscription
   * done for me", and answering that with today's counters told a subscriber who
   * had not read anything since midnight that they had got nothing — on a page
   * whose next button is "cancel". A running total is the honest answer to that
   * question, and it is the only number on the panel that grows.
   */
  lifetime: number;
}

/** Today, in the reader's own timezone. */
function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class ArticleQuota {
  private plus = inject(PlusSession);
  private log = inject(PageDiagnostics);

  /** Today's quota and fetch diagnostics, as one atomic stored record. */
  private stored = signal(this.read());

  /** Successful free-tier articles charged today. */
  private used = computed(() => this.stored().count);

  /** Fetch actions started on each tier today, including failed attempts. */
  readonly freeFetches = computed(() => this.stored().freeFetches);
  readonly plusFetches = computed(() => this.stored().plusFetches);

  /**
   * Articles opened in the reader on this browser, ever.
   *
   * The one number on the Plus page that answers "was this worth it" rather than
   * "how much is left today".
   */
  readonly lifetime = computed(() => this.stored().lifetime);

  /** True after the supporter service has answered for this page load. */
  private entitlementChecked = signal(false);

  /** One shared lookup when construction and a click happen together. */
  private entitlementCheck: Promise<void> | null = null;

  /** True while an exhausted counter may still turn out to belong to a supporter. */
  readonly checkingEntitlement = signal(false);

  /**
   * Whether this reader is exempt.
   *
   * A lapsed subscription silently returns them to the free limit rather than
   * breaking anything, which is the same posture the proxy takes.
   */
  readonly unlimited = computed(() => this.plus.isSupporter());

  /** Free-tier expansions left, even while Plus makes the effective limit unlimited. */
  readonly freeRemaining = computed(() => Math.max(0, FREE_DAILY_ARTICLES - this.used()));

  /** Expansions left today. `Infinity` for supporters. */
  readonly remaining = computed(() => (this.unlimited() ? Infinity : this.freeRemaining()));

  /**
   * Whether the fetch control should remain available.
   *
   * An exhausted counter stays available while entitlement is being checked.
   * Disabling it sooner creates a deadlock: the subscriber cannot make the
   * proxied request that would otherwise discover their subscription.
   */
  readonly allowed = computed(() => this.checkingEntitlement() || this.remaining() > 0);

  constructor() {
    // A browser can arrive with yesterday's session gone from memory but
    // today's local counter already exhausted. Start the lookup immediately so
    // a returning subscriber is unlocked without having to visit Settings.
    if (this.remaining() === 0) {
      void this.checkEntitlement('exhausted-on-load');
    }
  }

  /**
   * Settle the account tier before deciding whether this expansion is allowed.
   *
   * `PlusSession` deliberately starts at `free`: entitlement is an account
   * fact, not something safe to persist in local storage. The reader must
   * therefore refresh the tier at its own gate instead of assuming the initial
   * value is authoritative. The lookup is shared with the constructor's
   * exhausted-counter check. A supporter already confirmed in this app session
   * needs no second lookup.
   */
  async authorize(): Promise<boolean> {
    await this.checkEntitlement('article-fetch');
    const allowed = this.remaining() > 0;
    this.log.info('ArticleEntitlement', 'decision', {
      tier: this.unlimited() ? 'plus' : 'free',
      allowed,
      remaining: this.unlimited() ? 'unlimited' : this.remaining(),
      freeFetchesToday: this.freeFetches(),
      plusFetchesToday: this.plusFetches(),
    });
    return allowed;
  }

  /** Perform the entitlement lookup once for this instance. */
  private checkEntitlement(
    trigger: 'article-fetch' | 'exhausted-on-load' | 'storage-refresh',
  ): Promise<void> {
    if (this.entitlementChecked()) {
      this.log.info('ArticleEntitlement', 'check:already-settled', {
        trigger,
        tier: this.unlimited() ? 'plus' : 'free',
      });
      return Promise.resolve();
    }
    if (this.plus.isSupporter()) {
      this.entitlementChecked.set(true);
      this.log.info('ArticleEntitlement', 'check:known-plus', { trigger });
      return Promise.resolve();
    }
    if (this.entitlementCheck) {
      this.log.info('ArticleEntitlement', 'check:joined', { trigger });
      return this.entitlementCheck;
    }

    this.log.info('ArticleEntitlement', 'check:start', {
      trigger,
      usedToday: this.used(),
      remaining: this.remaining(),
    });
    this.checkingEntitlement.set(true);
    let failed = false;
    this.entitlementCheck = this.plus
      // `refresh()`, not `token()`: a fresh held free token can predate a
      // subscription bought in another tab. Reusing it would make this lookup
      // confidently repeat the same stale answer for up to fifteen minutes.
      .refresh()
      .then(() => undefined)
      // PlusSession normally resolves failures to null. Keep the quota gate
      // defensive too: an account-service outage must settle to the free
      // posture, not become an unhandled rejection from the constructor.
      .catch(() => {
        failed = true;
      })
      .finally(() => {
        this.entitlementChecked.set(true);
        this.checkingEntitlement.set(false);
        this.entitlementCheck = null;
        this.log.info('ArticleEntitlement', 'check:complete', {
          trigger,
          tier: this.unlimited() ? 'plus' : 'free',
          failed,
          remaining: this.unlimited() ? 'unlimited' : this.remaining(),
        });
      });
    return this.entitlementCheck;
  }

  /** Today's stored counter, resetting a stale day on read. */
  private read(): StoredQuota {
    const fresh: StoredQuota = {
      day: today(),
      count: 0,
      freeFetches: 0,
      plusFetches: 0,
      lifetime: 0,
    };
    let raw: string | null;
    try {
      raw = localStorage.getItem(ARTICLE_QUOTA_KEY);
    } catch {
      // Private-mode or blocked storage: behave as if today is fresh. The
      // alternative — refusing the feature — punishes the wrong people.
      return fresh;
    }
    if (!raw) {
      return fresh;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredQuota>;
      // Carried across the day boundary and across a damaged daily record,
      // because it is not a quota number. Losing a reader's running total at
      // midnight would make the one growing number on the Plus page reset to
      // zero every night — the exact failure this field exists to fix.
      const lifetime = nonNegative(parsed.lifetime);
      if (parsed.day !== today() || typeof parsed.count !== 'number') {
        return { ...fresh, lifetime };
      }
      const count = nonNegative(parsed.count);
      return {
        day: parsed.day,
        count,
        // Before fetch counters existed, `count` is the closest truthful lower
        // bound: every charged article necessarily began as a free fetch.
        freeFetches:
          typeof parsed.freeFetches === 'number' ? nonNegative(parsed.freeFetches) : count,
        plusFetches: nonNegative(parsed.plusFetches),
        // Same reasoning for a record written before this field existed: today's
        // reads are the only ones we can prove happened, so start there rather
        // than claiming zero.
        lifetime: typeof parsed.lifetime === 'number' ? lifetime : count,
      };
    } catch {
      return fresh;
    }
  }

  /** Record one click that is about to reach the article fetcher. */
  recordFetch(): void {
    const current = this.read();
    const next: StoredQuota = this.unlimited()
      ? { ...current, plusFetches: current.plusFetches + 1 }
      : { ...current, freeFetches: current.freeFetches + 1 };
    this.persist(next);
    this.log.info('ArticleQuota', 'fetch:recorded', {
      tier: this.unlimited() ? 'plus' : 'free',
      freeFetchesToday: next.freeFetches,
      plusFetchesToday: next.plusFetches,
      remaining: this.unlimited() ? 'unlimited' : this.remaining(),
    });
  }

  /**
   * Record one rendered article.
   *
   * Call only after an article was actually shown. Returns the new remaining
   * count so a caller can message it without a second read.
   */
  consume(): number {
    const current = this.read();
    if (this.unlimited()) {
      // A supporter is charged nothing, but is still *counted*. This used to
      // return before touching storage, which meant the only reader whose total
      // the Plus page wanted to show was the one reader never counted — their
      // running total sat at zero no matter how much they read.
      this.persist({ ...current, lifetime: current.lifetime + 1 });
      return Infinity;
    }
    const next = { ...current, count: current.count + 1, lifetime: current.lifetime + 1 };
    this.persist(next);
    return Math.max(0, FREE_DAILY_ARTICLES - next.count);
  }

  /** Publish and persist one complete daily record. */
  private persist(next: StoredQuota): void {
    this.stored.set(next);
    try {
      localStorage.setItem(ARTICLE_QUOTA_KEY, JSON.stringify(next));
    } catch {
      // A counter we cannot persist is a counter that resets on reload. Not
      // worth failing the read the user already paid for.
    }
  }

  /** Re-read from storage, for a browser that changed it in another tab. */
  refresh(): void {
    this.stored.set(this.read());
    if (this.remaining() === 0) {
      void this.checkEntitlement('storage-refresh');
    }
  }
}

/** A finite, non-negative diagnostic counter, or zero for old/corrupt data. */
function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
