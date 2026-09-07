import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, Subject, takeUntil } from 'rxjs';
import { scopeSuffixForMastodonAccount } from '../account-scope';
import { Api } from '../api';
import { Auth } from '../auth';
import { Account, Relationship, UserList } from '../models';
import { describeHttpError } from '../page-diagnostics';
import { RateLimitCoordinator } from '../rate-limit.interceptor';
import { Server } from '../server';
import {
  categorizePeople,
  PEOPLE_CATEGORIES,
  PEOPLE_LIST_TITLES,
  PeopleCategory,
  PeopleEvidence,
  recordPeopleEvidence,
} from './people-categories';

const STORAGE_KEY_BASE = 'mockingbird_people_lists';
const STALE_MS = 7 * 86_400_000;
const MAX_PAGES = 2000;
const SAMPLE_PAGES = 10;

interface StoredPeopleLists {
  ids: Partial<Record<PeopleCategory, string>>;
  evidence: Record<string, PeopleEvidence>;
  syncedAt?: number;
  followingCount?: number;
  onlyAdd?: boolean;
  dirty?: boolean;
}
export interface PeopleListsJob {
  phase: 'reading' | 'writing' | 'paused' | 'done' | 'cancelled' | 'failed';
  step: 'following' | 'relationships' | 'activity' | 'lists';
  requests: number;
  scanned: number;
  completed: number;
  added: number;
  removed: number;
  created: number;
  pausedUntil?: number;
  error?: string;
}
interface PeoplePage {
  accounts: Account[];
  nextMaxId: string | null;
  paginationKnown?: boolean;
  source?: string;
}

/** A user-started snapshot, not a background crawler. Navigation leaves the job
 * running; reload ends it. Only a fully read snapshot may drive removals.
 * Each write uses freshly discovered server lists and current membership.
 */
