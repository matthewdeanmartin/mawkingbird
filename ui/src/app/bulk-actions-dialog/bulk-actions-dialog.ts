import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import {
  BulkActionId,
  BulkActions,
  BulkPreview,
  BulkTarget,
  bulkAction,
  needsList,
} from '../bulk-actions';
import { FocusTrap } from '../a11y/focus-trap';
import { PageDiagnostics } from '../page-diagnostics';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/**
 * "Here is exactly what is about to happen — do you still want it?" for a bulk
 * action.
 *
 * Deliberately not the generic {@link ConfirmDialog}: everything that makes this
 * safe is specific. It runs the planning pass before asking, so the prompt says
 * "unblock all 47 accounts" rather than "unblock everyone" and the user knows
 * the size of what they are agreeing to. It spells out the consequences as
 * separate statements rather than one paragraph nobody reads. And for the two
 * destructive actions it offers a CSV of the list first, because "this can only
 * be undone if you backed it up" is only fair if backing it up is one click
 * away.
 *
 * The host owns open/closed state and reacts to (confirmed).
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n bulk.stopCounting: Stop counting
// i18n bulk.atLeast: at least
// i18n bulk.summary.reblogs.noneOn: Nothing to do — retweets are already on for everyone you follow.
// i18n bulk.summary.reblogs.noneOff: Nothing to do — retweets are already off for everyone you follow.
// i18n bulk.summary.reblogs.allOne: This will change all {{about}}{{count}} account you follow.
// i18n bulk.summary.reblogs.allOther: This will change all {{about}}{{count}} accounts you follow.
// i18n bulk.summary.reblogs.someOne: This will change {{about}}{{count}} account of the {{friends}} you follow. The rest are already set that way and will be left alone.
// i18n bulk.summary.reblogs.someOther: This will change {{about}}{{count}} accounts of the {{friends}} you follow. The rest are already set that way and will be left alone.
// i18n bulk.summary.unmute.one: This will unmute {{about}}{{count}} account.
// i18n bulk.summary.unmute.other: This will unmute {{about}}{{count}} accounts.
// i18n bulk.summary.unmute.none: Nothing to do — your mute list is already empty.
// i18n bulk.summary.unblock.one: This will unblock {{about}}{{count}} account.
// i18n bulk.summary.unblock.other: This will unblock {{about}}{{count}} accounts.
// i18n bulk.summary.unblock.none: Nothing to do — your block list is already empty.
// i18n bulk.summary.list.empty: Nothing to do — this {{source}} has no members.
// i18n bulk.summary.follow.allAlreadyOne: Nothing to do — you already follow all {{members}} member of this {{source}}.
// i18n bulk.summary.follow.allAlready: Nothing to do — you already follow all {{members}} members of this {{source}}.
// i18n bulk.summary.follow.allOne: This will follow all {{about}}{{count}} member of this {{source}}.
// i18n bulk.summary.follow.allOther: This will follow all {{about}}{{count}} members of this {{source}}.
// i18n bulk.summary.follow.some: This will follow {{about}}{{count}} of the {{members}} members of this {{source}}. You already follow the other {{rest}}.
// i18n bulk.summary.unfollow.noneFollowed: Nothing to do — you do not follow anyone in this {{source}}.
// i18n bulk.summary.unfollow.allOne: This will unfollow all {{about}}{{count}} member of this {{source}}.
// i18n bulk.summary.unfollow.allOther: This will unfollow all {{about}}{{count}} members of this {{source}}.
// i18n bulk.summary.unfollow.some: This will unfollow {{about}}{{count}} of the {{members}} members of this {{source}}. You already do not follow the other {{rest}}.
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n bulk.plan.reading: Reading your accounts…
// i18n bulk.plan.checking: Checking which ones need changing…
// i18n bulk.plan.counting: Checking how many accounts this affects…
// i18n bulk.plan.readOne: {{count}} account read
// i18n bulk.plan.readOther: {{count}} accounts read
// i18n bulk.plan.requestOne: {{count}} request
// i18n bulk.plan.requestOther: {{count}} requests
// i18n bulk.stopped: Stopped counting. Nothing has been changed.
// i18n bulk.stopped.hint: No accounts were touched — this only ever read your list. Count again to see what this action would do.
// i18n bulk.checkFailed: Couldn’t check what this would do: {{error}}
// i18n bulk.nothingChanged: Nothing has been changed.
// i18n bulk.backup.savedOne: Saved a copy of {{count}} account to your downloads.
// i18n bulk.backup.savedOther: Saved a copy of {{count}} accounts to your downloads.
// i18n bulk.backup.hint: Download the list first and you can put it back later with Import/Export.
// i18n bulk.backup.preparing: Preparing…
// i18n bulk.backup.download: Download this list first
// i18n bulk.countAgain: Count again
// i18n bulk.tryAgain: Try again
// i18n common.close: Close
@Component({
  selector: 'app-bulk-actions-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './bulk-actions-dialog.html',
  styleUrl: './bulk-actions-dialog.css',
})
export class BulkActionsDialog implements OnInit {
  private readonly bulk = inject(BulkActions);
  private readonly diagnostics = inject(PageDiagnostics);

  readonly action = input.required<BulkActionId>();
  /** Required by the list actions; ignored by the rest. */
  readonly target = input<BulkTarget | undefined>(undefined);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly spec = computed(() => bulkAction(this.action()));
  protected readonly preview = signal<BulkPreview | null>(null);
  protected readonly loading = signal(true);
  protected readonly backup = signal<{ saved: boolean; count: number } | null>(null);
  protected readonly backupBusy = signal(false);
  protected readonly backupError = signal('');

  /**
   * Live progress of the counting pass.
   *
   * The count is the slow half on a large account — paging a 50,000-follow list
   * is hundreds of requests — and it used to run behind one static line with no
   * numbers and no way to stop it. Read straight off the service so the dialog
   * has no second copy of the state to keep in sync.
   */
  protected readonly planning = this.bulk.planning;

  /**
   * Whether the user stopped the count, so nothing was measured.
   *
   * Named apart from the `cancelled` output above, which means "the user
   * dismissed the dialog" — a different event with a different consequence.
   */
  protected readonly planCancelled = computed(() => !!this.preview()?.cancelled);

  /** Stop counting. Nothing has been written, so this needs no confirmation. */
  protected stopCounting(): void {
    this.bulk.cancelPlanning();
  }

  /**
   * Counting starts here rather than in the constructor: `action` is a required
   * input, and reading one before Angular has set it throws — which left the
   * dialog stuck on "Checking…" forever.
   */
  ngOnInit(): void {
    void this.load();
  }

  /** Count what the action would touch. Re-runnable after a failure. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      // Explicitly dropped for the account-wide actions rather than passed
      // through: those operate on your follow / mute / block lists, and a list
      // arriving here only ever meant the caller was confused about scope.
      const target = needsList(this.action()) ? this.target() : undefined;
      this.preview.set(await this.bulk.preview(this.action(), target));
    } finally {
      // Never leave the dialog claiming to be busy; a stuck spinner in front of
      // a destructive action is worse than an error message.
      this.loading.set(false);
    }
  }

  /**
   * What to call the thing being followed: a list, or a collection.
   *
   * The two actions are one job with different reads, so the copy is shared and
   * only the noun moves. Saying "this list" over a collection is a small lie,
   * but it is the kind that makes a confirmation dialog untrustworthy.
   */
  private transloco = inject(TranslocoService);

  protected readonly sourceNoun = computed(() =>
    this.target()?.kind === 'collection'
      ? this.transloco.translate<string>('bulk.source.collection')
      : this.transloco.translate<string>('bulk.source.list'),
  );

  /**
   * The dialog heading, with the noun supplied as a parameter.
   *
   * This used to `.replace('this list', 'this collection')` on the finished
   * title. That is invisible string surgery on display text: the moment the
   * title is German the substring is not there, the replace silently does
   * nothing, and the dialog says "list" over a collection in every locale but
   * English — the exact small lie the note above says makes a confirmation
   * untrustworthy. The title now carries `{{source}}` and the noun is passed in.
   */
  protected readonly title = computed(() =>
    this.transloco.translate<string>(this.spec().titleKey, { source: this.sourceNoun() }),
  );

  /** Nothing to do — used to turn Confirm into a plain "Close". */
  protected readonly noWork = computed(() => {
    const preview = this.preview();
    return !!preview && !preview.error && preview.targets === 0;
  });

  /**
   * The headline sentence, with the real number in it.
   *
   * Every branch resolves a **key** and hands the numbers over as parameters,
   * rather than assembling a sentence from English fragments. The old version
   * interpolated "at least", a noun, and two counts into a template literal; in
   * German the adjective inflects, in Finnish the noun takes a case, and in
   * Russian the whole phrase changes shape with the number. A locale needs the
   * whole sentence to rewrite, not the gaps between our words.
   *
   * Singular/plural is still picked here by an `=== 1` test, which is correct for
   * English and approximate elsewhere (Russian has six plural categories). That
   * is a deliberate interim state: ui-i18n-6 replaces these pairs with ICU plural
   * messages, and the keys are already shaped so only the dictionary changes.
   */
  protected readonly summary = computed(() => {
    const preview = this.preview();
    const spec = this.spec();
    if (!preview || preview.error) {
      return '';
    }
    const t = (key: string, params: Record<string, unknown> = {}) =>
      this.transloco.translate<string>(key, {
        // "at least 40" when the count is a floor rather than exact. Passed as a
        // translated fragment so a locale can place or drop it.
        about: preview.approximate ? this.transloco.translate<string>('bulk.atLeast') : '',
        count: preview.targets.toLocaleString(),
        source: this.sourceNoun(),
        ...params,
      });

    switch (spec.id) {
      case 'reblogs-off':
      case 'reblogs-on': {
        if (!preview.targets) {
          return t(
            spec.id === 'reblogs-on'
              ? 'bulk.summary.reblogs.noneOn'
              : 'bulk.summary.reblogs.noneOff',
          );
        }
        const friends = preview.targets + preview.alreadyCorrect;
        // "1 of your 1 friends" is nonsense; when nobody is being skipped, say so.
        if (preview.alreadyCorrect === 0) {
          return t(friends === 1 ? 'bulk.summary.reblogs.allOne' : 'bulk.summary.reblogs.allOther');
        }
        return t(
          preview.targets === 1 ? 'bulk.summary.reblogs.someOne' : 'bulk.summary.reblogs.someOther',
          { friends: friends.toLocaleString() },
        );
      }
      case 'mute-amnesty':
        return preview.targets
          ? t(preview.targets === 1 ? 'bulk.summary.unmute.one' : 'bulk.summary.unmute.other')
          : t('bulk.summary.unmute.none');
      case 'block-amnesty':
        return preview.targets
          ? t(preview.targets === 1 ? 'bulk.summary.unblock.one' : 'bulk.summary.unblock.other')
          : t('bulk.summary.unblock.none');
      case 'list-follow': {
        const members = preview.targets + preview.alreadyCorrect;
        if (!members) {
          return t('bulk.summary.list.empty');
        }
        if (!preview.targets) {
          return t(
            members === 1 ? 'bulk.summary.follow.allAlreadyOne' : 'bulk.summary.follow.allAlready',
            { members: members.toLocaleString() },
          );
        }
        if (preview.alreadyCorrect === 0) {
          return t(
            preview.targets === 1 ? 'bulk.summary.follow.allOne' : 'bulk.summary.follow.allOther',
          );
        }
        return t('bulk.summary.follow.some', {
          members: members.toLocaleString(),
          rest: preview.alreadyCorrect.toLocaleString(),
        });
      }
      case 'list-unfollow': {
        const members = preview.targets + preview.alreadyCorrect;
        if (!members) {
          return t('bulk.summary.list.empty');
        }
        if (!preview.targets) {
          return t('bulk.summary.unfollow.noneFollowed');
        }
        if (preview.alreadyCorrect === 0) {
          return t(
            preview.targets === 1
              ? 'bulk.summary.unfollow.allOne'
              : 'bulk.summary.unfollow.allOther',
          );
        }
        return t('bulk.summary.unfollow.some', {
          members: members.toLocaleString(),
          rest: preview.alreadyCorrect.toLocaleString(),
        });
      }
    }
  });

  /**
   * Download the list as CSV before it is destroyed.
   *
   * Built and downloaded client-side (see {@link BulkActions.backupCsv}) so it
   * works against any server, and formatted to match Mastodon's own export so it
   * can be imported back.
   */
  protected async downloadBackup(): Promise<void> {
    const spec = this.spec();
    if (!spec.backup || this.backupBusy()) {
      return;
    }
    this.backupBusy.set(true);
    this.backupError.set('');
    try {
      const { csv, count } = await this.bulk.backupCsv(spec.id);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${spec.backup}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      this.backup.set({ saved: true, count });
    } catch (error: unknown) {
      this.diagnostics.error('BulkActions', 'backup:error', error, { action: this.action() });
      this.backupError.set('Could not build the backup. You can still continue, or try again.');
    } finally {
      this.backupBusy.set(false);
    }
  }
}
