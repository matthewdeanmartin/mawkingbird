import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { Api } from '../api';
import { Account } from '../models';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { PREVIEW_KEY, type PreviewState, readPreviewState } from './preview-state';

/** The server the hardcoded ids below belong to. */
export const PREVIEW_SERVER = 'https://mastodon.social';

/**
 * The accounts a first-time visitor sees, chosen by the product owner.
 *
 * A couple, not a whole starter kit: seeding a kit costs 20+ API calls before
 * the first post appears, and a couple of active accounts read as a timeline as
 * well. One official account and one real newsroom, so the preview is not
 * wall-to-wall meta-Mastodon. Only organisations: a person's account can be
 * their personal life too, which a stranger's first screen should not seed.
 *
 * The ids are mastodon.social's. `Account` bodies are compiled in rather than
 * fetched because `AnonymousFollows.follow()` stores the whole account and the
 * timeline renders the author card from it: seeded from a bare id, every post
 * would show a blank avatar and no display name. {@link Api.getAccounts}
 * refreshes these at runtime, so a stale snapshot costs an out-of-date avatar
 * rather than an empty preview.
 */
const PREVIEW_ACCOUNTS: readonly Account[] = [
  snapshot({
    id: '13179',
    username: 'Mastodon',
    acct: 'Mastodon',
    display_name: 'Mastodon',
    note: '<p>Our mission is to connect the world through thriving online communities.</p><p>This is the primary account for the Mastodon project.</p>',
    url: 'https://mastodon.social/@Mastodon',
    avatar:
      'https://files.mastodon.social/accounts/avatars/000/013/179/original/b4ceb19c9c54ec7e.png',
    followers_count: 877008,
    following_count: 51,
    statuses_count: 560,
  }),
  // Federated, not local: `@propublica` does not exist on mastodon.social, and
  // the id below is the one *mastodon.social* assigned to the remote account.
  // Verified 2026-08-12 via /api/v1/accounts/lookup?acct=propublica@newsie.social.
  snapshot({
    id: '109365953730768772',
    username: 'ProPublica',
    acct: 'ProPublica@newsie.social',
    display_name: 'ProPublica',
    note: '<p>The official Mastodon page for ProPublica.</p><p>Pursuing stories with moral force.</p>',
    url: 'https://newsie.social/@ProPublica',
    avatar:
      'https://files.mastodon.social/cache/accounts/avatars/109/365/953/730/768/772/original/3c190e6fd6009f43.png',
    followers_count: 185004,
    following_count: 159,
    statuses_count: 4373,
  }),
];

/** Fill in the fields every `Account` needs but a snapshot has no reason to state. */
function snapshot(
  partial: Pick<
    Account,
    | 'id'
    | 'username'
    | 'acct'
    | 'display_name'
    | 'note'
    | 'url'
    | 'avatar'
    | 'followers_count'
    | 'following_count'
    | 'statuses_count'
  >,
): Account {
  return {
    ...partial,
    avatar_static: partial.avatar,
    header: '',
    header_static: '',
    bot: false,
    locked: false,
    discoverable: true,
    fields: [],
    role: null,
  };
}

export const PREVIEW_ACCOUNT_IDS: readonly string[] = PREVIEW_ACCOUNTS.map((a) => a.id);

/**
 * Seeds and removes the follows behind the first-run preview.
 *
 * The seed is temporary by contract: **every** exit from the first-run modal
 * clears it, including the ones that lead to a real login. An anonymous account
 * left carrying follows the visitor never chose is the failure this
 * service exists to prevent.
 */
@Injectable({ providedIn: 'root' })
export class PreviewSeed {
  private follows = inject(AnonymousFollows);
  private api = inject(Api);

  /** True while a preview is on screen and its follows are still in storage. */
  get active(): boolean {
    return this.state() !== null;
  }

  private state(): PreviewState | null {
    return readPreviewState();
  }

  /**
   * Mark a preview as running without seeding anyone.
   *
   * For the case where no server could be reached: there are no posts to show,
   * but the modal must still appear and still be answerable, and answering it
   * must still end the preview.
   */
  markEmpty(server: string): void {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ server, preexisting: [] }));
  }

  /**
   * Follow the preview accounts, then refresh them from the live server.
   *
   * Follows are seeded from the compiled-in snapshot **first** so the timeline
   * can start rendering without waiting on the network; the batch call then
   * replaces them with current avatars and bios. A failed lookup is not an
   * error — it leaves the snapshot in place, which is what it is for.
   */
  async seed(server: string): Promise<void> {
    // Anything the visitor already followed is theirs, not ours, and must
    // survive cleanup. Recorded before seeding, because afterwards the two are
    // indistinguishable.
    const preexisting = PREVIEW_ACCOUNTS.filter((account) =>
      this.follows.isFollowing(account, server),
    ).map((account) => account.id);
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ server, preexisting }));
    for (const account of PREVIEW_ACCOUNTS) {
      this.follows.follow(account, server);
    }
    if (server !== PREVIEW_SERVER) {
      // The hardcoded ids are mastodon.social's and mean nothing elsewhere.
      // The snapshot still renders, and reads route by the account's own origin.
      return;
    }
    try {
      const fresh = await firstValueFrom(
        this.api.getAccounts([...PREVIEW_ACCOUNT_IDS]).pipe(timeout(5000)),
      );
      for (const account of fresh) {
        if (PREVIEW_ACCOUNT_IDS.includes(account.id)) {
          // `refreshAccount`, not `follow`: the account is already followed by
          // the loop above, and `follow` returns early for an existing key —
          // so calling it here would silently keep the stale snapshot.
          this.follows.refreshAccount(account, server);
        }
      }
    } catch {
      // Blocked, rate-limited or slow: the snapshot is the fallback by design.
    }
  }

  /**
   * Remove the seeded follows and end the preview.
   *
   * Only removes accounts this service seeded, matched the way
   * `AnonymousFollows` keys them. Someone who genuinely followed one of the
   * accounts during the preview keeps that follow — un-following it behind their
   * back would be worse than leaving it.
   */
  clear(): void {
    const state = this.state();
    if (!state) {
      return;
    }
    for (const account of PREVIEW_ACCOUNTS) {
      if (!state.preexisting.includes(account.id)) {
        this.follows.unfollow(account, state.server);
      }
    }
    localStorage.removeItem(PREVIEW_KEY);
  }
}
