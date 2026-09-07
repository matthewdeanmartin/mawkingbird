import { computed, inject, Injectable, signal } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { PlusSession } from '../account/plus-session';
import { ProfileClient } from '../account/profile-client';
import { ArticleQuota } from './article-quota';

/**
 * The running total of articles read, reconciled between this browser and the
 * subscriber's account.
 *
 * ## Why this is not just the local counter
 *
 * `ArticleQuota` already keeps a lifetime total, and for a free reader that is
 * the whole story. But the number exists to answer "is my subscription worth
 * it", and a per-browser total answers that question wrong in exactly the case
 * that matters: a subscriber who buys a laptop, or clears their site data, is
 * told they have read nothing. That is the same insult the daily counters were
 * delivering, just on a longer timer.
 *
 * So for a supporter the account's total is the truth, and this browser's reads
 * are contributions to it.
 *
 * ## Why the local counter is not simply abandoned
 *
 * Because the network is not always there and the account is not always paid
 * for. Local stays authoritative for free readers, and it is the fallback
 * whenever the service cannot be reached — a diagnostics panel that shows
 * nothing when the network hiccups is worse than one showing a slightly low
 * number.
 *
 * ## Why unsent reads are counted, not queued
 *
 * `pendingUnsent` is one integer, not a list of article ids. There is nothing to
 * retry *individually* — the server takes a count — and a queue of what someone
 * read is precisely the reading history this feature refuses to build.
 */

/** Where the unsent count survives a reload. Registered as a `cache` record. */
export const READING_TALLY_KEY = 'mockingbird_reading_tally_unsent';

@Injectable({ providedIn: 'root' })
export class ArticleReadingTally {
  private quota = inject(ArticleQuota);
  private plus = inject(PlusSession);
  private client = inject(ProfileClient);
  private log = inject(PageDiagnostics);

  /** The account's total, once fetched. Null until then, or when unreachable. */
  private remote = signal<number | null>(null);

  /** When the account started counting, for "since March" phrasing. */
  private remoteSince = signal<string>('');

  /** Reads made here that the account has not accepted yet. */
  private unsent = signal(readUnsent());

  /** True while a flush or fetch is in flight, so the panel can say so. */
  readonly busy = signal(false);

  /**
   * The number to show.
   *
   * The account's total plus anything not yet pushed, so the figure never goes
   * *down* when a flush is pending — a total that dips after you read something
   * looks broken even when it is momentarily more accurate.
   *
   * Falls back to this browser's lifetime count when the account has not
   * answered: a free reader, a lapsed one, or an unreachable service.
   */
  readonly total = computed(() => {
    const remote = this.remote();
    return remote === null ? this.quota.lifetime() : remote + this.unsent();
  });

  /** True when {@link total} is this browser only, so the UI can say which. */
  readonly localOnly = computed(() => this.remote() === null);

  /** ISO date the account began counting, or '' if not known. */
  readonly since = computed(() => this.remoteSince());

