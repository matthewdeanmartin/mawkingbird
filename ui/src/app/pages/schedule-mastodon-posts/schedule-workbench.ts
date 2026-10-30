import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { ClientPrefs } from '../../client-prefs';
import { ConfirmDialog } from '../../confirm-dialog/confirm-dialog';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbHelp } from '../../design-system/help/help';
import { MbNotice } from '../../design-system/notice/notice';
import { ScheduledStatus } from '../../models';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import {
  Cadence,
  CadenceUnit,
  DAILY_LIMIT,
  LimitProblem,
  MAX_CHARS,
  RowProblem,
  TOTAL_LIMIT,
  defaultStart,
  limitProblems,
  parseLocal,
  postTime,
  rowProblem,
  toLocalInput,
} from './schedule-plan';
import { isParkedSchedule } from '../drafts/draft-items';

interface Row {
  /** Track key, and the Idempotency-Key, so a retry never posts a row twice. */
  key: string;
  text: string;
  pinnedAt: string | null;
  /** The server's refusal from the last attempt, shown under the row. */
  error: string | null;
}

type ScheduleVisibility = 'public' | 'unlisted' | 'private';

const PROBLEM_TEXT: Record<RowProblem, string> = {
  empty: 'Write something, or remove this post.',
  tooLong: `Longer than ${MAX_CHARS} characters, Mastodon's usual limit.`,
  noTime: 'Pick a time.',
  tooSoon: 'At least 10 minutes from now, or Mastodon posts it straight away.',
};

/** Enough pages for the 300-post limit at 40 a page, with room to spare. */
const MAX_PAGES = 10;

function newRow(): Row {
  return { key: crypto.randomUUID(), text: '', pinnedAt: null, error: null };
}

/**
 * The signed-in body of /schedule-mastodon-posts: several posts, spaced out by
 * a cadence, handed to the Mastodon server with `scheduled_at`.
 *
 * The server publishes them. Nothing waits in this browser, so the page can be
 * closed the moment the batch is sent, which is the whole point of the page.
 */
@Component({
  selector: 'app-schedule-workbench',
  imports: [
    FormsModule,
    ConfirmDialog,
    FocusedNextSteps,
    MbButton,
    MbControl,
    MbField,
    MbHelp,
    MbNotice,
  ],
  templateUrl: './schedule-workbench.html',
  styleUrl: './schedule-workbench.css',
})
export class ScheduleWorkbench {
  private readonly api = inject(Api);
  private readonly prefs = inject(ClientPrefs);

  protected readonly maxChars = MAX_CHARS;
  protected readonly totalLimit = TOTAL_LIMIT;
  protected readonly dailyLimit = DAILY_LIMIT;
  protected readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  protected readonly cadence = signal<Cadence>({ start: defaultStart(), every: 1, unit: 'days' });
  protected readonly rows = signal<Row[]>([newRow(), newRow(), newRow()]);
  protected readonly visibility = signal<ScheduleVisibility>(this.initialVisibility());

  /** Re-read on a timer so "too soon" turns on by itself as the clock moves. */
  private readonly now = signal(Date.now());

