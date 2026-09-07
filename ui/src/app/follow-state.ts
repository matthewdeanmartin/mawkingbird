import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { qualifiedHandle } from './account-handle';
import { Account, Relationship } from './models';
import { BlueskyGraph } from './providers/bluesky/bluesky-graph';
import { BlueskySession } from './providers/bluesky/bluesky-session';

/**
 * Who the viewer follows, resolved in batches and shared across the app.
 *
 * ## Why this exists
 *
 * Three places wanted the same answer and none of them agreed on it. The
 * collection page had no follow affordance at all — a curated list of people
 * whose entire purpose is to be followed, with no way to follow any of them and
 * no indication of who you already follow, so the only way through it was to
 * open every member in a new tab. `feed-members` resolved follow state
 * correctly and then rendered no button with it. `bulk-actions` batched at 40
 * while the other two batched at 80.
 *
 * 40 is the right number: it is Mastodon's documented cap for
 * `/accounts/relationships`, and a request for 80 ids quietly comes back with
 * the first 40 — which reads as "you don't follow these people" for everyone
 * past the cap.
 *
 * ## What it holds
 *
 * The relationship for each account id we have asked about. Follow and unfollow
 * write through here, so a row in one component reflects a follow made from
 * another without a refetch.
 *
 * In memory only, for the session. Follow state is cheap to re-ask and
 * catastrophic to get wrong from cache: a stale "following" hides the button
 * that would let you follow them.
 */

/** Mastodon caps `/accounts/relationships` at 40 ids per request. */
export const RELATIONSHIP_BATCH = 40;

/** What the button should show for one account. */
export type FollowStatus =
  /** Not asked yet, or the viewer is anonymous — render nothing. */
  | 'unknown'
  | 'following'
  /** A follow request is in with a locked account, awaiting their decision. */
  | 'requested'
  | 'not-following';

@Injectable({ providedIn: 'root' })
export class FollowState {
  private api = inject(Api);
  private auth = inject(Auth);
  private blueskyGraph = inject(BlueskyGraph);
  private blueskySession = inject(BlueskySession);

  private known = signal<Record<string, Relationship>>({});
  /** Foreign `user@host` → the local account record for them, or null if none. */
  private foreign = new Map<string, Account | null>();
  private foreignPending = new Map<string, Promise<Account | null>>();
  /** Ids with a write in flight, so the button can disable itself. */
  private busy = signal<ReadonlySet<string>>(new Set());
  private pending = new Map<string, Promise<void>>();

  /** What we know about this account without asking. */
  status(id: string): FollowStatus {
    const rel = this.known()[id];
    if (!rel) {
      return 'unknown';
    }
    if (rel.following) {
      return 'following';
    }
    return rel.requested ? 'requested' : 'not-following';
  }

  busyWith(id: string): boolean {
    return this.busy().has(id);
  }

  /** Already connected or blocked, so this person should not be suggested. */
  excludesSuggestion(id: string): boolean {
    const rel = this.known()[id];
    return !!rel && (rel.following || rel.requested || rel.blocking);
  }

  /**
   * Resolve these accounts, skipping any already known.
   *
   * Anonymous viewers are answered with silence rather than a request: there is
   * no relationship to have, and the endpoint would 401.
   */
  async resolve(ids: string[]): Promise<void> {
    if (this.auth.isAnonymous) {
      return;
    }
    const unique = [...new Set(ids)];
    // Anything already in flight is awaited rather than re-requested: two
    // components mounting against the same collection should cost one call.
    const inFlight = unique
      .map((id) => this.pending.get(id))
      .filter((p): p is Promise<void> => !!p);
    const wanted = unique.filter((id) => !this.known()[id] && !this.pending.has(id));
    const bluesky = wanted.filter((id) => isBlueskyId(id) && this.blueskySession.linked());
    const mastodon = wanted.filter((id) => !isBlueskyId(id));

    const batches: Promise<void>[] = [];
    for (let i = 0; i < mastodon.length; i += RELATIONSHIP_BATCH) {
      const slice = mastodon.slice(i, i + RELATIONSHIP_BATCH);
      const batch = this.fetch(slice).finally(() => {
        for (const id of slice) {
          this.pending.delete(id);
        }
      });
      for (const id of slice) {
        this.pending.set(id, batch);
      }
      batches.push(batch);
    }
    for (const id of bluesky) {
      const request = this.fetchBluesky(id).finally(() => this.pending.delete(id));
      this.pending.set(id, request);
      batches.push(request);
    }
    await Promise.all([...batches, ...inFlight]);
  }

  private async fetch(ids: string[]): Promise<void> {
    try {
      const rels = await firstValueFrom(this.api.relationships(ids));
      this.write(rels);
    } catch {
      // Leave them 'unknown': a row with no button is better than a row whose
      // button claims a relationship we failed to read.
    }
  }

  private async fetchBluesky(id: string): Promise<void> {
    try {
      const relationship = await firstValueFrom(this.blueskyGraph.relationship(blueskyDid(id)));
      this.write([relationship]);
    } catch {
      // As above, an unknown button is safer than inventing relationship state.
    }
  }

