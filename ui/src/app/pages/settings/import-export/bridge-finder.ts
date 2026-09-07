/**
 * The bridge finder: *"who that I follow over there is also over here?"*
 *
 * The fourth discovery path on the Import/Export Friends page, and the only one
 * that reads two of the user's own live networks rather than a foreign archive.
 * `twitter-friend-discovery.ts` and `github-friend-discovery.ts` are its
 * siblings and this deliberately mirrors their shape — `rows`/`running`/
 * `callCount`/`stop()`/budgeted `start()` — so the three read alike.
 *
 * ## Symmetric by construction
 *
 * There is no "Mastodon → Bluesky" class and no inverse of it. There is one
 * engine parameterised by `{source, target}`, because after six sprints of
 * un-Mastodon-ing the app, shipping the Mastodon-first half alone would be a
 * step backwards. `direction()` picks which walker and which searcher run; the
 * rest of the file never asks which network it is looking at.
 *
 * Ids stay namespaced (`bsky:<did>`) and nothing here learns a second protocol:
 * both sides are adapted to `Account` at the provider edge, per the roadmap's
 * standing constraint 2.
 *
 * ## Why it costs what it costs
 *
 * See `bridge-matching.ts` for the two-pass design. In short: pass 1 reads bios
 * the follow-list responses already returned (zero extra calls) and confirms
 * what it finds in batches of 25; pass 2 searches the leftovers one at a time,
 * under a budget the user sets. The counters below are public because the point
 * of the budget is that the user can watch it being spent.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api';
import { Account } from '../../../models';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { BlueskyGraph } from '../../../providers/bluesky/bluesky-graph';
import { adaptProfile } from '../../../providers/bluesky/bluesky-adapter';
import { BskyFollows } from '../../../providers/bluesky/bluesky-types';
import { Auth } from '../../../auth';
import {
  BridgeConfidence,
  BridgeMatch,
  BridgeNetwork,
  compareMatches,
  handleInText,
  rankBridgeCandidate,
  searchableProfileText,
  verifiedLinkTo,
} from './bridge-matching';

export type BridgeRowStatus = 'pending' | 'searching' | 'complete' | 'failed';

/** One person on the source network, and what was found for them on the target. */
export interface BridgeRow {
  /** The person as they exist on the *source* network. */
  person: Account;
  status: BridgeRowStatus;
  /** A handle read out of their bio by pass 1, before it was confirmed. */
  clue?: string;
  matches: BridgeMatch[];
  error?: string;
}

export interface BridgeDirection {
  source: BridgeNetwork;
  target: BridgeNetwork;
}

/** Mastodon caps `/following` at 80 per page. `getFollows` sets its own limit. */
const MASTODON_PAGE = 80;

/** `getProfiles` accepts 25 actors per call — pass 1's whole batching budget. */
const PROFILE_BATCH = 25;

/** Walking the source list is metered too, so a runaway cursor cannot spin. */
const MAX_SOURCE_PAGES = 60;

@Injectable({ providedIn: 'root' })
export class BridgeFinder {
  private api = inject(Api);
  private bsky = inject(BlueskyApi);
  private graph = inject(BlueskyGraph);
  private auth = inject(Auth);
  private stopRequested = false;

  readonly direction = signal<BridgeDirection>({ source: 'mastodon', target: 'bluesky' });
  readonly rows = signal<BridgeRow[]>([]);
  readonly loading = signal(false);
  readonly running = signal(false);
  readonly loadError = signal<string | null>(null);

  /** Paid `searchActors`/`search` calls only — what the budget actually limits. */
  readonly callCount = signal(0);
  /** Pages of the source follow list read. Cheap, but worth showing. */
  readonly sourcePageCount = signal(0);
  /** Confirmation calls spent by the free pass (batched 25 at a time). */
  readonly confirmCount = signal(0);
  /** How many rows pass 1 resolved without a search. The headline number. */
  readonly freeMatchCount = signal(0);

  readonly following = signal<ReadonlySet<string>>(new Set());
  readonly followBusy = signal<ReadonlySet<string>>(new Set());
  readonly followErrors = signal<ReadonlyMap<string, string>>(new Map());

  /** Small courtesy delay between paid searches; tests set this to zero. */
  delayMs = 350;

  /** Rows pass 1 could not resolve — what a paid scan would work through. */
  pendingRows(): BridgeRow[] {
    return this.rows().filter((row) => row.status === 'pending');
  }

