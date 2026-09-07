import { computed, inject, Injectable, signal } from '@angular/core';
import { ClientLists } from '../../lists/client-lists';
import { ProfileLists } from './profile-lists';

/**
 * The one-time offer to copy this browser's lists onto a Plus account.
 *
 * ## Why an offer and not a migration
 *
 * Three rules, and each rules out something that looks helpful:
 *
 * 1. **Never automatic.** Enabling a storage provider should not move a user's
 *    data without being asked. Someone turning Plus on to try it has not
 *    consented to their lists changing location.
 * 2. **Copy, never move.** The local lists stay exactly where they are. This is
 *    what keeps Plus low-risk to try: cancelling leaves the browser as it was,
 *    with nothing to restore. A "tidy up the originals" step would be the one
 *    irreversible action in an otherwise reversible feature.
 * 3. **Show counts before doing it.** "Copy 4 lists (37 accounts) to your
 *    account?" is a question someone can answer. "Sync your lists?" is not.
 *
 * ## Asked once, per account
 *
 * The record is keyed by account key, not global. Someone with a main and an alt
 * gets asked once for each, because the answer is genuinely different — their
 * alt's lists are not their main's. Declining is remembered forever; the copy
 * remains available on demand from the lists page, so "no thanks" closes the
 * prompt rather than removing the capability.
 */

const STORAGE_KEY = 'mockingbird_profile_list_copy';

interface CopyRecord {
  /** Account keys that have been asked, whatever the answer was. */
  asked: string[];
}

function readRecord(): CopyRecord {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as CopyRecord | null;
    return Array.isArray(parsed?.asked) ? { asked: parsed.asked } : { asked: [] };
  } catch {
    return { asked: [] };
  }
}

function writeRecord(record: CopyRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A full quota must not break the lists page. The cost is being asked
    // again later, which is mildly annoying and entirely safe — unlike
    // failing to render.
  }
}

/** What the offer would do, in numbers a person can check. */
export interface CopyPreview {
  lists: number;
  accounts: number;
  titles: string[];
}

@Injectable({ providedIn: 'root' })
export class ProfileListCopy {
  private local = inject(ClientLists);
  private profile = inject(ProfileLists);

  private askedFor = signal<string[]>(readRecord().asked);
  private busyNow = signal(false);
  private result = signal<string | null>(null);

  readonly busy = computed(() => this.busyNow());
  readonly message = computed(() => this.result());

  /**
   * What copying would produce.
   *
   * Returns null when there is nothing to copy, which is the common case and
   * should render nothing at all rather than an empty offer.
   */
  preview(): CopyPreview | null {
    const lists = this.local.lists();
    if (lists.length === 0) {
      return null;
    }
    const accounts = new Set(lists.flatMap((list) => list.memberHandles));
    return {
      lists: lists.length,
      accounts: accounts.size,
      titles: lists.map((list) => list.title),
    };
  }

  /**
   * Whether to show the offer unprompted for this account.
   *
   * Deliberately conservative: only when the profile side is loaded and empty.
   * Offering a copy into a collection that already has lists would invite
   * duplicates, and the user can still copy on demand if that is what they want.
   */
  shouldOffer(accountKey: string | null): boolean {
    if (accountKey === null || this.askedFor().includes(accountKey)) {
      return false;
    }
    if (!this.profile.loaded() || this.profile.count() > 0) {
      return false;
    }
    return this.preview() !== null;
  }

  /** Remember that this account was asked, whatever the answer. */
  markAsked(accountKey: string | null): void {
    if (accountKey === null || this.askedFor().includes(accountKey)) {
      return;
    }
    const asked = [...this.askedFor(), accountKey];
    this.askedFor.set(asked);
    writeRecord({ asked });
  }

  /**
   * Copy this browser's lists to the account.
   *
   * The local lists are untouched — see rule 2 in the class comment.
   */
  async copy(accountKey: string | null): Promise<boolean> {
    const lists = this.local.lists();
    if (lists.length === 0) {
      return false;
    }
    this.busyNow.set(true);
    this.result.set(null);
    try {
      const outcome = await this.profile.copyIn(lists);
      this.markAsked(accountKey);
      if (outcome.kind !== 'ok') {
        this.result.set(outcome.message);
        return false;
      }
      this.result.set(
        `Copied ${outcome.value.written} list${outcome.value.written === 1 ? '' : 's'} to your account. Your browser's copies are still here.`,
      );
      return true;
    } finally {
      this.busyNow.set(false);
    }
  }

  /** Dismiss the offer for this account without copying. */
  decline(accountKey: string | null): void {
    this.markAsked(accountKey);
  }

  /** For tests. */
  resetForTest(): void {
    this.askedFor.set([]);
    this.busyNow.set(false);
    this.result.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}
