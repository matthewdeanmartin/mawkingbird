import { inject, Injectable } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { ProfileFeeds } from './profile-feeds';
import { ProfileTrust } from './profile-trust';
import type { ProfileTrustEntry } from './profile-trust';
import { ProfileLists } from './profile-lists';
import type { ProfileList } from './profile-lists';
import { ClientLists } from '../../lists/client-lists';
import { RssSubscriptions } from '../rss/rss-subscriptions';
import { TrustedAccounts } from '../../trusted-accounts';
import type { Entry } from '../../trusted-accounts';
import { needsAdoptionChoice, planAdoption } from './collection-adoption';
import type { AdoptionChoice } from './collection-adoption';

/**
 * Switching a collection's sync on, for the first time, on a browser that
 * already has data.
 *
 * ## What this is not
 *
 * Not an ongoing sync. It runs once, when a toggle goes on, to settle the
 * question of what the account should hold. Afterwards the collection store is
 * the only copy and there is nothing to reconcile — which is the whole reason
 * the provider model was chosen over mirroring.
 *
 * ## The two-step shape
 *
 * `inspect()` reads both sides and reports whether the user has to be asked;
 * `apply()` performs a choice. They are separate calls because the question is
 * asked in a dialog, and a service that both prompted and wrote would have to
 * own UI state to do it.
 *
 * A choice is only needed when **both** sides hold something. Everything else
 * settles silently: an empty account takes the local data, and an empty browser
 * takes the account's.
 */

/** The collections this can reconcile. */
export type AdoptableCollection = 'trust' | 'feeds' | 'lists';

