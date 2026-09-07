import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, map, Observable, of } from 'rxjs';
import { accountScopeSuffix, scopedKey } from './account-scope';
import { Api } from './api';
import { Auth } from './auth';
import { ClientPrefs, homeWindowMs } from './client-prefs';
import { Account, Status, UserList } from './models';
import { AnonymousFollow, AnonymousFollows } from './providers/anonymous/anonymous-follows';
import { AnonymousLists } from './providers/anonymous/anonymous-lists';
import {
  AnonymousFollowFeedSession,
  AnonymousMastodonProvider,
} from './providers/anonymous/anonymous-mastodon-provider';
import { Server } from './server';
import { DiagnosticLog } from './diagnostic-log';

const STORAGE_KEY_BASE = 'mockingbird_just_my_server';
export const JUST_MY_SERVER_LIST_PREFIX = 'Mawkingbird: People on ';
const PAGE_SIZE = 20;
const ACCOUNT_PAGE_SIZE = 80;
const MAX_PAGES = 100;
const MEMBERSHIP_BATCH_SIZE = 50;

interface StoredState {
  enabled?: boolean;
  listId?: string;
  host?: string;
}

export interface ServerListUpdatePlan {
  listId: string | null;
  addIds: string[];
  removeIds: string[];
  alreadyPresent: number;
}

export interface ServerListUpdateResult {
  added: number;
  removed: number;
  alreadyPresent: number;
  failed: number;
}

interface AppliedMastodonUpdate extends ServerListUpdateResult {
  listId: string;
}

/** Convert a URL, domain, or handle host into one stable instance identifier. */
export function normalizeInstanceHost(value: string): string {
  const trimmed = value.trim().replace(/^@/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.port ? `${hostname}:${url.port}` : hostname;
  } catch {
    return trimmed.toLowerCase().replace(/\.$/, '').replace(/\/+$/, '');
  }
}

/** Host advertised by an account, treating a bare acct as local to its API server. */
export function accountInstanceHost(account: Account, homeHost: string): string {
  const acct = typeof account.acct === 'string' ? account.acct : '';
  const at = acct.lastIndexOf('@');
  if (at >= 0 && at < acct.length - 1) {
    return normalizeInstanceHost(acct.slice(at + 1));
  }
  if (acct && !acct.includes('@')) {
    return normalizeInstanceHost(homeHost);
  }
  try {
    return normalizeInstanceHost(new URL(account.url).host);
  } catch {
    return normalizeInstanceHost(homeHost);
  }
}

export function accountIsOnServer(account: Account, homeHost: string): boolean {
  return accountInstanceHost(account, homeHost) === normalizeInstanceHost(homeHost);
}

/** Keep originals and boosts only when the displayed author belongs to the home instance. */
export function serverOnlyStatuses(statuses: Status[], homeHost: string): Status[] {
  return statuses.filter((status) =>
    accountIsOnServer(status.reblog?.account ?? status.account, homeHost),
  );
}