  /**
   * Load the account's total.
   *
   * Never called on a timer and never on app start: this is a number someone
   * looks at on one settings panel, and polling it would add a background
   * request to answer a question nobody is asking. The Plus page calls it.
   */
  async load(): Promise<void> {
    if (!this.plus.isSupporter()) {
      // Nothing to load: a free account has no server-side total, and asking
      // would earn a 402 that means nothing to this caller.
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.client.readingStats();
      if (result.kind === 'ok') {
        this.remote.set(result.value.articles);
        this.remoteSince.set(result.value.since);
        await this.flush();
      } else {
        // Any refusal or failure leaves `remote` null, which shows this
        // browser's own total rather than a zero.
        this.log.info('ReadingTally', 'load:unavailable', { kind: result.kind });
      }
    } catch (cause) {
      // Never rethrows.
      //
      // Callers invoke this as fire-and-forget (`void tally.load()` in the Plus
      // page's ngOnInit), because one diagnostics number must not delay a page
      // or block anything else on it. That makes an escaping rejection an
      // *unhandled* one — it cannot be caught anywhere downstream, so it
      // surfaces as a global error rather than as a missing number.
      //
      // A `try/finally` was not enough: it restored `busy` and re-raised. The
      // whole contract of this method is "populate a figure if you can", and
      // failing to populate it is already fully expressed by leaving `remote`
      // null, which falls back to this browser's own total.
      this.log.warn('ReadingTally', 'load:failed', { message: String(cause) });
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Record one article, locally always and remotely when it is worth a request.
   *
   * The local write happens first and unconditionally, so the count is correct
   * even signed out, offline, or mid-lapse.
   */
  recordOne(): void {
    this.quota.consume();
    if (!this.plus.isSupporter()) {
      return;
    }
    this.bumpUnsent(1);
    // Fire and forget: this runs right after an article rendered, and the
    // reader is reading. Nothing about the tally may block or interrupt that,
    // and a failure simply leaves the count pending for the next flush.
    void this.flush();
  }

  /**
   * Push unsent reads to the account.
   *
   * Sends at most what the service accepts per call and stops on the first
   * failure, leaving the remainder pending. No retry loop: the next article, or
   * the next visit to the Plus page, is the retry.
   *
   * ## Why one at a time
   *
   * `unsent` is only decremented once the server answers, so a second flush
   * starting while the first is in flight sees the same pending count and sends
   * it again — double-counting every read that happened to coincide with a page
   * load. Two callers do overlap in practice: `recordOne` fires one, and
   * `load()` fires another as soon as the Plus page opens.
   *
   * Overlapping callers join the run already going rather than starting a
   * second, and that run re-checks the count when it finishes, so nothing
   * recorded mid-flight is lost.
   *
   * Like {@link load}, this never rejects: `recordOne` fires it as
   * fire-and-forget straight after an article rendered, so a rejection here has
   * nowhere to be caught. Unsent reads stay counted in `unsent` for the next
   * attempt, which is the whole recovery story.
   */
  async flush(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.runFlush()
      .catch((cause: unknown) => {
        this.log.warn('ReadingTally', 'flush:failed', { message: String(cause) });
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  /** The flush currently running, so a concurrent caller can await it. */
  private inFlight: Promise<void> | null = null;

  private async runFlush(): Promise<void> {
    if (!this.plus.isSupporter()) {
      return;
    }
    const pending = this.unsent();
    if (pending <= 0) {
      return;
    }
    const batch = Math.min(pending, MAX_PER_REQUEST);
    const result = await this.client.recordArticlesRead(batch);
    if (result.kind !== 'ok') {
      this.log.info('ReadingTally', 'flush:deferred', { kind: result.kind, pending });
      return;
    }
    // Decrement by what was actually accepted rather than clearing, so reads
    // recorded while this request was in flight are not silently dropped.
    this.bumpUnsent(-batch);
    this.remote.set(result.value.articles);
    if (result.value.since) {
      this.remoteSince.set(result.value.since);
    }
    if (this.unsent() > 0) {
      // `runFlush`, not `flush`: this *is* the in-flight run, and awaiting the
      // public method here would be awaiting our own promise.
      await this.runFlush();
    }
  }

  private bumpUnsent(delta: number): void {
    const next = Math.max(0, this.unsent() + delta);
    this.unsent.set(next);
    try {
      localStorage.setItem(READING_TALLY_KEY, String(next));
    } catch {
      // Unsent reads that cannot be persisted are lost on reload. The article
      // was still read and still counted locally; this is bookkeeping.
    }
  }
}

/** The service's own per-request cap. Mirrors `MAX_DELTA_PER_REQUEST`. */
const MAX_PER_REQUEST = 10;

function readUnsent(): number {
  try {
    const raw = Number(localStorage.getItem(READING_TALLY_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}
