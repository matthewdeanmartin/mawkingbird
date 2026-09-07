import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ArticleFetch } from '../../providers/article/article-fetch';
import { ArticleQuota } from '../../providers/article/article-quota';
import { ArticleReadingTally } from '../../providers/article/article-reading-tally';
import { ArticleDiagnosis, ArticleResult } from '../../providers/article/article-models';
import { inspectUrl } from '../../providers/article/article-diagnosis';
import { ObservedFailures } from '../../providers/article/observed-failures';
import { PageDiagnostics } from '../../page-diagnostics';

/**
 * Expanding one linked article: the fetch, the quota, and the sentence that
 * explains whatever came back.
 *
 * ## Why this is a service and not two copies of the same method
 *
 * It was two copies. `thread.ts` and `pages/rss/rss-article` both called
 * `ArticleFetch.expand()`, both spent quota, and both recorded a read — and
 * they had already drifted apart in the details that matter. Thread reader-mode
 * carried a named sentence for every one of the twenty diagnoses plus a
 * folded-away debug disclosure; the RSS pane rendered the raw diagnosis slug
 * into "Couldn't read the full article (bot-check)". Thread bounded its manual
 * retries; the pane had no retry at all.
 *
 * Neither was wrong about *its* surface. But there is one extraction pipeline
 * by design (see `article-fetch.ts`), and having two different explanations of
 * the same failure is how a reader learns the messages are not to be trusted.
 *
 * ## What stays at the call site
 *
 * Rendering. This service settles *what happened and what it means*; the
 * component decides how much of it to show. A pane with 290px of room and a
 * full reader page legitimately differ there.
 *
 * ## Quota
 *
 * Spent here, on the rule both call sites had already converged on: only a
 * *rendered* article costs anything. A cache hit, a failure, and a page the
 * quality gate rejected are all free — `recordFetch` before the request marks
 * the attempt, and the tally records the read only once `result.article` exists.
 */

/**
 * Forced retries allowed per document.
 *
 * A failure on the article route is never edge-cached (a cached refusal would
 * strand a reader past the point where the site recovered), so every forced
 * retry is a full origin round trip that costs us and the publisher alike.
 * Bounded so "Try again" stays a deliberate act rather than a thing to lean on.
 */
export const MAX_MANUAL_RETRIES = 2;

/** Translation keys for the sentence each diagnosis earns. */
const DIAGNOSIS_NOTES: Record<ArticleDiagnosis, string | null> = {
  ok: null,
  partial: 'reader.article.note.partial',
  paywall: 'reader.article.note.paywall',
  'bot-check': 'reader.article.note.botCheck',
  'consent-wall': 'reader.article.note.consentWall',
  'needs-js': 'reader.article.note.needsJs',
  junk: 'reader.article.note.junk',
  'not-html': 'reader.article.note.notHtml',
  'too-large': 'reader.article.note.tooLarge',
  'rate-limited': 'reader.article.note.rateLimited',
  // Distinguished from ours deliberately: waiting fixes our limit, and does not
  // necessarily fix theirs.
  'site-rate-limited': 'reader.article.note.siteRateLimited',
  'site-error': 'reader.article.note.siteError',
  'not-found': 'reader.article.note.notFound',
  'upstream-timeout': 'reader.article.note.upstreamTimeout',
  'blocked-destination': 'reader.article.note.blockedDestination',
  // Should never reach a reader: the fetch retries on the older route when it
  // sees this. Worded for the case where that retry also fails, which means the
  // proxy is genuinely misconfigured rather than merely behind.
  'route-unavailable': 'reader.article.note.routeUnavailable',
  'redirect-loop': 'reader.article.note.redirectLoop',
  network: 'reader.article.note.network',
};

/**
 * One document's expansion state.
 *
 * Not `providedIn: 'root'` — this is per-document state, and a singleton would
 * carry one article's result onto the next document the reader opened. Provided
 * by the component that owns a reading surface.
 */