/** Owns the generated same-instance list, its account-scoped mode, and its feed cursor. */
@Injectable({ providedIn: 'root' })
export class JustMyServer {
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);
  private prefs = inject(ClientPrefs);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymousLists = inject(AnonymousLists);
  private anonymousProvider = inject(AnonymousMastodonProvider);
  private diagnostics = inject(DiagnosticLog);

  readonly enabled = signal(false);
  readonly checking = signal(false);
  readonly ready = signal(false);
  readonly listId = signal<string | null>(null);
  readonly preparing = signal(false);
  readonly updating = signal(false);
  readonly dialogOpen = signal(false);
  readonly plan = signal<ServerListUpdatePlan | null>(null);
  readonly completed = signal(0);
  readonly total = signal(0);
  readonly result = signal<ServerListUpdateResult | null>(null);
  readonly error = signal('');
  readonly hasMore = signal(false);
  readonly droppedByWindow = signal(0);

  readonly homeHost = computed(() => {
    const acct = this.auth.account()?.acct ?? '';
    const at = acct.lastIndexOf('@');
    if (at >= 0 && at < acct.length - 1) {
      return normalizeInstanceHost(acct.slice(at + 1));
    }
    const base = this.server.baseUrl();
    if (base) return normalizeInstanceHost(base);
    return typeof location === 'undefined' ? '' : normalizeInstanceHost(location.host);
  });

  readonly listTitle = computed(
    () => `${JUST_MY_SERVER_LIST_PREFIX}${this.homeHost() || 'server'}`,
  );
  readonly effectiveEnabled = computed(
    () => this.auth.isAuthenticated && this.enabled() && this.ready(),
  );
  readonly progressLabel = computed(() => {
    if (!this.updating()) return '';
    return `${this.completed()} of ${this.total()}`;
  });

  private identity = '\u0000';
  private context = '\u0000';
  private checkGeneration = 0;
  private maxId: string | undefined;
  private exhausted = true;
  private cutoff: number | null = null;
  private anonymousFeed: AnonymousFollowFeedSession | null = null;

  constructor() {
    effect(() => {
      this.auth.mode();
      this.auth.token();
      this.server.baseUrl();
      const nextIdentity = accountScopeSuffix();
      const nextContext = `${nextIdentity}|${this.homeHost()}`;
      if (nextIdentity !== this.identity) {
        this.identity = nextIdentity;
        this.loadEnabled();
      }
      if (nextContext !== this.context) {
        this.context = nextContext;
        this.checkGeneration += 1;
        this.ready.set(false);
        this.listId.set(null);
        this.result.set(null);
        this.error.set('');
        this.dialogOpen.set(false);
        this.plan.set(null);
        this.loadListReference();
      }
    });
  }

  setEnabled(on: boolean): void {
    if (on && !this.ready()) return;
    this.enabled.set(on);
    this.persistState();
  }

  /** Revalidate a remembered list before crossing from the normal feed into it. */
  requestEnabled(on: boolean): void {
    if (!on) {
      this.setEnabled(false);
      return;
    }
    if (this.auth.isAnonymous) {
      this.checkList();
      if (this.ready()) this.setEnabled(true);
      return;
    }
    const generation = ++this.checkGeneration;
    this.checking.set(true);
    this.api.lists().subscribe({
      next: (lists) => {
        const id = this.findList(lists)?.id ?? null;
        this.finishCheck(generation, id);
        if (id) this.setEnabled(true);
      },
      error: () => {
        if (generation !== this.checkGeneration) return;
        this.checking.set(false);
        this.error.set('Could not check your server list.');
      },
    });
  }

  /** Discover the generated list without changing its membership. */
  checkList(): void {
    const generation = ++this.checkGeneration;
    this.checking.set(true);
    this.ready.set(false);
    this.listId.set(null);
    this.error.set('');
    if (!this.auth.isAuthenticated || !this.homeHost()) {
      this.checking.set(false);
      return;
    }
    if (this.auth.isAnonymous) {
      const list = this.findAnonymousList();
      this.finishCheck(generation, list?.id ?? null);
      return;
    }
    this.api.lists().subscribe({
      next: (lists) => this.finishCheck(generation, this.findList(lists)?.id ?? null),
      error: () => {
        if (generation !== this.checkGeneration) return;
        this.checking.set(false);
        this.error.set('Could not check your server list.');
      },
    });
  }

  /** Calculate the exact add/remove operation, then ask the user to approve it. */
  async prepareUpdate(): Promise<void> {
    if (this.preparing() || this.updating()) return;
    this.preparing.set(true);
    this.result.set(null);
    this.error.set('');
    try {
      const updatePlan = this.auth.isAnonymous
        ? this.prepareAnonymousUpdate()
        : await this.prepareMastodonUpdate();
      this.plan.set(updatePlan);
      this.dialogOpen.set(true);
    } catch {
      this.error.set('Could not inspect all friends and list members. Nothing was changed.');
    } finally {
      this.preparing.set(false);
    }
  }

  closeDialog(): void {
    if (!this.updating()) {
      this.dialogOpen.set(false);
      this.plan.set(null);
    }
  }

  async confirmUpdate(): Promise<void> {
    const updatePlan = this.plan();
    if (!updatePlan || this.updating()) return;
    this.updating.set(true);
    this.completed.set(0);
    this.total.set(updatePlan.addIds.length + updatePlan.removeIds.length);
    this.error.set('');
    this.ready.set(false);
    this.diagnostics.write('info', 'Just My Server', 'Synchronization started.', {
      listId: updatePlan.listId,
      plannedAdds: updatePlan.addIds.length,
      plannedRemovals: updatePlan.removeIds.length,
    });
    try {
      const applied = this.auth.isAnonymous
        ? {
            listId: this.applyAnonymousUpdate(updatePlan),
            added: updatePlan.addIds.length,
            removed: updatePlan.removeIds.length,
            alreadyPresent: updatePlan.alreadyPresent,
            failed: 0,
          }
        : await this.applyMastodonUpdate(updatePlan);
      const { listId, ...result } = applied;
      this.listId.set(listId);
      this.ready.set(true);
      this.persistState();
      this.result.set(result);
      this.dialogOpen.set(false);
      this.plan.set(null);
      this.diagnostics.write('info', 'Just My Server', 'Synchronization finished.', result);
    } catch (cause: unknown) {
      this.diagnostics.write('error', 'Just My Server', 'Synchronization stopped.', {
        listId: updatePlan.listId,
        completed: this.completed(),
        total: this.total(),
        status: this.errorStatus(cause),
        cause,
      });
      this.result.set({
        added: 0,
        removed: 0,
        alreadyPresent: 0,
        failed: Math.max(1, this.total() - this.completed()),
      });
      this.error.set('The update stopped before the list was complete. Run it again to repair it.');
    } finally {
      this.updating.set(false);
    }
  }

  /** Reset the special feed independently of the normal multi-provider Home feed. */
  resetFeed(): void {
    const windowMs = homeWindowMs(this.prefs.homeWindow());
    this.cutoff = windowMs === null ? null : Date.now() - windowMs;
    this.droppedByWindow.set(0);
    this.maxId = undefined;
    this.exhausted = !this.effectiveEnabled();
    this.hasMore.set(!this.exhausted);
    this.anonymousFeed = null;
    if (this.auth.isAnonymous && !this.exhausted) {
      const keys = new Set(this.findAnonymousList()?.memberKeys ?? []);
      const follows = this.anonymousFollows.follows().filter((follow) => keys.has(follow.key));
      this.anonymousFeed = this.anonymousProvider.createFollowFeed(follows, (status) =>
        this.withinWindow(status),
      );
      this.hasMore.set(follows.length > 0);
    }
  }

  nextPage(): Observable<Status[]> {
    if (this.exhausted || !this.listId()) return of([]);
    if (this.auth.isAnonymous) {
      const feed = this.anonymousFeed;
      if (!feed) return of([]);
      return feed.fetchPage().pipe(
        map((page) => {
          this.exhausted = !page.hasMore;
          this.hasMore.set(page.hasMore);
          return serverOnlyStatuses(page.statuses, this.homeHost());
        }),
      );
    }
    return this.api.listTimeline(this.listId()!, this.maxId, PAGE_SIZE).pipe(
      map((statuses) => {
        this.maxId = statuses.at(-1)?.id ?? this.maxId;
        if (statuses.length < PAGE_SIZE) this.exhausted = true;
        const fresh = statuses.filter((status) => this.withinWindow(status));
        if (fresh.length < statuses.length) this.exhausted = true;
        this.hasMore.set(!this.exhausted);
        return serverOnlyStatuses(fresh, this.homeHost());
      }),
    );
  }

  private withinWindow(status: Status): boolean {
    if (this.cutoff === null) return true;
    const timestamp = Date.parse(status.created_at);
    const allowed = Number.isNaN(timestamp) || timestamp === 0 || timestamp >= this.cutoff;
    if (!allowed) this.droppedByWindow.update((count) => count + 1);
    return allowed;
  }

  private loadEnabled(): void {
    let stored: StoredState = {};
    try {
      stored = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY_BASE)) ?? '{}') as StoredState;
    } catch {
      // Corrupt state falls back to the deliberately-off default.
    }
    this.enabled.set(stored.enabled === true);
  }

  private loadListReference(): void {
    let stored: StoredState;
    try {
      stored = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY_BASE)) ?? '{}') as StoredState;
    } catch {
      return;
    }
    if (
      !this.enabled() &&
      typeof stored.listId === 'string' &&
      normalizeInstanceHost(stored.host ?? '') === this.homeHost()
    ) {
      this.listId.set(stored.listId);
      this.ready.set(true);
    }
  }

  private persistState(): void {
    localStorage.setItem(
      scopedKey(STORAGE_KEY_BASE),
      JSON.stringify({
        enabled: this.enabled(),
        listId: this.listId(),
        host: this.homeHost(),
      }),
    );
  }

  private finishCheck(generation: number, id: string | null): void {
    if (generation !== this.checkGeneration) return;
    this.listId.set(id);
    this.ready.set(id !== null);
    this.checking.set(false);
    if (id) this.persistState();
  }

  private findList(lists: UserList[]): UserList | undefined {
    const wanted = this.listTitle().toLocaleLowerCase();
    return lists.find((list) => list.title.trim().toLocaleLowerCase() === wanted);
  }

  private findAnonymousList() {
    const wanted = this.listTitle().toLocaleLowerCase();
    return this.anonymousLists
      .lists()
      .find((list) => list.title.trim().toLocaleLowerCase() === wanted);
  }

  private followIsOnServer(follow: AnonymousFollow): boolean {
    return (
      normalizeInstanceHost(follow.handle.split('@').at(-1) ?? follow.server) === this.homeHost()
    );
  }

  private prepareAnonymousUpdate(): ServerListUpdatePlan {
    const list = this.findAnonymousList();
    const currentKeys = new Set(list?.memberKeys ?? []);
    const target = this.anonymousFollows
      .follows()
      .filter((follow) => this.followIsOnServer(follow));
    const targetKeys = new Set(target.map((follow) => follow.key));
    return {
      listId: list?.id ?? null,
      addIds: target.filter((follow) => !currentKeys.has(follow.key)).map((follow) => follow.key),
      removeIds: [...currentKeys].filter((key) => !targetKeys.has(key)),
      alreadyPresent: target.filter((follow) => currentKeys.has(follow.key)).length,
    };
  }

  private async prepareMastodonUpdate(): Promise<ServerListUpdatePlan> {
    const [lists, following] = await Promise.all([
      firstValueFrom(this.api.lists()),
      this.fetchAllFollowing(),
    ]);
    const list = this.findList(lists);
    const current = list ? await this.fetchAllListMembers(list.id) : [];
    const target = this.uniqueAccounts(
      following.filter((account) => accountIsOnServer(account, this.homeHost())),
    );
    const currentIds = new Set(current.map((account) => account.id));
    const targetIds = new Set(target.map((account) => account.id));
    return {
      listId: list?.id ?? null,
      addIds: target.filter((account) => !currentIds.has(account.id)).map((account) => account.id),
      removeIds: current
        .filter((account) => !targetIds.has(account.id))
        .map((account) => account.id),
      alreadyPresent: target.filter((account) => currentIds.has(account.id)).length,
    };
  }

  private applyAnonymousUpdate(updatePlan: ServerListUpdatePlan): string {
    const list = updatePlan.listId
      ? this.anonymousLists.get(updatePlan.listId)
      : this.anonymousLists.create(this.listTitle());
    if (!list) throw new Error('Anonymous list disappeared.');
    for (const key of updatePlan.removeIds) {
      this.anonymousLists.setMember(list.id, key, false);
      this.completed.update((count) => count + 1);
    }
    for (const key of updatePlan.addIds) {
      this.anonymousLists.setMember(list.id, key, true);
      this.completed.update((count) => count + 1);
    }
    return list.id;
  }

  private async applyMastodonUpdate(
    updatePlan: ServerListUpdatePlan,
  ): Promise<AppliedMastodonUpdate> {
    const listId =
      updatePlan.listId ?? (await firstValueFrom(this.api.createList(this.listTitle()))).id;

    // The confirmation dialog is a preview, not a lock. Re-read immediately
    // before mutating so a list changed in another tab cannot make an add batch
    // contain an account that is already present (Mastodon rejects the whole
    // batch with 422 in that case).
    let currentIds = new Set((await this.fetchAllListMembers(listId)).map((account) => account.id));
    const removeIds = [...new Set(updatePlan.removeIds)];
    const addIds = [...new Set(updatePlan.addIds)];
    this.completed.update(
      (count) =>
        count +
        (updatePlan.removeIds.length - removeIds.length) +
        (updatePlan.addIds.length - addIds.length),
    );

    const removals = removeIds.filter((id) => currentIds.has(id));
    this.completed.update((count) => count + (removeIds.length - removals.length));
    await this.applyBatches(removals, (ids) => this.api.removeManyFromList(listId, ids));

    currentIds = new Set((await this.fetchAllListMembers(listId)).map((account) => account.id));
    const additions = addIds.filter((id) => !currentIds.has(id));
    const newlyPresent = addIds.length - additions.length;
    this.diagnostics.write('info', 'Just My Server', 'Reconciled current membership.', {
      currentMembers: currentIds.size,
      removals: removals.length,
      additions: additions.length,
      alreadyPresentSincePreview: newlyPresent,
    });
    this.completed.update((count) => count + newlyPresent);
    const added = await this.applyAddBatches(listId, additions);
    return {
      listId,
      added: added.added,
      removed: removals.length,
      alreadyPresent: updatePlan.alreadyPresent + newlyPresent + added.alreadyPresent,
      failed: 0,
    };
  }

  /**
   * Add unique, known-absent ids in batches. If another client races us and a
   * batch gets 422, reconcile and finish its still-missing ids individually.
   */
  private async applyAddBatches(
    listId: string,
    accountIds: string[],
  ): Promise<{ added: number; alreadyPresent: number }> {
    let added = 0;
    let alreadyPresent = 0;
    for (let index = 0; index < accountIds.length; index += MEMBERSHIP_BATCH_SIZE) {
      const batch = accountIds.slice(index, index + MEMBERSHIP_BATCH_SIZE);
      try {
        await firstValueFrom(this.api.addManyToList(listId, batch));
        added += batch.length;
        this.completed.update((count) => count + batch.length);
      } catch (cause: unknown) {
        this.diagnostics.write(
          'warn',
          'Just My Server',
          'Add batch rejected; reconciling individually.',
          {
            batchSize: batch.length,
            status: this.errorStatus(cause),
          },
        );
        const current = new Set(
          (await this.fetchAllListMembers(listId)).map((account) => account.id),
        );
        const pending = batch.filter((id) => !current.has(id));
        const present = batch.length - pending.length;
        alreadyPresent += present;
        this.completed.update((count) => count + present);
        let rejectedAsPresent = 0;
        for (const id of pending) {
          try {
            await firstValueFrom(this.api.addManyToList(listId, [id]));
            added += 1;
            this.completed.update((count) => count + 1);
          } catch (error: unknown) {
            if (this.errorStatus(error) === 422) {
              alreadyPresent += 1;
              rejectedAsPresent += 1;
              this.completed.update((count) => count + 1);
              continue;
            }
            const afterFailure = new Set(
              (await this.fetchAllListMembers(listId)).map((account) => account.id),
            );
            if (!afterFailure.has(id)) throw error;
            alreadyPresent += 1;
            this.completed.update((count) => count + 1);
          }
        }
        if (rejectedAsPresent) {
          this.diagnostics.write(
            'info',
            'Just My Server',
            'Mastodon reported accounts already on the list.',
            {
              count: rejectedAsPresent,
            },
          );
        }
      }
    }
    return { added, alreadyPresent };
  }

  private async applyBatches(
    accountIds: string[],
    operation: (ids: string[]) => Observable<unknown>,
  ): Promise<void> {
    for (let index = 0; index < accountIds.length; index += MEMBERSHIP_BATCH_SIZE) {
      const batch = accountIds.slice(index, index + MEMBERSHIP_BATCH_SIZE);
      await firstValueFrom(operation(batch));
      this.completed.update((count) => count + batch.length);
    }
  }

  private async fetchAllFollowing(): Promise<Account[]> {
    const account = this.auth.account();
    if (!account) throw new Error('Not signed in.');
    const byId = new Map<string, Account>();
    let maxId: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await firstValueFrom(
        this.api.accountFollowingPage(account.id, maxId, ACCOUNT_PAGE_SIZE),
      );
      for (const followed of response.accounts) byId.set(followed.id, followed);
      if (!response.nextMaxId || !response.accounts.length) break;
      maxId = response.nextMaxId;
    }
    return [...byId.values()];
  }

  private async fetchAllListMembers(listId: string): Promise<Account[]> {
    const byId = new Map<string, Account>();
    let maxId: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await firstValueFrom(
        this.api.listAccountsPage(listId, maxId, ACCOUNT_PAGE_SIZE),
      );
      for (const account of response.accounts) byId.set(account.id, account);
      if (!response.nextMaxId || !response.accounts.length) break;
      maxId = response.nextMaxId;
    }
    return [...byId.values()];
  }

  private uniqueAccounts(accounts: Account[]): Account[] {
    return [...new Map(accounts.map((account) => [account.id, account])).values()];
  }

  private errorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
    const status = error.status;
    return typeof status === 'number' ? status : undefined;
  }
}
