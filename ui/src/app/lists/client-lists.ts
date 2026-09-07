import { computed, inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../account-scope';
import { PageDiagnostics } from '../page-diagnostics';
import { Account, UserList } from '../models';

/**
 * Browser-local lists of accounts, for every session.
 *
 * ## Why this exists next to the server's own lists
 *
 * Mastodon's list API only accepts accounts you **follow**. That is a reasonable rule
 * for a server that has to fetch those timelines forever, and a bad fit for the way
 * people actually curate: a reading list of accounts you want to check on is not a
 * statement that you want them in your home feed. A client-side list has no such
 * restriction — anyone you can see can go in one, followed or not.
 *
 * It also works when the server's lists don't: signed out entirely, or signed in to an
 * instance whose list endpoints are unavailable. That was the original reason this
 * started life as `AnonymousLists`; generalizing it is just admitting the capability was
 * never really about being anonymous.
 *
 * ## Member identity is the handle
 *
 * Members are stored as `username@host` — the same string `AnonymousFollows` already
 * uses as its follow key, which is what makes this generalization cheap rather than a
 * migration. A handle survives what an account id does not: it means the same thing to a
 * signed-out browser, to a signed-in session on one instance, and to the same person
 * signed in somewhere else. Account ids are per-instance and would strand every list the
 * moment you switched servers.
 *
 * The cost is a resolution step — `ListFeedResolver.mergeMemberTimelines()` takes ids,
 * so handles must be looked up before a feed can be built. That lookup belongs to the
 * page building the feed, not here; this store's job is remembering the handles.
 *
 * ## Account-scoped, and disposable
 *
 * Keyed per account via {@link scopedKey}, like every other client-side preference
 * ([[account-scoped-client-settings]]). Treated as **cache, not durable records**: a
 * version bump discards what came before rather than migrating it, and the next page
 * load rebuilds from the API. That is a deliberate trade — the alternative is carrying
 * migration code forever for data the user can recreate in seconds — but a silent wipe
 * is a bad experience, so a discard is always logged.
 */

const STORAGE_BASE = 'mockingbird_client_lists';
const STATE_VERSION = 1;

/** A client-side list. `memberHandles` are `username@host`, never account ids. */
export interface ClientList extends UserList {
  memberHandles: string[];
  createdAt: string;
}

interface ClientListState {
  version: typeof STATE_VERSION;
  lists: ClientList[];
}

/** `username@host` for an account, matching the anonymous follow-key format. */
export function handleFor(account: Account, fallbackHost = ''): string {
  const acct = typeof account.acct === 'string' ? account.acct : '';
  // A local account's `acct` is a bare username; a remote one already carries the host.
  if (acct.includes('@')) {
    return acct.toLowerCase();
  }
  const username = (acct || account.username || '').toLowerCase();
  const host = fallbackHost
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return host ? `${username}@${host}` : username;
}

@Injectable({ providedIn: 'root' })
export class ClientLists {
  private diagnostics = inject(PageDiagnostics);

  private state = signal<ClientListState>(this.load());

  readonly lists = computed(() => this.state().lists);
  readonly count = computed(() => this.state().lists.length);

  private storageKey(): string {
    return scopedKey(STORAGE_BASE);
  }

  /**
   * Read stored lists, discarding anything from a different version.
   *
   * The discard is logged rather than silent: "my lists vanished" is otherwise an
   * unexplainable event, and this is the only place that can explain it.
   */
  private load(): ClientListState {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) {
        return { version: STATE_VERSION, lists: [] };
      }
      const parsed = JSON.parse(raw) as Partial<ClientListState> | null;
      if (parsed?.version !== STATE_VERSION) {
        this.diagnostics.info('ClientLists', 'cache:version-bust', {
          found: parsed?.version ?? null,
          expected: STATE_VERSION,
          discarded: Array.isArray(parsed?.lists) ? parsed.lists.length : 0,
        });
        return { version: STATE_VERSION, lists: [] };
      }
      if (!Array.isArray(parsed.lists)) {
        return { version: STATE_VERSION, lists: [] };
      }
      return {
        version: STATE_VERSION,
        lists: parsed.lists.filter(
          (list): list is ClientList =>
            typeof list?.id === 'string' &&
            typeof list.title === 'string' &&
            Array.isArray(list.memberHandles),
        ),
      };
    } catch {
      return { version: STATE_VERSION, lists: [] };
    }
  }

  get(id: string): ClientList | null {
    return this.lists().find((list) => list.id === id) ?? null;
  }

  create(title: string): ClientList {
    const list: ClientList = {
      id: `client-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      memberHandles: [],
      createdAt: new Date().toISOString(),
    };
    this.persist([...this.lists(), list]);
    this.diagnostics.info('ClientLists', 'list:create', { id: list.id });
    return list;
  }

  /**
   * Replace every list with one reconciled against the account.
   *
   * A bulk write rather than repeated {@link create}: `create` mints a fresh id
   * and `createdAt`, which is right for a new list and wrong for one being
   * adopted — it would re-date the user's oldest list to the moment they turned
   * sync on, and change ids that other local state may already reference.
   */
  adoptAll(lists: ClientList[]): void {
    this.persist(lists.map((list) => ({ ...list })));
    this.diagnostics.info('ClientLists', 'list:adopt', { count: lists.length });
  }

  rename(id: string, title: string): void {
    const next = title.trim();
    if (!next) {
      return;
    }
    this.persist(this.lists().map((list) => (list.id === id ? { ...list, title: next } : list)));
  }

  remove(id: string): void {
    this.persist(this.lists().filter((list) => list.id !== id));
    this.diagnostics.info('ClientLists', 'list:remove', { id });
  }

  hasMember(id: string, handle: string): boolean {
    return this.get(id)?.memberHandles.includes(handle.toLowerCase()) ?? false;
  }

  /** Lists containing this handle — drives the "in N lists" affordance. */
  listsWith(handle: string): ClientList[] {
    const needle = handle.toLowerCase();
    return this.lists().filter((list) => list.memberHandles.includes(needle));
  }

  setMember(id: string, handle: string, member: boolean): void {
    const needle = handle.toLowerCase();
    this.persist(
      this.lists().map((list) => {
        if (list.id !== id) {
          return list;
        }
        const handles = new Set(list.memberHandles);
        if (member) {
          handles.add(needle);
        } else {
          handles.delete(needle);
        }
        return { ...list, memberHandles: [...handles] };
      }),
    );
  }

  private persist(lists: ClientList[]): void {
    const state: ClientListState = { version: STATE_VERSION, lists };
    this.state.set(state);
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(state));
    } catch (error: unknown) {
      // Honoured in memory for this session. A full quota must not lose the list the
      // user is in the middle of building.
      this.diagnostics.error('ClientLists', 'persist:failed', error);
    }
  }
}