export interface AdoptionInspection {
  collection: AdoptableCollection;
  localCount: number;
  remoteCount: number;
  /** True when the user has to choose. False when it settled on its own. */
  needsChoice: boolean;
  /** Set when the read failed. Nothing was changed. */
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class CollectionAdoptionRunner {
  private profileTrust = inject(ProfileTrust);
  private profileFeeds = inject(ProfileFeeds);
  private localTrust = inject(TrustedAccounts);
  private localFeeds = inject(RssSubscriptions);
  private profileLists = inject(ProfileLists);
  private localLists = inject(ClientLists);
  private diagnostics = inject(PageDiagnostics);

  /**
   * Read both sides and settle what can be settled without asking.
   *
   * Applies the unambiguous cases immediately rather than reporting them and
   * waiting: a user who turned a toggle on has already said what they want, and
   * a dialog offering one possible answer is a dialog that teaches people to
   * click through the ones that matter.
   */
  async inspect(collection: AdoptableCollection): Promise<AdoptionInspection> {
    const remote = this.remoteFor(collection);
    await remote.load();
    const failure = remote.error();
    if (failure) {
      // Nothing was changed. Reported rather than retried, because the caller
      // just flipped a switch and is watching.
      return {
        collection,
        localCount: 0,
        remoteCount: 0,
        needsChoice: false,
        error: failure,
      };
    }

    const localCount = this.localCount(collection);
    const remoteCount = remote.count();
    if (needsAdoptionChoice(localCount, remoteCount)) {
      return { collection, localCount, remoteCount, needsChoice: true };
    }

    // One possible outcome, so take it. `merge` and `replace` agree whenever one
    // side is empty, which is exactly when this branch is reached.
    const applied = await this.apply(collection, 'merge');
    if (!applied) {
      return {
        collection,
        localCount,
        remoteCount,
        needsChoice: false,
        error: 'That could not be saved to your account. Nothing was changed.',
      };
    }
    return { collection, localCount, remoteCount, needsChoice: false };
  }

  /** Perform a choice. */
  async apply(collection: AdoptableCollection, choice: AdoptionChoice): Promise<boolean> {
    const applied = await this.applyFor(collection, choice);
    this.diagnostics.info('CollectionAdoption', 'adopt', { collection, choice, ok: applied });
    return applied;
  }

  private applyFor(collection: AdoptableCollection, choice: AdoptionChoice): Promise<boolean> {
    switch (collection) {
      case 'trust':
        return this.applyTrust(choice);
      case 'feeds':
        return this.applyFeeds(choice);
      case 'lists':
        return this.applyLists(choice);
    }
  }

  private remoteFor(collection: AdoptableCollection): {
    load(): Promise<void>;
    count(): number;
    error(): string | null;
  } {
    switch (collection) {
      case 'trust':
        return this.profileTrust;
      case 'feeds':
        return this.profileFeeds;
      case 'lists':
        return this.profileLists;
    }
  }

  /**
   * Lists, where a title is the identity.
   *
   * The same person made both sides, so two lists called "Friends" are one list
   * — but their memberships can differ, and taking the account's copy wholesale
   * would drop anyone added on this browser. So a title match unions the members
   * rather than picking a winner, which is what the `combine` hook is for.
   *
   * Ids follow the account's copy on a match: keeping this browser's id would
   * write a second object for a list the account already has.
   */
  private async applyLists(choice: AdoptionChoice): Promise<boolean> {
    const local = this.localLists.lists();
    const plan = planAdoption(
      local,
      this.profileLists.lists(),
      choice,
      (list) => list.title.trim().toLowerCase(),
      (localList, remoteList) => {
        const members = new Set(remoteList.memberHandles);
        const additions = localList.memberHandles.filter((handle) => !members.has(handle));
        // Returning the remote object unchanged is how "nothing to add" is
        // signalled, so an identical list is not rewritten for no reason.
        if (additions.length === 0) {
          return remoteList;
        }
        return {
          ...remoteList,
          memberHandles: [...remoteList.memberHandles, ...additions],
        };
      },
    );

    if (plan.upload.length > 0) {
      const written = plan.remoteEmpty
        ? await this.profileLists.copyIn(plan.upload)
        : await this.profileLists.writeAll(plan.upload);
      const ok = typeof written === 'boolean' ? written : written.kind === 'ok';
      if (!ok) {
        return false;
      }
      // `copyIn` regenerates ids, so the account's view is what this browser
      // must take — not the plan, which still names the old local ids.
      if (plan.remoteEmpty) {
        this.localLists.adoptAll(this.profileLists.lists());
        return true;
      }
    }

    this.localLists.adoptAll(plan.local as ProfileList[]);
    return true;
  }

  private async applyTrust(choice: AdoptionChoice): Promise<boolean> {
    const localEntries = this.localTrust.entries();
    const local: ProfileTrustEntry[] = Object.entries(localEntries).map(([key, entry]) => ({
      key,
      acct: entry.acct,
      since: entry.since,
    }));
    const plan = planAdoption(local, this.profileTrust.entries(), choice, (entry) => entry.key);

    // The settings object follows the same rule as the entries: the stored copy
    // wins unless the account has none, because it is what every other browser
    // agreed on.
    const settings = plan.remoteEmpty
      ? {
          level: this.localTrust.level(),
          expandAllCw: this.localTrust.expandAllCwSetting(),
          showAllSensitive: this.localTrust.showAllSensitiveSetting(),
        }
      : this.profileTrust.settings();

    if (plan.upload.length > 0 || plan.remoteEmpty) {
      const written = await this.profileTrust.replaceAll(plan.upload, settings);
      if (!written) {
        // The local store is left exactly as it was: a failed upload must not
        // half-apply a reconciliation.
        return false;
      }
    }

    const entries: Record<string, Entry> = {};
    for (const entry of plan.local) {
      entries[entry.key] = { acct: entry.acct, since: entry.since };
    }
    this.localTrust.adoptAll(entries, settings);
    return true;
  }

  private async applyFeeds(choice: AdoptionChoice): Promise<boolean> {
    const local = this.localFeeds.feeds().map((feed) => ({
      url: feed.url,
      title: feed.title,
      // The local store has no folders yet; the OPML parser reads them and the
      // collection carries them, so this is where they will arrive from once the
      // UI grows folders.
      folders: [] as string[],
    }));
    const plan = planAdoption(local, this.profileFeeds.feeds(), choice, (feed) => feed.url);

    if (plan.upload.length > 0 || plan.remoteEmpty) {
      const written = await this.profileFeeds.replaceAll(plan.upload);
      if (!written) {
        return false;
      }
    }

    this.localFeeds.adoptAll(plan.local);
    return true;
  }

  /**
   * How many of a collection this browser holds.
   *
   * Public so the Plus diagnostics panel can report it without duplicating the
   * three different shapes these collections have. Reading it changes nothing —
   * unlike {@link inspect}, which adopts whatever it can settle.
   */
  localCount(collection: AdoptableCollection): number {
    switch (collection) {
      case 'trust':
        return Object.keys(this.localTrust.entries()).length;
      case 'feeds':
        return this.localFeeds.feeds().length;
      case 'lists':
        return this.localLists.lists().length;
    }
  }
}
