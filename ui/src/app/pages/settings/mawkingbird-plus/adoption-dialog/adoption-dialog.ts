import { TranslocoPipe } from '@jsverse/transloco';
import { Component, computed, input, output, signal } from '@angular/core';
import type { AdoptionChoice } from '../../../../providers/account/collection-adoption';
import type { AdoptableCollection } from '../../../../providers/account/collection-adoption-runner';

/**
 * "You have data in both places — which wins?"
 *
 * Shown when a collection's sync is switched on and both this browser and the
 * account hold something. Unlike the welcome dialog this one **can** be
 * cancelled, because there is a real third answer: leave the toggle off and
 * decide later. A modal that forces an irreversible data decision on the spot is
 * how people lose things.
 *
 * ## Two answers, and the one that is missing
 *
 * Merge and replace. There is deliberately no "upload mine over theirs" —
 * that direction destroys data belonging to a browser the user is not looking
 * at, and doing it safely needs per-item history and causality. The dialog says
 * so plainly rather than leaving the absence to be discovered.
 *
 * The consequence is stated in the copy, not buried: on a merge, anything held
 * in both places keeps the account's version.
 */
// Legacy fragment declarations are retained while deferred locales still reference them.
// i18n settings.plus.adoption.title: You have {{noun}} here and on your account
// i18n settings.plus.adoption.summaryLead: You're switching this on for the first time, so there are two sets to combine: the
// i18n settings.plus.adoption.cancel: Cancel
// i18n settings.plus.adoption.counts.a: already in this browser, and the
// i18n settings.plus.adoption.counts.b: saved to your Mawkingbird account by another device.
// i18n settings.plus.adoption.justThe.a: Just the
// i18n settings.plus.adoption.justThe.b: from my account
// i18n settings.plus.adoption.justThe.hint.a: This browser's
// i18n settings.plus.adoption.justThe.hint.b: are dropped and it matches your other devices exactly.
// i18n settings.plus.adoption.keepAll.hint: Everything from both. If the same thing is in both places, your account's copy is the one kept. This is what most people want.
// i18n settings.plus.adoption.keepAll: Keep all
// i18n settings.plus.adoption.leaveOff.hint.a: Keeps this browser's
// i18n settings.plus.adoption.leaveOff.hint.b: exactly as they are and changes nothing on your account. You can switch this on again whenever you like, and you'll be asked this same question.
// i18n settings.plus.adoption.leaveOff: Leave it off for now
// i18n settings.plus.adoption.noReplace: There's no option to replace your account's copy with this browser's — that would delete things from your other devices, and working out which change came first isn't something this app tries to guess.
// i18n settings.plus.adoption.reassure: Nothing has gone wrong, and you can't lose anything by picking either one — this only decides what this browser shows from now on.
// i18n settings.plus.adoption.titleTrust: You have trusted accounts here and on your account
// i18n settings.plus.adoption.titleFeeds: You have feed subscriptions here and on your account
// i18n settings.plus.adoption.titleLists: You have lists here and on your account
// i18n settings.plus.adoption.summaryCounts: You're switching this on for the first time, so there are two sets to combine: the <strong>{{localCount}}</strong> already in this browser, and the <strong>{{remoteCount}}</strong> saved to your Mawkingbird account by another device.
// i18n settings.plus.adoption.keepAllCount: Keep all {{count}}
// i18n settings.plus.adoption.justTheCount: Just the {{count}} from my account
// i18n settings.plus.adoption.justTheHintCount: This browser's {{count}} are dropped and it matches your other devices exactly.
// i18n settings.plus.adoption.leaveOffHintCount: Keeps this browser's {{count}} exactly as they are and changes nothing on your account. You can switch this on again whenever you like, and you'll be asked this same question.

@Component({
  selector: 'app-adoption-dialog',
  imports: [TranslocoPipe],
  templateUrl: './adoption-dialog.html',
  styleUrl: './adoption-dialog.css',
})
export class AdoptionDialog {
  readonly collection = input.required<AdoptableCollection>();
  readonly localCount = input.required<number>();
  readonly remoteCount = input.required<number>();

  /** The chosen answer. Not emitted if the user backs out. */
  readonly chose = output<AdoptionChoice>();
  /** Backed out: the toggle should go back off. */
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);

  protected readonly titleKey = computed(() => TITLE_KEYS[this.collection()]);

  /**
   * How many of this browser's items a merge would actually add.
   *
   * Not computed here — that needs both sets, and this component is given only
   * counts on purpose so it cannot be tempted into doing the reconciliation
   * itself. The copy therefore says what merge *means* rather than promising a
   * number it cannot verify.
   */
  protected choose(choice: AdoptionChoice): void {
    this.busy.set(true);
    this.chose.emit(choice);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}

const TITLE_KEYS: Record<AdoptableCollection, string> = {
  trust: 'settings.plus.adoption.titleTrust',
  feeds: 'settings.plus.adoption.titleFeeds',
  lists: 'settings.plus.adoption.titleLists',
};
