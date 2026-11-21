import { computed, inject, Injectable } from '@angular/core';
import { BlueskySession } from '../connections/bluesky/bluesky-session';
import { misskeyIdentity } from '../connections/misskey/misskey-identity-store';
import { Account, Relationship } from '../platform/api/models';
import { accountScopeSuffix } from '../platform/session/account-scope';
import { Auth } from '../platform/session/auth';
import { ClientPrefs } from '../platform/storage/client-prefs';
import { Wellness } from '../wellness/wellness';
import { FollowState } from './follow-state';

/**
 * Reply-guy controls: who the reader follows, and who follows the reader, as
 * cards need to know it.
 *
 * Mastodon has many defences against quotes and almost none against replies:
 * anyone the reader never chose to hear from can land in their notifications
 * and sit beside friends under their posts. Here "a reply guy" is simply
 * someone the recipient does not follow (see reply-guys-model.ts), and the
 * same rule runs in both directions:
 *
 * - defending the reader: {@link iFollow} drives the "you don't follow" chip,
 *   the virtual content warning and the Wellness notification switch;
 * - warning the reader: {@link followsMe} is false when the reader is about to
 *   reply to, or quote, someone who does not follow them.
 *
 * Content-warning trust (TrustedAccounts) is deliberately not consulted: that
 * is "I trust this person's CW judgement", a different question.
 *
 * ## No answer is not "no"
 *
 * Both questions return `null` when there is nothing to say: signed out, the
 * reader's own account, a network with no session, or a lookup still in
 * flight or failed. Callers act only on a definite `false`. The default
 * protection is a click, never removal, so failing open costs a friend's reply
 * nothing and a reply guy at worst one unguarded render.
 *
 * Answers come from {@link FollowState}, so a follow made anywhere opens the
 * guard on that person's cards at once. Bluesky authors carry the answer in
 * their `viewer` block and cost no request.
 */
@Injectable({ providedIn: 'root' })
export class ReplyGuys {
  private auth = inject(Auth);
  private follows = inject(FollowState);
  private bluesky = inject(BlueskySession);
  private prefs = inject(ClientPrefs);
  private wellness = inject(Wellness);

  /** The virtual content warning is on (Settings → Wellness; on by default). */
  readonly cwOn = computed(() => this.prefs.replyGuyCw());
  /** Wellness: their replies, mentions and quotes never reach notifications. */
  readonly hideFromNotifications = this.wellness.hideReplyGuys;

  private asked = new Set<string>();
  private queued = new Set<string>();
  private scope = accountScopeSuffix();

  /** Does the reader follow this account? `null` when there is no answer. */
  iFollow(account: Account | null | undefined): boolean | null {
    if (!account?.id || this.isSelf(account)) return null;
    const rel = this.relation(account);
    if (rel) return rel.following;
    return account.viewerFollows ?? null;
  }

  /** Does this account follow the reader? `null` when there is no answer. */
  followsMe(account: Account | null | undefined): boolean | null {
    if (!account?.id || this.isSelf(account)) return null;
    const rel = this.relation(account);
    if (rel) return rel.followed_by;
    return account.followsViewer ?? null;
  }

  /** Definitely not followed: the one case the chip and the guards act on. */
  notFollowed(account: Account | null | undefined): boolean {
    return this.iFollow(account) === false;
  }

  /** One of the reader's own accounts, on whichever network wrote it. */
  isSelf(account: Pick<Account, 'id'>): boolean {
    const id = account.id;
    if (id.startsWith('bsky:')) {
      const did = this.bluesky.session()?.did;
      return !!did && id === `bsky:${did}`;
    }
    if (id.startsWith('mk:')) {
      const key = this.auth.activeMisskeyKey();
      const identity = key ? misskeyIdentity(key) : null;
      return !!identity && id === `mk:${identity.profile.userId}`;
    }
    return id === this.auth.account()?.id;
  }

  /**
   * Ask about a page of accounts at once, ahead of the cards. Notifications and
   * threads call this; cards also ask for themselves, coalesced per tick.
   */
  prime(accounts: readonly (Account | null | undefined)[]): void {
    for (const account of accounts) this.relation(account);
  }

  /**
   * What FollowState knows, queueing a lookup when it knows nothing.
   * `undefined` means "no relationship (yet)"; the callers then fall back to
   * any viewer state the account itself carries.
   */
  private relation(account: Account | null | undefined): Relationship | undefined {
    if (!account?.id || this.isSelf(account)) return undefined;
    const known = this.follows.relationship(account.id);
    if (known) return known;
    if (account.viewerFollows !== undefined) return undefined;
    if (this.canAsk(account.id)) this.request(account.id);
    return undefined;
  }

  /** A lookup that would only 401, or ask the wrong server, is never sent. */
  private canAsk(id: string): boolean {
    if (this.auth.isAnonymous) return false;
    if (id.startsWith('bsky:')) return this.bluesky.linked();
    if (id.startsWith('mk:')) return !!this.auth.activeMisskeyKey();
    return !this.auth.lacksMastodonToken;
  }

  /**
   * Coalesce every id asked for in one render pass into one FollowState call,
   * which batches by network. Each id is asked once per signed-in account: a
   * failed lookup stays "no answer" rather than retrying on every render.
   */
  private request(id: string): void {
    const scope = accountScopeSuffix();
    if (scope !== this.scope) {
      this.scope = scope;
      this.asked.clear();
    }
    if (this.asked.has(id)) return;
    this.asked.add(id);
    const first = this.queued.size === 0;
    this.queued.add(id);
    if (!first) return;
    queueMicrotask(() => {
      const ids = [...this.queued];
      this.queued.clear();
      void this.follows.resolve(ids);
    });
  }
}
