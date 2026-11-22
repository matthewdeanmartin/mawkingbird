import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { Observable, finalize } from 'rxjs';
import { Account, Status } from '../platform/api/models';
import { ReadCache } from '../platform/offline/read-cache';
import { accountScopeSuffix } from '../platform/session/account-scope';
import { LitePrefs } from './lite-prefs';

/**
 * What Lite has already loaded, kept in memory for the whole visit
 * (spec/lite-next-hour.md).
 *
 * Lite is for a capable phone on a bad connection, so memory is spent freely
 * and the network sparingly:
 *
 * - **Held screens.** Lists, threads, profiles and search results stay for the
 *   visit; coming back is instant and makes no request.
 * - **Saved first.** A screen seen for the first time in this visit shows what
 *   the phone already has (a post or author from a feed it appeared in, or
 *   the read cache's copy on disk) before asking the network anything.
 * - **Check only when stale.** With "Updates: when out of date", a held screen
 *   older than its threshold is checked once in the background; otherwise
 *   only Refresh asks.
 * - **Keep the reader's place.** Newer posts found by a check wait above in
 *   `incoming` instead of shifting what is being read.
 *
 * Keys include the account scope, so switching accounts never shows another
 * account's held screens.
 */

export interface PagedState<T> {
  items: T[];
  /** Cursor for the next (older) page, or undefined before the first load. */
  cursor?: string;
  loading: boolean;
  /** True while the newest page is being fetched. */
  refreshing: boolean;
  failed: boolean;
  done: boolean;
  loadedAt: number | null;
  /** The items shown are the read cache's saved copy, not yet checked against the server. */
  fromSaved: boolean;
  /** Newer items found by a refresh, waiting above so the reader's place does not move. */
  incoming: T[];
  /**
   * When a refresh's newest page did not reach what was held, the id of the
   * last newer item: posts between it and the next held item were not loaded.
   */
  gapAfter: string | null;
  /** The post the reader was looking at when they left, to return to. */
  anchorId: string | null;
}

export interface ValueState<T> {
  value: T | null;
  loading: boolean;
  failed: boolean;
  loadedAt: number | null;
  /** The value shown came from the phone (a feed it appeared in, or disk), not yet checked. */
  fromSaved: boolean;
}

/** One page of items plus the cursor for the page after it. */
export interface Page<T> {
  items: T[];
  cursor?: string;
}

export type PageLoader<T> = (cursor?: string) => Observable<Page<T>>;

/** How old a held screen may get before a background check, by kind. */
export const STALE_MS = {
  /** Feeds, notifications and threads. */
  feed: 5 * 60_000,
  /** Profile details change slowly. */
  profile: 30 * 60_000,
} as const;

export interface ValueOptions<T> {
  /** A copy the phone already has (e.g. the post as it appeared in a feed). */
  seed?: T | null;
  /** An endpoint the read cache keeps, whose saved copy can be shown at once. */
  savedPath?: string;
  staleMs?: number;
}

/** Items with ids, paged by the last id (statuses, notifications). */
export function byLastId<T extends { id: string }>(items: T[]): Page<T> {
  return { items, cursor: items.at(-1)?.id };
}

function emptyPaged<T>(): PagedState<T> {
  return {
    items: [],
    loading: false,
    refreshing: false,
    failed: false,
    done: false,
    loadedAt: null,
    fromSaved: false,
    incoming: [],
    gapAfter: null,
    anchorId: null,
  };
}

/**
 * Merge a freshly fetched newest page into what is held, keeping the reader's
 * place: held items are updated in place, newer ones wait in `incoming`, and
 * a page that does not reach the held items marks a gap.
 */
export function mergeNewest<T>(state: PagedState<T>, page: Page<T>, now: number): PagedState<T> {
  if (!state.items.length) {
    return {
      ...emptyPaged<T>(),
      items: page.items,
      cursor: page.cursor,
      done: page.items.length === 0,
      loadedAt: now,
      anchorId: state.anchorId,
    };
  }
  const held = new Set(state.items.map(idOf));
  const waiting = new Set(state.incoming.map(idOf));
  const updated = new Map(page.items.map((item) => [idOf(item), item]));
  const fresh = page.items.filter((item) => !held.has(idOf(item)) && !waiting.has(idOf(item)));
  const overlaps = page.items.some((item) => held.has(idOf(item)));
  const incoming = [...fresh, ...state.incoming.map((item) => updated.get(idOf(item)) ?? item)];
  return {
    ...state,
    items: state.items.map((item) => updated.get(idOf(item)) ?? item),
    incoming,
    gapAfter: !overlaps && fresh.length ? String(idOf(fresh.at(-1))) : state.gapAfter,
    refreshing: false,
    failed: false,
    fromSaved: false,
    loadedAt: now,
  };
}