  /** Every pending scheduled post on the account, parked ones included. */
  protected readonly existing = signal<ScheduledStatus[]>([]);
  protected readonly existingLoaded = signal(false);
  protected readonly existingError = signal(false);
  /** Upcoming ones, soonest first. Parked "drafts" live on the Drafts page. */
  protected readonly upcoming = computed(() =>
    this.existing()
      .filter((s) => !isParkedSchedule(s))
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)),
  );

  protected readonly sending = signal(false);
  /** Posts scheduled by this page in this visit; the next steps wait for the first. */
  protected readonly scheduledCount = signal(0);
  protected readonly lastBatch = signal<number | null>(null);
  protected readonly pendingCancel = signal<ScheduledStatus | null>(null);
  protected readonly cancelError = signal(false);

  protected readonly times = computed(() =>
    this.rows().map((row, index) => postTime(row, this.cadence(), index)),
  );

  protected readonly problems = computed(() =>
    this.rows().map((row, index) => rowProblem(row.text, this.times()[index], this.now())),
  );

  protected readonly limits = computed<LimitProblem[]>(() =>
    limitProblems(
      this.times().filter((at): at is Date => at !== null),
      this.existing().map((s) => new Date(s.scheduled_at)),
    ),
  );

  protected readonly emptyCount = computed(
    () => this.problems().filter((problem) => problem === 'empty').length,
  );
  protected readonly failedCount = computed(() => this.rows().filter((row) => row.error).length);

  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      this.existingLoaded() &&
      this.rows().length > 0 &&
      this.problems().every((problem) => problem === null) &&
      this.limits().length === 0,
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    void this.loadExisting();
  }

  protected problemText(problem: RowProblem | null): string {
    return problem ? PROBLEM_TEXT[problem] : '';
  }

  protected limitText(problem: LimitProblem): string {
    if (problem.kind === 'total') {
      return `That would make ${problem.count} scheduled posts. Mastodon allows ${TOTAL_LIMIT} at once, counting ones already waiting.`;
    }
    return `${problem.count} posts would land on ${problem.day} (UTC). Mastodon allows ${DAILY_LIMIT} a day; space them further apart.`;
  }

  protected length(text: string): number {
    return [...text].length;
  }

  /** The row's time as the `datetime-local` value its picker shows. */
  protected rowInput(index: number): string {
    const at = this.times()[index];
    return at ? toLocalInput(at) : '';
  }

  protected when(at: Date | string | null): string {
    if (!at) return '';
    return new Date(at).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  protected setCadence(patch: Partial<Cadence>): void {
    this.cadence.update((cadence) => ({ ...cadence, ...patch }));
  }

  protected setUnit(value: string): void {
    this.setCadence({ unit: value as CadenceUnit });
  }

  protected setText(index: number, text: string): void {
    this.patchRow(index, { text, error: null });
  }

  protected pin(index: number, value: string): void {
    this.patchRow(index, { pinnedAt: parseLocal(value) ? value : null, error: null });
  }

  protected unpin(index: number): void {
    this.patchRow(index, { pinnedAt: null });
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, newRow()]);
  }

  protected removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  /**
   * Send the batch one post at a time. Each row that the server accepts leaves
   * the list; any it refuses stay, with the reason, for another go. A row keeps
   * its idempotency key, so retrying one that did land cannot duplicate it.
   */
  protected async send(): Promise<void> {
    this.now.set(Date.now());
    if (!this.canSend()) return;
    this.sending.set(true);
    const visibility = this.visibility();
    const batch = this.rows().map((row, index) => ({ row, at: this.times()[index]! }));
    let scheduled = 0;
    for (const { row, at } of batch) {
      try {
        await firstValueFrom(
          this.api.postStatus(row.text, { visibility, scheduledAt: at.toISOString() }, row.key),
        );
        scheduled++;
        this.rows.update((rows) => rows.filter((r) => r.key !== row.key));
      } catch (error: unknown) {
        // Pinned to the time it was sent for: rows removed above it must not
        // slide it onto an earlier post's cadence slot on the next attempt.
        this.rows.update((rows) =>
          rows.map((r) =>
            r.key === row.key ? { ...r, pinnedAt: toLocalInput(at), error: reason(error) } : r,
          ),
        );
      }
    }
    this.scheduledCount.update((count) => count + scheduled);
    this.lastBatch.set(scheduled);
    if (!this.rows().length) this.rows.set([newRow()]);
    this.sending.set(false);
    await this.loadExisting();
  }

  protected confirmCancel(): void {
    const target = this.pendingCancel();
    this.pendingCancel.set(null);
    if (!target) return;
    this.cancelError.set(false);
    this.api.cancelScheduledStatus(target.id).subscribe({
      next: () => this.existing.update((rows) => rows.filter((s) => s.id !== target.id)),
      error: () => this.cancelError.set(true),
    });
  }

  protected preview(s: ScheduledStatus): string {
    const text = s.params.text?.trim() ?? '';
    if (!text) return s.media_attachments.length ? '(media post)' : '(empty post)';
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }

  private patchRow(index: number, patch: Partial<Row>): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  private async loadExisting(): Promise<void> {
    this.existingError.set(false);
    const all: ScheduledStatus[] = [];
    let maxId: string | undefined;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { rows, nextMaxId } = await firstValueFrom(this.api.scheduledStatusesPage(maxId));
        all.push(...rows);
        if (!nextMaxId || !rows.length) break;
        maxId = nextMaxId;
      }
      this.existing.set(all);
      this.existingLoaded.set(true);
    } catch {
      // Without the list the limits can't be checked, so sending stays off
      // rather than guessing; the message offers a retry.
      this.existingError.set(true);
    }
  }

  protected retryLoad(): void {
    void this.loadExisting();
  }

  /** The account's default, except Direct: a scheduled DM batch is never the intent here. */
  private initialVisibility(): ScheduleVisibility {
    const preferred = this.prefs.defaultVisibility();
    return preferred === 'direct' ? 'public' : preferred;
  }
}

/** The server's own sentence when it sent one ("Scheduled at … limit"), else a plain one. */
function reason(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = String(error.error?.error ?? '').trim();
    if (detail) return detail;
    if (error.status === 0) return "Couldn't reach your server. Try again.";
    return `Your server refused it (HTTP ${error.status}).`;
  }
  return "Couldn't schedule this post. Try again.";
}