@Injectable()
export class ArticleExpansion {
  private articles = inject(ArticleFetch);
  private tally = inject(ArticleReadingTally);
  private transloco = inject(TranslocoService);
  private log = inject(PageDiagnostics);
  private observed = inject(ObservedFailures);

  readonly quota = inject(ArticleQuota);

  /** True while a fetch is in flight. */
  readonly expanding = signal(false);

  /** The last attempt's result, or null before the first. */
  readonly result = signal<ArticleResult | null>(null);

  /** Forced retries spent on this document. */
  private retries = signal(0);
  private generation = 0;

  /** Clear the surface and invalidate completions belonging to the last document. */
  reset(): void {
    this.generation++;
    this.result.set(null);
    this.expanding.set(false);
    this.retries.set(0);
  }

  async restore(url: string | null): Promise<ArticleResult | null> {
    const generation = this.generation;
    const cached = url ? await this.articles.cached(url) : null;
    if (generation !== this.generation || this.expanding() || this.result()) return null;
    if (cached?.article) this.result.set(cached);
    return cached?.article ? cached : null;
  }

  /** Whether another manual retry is allowed. */
  readonly retriesLeft = computed(() => MAX_MANUAL_RETRIES - this.retries());

  /** Whether expansion is possible at all — it needs a CORS proxy. */
  readonly available = computed(() => this.articles.available());

  /**
   * Why expansion cannot run right now, if it cannot.
   *
   * Separate from the diagnosis notes, which describe a fetch that already
   * happened. This is about the state of the app before any fetch is possible.
   *
   * The proxy selection lives in `localStorage` and does not travel between
   * devices, so the same account on a second browser has none configured.
   * Saying so beats rendering nothing, which is indistinguishable from the
   * feature not existing.
   */
  readonly blocker = computed<string | null>(() =>
    this.available() ? null : this.transloco.translate('reader.article.blocker'),
  );

  /** The host an expanded article came from, for the attribution line. */
  readonly host = computed(() => {
    const result = this.result();
    if (!result) {
      return '';
    }
    try {
      return new URL(result.finalUrl).hostname.replace(/^www\./, '');
    } catch {
      return result.finalUrl;
    }
  });

  /**
   * A warning from what this device has already seen at this host.
   *
   * Null when there is nothing to say, which is the common case. When it is
   * set, the button becomes "Try anyway" and the sentence is the same one the
   * shipped `UNLIKELY_HOSTS` list produces — the two sources are deliberately
   * indistinguishable to the reader, because a hint is a hint whether it came
   * from a table or from experience.
   */
  beforeFetch(
    url: string | null,
  ): { diagnosis: ArticleDiagnosis; worthTrying: boolean; note: string } | null {
    if (!url) {
      return null;
    }
    // The shipped list first: it is reviewable by a human, it works on the very
    // first attempt, and it knows things experience cannot (a PDF is never
    // going to extract, however many times it is tried).
    const shipped = inspectUrl(url);
    if (shipped) {
      return { ...shipped, note: this.noteFor(shipped.diagnosis) };
    }
    // Then what this device has actually seen. Always worth trying: unlike the
    // shipped list, this is a pattern rather than a fact, and a site that has
    // started working again should cost one click to discover.
    const observed = this.observed.warnFor(url);
    return observed
      ? { diagnosis: observed, worthTrying: true, note: this.noteFor(observed) }
      : null;
  }

  /** The sentence a diagnosis earns — one table, so every surface agrees. */
  private noteFor(diagnosis: ArticleDiagnosis): string {
    const key = DIAGNOSIS_NOTES[diagnosis];
    return key ? this.transloco.translate<string>(key) : '';
  }

  /** The diagnosis worth showing, when the result is not a clean article. */
  readonly failure = computed<ArticleDiagnosis | null>(() => {
    const result = this.result();
    return result && !result.article ? result.diagnosis : null;
  });

  /**
   * What to say about a result that is not a clean article.
   *
   * Every diagnosis gets its own sentence. A generic "couldn't load" is the one
   * thing this feature will not ship: these pages fail for specific, nameable
   * reasons, and "this publisher requires a subscription" is a different fact
   * from "this page needs JavaScript".
   */
  readonly note = computed<string | null>(() => {
    const result = this.result();
    if (!result) {
      return null;
    }
    const key = DIAGNOSIS_NOTES[result.diagnosis];
    return key ? this.transloco.translate(key) : null;
  });