  matchedRows(): BridgeRow[] {
    return this.rows().filter((row) => row.matches.length > 0);
  }

  setDirection(direction: BridgeDirection): void {
    if (
      direction.source === this.direction().source &&
      direction.target === this.direction().target
    ) {
      return;
    }
    this.reset();
    this.direction.set(direction);
  }

  reset(): void {
    this.stopRequested = true;
    this.rows.set([]);
    this.loading.set(false);
    this.running.set(false);
    this.loadError.set(null);
    this.callCount.set(0);
    this.sourcePageCount.set(0);
    this.confirmCount.set(0);
    this.freeMatchCount.set(0);
    this.following.set(new Set());
    this.followBusy.set(new Set());
    this.followErrors.set(new Map());
  }

  stop(): void {
    this.stopRequested = true;
  }

  /**
   * Load the source follow list and run the free pass over it.
   *
   * Everything this does is either already paid for (the follow list, which the
   * user must fetch regardless) or batched 25-to-a-call (confirmation). No
   * per-person search happens here — that is {@link scan}, and it is opt-in.
   */
  async load(): Promise<void> {
    if (this.loading() || this.running()) return;
    this.reset();
    this.stopRequested = false;
    this.loading.set(true);
    try {
      const people = await this.readSourceFollows();
      this.rows.set(people.map((person) => ({ person, status: 'pending' as const, matches: [] })));
      await this.freePass();
      await this.loadFollowState();
    } catch (error: unknown) {
      this.loadError.set(describeLoadError(error, this.direction().source));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * The paid pass: one search per unresolved person, capped by `budget`.
   *
   * Stopping keeps everything already found — a half-spent scan is still a
   * useful answer, and re-running resumes at the first still-pending row rather
   * than starting over.
   */
  async scan(budget: number): Promise<void> {
    if (this.loading() || this.running()) return;
    this.stopRequested = false;
    this.running.set(true);
    const startedAt = this.callCount();
    try {
      for (let index = 0; index < this.rows().length; index++) {
        if (this.stopRequested || this.callCount() - startedAt >= budget) break;
        if (this.rows()[index].status !== 'pending') continue;
        await this.searchRow(index);
      }
      await this.loadFollowState();
    } finally {
      this.running.set(false);
    }
  }

  isFollowing(account: Account): boolean {
    return this.following().has(account.id);
  }

  /**
   * Follow every account in `accounts` on the target network, one at a time.
   *
   * Clears the stop flag first, deliberately: `stop()` and a rate-limited scan
   * both leave it set, and a user who then picks matches and clicks Follow is
   * asking for a *new* action rather than resuming the one they cancelled.
   * Without this, that click is a silent no-op.
   */
  async followAll(accounts: readonly Account[]): Promise<void> {
    this.stopRequested = false;
    for (const account of accounts) {
      if (this.stopRequested) break;
      await this.follow(account);
    }
  }

  async follow(account: Account): Promise<void> {
    if (this.followBusy().has(account.id) || this.isFollowing(account)) return;
    this.followBusy.update((busy) => new Set(busy).add(account.id));
    this.followErrors.update((errors) => {
      const next = new Map(errors);
      next.delete(account.id);
      return next;
    });
    try {
      if (this.direction().target === 'bluesky') {
        await firstValueFrom(this.graph.follow(didOf(account.id)));
      } else {
        await firstValueFrom(this.api.follow(account.id));
      }
      this.following.update((following) => new Set(following).add(account.id));
    } catch {
      this.followErrors.update((errors) =>
        new Map(errors).set(account.id, 'Could not follow this account.'),
      );
    } finally {
      this.followBusy.update((busy) => {
        const next = new Set(busy);
        next.delete(account.id);
        return next;
      });
    }
  }

  // --- the source walk ---

  private async readSourceFollows(): Promise<Account[]> {
    return this.direction().source === 'mastodon'
      ? this.readMastodonFollows()
      : this.readBlueskyFollows();
  }

  /**
   * Walk `/accounts/{id}/following` by its **Link header** cursor.
   *
   * `accountFollowingPage`, never `accountFollowing`: `/following` paginates by
   * an internal relationship id that appears nowhere in the account objects it
   * returns, so guessing `max_id` from the last account re-reads page one
   * forever. `api.ts` documents the trap; a bulk walker is exactly the code that
   * falls into it.
   */
  private async readMastodonFollows(): Promise<Account[]> {
    const me = this.auth.account();
    if (!me) throw new Error('no-source-account');
    const accounts: Account[] = [];
    const seen = new Set<string>();
    let maxId: string | undefined;
    for (let page = 0; page < MAX_SOURCE_PAGES; page++) {
      const result = await firstValueFrom(
        this.api.accountFollowingPage(me.id, maxId, MASTODON_PAGE),
      );
      this.sourcePageCount.update((count) => count + 1);
      for (const account of result.accounts) {
        if (!seen.has(account.id)) {
          seen.add(account.id);
          accounts.push(account);
        }
      }
      if (!result.nextMaxId || result.nextMaxId === maxId) break;
      maxId = result.nextMaxId;
    }
    return accounts;
  }

  /**
   * Walk `getFollows`, addressing the viewer by handle.
   *
   * `actor` takes a handle or a DID, and `Auth.account().acct` is the handle for
   * a Bluesky-primary account (see `adaptProfile`). The DID would be equivalent
   * but lives behind a private signal on `Auth`.
   */
  private async readBlueskyFollows(): Promise<Account[]> {
    const actor = this.auth.account()?.acct;
    if (!actor) throw new Error('no-source-account');
    const accounts: Account[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_SOURCE_PAGES; page++) {
      const result: BskyFollows = await firstValueFrom(this.bsky.getFollows(actor, cursor));
      this.sourcePageCount.update((count) => count + 1);
      for (const profile of result.follows ?? []) {
        const account = adaptProfile(profile);
        if (!seen.has(account.id)) {
          seen.add(account.id);
          accounts.push(account);
        }
      }
      const next = result.cursor ?? null;
      if (!next || next === cursor) break;
      cursor = next;
    }
    return accounts;
  }

  // --- pass 1: the free pass ---

  /**
   * Read handles out of bios the follow list already returned, then confirm
   * them in batches.
   *
   * The confirmation is what turns a claim into an account, and it is the only
   * cost. Bluesky confirms 25 handles per `getProfiles`; Mastodon has no batch
   * lookup, so it spends one `lookupAccount` each — still a lookup rather than a
   * search, and only for people who published the handle themselves.
   */
  private async freePass(): Promise<void> {
    const target = this.direction().target;
    const clues = new Map<number, string>();
    for (const [index, row] of this.rows().entries()) {
      const clue = handleInText(searchableProfileText(row.person), target);
      if (clue) {
        clues.set(index, clue.handle);
        this.patch(index, { clue: clue.handle });
      }
    }
    if (clues.size === 0) return;

    if (target === 'bluesky') {
      await this.confirmBlueskyClues(clues);
    } else {
      await this.confirmMastodonClues(clues);
    }
  }

  private async confirmBlueskyClues(clues: Map<number, string>): Promise<void> {
    const entries = [...clues.entries()];
    for (let start = 0; start < entries.length; start += PROFILE_BATCH) {
      if (this.stopRequested) break;
      const batch = entries.slice(start, start + PROFILE_BATCH);
      this.confirmCount.update((count) => count + 1);
      try {
        const result = await firstValueFrom(this.bsky.getProfiles(batch.map(([, h]) => h)));
        const byHandle = new Map(
          (result.profiles ?? []).map((profile) => [profile.handle.toLowerCase(), profile]),
        );
        for (const [index, handle] of batch) {
          const profile = byHandle.get(handle);
          if (!profile) {
            this.patch(index, { status: 'failed', error: 'That Bluesky handle no longer exists.' });
            continue;
          }
          this.graph.remember(profile.did, profile.viewer?.following);
          if (profile.viewer?.following) {
            this.following.update((following) => new Set(following).add(`bsky:${profile.did}`));
          }
          this.completeFree(index, adaptProfile(profile));
        }
      } catch {
        for (const [index] of batch) {
          this.patch(index, {
            status: 'failed',
            error: 'Could not confirm the handle in their bio.',
          });
        }
      }
    }
  }

  private async confirmMastodonClues(clues: Map<number, string>): Promise<void> {
    for (const [index, handle] of clues) {
      if (this.stopRequested) break;
      this.confirmCount.update((count) => count + 1);
      try {
        const account = await firstValueFrom(this.api.lookupAccount(handle));
        this.completeFree(index, account);
      } catch {
        this.patch(index, {
          status: 'failed',
          error: 'Your server could not find the account named in their bio.',
        });
      }
    }
  }

  /**
   * Record a pass-1 hit.
   *
   * `exact` because the person published the link themselves — there is nothing
   * inferred here, which is exactly the distinction between a match *kind* and a
   * high score. A verified rel=me field is called out separately because the
   * server checked it rather than taking anyone's word.
   */
  private completeFree(index: number, account: Account): void {
    const row = this.rows()[index];
    if (!row) return;
    const evidence = verifiedLinkTo(row.person, row.clue ?? '')
      ? 'Verified link in their profile'
      : 'They published this handle in their bio';
    const confidence: BridgeConfidence = 'exact';
    this.patch(index, {
      status: 'complete',
      matches: [{ account, signals: [evidence], confidence }],
    });
    this.freeMatchCount.update((count) => count + 1);
  }

  // --- pass 2: the paid pass ---

  private async searchRow(index: number): Promise<void> {
    const row = this.rows()[index];
    const query = row.person.display_name?.trim() || row.person.username;
    if (!query) {
      this.patch(index, { status: 'complete', matches: [] });
      return;
    }
    this.patch(index, { status: 'searching', error: undefined });
    this.callCount.update((count) => count + 1);
    try {
      const candidates = await this.searchTarget(query);
      const matches = candidates
        .map((candidate) => rankBridgeCandidate(row.person, candidate))
        .filter((match) => match.signals.length > 0)
        .sort(compareMatches)
        .slice(0, 5);
      this.patch(index, { status: 'complete', matches });
    } catch (error: unknown) {
      const status = (error as HttpErrorResponse)?.status;
      this.patch(index, {
        status: 'failed',
        error:
          status === 429
            ? 'Rate limited. Try again in a few minutes.'
            : 'The search request failed.',
      });
      // A rate limit will not clear within the scan, so stop spending on it.
      if (status === 429) this.stopRequested = true;
    }
    if (!this.stopRequested && this.delayMs) await delay(this.delayMs);
  }

  private async searchTarget(query: string): Promise<Account[]> {
    if (this.direction().target === 'bluesky') {
      const result = await firstValueFrom(this.bsky.searchActors(query, null));
      // searchActors returns profileViews with bio but no counts. The counts are
      // not a matching signal, so this deliberately skips the getProfiles
      // hydration the search page does — it would double the pass's cost.
      return (result.actors ?? []).map(adaptProfile);
    }
    const result = await firstValueFrom(
      this.api.search(query, 'accounts', { resolve: false, limit: 10 }),
    );
    return result.accounts ?? [];
  }

  // --- follow state ---

  /**
   * Which matches the user already follows, so the list does not offer to
   * re-follow them.
   *
   * Bluesky's follow state arrives free with `getProfiles` during pass 1, so
   * only the Mastodon side needs a call here — and it batches 80 to a request.
   */
  private async loadFollowState(): Promise<void> {
    if (this.direction().target !== 'mastodon') return;
    const ids = [
      ...new Set(
        this.rows()
          .flatMap((row) => row.matches)
          .map((match) => match.account.id)
          .filter((id) => id && !this.following().has(id)),
      ),
    ];
    for (let index = 0; index < ids.length; index += 80) {
      try {
        const batch = await firstValueFrom(this.api.relationships(ids.slice(index, index + 80)));
        this.following.update((following) => {
          const next = new Set(following);
          for (const relationship of batch) {
            if (relationship.following) next.add(relationship.id);
          }
          return next;
        });
      } catch {
        // The list stays useful without it; a re-follow is a no-op server-side.
      }
    }
  }

  private patch(index: number, changes: Partial<BridgeRow>): void {
    this.rows.update((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row)),
    );
  }
}

/** `bsky:did:plc:…` → `did:plc:…`; the graph writes take a bare DID. */
function didOf(id: string): string {
  return id.startsWith('bsky:') ? id.slice('bsky:'.length) : id;
}

function describeLoadError(error: unknown, source: BridgeNetwork): string {
  if (error instanceof Error && error.message === 'no-source-account') {
    return 'Could not tell which account to read follows from.';
  }
  const status = (error as HttpErrorResponse)?.status;
  if (status === 429) return 'Rate limited while reading your follow list. Try again shortly.';
  return source === 'mastodon'
    ? 'Could not read who you follow on Mastodon.'
    : 'Could not read who you follow on Bluesky.';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
