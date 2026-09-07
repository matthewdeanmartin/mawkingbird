import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Drafts } from '../../drafts';
import { ScheduledStatus } from '../../models';
import { PasteHistory } from '../../providers/paste/paste-history';
import {
  DraftItem,
  DraftKind,
  DraftSourceError,
  isParkedSchedule,
  isSelfDraft,
  localDraftItem,
  mergeDraftItems,
  pasteDraftItem,
  scheduledDraftItem,
  selfDraftItem,
} from './draft-items';

/**
 * How many of the account's own recent posts to scan for self-drafts. The
 * predicate needs recency anyway ({@link isSelfDraft}), so one page is plenty;
 * a user with more than 40 posts in the last 30 days has newer self-notes than
 * anything this would miss.
 */
const SELF_SCAN_LIMIT = 40;

/**
 * Assembles the merged drafts list from all four mechanisms.
 *
 * Each server-backed source loads independently and records its own failure.
 * That isolation is the point: a 500 from `/scheduled_statuses` must not take
 * the user's local drafts down with it, and an anonymous session (no server
 * identity at all) must still see its local drafts and pastes without issuing a
 * single authenticated request.
 */
// i18n pages.drafts.errors.loadScheduled: Scheduled posts couldn't be loaded, so any parked ones are missing.
// i18n pages.drafts.errors.loadSelf: Your recent posts couldn't be loaded, so private notes to yourself are missing.
@Injectable({ providedIn: 'root' })
export class DraftSources {
  private api = inject(Api);
  private auth = inject(Auth);
  private drafts = inject(Drafts);
  private pastes = inject(PasteHistory);
  private transloco = inject(TranslocoService);

  /** Every scheduled post the server returned, parked or not. */
  private readonly scheduled = signal<ScheduledStatus[]>([]);
  private readonly selfDrafts = signal<DraftItem[]>([]);
  private readonly errors = signal<DraftSourceError[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);

  /** Failures, for the per-source warnings. */
  readonly sourceErrors = this.errors.asReadonly();

  /**
   * Scheduled posts that are genuinely pending — near enough to fire. These are
   * *not* drafts and get their own section, so "publishes tomorrow" is never
   * mistaken for "sitting in a drawer".
   */
  readonly upcomingScheduled = computed(() =>
    this.scheduled()
      .filter((s) => !isParkedSchedule(s))
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)),
  );

  /** The merged, newest-first drafts list across all four kinds. */
  readonly items = computed(() =>
    mergeDraftItems([
      this.drafts.drafts().map(localDraftItem),
      this.scheduled()
        .filter((s) => isParkedSchedule(s))
        .map(scheduledDraftItem),
      this.selfDrafts(),
      this.pastes.records().map(pasteDraftItem),
    ]),
  );

  readonly counts = computed(() => {
    const counts: Record<DraftKind, number> = { local: 0, scheduled: 0, self: 0, paste: 0 };
    for (const item of this.items()) {
      counts[item.kind]++;
    }
    return counts;
  });

  /**
   * Load the two server-backed sources. Local drafts and pastes need no loading
   * — they are already signals over localStorage, so they appear immediately and
   * stay live as they change.
   */
  load(): void {
    this.errors.set([]);
    if (this.auth.isAnonymous) {
      // No server identity: nothing to ask for, and asking would attach a token
      // that doesn't exist.
      this.scheduled.set([]);
      this.selfDrafts.set([]);
      this.loaded.set(true);
      return;
    }
    this.loading.set(true);
    let pending = 2;
    const settle = (): void => {
      if (--pending === 0) {
        this.loading.set(false);
        this.loaded.set(true);
      }
    };

    this.api.scheduledStatuses().subscribe({
      next: (rows) => {
        this.scheduled.set(rows);
        settle();
      },
      error: () => {
        this.fail('scheduled', this.transloco.translate('pages.drafts.errors.loadScheduled'));
        settle();
      },
    });

    const accountId = this.auth.account()?.id;
    if (!accountId) {
      // Verify hasn't landed yet; the other three kinds still render.
      this.selfDrafts.set([]);
      settle();
      return;
    }
    this.api.getAccountStatuses(accountId, { limit: SELF_SCAN_LIMIT }).subscribe({
      next: (rows) => {
        this.selfDrafts.set(rows.filter((s) => isSelfDraft(s, accountId)).map(selfDraftItem));
        settle();
      },
      error: () => {
        this.fail('self', this.transloco.translate('pages.drafts.errors.loadSelf'));
        settle();
      },
    });
  }

  /** Drop a parked schedule from the list after it is cancelled server-side. */
  forgetScheduled(id: string): void {
    this.scheduled.update((list) => list.filter((s) => s.id !== id));
  }

  /** Drop a self draft from the list after its status is deleted server-side. */
  forgetSelf(id: string): void {
    this.selfDrafts.update((list) => list.filter((item) => item.id !== id));
  }

  private fail(kind: DraftKind, message: string): void {
    this.errors.update((list) => [...list, { kind, message }]);
  }
}
