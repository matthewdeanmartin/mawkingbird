import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { Account } from '../platform/api/models';
import { OriginReads } from '../reading/origin/origin-reads';
import { AnonymousPublicApi } from './anonymous/anonymous-public-api';
import { describeError } from './bulk-actions';
import { FollowState, RELATIONSHIP_BATCH } from './follow-state';
import { InteractionDecayScan } from './interaction-decay-scan';
import { Evidence, batches, behaviorOf, rank } from './new-people';

/** Followers per page. */
export const PAGE = 80;
/** People whose posts one click checks (one request each). */
export const CHECK_STEP = 20;
/** Posts read per person. */
const POSTS = 40;

export interface NewPeopleState {
  phase: 'loading' | 'ready' | 'checking' | 'failed';
  accountId: string;
  /** Followers read so far. */
  read: number;
  /** People you don't follow back, in display order. */
  people: Evidence[];
  /** Where older followers continue; null at the end. */
  cursor: string | null;
  /** Post checks done and planned in the current run. */
  checked: number;
  toCheck: number;
  /** People whose posts could not be read. */
  unreadable: ReadonlySet<string>;
  error?: string;
}

/**
 * Finds recent followers you don't follow back and gathers evidence on them.
 *
 * Loading a page costs one followers request plus two batches per 40 people.
 * Posts are read only on request, one request per person. A root service, so
 * results survive leaving the tab; nothing is stored.
 */
@Injectable({ providedIn: 'root' })
export class NewPeopleScan {
  private readonly api = inject(Api);
  private readonly follows = inject(FollowState);
  private readonly decay = inject(InteractionDecayScan);
  private readonly origin = inject(OriginReads);
  private readonly publicApi = inject(AnonymousPublicApi);

  readonly state = signal<NewPeopleState | null>(null);
  readonly busy = computed(() => {
    const phase = this.state()?.phase;
    return phase === 'loading' || phase === 'checking';
  });

  private cancelRequested = false;

  cancel(): void {
    this.cancelRequested = true;
  }

  /** The newest followers, or (with `more`) the next older page. */
  async load(accountId: string, more = false): Promise<void> {
    const before = this.state();
    if (this.busy()) {
      return;
    }
    const keep = more && before?.accountId === accountId ? before : null;
    if (more && !keep?.cursor) {
      return;
    }
    this.state.set({
      phase: 'loading',
      accountId,
      read: keep?.read ?? 0,
      people: keep?.people ?? [],
      cursor: keep?.cursor ?? null,
      checked: 0,
      toCheck: 0,
      unreadable: keep?.unreadable ?? new Set(),
    });
    try {
      const page = await firstValueFrom(
        this.api.accountFollowersPage(accountId, keep?.cursor ?? undefined, PAGE),
      );
      const known = new Set(this.state()!.people.map((e) => e.account.id));
      const accounts = page.accounts.filter((a) => a.id !== accountId && !known.has(a.id));
      await this.follows.resolve(accounts.map((a) => a.id));
      // An unknown relationship is left out: the list promises "not followed".
      const strangers = accounts.filter((a) => {
        const rel = this.follows.relationship(a.id);
        return !!rel && !rel.following && !rel.requested && !rel.blocking && !rel.muting;
      });
      const familiar = await this.familiar(strangers.map((a) => a.id));
      const added = strangers.map((a) => this.evidence(accountId, a, familiar.get(a.id) ?? null));
      this.patch((s) => {
        const people = this.withBatches([...s.people, ...added]);
        return {
          ...s,
          phase: 'ready',
          read: s.read + page.accounts.length,
          people: rank(people),
          // A page with nobody new means the cursor is going in circles.
          cursor: accounts.length ? page.nextMaxId : null,
        };
      });
    } catch (error) {
      this.patch((s) => ({ ...s, phase: 'failed', error: describeError(error) }));
    }
  }