@Injectable({ providedIn: 'root' })
export class PeopleLists {
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);
  private rateLimits = inject(RateLimitCoordinator);
  private cancelled = new Subject<void>();
  private stopRequested = false;
  private owner = '';
  private jobOwner = signal('');
  private internalJob = signal<PeopleListsJob | null>(null);
  private revision = signal(0);
  /** Spacing is injectable in tests without making production hammer the server. */
  delayMs = 200;

  readonly eligible = computed(
    () => this.auth.kind() === 'mastodon' && !!this.auth.token() && !!this.auth.account(),
  );
  private context = computed(() =>
    JSON.stringify([
      this.auth.kind(),
      this.auth.account()?.id,
      this.server.baseUrl(),
      this.auth.token(),
    ]),
  );
  readonly job = computed(() => (this.jobOwner() === this.context() ? this.internalJob() : null));
  readonly running = computed(() => {
    const phase = this.internalJob()?.phase;
    return phase === 'reading' || phase === 'writing' || phase === 'paused';
  });
  readonly lastSync = computed(() => {
    this.context();
    this.revision();
    return this.readStored().syncedAt ?? null;
  });

  constructor() {
    effect(() => {
      const context = this.context();
      if (this.owner && context !== this.owner) this.stop();
    });
  }

  /** Server discovery is the authority even when this browser remembers IDs. */
  status(lists: UserList[], now = Date.now()): 'new' | 'missing' | 'stale' | 'fresh' | 'addOnly' {
    this.revision();
    const stored = this.readStored();
    const existing = PEOPLE_CATEGORIES.map((category) => this.findList(category, lists, stored));
    if (!stored.syncedAt && !Object.keys(stored.ids).length && !existing.some(Boolean))
      return 'new';
    if (existing.some((list) => !list)) return 'missing';
    if (
      stored.dirty ||
      !stored.syncedAt ||
      now - stored.syncedAt >= STALE_MS ||
      stored.followingCount !== this.auth.account()?.following_count ||
      PEOPLE_CATEGORIES.some((category, index) => stored.ids[category] !== existing[index]?.id)
    )
      return 'stale';
    return stored.onlyAdd ? 'addOnly' : 'fresh';
  }

  stop(): void {
    this.stopRequested = true;
    this.cancelled.next();
  }

  async start(onlyAdd = false): Promise<void> {
    if (this.running() || !this.eligible()) return;
    this.owner = this.context();
    this.jobOwner.set(this.owner);
    this.stopRequested = false;
    this.internalJob.set({
      phase: 'reading',
      step: 'following',
      requests: 0,
      scanned: 0,
      completed: 0,
      added: 0,
      removed: 0,
      created: 0,
    });
    const key = this.storageKey();
    const stored = this.readStored();
    try {
      const me = this.auth.account()!;
      const following = await this.walk(
        (cursor) => this.api.accountFollowingPage(me.id, cursor, 80),
        true,
      );
      this.patch({ step: 'relationships' });
      const relationships: Relationship[] = [];
      for (let i = 0; i < following.length; i += 40) {
        const batch = following.slice(i, i + 40);
        relationships.push(
          ...(await this.request(() => this.api.relationships(batch.map((account) => account.id)))),
        );
        // Some servers omit activity metadata from following pages. Hydrate in
        // batches where supported; older servers can return individual accounts.
        const missing = batch.filter((account) => account.last_status_at === undefined);
        if (missing.length) {
          let hydrated: Account[];
          try {
            hydrated = await this.request(() =>
              this.api.getAccounts(missing.map((account) => account.id)),
            );
          } catch (error) {
            if (!(error instanceof HttpErrorResponse) || ![404, 405].includes(error.status))
              throw error;
            hydrated = [];
            for (const account of missing)
              hydrated.push(await this.request(() => this.api.getAccount(account.id)));
          }
          const byId = new Map(hydrated.map((account) => [account.id, account]));
          for (const account of missing) Object.assign(account, byId.get(account.id) ?? {});
        }
      }
      this.patch({ step: 'activity' });
      // Fixed cost: at most ten pages each, never a timeline request per friend.
      const notifications = await this.sample((cursor) => this.api.notifications(cursor));
      const own = await this.sample((cursor) =>
        this.api.getAccountStatuses(me.id, { maxId: cursor, limit: 40 }),
      );
      const home = await this.sample((cursor) => this.api.homeTimeline(cursor));
      stored.evidence = recordPeopleEvidence(
        following,
        stored.evidence,
        notifications,
        own,
        home,
        me.id,
      );
      const targets = categorizePeople(following, relationships, stored.evidence);
      this.check();
      // A reload, cancellation, or failed write must never leave a "fresh" badge.
      stored.dirty = true;
      this.persist(key, stored);
      this.patch({ phase: 'writing', step: 'lists' });
      for (const category of PEOPLE_CATEGORIES) {
        await this.syncCategory(category, targets[category], stored, key, onlyAdd);
        this.patch({ completed: this.internalJob()!.completed + 1 });
      }
      this.check();
      // Verify all references once more, including lists deleted during the run.
      const finalLists = await this.request(() => this.api.lists());
      if (
        PEOPLE_CATEGORIES.some(
          (category) => !finalLists.some((list) => list.id === stored.ids[category]),
        )
      ) {
        throw new Error('A generated list disappeared during the update. Run Update to repair it.');
      }
      stored.syncedAt = Date.now();
      stored.followingCount = me.following_count;
      stored.onlyAdd = onlyAdd;
      stored.dirty = false;
      this.persist(key, stored);
      this.patch({ phase: 'done' });
    } catch (error) {
      this.patch({
        phase: this.stopRequested || this.owner !== this.context() ? 'cancelled' : 'failed',
        error: this.stopRequested ? undefined : describeHttpError(error),
      });
    } finally {
      this.owner = '';
    }
  }

  private async syncCategory(
    category: PeopleCategory,
    target: string[],
    stored: StoredPeopleLists,
    key: string,
    onlyAdd: boolean,
  ): Promise<void> {
    // Rediscover on each retry; a remembered ID can have been deleted anywhere.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const lists = await this.request(() => this.api.lists());
        let list = this.findList(category, lists, stored);
        if (!list) {
          list = await this.request(() => this.api.createList(PEOPLE_LIST_TITLES[category]));
          this.patch({ created: this.internalJob()!.created + 1 });
        }
        stored.ids[category] = list.id;
        this.persist(key, stored);
        const id = list.id;
        const current = new Set(
          (await this.walk((cursor) => this.api.listAccountsPage(id, cursor, 80))).map(
            (account) => account.id,
          ),
        );
        const wanted = new Set(target);
        // Add before removing: a failed add must not erase the previous snapshot.
        await this.batches(
          target.filter((accountId) => !current.has(accountId)),
          (ids) => this.api.addManyToList(id, ids),
          'added',
        );
        if (!onlyAdd)
          await this.batches(
            [...current].filter((accountId) => !wanted.has(accountId)),
            (ids) => this.api.removeManyFromList(id, ids),
            'removed',
          );
        const after = new Set(
          (await this.walk((cursor) => this.api.listAccountsPage(id, cursor, 80))).map(
            (account) => account.id,
          ),
        );
        if (
          target.some((accountId) => !after.has(accountId)) ||
          (!onlyAdd && [...after].some((accountId) => !wanted.has(accountId)))
        ) {
          throw new Error('List membership changed during the update. Run Update to reconcile it.');
        }
        return;
      } catch (error) {
        // 422 can mean a concurrent add, or an unfollow. Re-read and retry, but
        // never count an unexplained rejection as success.
        if (
          !(error instanceof HttpErrorResponse) ||
          ![404, 422].includes(error.status) ||
          attempt === 2
        )
          throw error;
      }
    }
  }

  private async batches(
    ids: string[],
    send: (ids: string[]) => Observable<unknown>,
    counter: 'added' | 'removed',
  ): Promise<void> {
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await this.request(() => send(batch));
      this.patch({ [counter]: this.internalJob()![counter] + batch.length });
    }
  }

  private async walk(
    fetch: (cursor?: string) => Observable<PeoplePage>,
    following = false,
  ): Promise<Account[]> {
    const accounts = new Map<string, Account>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.request(() => fetch(cursor));
      const before = accounts.size;
      for (const account of response.accounts) accounts.set(account.id, account);
      if (following) this.patch({ scanned: accounts.size });
      if (response.paginationKnown === false || response.source === 'account-id-fallback')
        throw new Error(
          'The server hid list pagination. Cannot safely synchronize an incomplete list.',
        );
      if (!response.nextMaxId) return [...accounts.values()];
      if (accounts.size === before || cursors.has(response.nextMaxId))
        throw new Error('Pagination did not advance. Nothing further was changed; try again.');
      cursors.add(response.nextMaxId);
      cursor = response.nextMaxId;
    }
    throw new Error(
      'The account scan was incomplete. Try again; no partial scan can remove members.',
    );
  }

  private async sample<T extends { id: string }>(
    fetch: (cursor?: string) => Observable<T[]>,
  ): Promise<T[]> {
    const items = new Map<string, T>();
    let cursor: string | undefined;
    for (let page = 0; page < SAMPLE_PAGES; page++) {
      const batch = await this.request(() => fetch(cursor));
      if (!batch.length) break;
      const before = items.size;
      for (const item of batch) items.set(item.id, item);
      if (items.size === before) throw new Error('Activity pagination did not advance. Try again.');
      cursor = batch.at(-1)!.id;
    }
    return [...items.values()];
  }

  private async request<T>(send: () => Observable<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      this.check();
      await this.wait(this.delayMs);
      this.patch({ requests: this.internalJob()!.requests + 1 });
      try {
        const result = await firstValueFrom(send().pipe(takeUntil(this.cancelled)));
        this.check();
        return result;
      } catch (error) {
        this.check();
        if (!(error instanceof HttpErrorResponse) || error.status !== 429 || attempt >= 5)
          throw error;
        const phase = this.internalJob()!.phase;
        const delay = this.rateLimits.retryDelayMs(error.headers) || 30_000;
        this.patch({ phase: 'paused', pausedUntil: Date.now() + delay });
        await this.wait(delay);
        this.patch({ phase, pausedUntil: undefined });
      }
    }
  }

  private async wait(ms: number): Promise<void> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(100, until - Date.now())));
      this.check();
    }
    this.check();
  }

  private check(): void {
    if (this.stopRequested || this.owner !== this.context()) throw new Error('Stopped.');
  }
  private patch(patch: Partial<PeopleListsJob>): void {
    this.internalJob.update((job) => (job ? { ...job, ...patch } : null));
  }
  private storageKey(): string {
    return (
      STORAGE_KEY_BASE +
      scopeSuffixForMastodonAccount(this.auth.account()?.id ?? '', this.server.baseUrl())
    );
  }
  private readStored(): StoredPeopleLists {
    try {
      const value = JSON.parse(
        localStorage.getItem(this.storageKey()) ?? 'null',
      ) as StoredPeopleLists | null;
      if (
        value &&
        value.ids &&
        value.evidence &&
        typeof value.ids === 'object' &&
        typeof value.evidence === 'object'
      )
        return value;
    } catch {
      /* Rebuild from canonical server titles when local metadata is absent. */
    }
    return { ids: {}, evidence: {} };
  }
  private persist(key: string, stored: StoredPeopleLists): void {
    this.check();
    localStorage.setItem(key, JSON.stringify(stored));
    this.revision.update((value) => value + 1);
  }
  private findList(
    category: PeopleCategory,
    lists: UserList[],
    stored: StoredPeopleLists,
  ): UserList | undefined {
    return (
      lists.find((list) => list.id === stored.ids[category]) ??
      lists.find(
        (list) => list.title.trim().toLowerCase() === PEOPLE_LIST_TITLES[category].toLowerCase(),
      )
    );
  }
}