  /**
   * The technical detail behind a failure, as lines for a disclosure.
   *
   * Shown in the page rather than only logged to the console. "It didn't work"
   * is not something anyone can act on, and requiring devtools to find out why
   * puts the answer out of reach of exactly the people most likely to report
   * the problem.
   */
  readonly debug = computed<string[]>(() => {
    const result = this.result();
    const debug = result?.debug;
    if (!result || !debug || result.article) {
      return [];
    }
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.transloco.translate(key, params);
    const lines: string[] = [];
    if (debug.source === 'upstream') {
      lines.push(
        debug.upstreamStatus
          ? t('reader.article.debug.upstreamStatus', { status: debug.upstreamStatus })
          : t('reader.article.debug.upstream'),
      );
    } else if (debug.source === 'proxy') {
      lines.push(t('reader.article.debug.proxy'));
    }
    if (debug.status) {
      lines.push(t('reader.article.debug.status', { status: debug.status }));
    }
    if (debug.detail) {
      lines.push(debug.detail);
    }
    if (debug.documentWords !== undefined) {
      lines.push(t('reader.article.debug.textFound', { count: debug.documentWords }));
    }
    if (debug.hadMetadata !== undefined) {
      lines.push(
        t(
          debug.hadMetadata
            ? 'reader.article.debug.previewReadable'
            : 'reader.article.debug.noPreview',
        ),
      );
    }
    if (debug.elapsedMs !== undefined) {
      lines.push(
        t('reader.article.debug.elapsed', { seconds: (debug.elapsedMs / 1000).toFixed(1) }),
      );
    }
    lines.push(t('reader.article.debug.url', { url: result.finalUrl }));
    return lines;
  });

  /**
   * Fetch and render the article at `url`.
   *
   * Returns the result, so a caller that wants to move focus or record a
   * position can do it without watching the signal.
   */
  async expand(url: string | null, force = false): Promise<ArticleResult | null> {
    if (!url || this.expanding()) {
      return null;
    }
    if (this.result()?.article) return this.result();
    // A forced retry bypasses the cache, and therefore also the failure
    // cooldown that stops a permanently-refusing site being re-fetched forever.
    if (force && this.retries() >= MAX_MANUAL_RETRIES) {
      return null;
    }

    this.expanding.set(true);
    const generation = this.generation;
    try {
      if (!force) {
        const cached = await this.articles.cached(url);
        if (generation !== this.generation) return null;
        if (cached) {
          this.result.set(cached);
          return cached;
        }
      }
      // `isSupporter()` starts false on every reload because entitlement is
      // deliberately not persisted. Settle it before enforcing the local
      // counter; otherwise an exhausted subscriber is refused before the
      // request that could discover their subscription is ever made.
      if (!(await this.quota.authorize())) {
        return null;
      }
      if (generation !== this.generation) return null;
      if (force) {
        this.retries.update((n) => n + 1);
        await this.articles.forget(url);
      }
      if (generation !== this.generation) return null;
      this.quota.recordFetch();
      const result = await this.articles.expand(url, force);
      if (generation !== this.generation) return null;
      this.result.set(result);
      if (result.article) {
        this.retries.set(0);
        // Through the tally rather than the quota directly, so a supporter's
        // running total also reaches their account and is the same on their
        // phone. Only a rendered article counts.
        if (!result.fromCache) this.tally.recordOne();
      }
      // What this device has learned about the host, whichever way it went.
      // A success clears the record; only host-attributable failures count.
      this.observed.record(url, result.diagnosis);
      this.log.info('Reader', 'article:expanded', {
        diagnosis: result.diagnosis,
        rendered: result.article !== null,
        host: this.host(),
      });
      return result;
    } finally {
      if (generation === this.generation) this.expanding.set(false);
    }
  }
}