  /**
   * Follow, or unfollow, updating optimistically.
   *
   * Optimistic because the button is the whole interaction and a spinner on
   * every click through a list of forty people is its own kind of unusable. The
   * rollback matters more than the optimism: a failed follow that keeps saying
   * "Following" is a lie the user acts on.
   *
   * Returns whether it worked, so a caller can surface the failure.
   */
  async toggle(id: string): Promise<boolean> {
    if (
      this.auth.isAnonymous ||
      this.busyWith(id) ||
      (isBlueskyId(id) && !this.blueskySession.linked())
    ) {
      return false;
    }
    const before = this.known()[id];
    const wasConnected = !!before && (before.following || before.requested);

    this.setBusy(id, true);
    // Optimistic: assume the ordinary case (a public account follows straight
    // through). A locked account answers `requested`, and the real response
    // below replaces this guess either way.
    this.write([
      { ...(before ?? emptyRelationship(id)), following: !wasConnected, requested: false },
    ]);

    try {
      const rel = await firstValueFrom(
        isBlueskyId(id)
          ? wasConnected
            ? this.blueskyGraph.unfollow(blueskyDid(id))
            : this.blueskyGraph.follow(blueskyDid(id))
          : wasConnected
            ? this.api.unfollow(id)
            : this.api.follow(id),
      );
      // The server's answer wins — it is the one that knows about locked
      // accounts, and it is what turns an optimistic "Following" into the
      // honest "Requested".
      this.write([rel]);
      return true;
    } catch {
      if (before) {
        this.write([before]);
      } else {
        this.forget(id);
      }
      return false;
    } finally {
      this.setBusy(id, false);
    }
  }

  /** Fold in relationships someone else already fetched. */
  write(rels: Relationship[]): void {
    this.known.update((all) => {
      const next = { ...all };
      for (const rel of rels) {
        next[rel.id] = rel;
      }
      return next;
    });
  }

  /**
   * The local account for a foreign one, so it can actually be followed.
   *
   * A shipped starter kit (and anything else assembled off-server) carries
   * accounts as the *origin* server described them. Their ids are meaningless
   * here: `POST /accounts/<their id>/follow` either 404s or, worse, follows
   * whoever happens to hold that id on this server. That is why those rows
   * originally shipped with no follow button at all.
   *
   * The fix is the flow Mastodon provides for exactly this: search the
   * fully-qualified `user@host` handle with `resolve=true`, which webfingers the
   * account and creates a *local* record for it, then act on that id. It is what
   * `import-follows.ts` and `starter-kit-post.ts` already do; this is that logic
   * in one place so a third and fourth copy don't appear.
   *
   * Returns null when the handle can't be built or the account can't be found —
   * the caller shows no button rather than one that would fail.
   */
  async resolveForeign(account: Account): Promise<Account | null> {
    if (this.auth.isAnonymous) {
      return null;
    }
    const handle = qualifiedHandle(account);
    if (!handle) {
      return null;
    }
    const cached = this.foreign.get(handle);
    if (cached !== undefined) {
      return cached;
    }
    const inFlight = this.foreignPending.get(handle);
    if (inFlight) {
      return inFlight;
    }

    const lookup = firstValueFrom(this.api.search(handle, 'accounts', { resolve: true, limit: 5 }))
      .then((results) => {
        const found = pickAccount(handle, results.accounts ?? []);
        // Cached either way: a null is as worth remembering as a hit, since
        // re-webfingering a handle that doesn't resolve costs the same as one
        // that does and gets the same answer.
        this.foreign.set(handle, found);
        return found;
      })
      .catch(() => null)
      .finally(() => this.foreignPending.delete(handle));

    this.foreignPending.set(handle, lookup);
    return lookup;
  }

  /** Drop everything — used when the signed-in account changes. */
  reset(): void {
    this.known.set({});
    this.busy.set(new Set());
    this.pending.clear();
    this.foreign.clear();
    this.foreignPending.clear();
  }

  private forget(id: string): void {
    this.known.update((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
  }

  private setBusy(id: string, busy: boolean): void {
    this.busy.update((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}

function isBlueskyId(id: string): boolean {
  return id.startsWith('bsky:did:');
}

function blueskyDid(id: string): string {
  return id.slice('bsky:'.length);
}

/**
 * The best match for a handle among search results.
 *
 * Search returns look-alikes — the same username on a different host, a display
 * name that happens to contain the text — so an exact `acct` match wins.
 * Falling back to the first result is deliberate rather than lazy: with
 * `resolve=true` the webfingered account is the first result, and refusing to
 * act on it would leave the button dead for accounts that resolved perfectly
 * well.
 */
function pickAccount(handle: string, accounts: Account[]): Account | null {
  const wanted = handle.toLowerCase();
  return accounts.find((a) => a.acct?.toLowerCase() === wanted) ?? accounts[0] ?? null;
}

/** A relationship placeholder for an account we are writing to before reading. */
function emptyRelationship(id: string): Relationship {
  return {
    id,
    following: false,
    followed_by: false,
    requested: false,
    blocking: false,
    muting: false,
  };
}