  /** Read the posts of the next {@link CHECK_STEP} people not checked yet. */
  async checkPosts(): Promise<void> {
    const start = this.state();
    if (!start || this.busy()) {
      return;
    }
    const queue = this.unchecked().slice(0, CHECK_STEP);
    if (!queue.length) {
      return;
    }
    this.cancelRequested = false;
    this.patch((s) => ({ ...s, phase: 'checking', checked: 0, toCheck: queue.length }));
    for (const { account } of queue) {
      if (this.cancelRequested) {
        break;
      }
      try {
        const posts = await firstValueFrom(
          this.api.getAccountStatuses(account.id, { limit: POSTS }),
        );
        this.update(account.id, { behavior: behaviorOf(posts), behaviorFrom: null });
      } catch {
        this.patch((s) => ({ ...s, unreadable: new Set([...s.unreadable, account.id]) }));
      }
      this.patch((s) => ({ ...s, checked: s.checked + 1 }));
    }
    // Re-ranked once at the end, so rows don't jump while being read.
    this.patch((s) => ({ ...s, phase: 'ready', people: rank(s.people) }));
  }

  /** People whose posts have not been read, in display order. */
  readonly unchecked = computed(() => {
    const s = this.state();
    return (s?.people ?? []).filter((e) => !e.behavior && !s!.unreadable.has(e.account.id));
  });

  /**
   * Whether this person's own server may be asked. Only for a remote account
   * and only when the reader allowed reads from other servers in Settings.
   */
  canAskOrigin(e: Evidence): boolean {
    return !e.behaviorFrom && this.origin.originOfAccount(e.account) !== null;
  }

  /** Read their posts from their own server. False when it won't answer. */
  async askOrigin(e: Evidence): Promise<boolean> {
    const server = this.origin.originOfAccount(e.account);
    if (!server) {
      return false;
    }
    try {
      const found = await firstValueFrom(this.publicApi.lookupAccount(server, e.account.username));
      const posts = await firstValueFrom(
        this.publicApi.getAccountStatuses({ server, id: found.id }, { limit: POSTS }),
      );
      this.update(e.account.id, {
        behavior: behaviorOf(posts),
        behaviorFrom: new URL(server).hostname,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Who you follow that follows each of them; an absent id is unknown. */
  private async familiar(ids: string[]): Promise<Map<string, Account[]>> {
    const out = new Map<string, Account[]>();
    try {
      for (let i = 0; i < ids.length; i += RELATIONSHIP_BATCH) {
        const batch = ids.slice(i, i + RELATIONSHIP_BATCH);
        for (const row of await firstValueFrom(this.api.familiarFollowersOf(batch))) {
          out.set(row.id, row.accounts);
        }
      }
    } catch {
      // Servers without the endpoint: vouching is unknown, not zero.
    }
    return out;
  }

  private evidence(me: string, account: Account, familiar: Account[] | null): Evidence {
    const run = this.decay.state();
    const log = run?.accountId === me ? run.log : undefined;
    const followedAt = log?.firstFollow.get(account.id) ?? null;
    const replies = (log?.reactions ?? []).filter(
      (r) => r.kind === 'replies' && r.personId === account.id,
    );
    return {
      account,
      familiar,
      repliedToYou: replies.length > 0,
      repliedBeforeFollowing: followedAt !== null && replies.some((r) => r.at < followedAt),
      followedAt,
      behavior: null,
      behaviorFrom: null,
      arrivedTogether: 0,
      remote: account.acct.includes('@'),
    };
  }

  private withBatches(people: Evidence[]): Evidence[] {
    const found = batches(people.map((e) => e.account));
    return people.map((e) => ({ ...e, arrivedTogether: found.get(e.account.id) ?? 0 }));
  }

  private update(id: string, changes: Partial<Evidence>): void {
    this.patch((s) => ({
      ...s,
      people: s.people.map((e) => (e.account.id === id ? { ...e, ...changes } : e)),
    }));
  }

  private patch(change: (state: NewPeopleState) => NewPeopleState): void {
    this.state.update((s) => (s ? change(s) : s));
  }
}
