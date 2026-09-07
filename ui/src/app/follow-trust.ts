import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { Auth } from './auth';
import { AnonymousAccount } from './providers/anonymous/anonymous-account';
import { AnonymousFollows } from './providers/anonymous/anonymous-follows';
import { Account } from './models';

/**
 * "Do I follow this person?", answered cheaply enough to ask on every card.
 *
 * Backing store for the `follows` and `follows-boosts` trust levels (see
 * {@link TrustedAccounts}). Those levels mean *everyone I follow, now and in
 * future*, so there is deliberately no materialised follow list: paging
 * `/accounts/{me}/following` for someone with thousands of follows is a lot of
 * requests to answer a question about the twenty accounts actually on screen,
 * and the answer goes stale the moment they follow someone new.
 *
 * ## How the answer is obtained
 *
 * Signed into Mastodon: `/api/v1/accounts/relationships` takes a *batch* of ids
 * and returns `following` for each. One request covers a whole timeline page —
 * a 40-status page is typically fewer than 20 distinct accounts — so the cost is
 * roughly one extra call per page rather than one per card.
 *
 * Anonymous or Bluesky-primary: there is no such endpoint, and none is needed.
 * {@link AnonymousFollows} already holds the one local follow list covering both
 * networks, and answers synchronously.
 *
 * ## Why asking is safe
 *
 * Unknown means *not trusted*. A card renders its content warning closed until
 * the relationship arrives, then opens it — never the other way round, so a slow
 * or failed request can only leave a warning in place, never reveal something
 * early. That does mean a brief visible flicker on trusted posts; it is the
 * correct direction to fail in.
 *
 * Verdicts live in memory only. They are cheap to re-fetch, and a persisted
 * "following: true" would keep a warning open after an unfollow until some TTL
 * noticed.
 */
@Injectable({ providedIn: 'root' })
export class FollowTrust {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousFollows);
  private anonymousAccount = inject(AnonymousAccount);

  /** account id → do we follow them. Absent means "not asked yet". */
  private verdicts = signal<Record<string, boolean>>({});

  /** Ids already requested, so a shared timeline page asks only once. */
  private asked = new Set<string>();

  /**
   * Bumped whenever verdicts change, for card computeds to depend on.
   *
   * Exposed as its own signal rather than having callers read {@link verdicts}
   * directly: the map identity changing is the only thing a card cares about.
   */
  readonly revision = computed(() => this.verdicts());

  /**
   * True when we know we follow this account. False when we know we don't, and
   * also when we haven't found out yet — see the class note on failing closed.
   *
   * Asking is a side effect: an id we have not seen is queued for the next
   * batch. That keeps the call sites (status cards) free of any fetch logic.
   */
  isFollowing(account: Pick<Account, 'id' | 'acct' | 'url'> | null | undefined): boolean {
    if (!account) {
      return false;
    }
    if (this.usesLocalFollows()) {
      return this.anonymous.isFollowing(account as Account, this.anonymousAccount.server());
    }
    const known = this.verdicts()[account.id];
    if (known === undefined) {
      this.request(account.id);
      return false;
    }
    return known;
  }

  /**
   * Ask about a page of accounts at once.
   *
   * Timelines call this with everyone in the page so the whole page resolves in
   * a single request, instead of each card discovering its own id one at a time.
   */
  prime(accounts: readonly Pick<Account, 'id'>[]): void {
    if (this.usesLocalFollows()) {
      return;
    }
    const ids = accounts.map((a) => a.id).filter((id) => id && !this.asked.has(id));
    if (ids.length) {
      this.fetch([...new Set(ids)]);
    }
  }

  /**
   * Forget every verdict, so the next render asks again.
   *
   * Called on account switch and after follow/unfollow: both change the answer
   * for accounts we may already have cached.
   */
  reset(): void {
    this.asked.clear();
    this.verdicts.set({});
  }

  /**
   * Anonymous and Bluesky-primary read the local follow store instead of the
   * API. `isAnonymous` alone is not enough — a Bluesky-primary session is signed
   * in but has no Mastodon token to spend on `/relationships`.
   */
  private usesLocalFollows(): boolean {
    return this.auth.isAnonymous || this.auth.isBlueskyPrimary;
  }

  /**
   * Queue one id, coalescing everything asked for in the same tick into a single
   * request. Cards resolve independently during a render pass, so without this a
   * twenty-card page would issue twenty requests.
   */
  private pending = new Set<string>();
  private flushing = false;

  private request(id: string): void {
    if (this.asked.has(id)) {
      return;
    }
    this.pending.add(id);
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    queueMicrotask(() => {
      this.flushing = false;
      const ids = [...this.pending];
      this.pending.clear();
      if (ids.length) {
        this.fetch(ids);
      }
    });
  }

  private fetch(ids: string[]): void {
    for (const id of ids) {
      this.asked.add(id);
    }
    this.api.relationships(ids).subscribe({
      next: (rels) => {
        const next = { ...this.verdicts() };
        for (const rel of rels) {
          next[rel.id] = !!rel.following;
        }
        // Ids the server said nothing about are settled as "not following", so
        // they are not re-requested on every subsequent render.
        for (const id of ids) {
          next[id] ??= false;
        }
        this.verdicts.set(next);
      },
      error: () => {
        // Leave the verdicts alone: absent still reads as untrusted, which is
        // the safe answer. Allow a retry on the next render rather than pinning
        // a wrong "false" for the session.
        for (const id of ids) {
          this.asked.delete(id);
        }
      },
    });
  }
}
