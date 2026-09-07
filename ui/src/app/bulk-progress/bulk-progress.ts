import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { BulkActions, bulkAction, formatEta } from '../bulk-actions';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/**
 * Live status of the running (or just-finished) bulk job: percentage, counts,
 * estimated time remaining, and — the part that stops a long job looking broken
 * — an explicit "paused for rate limiting" state with a countdown.
 *
 * Rendered in both places a job can be started (the Bulk actions tab and the
 * mute/block pages), reading the one job {@link BulkActions} owns, so whichever
 * page you are on shows the same truth. The job outlives this component; moving
 * between those pages destroys and recreates the panel without touching the run.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n bulk.stop: Stop
// i18n bulk.dismiss: Dismiss
// i18n bulk.progress.remaining: {{time}} left
// i18n bulk.progress.changed: {{count}} changed
// i18n bulk.progress.alreadyCorrect: {{count}} already correct
// i18n bulk.progress.failed: {{count}} failed
// i18n bulk.rateLimited: Rate limited — resuming in {{secs}}s
@Component({
  selector: 'app-bulk-progress',
  imports: [TranslocoPipe],
  templateUrl: './bulk-progress.html',
  styleUrl: './bulk-progress.css',
})
export class BulkProgress {
  private readonly bulk = inject(BulkActions);

  protected readonly job = this.bulk.job;

  /**
   * Ticks every second so the countdown and the estimate actually move — they
   * are derived from `Date.now()`, which is not reactive on its own.
   */
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private transloco = inject(TranslocoService);

  protected readonly spec = computed(() => {
    const job = this.job();
    return job ? bulkAction(job.action) : null;
  });

  /** The unit noun ("friends", "muted accounts"), already translated. */
  protected readonly unitLabel = computed(() => {
    const key = this.spec()?.unitKey;
    return key ? this.transloco.translate<string>(key) : '';
  });

  /** Whole percent for the label and the bar width; null while indeterminate. */
  protected readonly pct = computed(() => {
    const value = this.bulk.percent();
    return value === null ? null : Math.round(value * 100);
  });

  /** Seconds left in the current rate-limit pause, or null when not paused. */
  protected readonly pauseSeconds = computed<number | null>(() => {
    const job = this.job();
    if (!job || job.phase !== 'paused' || job.pausedUntil === null) {
      return null;
    }
    return Math.max(0, Math.ceil((job.pausedUntil - this.now()) / 1000));
  });

  protected readonly eta = computed<string | null>(() => {
    // Read the tick so the estimate refreshes as time passes, not only on writes.
    this.now();
    const ms = this.bulk.etaMs();
    return ms === null ? null : formatEta(ms);
  });

  /** One line describing what is happening, also used as the live-region text. */
  protected readonly status = computed(() => {
    const job = this.job();
    if (!job) {
      return '';
    }
    switch (job.phase) {
      case 'planning':
        return 'Working out what needs changing…';
      case 'paused':
        return 'Paused — the server is rate limiting us';
      case 'running':
        return 'Working…';
      case 'done':
        return job.failed ? 'Finished, with some failures' : 'Finished';
      case 'cancelled':
        return 'Stopped';
      case 'failed':
        return 'Stopped — something went wrong';
    }
  });

  protected readonly canCancel = computed(() => this.bulk.running());

  protected cancel(): void {
    this.bulk.cancel();
  }

  protected dismiss(): void {
    this.bulk.dismiss();
  }
}