/** Put the waiting newer items on top, where the reader asked to see them. */
export function applyIncoming<T>(state: PagedState<T>): PagedState<T> {
  if (!state.incoming.length) return state;
  return { ...state, items: [...state.incoming, ...state.items], incoming: [] };
}

/** Posts and accounts seen this visit; more than a day of reading stays below this. */
const MAX_KNOWN = 5_000;

@Injectable({ providedIn: 'root' })
export class LiteStore {
  private readonly readCache = inject(ReadCache);
  private readonly prefs = inject(LitePrefs);
  private readonly paged = new Map<string, WritableSignal<PagedState<unknown>>>();
  private readonly values = new Map<string, WritableSignal<ValueState<unknown>>>();
  private readonly statuses = new Map<string, Status>();
  private readonly accounts = new Map<string, Account>();
  /** Bumped by the Refresh button; the screen on display reloads. */
  readonly refreshTick = signal(0);
  private readonly inFlight = signal(0);
  /** Something is loading, for the Refresh button's busy state. */
  readonly busy = computed(() => this.inFlight() > 0);

  refresh(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  /** A post seen this visit (in any feed, thread or notification), or null. */
  knownStatus(id: string): Status | null {
    return this.statuses.get(`${accountScopeSuffix()} ${id}`) ?? null;
  }

  /** An account seen this visit (as an author or in a notification), or null. */
  knownAccount(id: string): Account | null {
    return this.accounts.get(`${accountScopeSuffix()} ${id}`) ?? null;
  }

  /**
   * The held list for `key`. On the first visit, when `savedPath` names an
   * endpoint the read cache keeps, its saved first page shows at once; it is
   * checked against the server only when stale (or on Refresh).
   */
  pagedState<T extends { id: string }>(
    key: string,
    loader: PageLoader<T>,
    savedPath?: string,
    staleMs: number = STALE_MS.feed,
  ): WritableSignal<PagedState<T>> {
    const full = this.scoped(key);
    let state = this.paged.get(full) as WritableSignal<PagedState<T>> | undefined;
    if (!state) {
      // Created loading, and started a moment later: this is often called from
      // a computed, where writing signals is not allowed.
      const created = signal<PagedState<T>>({ ...emptyPaged<T>(), loading: true });
      state = created;
      this.paged.set(full, created as WritableSignal<PagedState<unknown>>);
      queueMicrotask(() => this.startPaged(created, loader, savedPath, staleMs));
    }
    return state;
  }

  private startPaged<T extends { id: string }>(
    state: WritableSignal<PagedState<T>>,
    loader: PageLoader<T>,
    savedPath: string | undefined,
    staleMs: number,
  ): void {
    const firstPage = () => {
      state.update((s) => ({ ...s, loading: false }));
      this.more(state, loader);
    };
    const scope = accountScopeSuffix();
    if (!savedPath || !scope) {
      firstPage();
      return;
    }
    void this.readCache.peekFirstPage(scope, savedPath).then((saved) => {
      const items = saved ? (JSON.parse(saved.body) as T[]) : [];
      if (saved && Array.isArray(items) && items.length && !state().items.length) {
        this.remember(items);
        state.set({
          ...emptyPaged<T>(),
          ...byLastId(items),
          loadedAt: saved.savedAt,
          fromSaved: true,
        });
        this.checkIfStale(state, loader, staleMs);
      } else {
        firstPage();
      }
    });
  }

  /** Append the next older page. */
  more<T>(state: WritableSignal<PagedState<T>>, loader: PageLoader<T>): void {
    const current = state();
    if (current.loading || current.refreshing) return;
    state.update((s) => ({ ...s, loading: true, failed: false }));
    this.track(loader(current.items.length ? current.cursor : undefined)).subscribe({
      next: (page) => {
        this.remember(page.items);
        state.update((s) => {
          const seen = new Set(s.items.map(idOf));
          const fresh = page.items.filter((item) => !seen.has(idOf(item)));
          return {
            ...s,
            items: [...s.items, ...fresh],
            cursor: page.cursor ?? s.cursor,
            done: fresh.length === 0,
            loading: false,
            loadedAt: s.loadedAt ?? Date.now(),
          };
        });
      },
      error: () => state.update((s) => ({ ...s, loading: false, failed: true })),
    });
  }

  /**
   * Fetch the newest page and merge it without moving the reader (see
   * {@link mergeNewest}). What is held stays on screen; a failure keeps it.
   */
  reload<T>(state: WritableSignal<PagedState<T>>, loader: PageLoader<T>): void {
    if (state().refreshing) return;
    state.update((s) => ({ ...s, refreshing: true, failed: false }));
    this.track(loader(undefined)).subscribe({
      next: (page) => {
        this.remember(page.items);
        state.update((s) => mergeNewest(s, page, Date.now()));
      },
      error: () => state.update((s) => ({ ...s, refreshing: false, failed: true })),
    });
  }

  /** Reload once if the reader wants stale checks and this list is older than `staleMs`. */
  checkIfStale<T>(
    state: WritableSignal<PagedState<T>>,
    loader: PageLoader<T>,
    staleMs: number,
  ): void {
    const s = state();
    if (this.prefs.value().refresh !== 'stale' || s.loading || s.refreshing) return;
    if (s.loadedAt !== null && Date.now() - s.loadedAt > staleMs) this.reload(state, loader);
  }

  /**
   * A single held value (a post, its replies, a profile, search results).
   * On first use it shows what the phone has — `seed`, else the read cache's
   * copy of `savedPath` — and asks the server only when there is nothing to
   * show or what is shown is stale.
   */
  valueState<T>(
    key: string,
    fetch: () => Observable<T>,
    options: ValueOptions<T> = {},
  ): WritableSignal<ValueState<T>> {
    const full = this.scoped(key);
    let state = this.values.get(full) as WritableSignal<ValueState<T>> | undefined;
    if (!state) {
      const seed = options.seed ?? null;
      const created = signal<ValueState<T>>({
        value: seed,
        loading: !seed,
        failed: false,
        loadedAt: seed ? Date.now() : null,
        fromSaved: !!seed,
      });
      state = created;
      this.values.set(full, created as WritableSignal<ValueState<unknown>>);
      if (!seed) queueMicrotask(() => this.startValue(created, fetch, options));
    }
    return state;
  }

  private startValue<T>(
    state: WritableSignal<ValueState<T>>,
    fetch: () => Observable<T>,
    options: ValueOptions<T>,
  ): void {
    const scope = accountScopeSuffix();
    if (!options.savedPath || !scope) {
      this.runValue(state, fetch);
      return;
    }
    void this.readCache.get(scope, options.savedPath).then((saved) => {
      if (saved && state().value === null) {
        const value = JSON.parse(saved.body) as T;
        this.remember([value]);
        state.set({
          value,
          loading: false,
          failed: false,
          loadedAt: saved.savedAt,
          fromSaved: true,
        });
        this.checkValueIfStale(state, fetch, options.staleMs ?? STALE_MS.feed);
      } else {
        this.runValue(state, fetch);
      }
    });
  }

  /** Reload a held value; what is held stays on screen until the answer arrives. */
  fetchValue<T>(state: WritableSignal<ValueState<T>>, fetch: () => Observable<T>): void {
    if (state().loading) return;
    this.runValue(state, fetch);
  }

  /** Reload once if the reader wants stale checks and this value is older than `staleMs`. */
  checkValueIfStale<T>(
    state: WritableSignal<ValueState<T>>,
    fetch: () => Observable<T>,
    staleMs: number,
  ): void {
    const s = state();
    if (this.prefs.value().refresh !== 'stale' || s.loading) return;
    if (s.loadedAt !== null && Date.now() - s.loadedAt > staleMs) this.runValue(state, fetch);
  }

  private runValue<T>(state: WritableSignal<ValueState<T>>, fetch: () => Observable<T>): void {
    state.update((s) => ({ ...s, loading: true, failed: false }));
    this.track(fetch()).subscribe({
      next: (value) => {
        this.remember([value]);
        state.set({ value, loading: false, failed: false, loadedAt: Date.now(), fromSaved: false });
      },
      error: () => state.update((s) => ({ ...s, loading: false, failed: true })),
    });
  }

  /** Note every post and account inside whatever was just shown, for instant reopening. */
  private remember(items: readonly unknown[]): void {
    const scope = accountScopeSuffix();
    const visit = (value: unknown, depth: number): void => {
      if (!value || typeof value !== 'object' || depth > 3) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1);
        return;
      }
      const record = value as Record<string, unknown>;
      if (
        typeof record['id'] === 'string' &&
        typeof record['content'] === 'string' &&
        record['account']
      ) {
        this.put(this.statuses, `${scope} ${record['id']}`, record as unknown as Status);
      }
      if (typeof record['id'] === 'string' && typeof record['acct'] === 'string') {
        this.put(this.accounts, `${scope} ${record['id']}`, record as unknown as Account);
      }
      for (const key of [
        'account',
        'reblog',
        'status',
        'last_status',
        'ancestors',
        'descendants',
      ]) {
        if (key in record) visit(record[key], depth + 1);
      }
    };
    for (const item of items) visit(item, 0);
  }

  private put<T>(map: Map<string, T>, key: string, value: T): void {
    map.delete(key);
    map.set(key, value);
    if (map.size > MAX_KNOWN) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
  }

  private track<T>(source: Observable<T>): Observable<T> {
    this.inFlight.update((n) => n + 1);
    return source.pipe(finalize(() => this.inFlight.update((n) => n - 1)));
  }

  private scoped(key: string): string {
    return `${accountScopeSuffix()} ${key}`;
  }
}

function idOf(item: unknown): unknown {
  return (item as { id?: unknown })?.id ?? item;
}
