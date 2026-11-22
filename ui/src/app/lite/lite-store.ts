import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { ReadCache } from '../platform/offline/read-cache';
import { Observable, finalize } from 'rxjs';
import { accountScopeSuffix } from '../platform/session/account-scope';

/**
 * What Lite has already loaded, kept in memory for the whole visit.
 *
 * Lite is for a powerful phone on a terrible connection (the metal retail
 * building between two towns), not for a weak phone. Memory is cheap there;
 * the network is what hurts. So nothing is thrown away when the reader moves
 * between Home, Notifications, Bookmarks, a thread or a profile: going back
 * shows what was there at once, and nothing reloads until the reader presses
 * Refresh. A load that is still running when the reader leaves keeps going
 * and fills the screen for when they come back.
 *
 * Keys include the account scope, so switching accounts never shows another
 * account's held screens.
 */

export interface PagedState<T> {
  items: T[];
  /** Cursor for the next (older) page, or undefined before the first load. */
  cursor?: string;
  loading: boolean;
  /** True while the newest page is being fetched to replace what is held. */
  refreshing: boolean;
  failed: boolean;
  done: boolean;
  loadedAt: number | null;
  /** The items shown are the read cache's saved copy, not yet replaced by a live page. */
  fromSaved: boolean;
}

export interface ValueState<T> {
  value: T | null;
  loading: boolean;
  failed: boolean;
  loadedAt: number | null;
}

/** One page of items plus the cursor for the page after it. */
export interface Page<T> {
  items: T[];
  cursor?: string;
}

export type PageLoader<T> = (cursor?: string) => Observable<Page<T>>;

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
  };
}

@Injectable({ providedIn: 'root' })
export class LiteStore {
  private readonly readCache = inject(ReadCache);
  private readonly paged = new Map<string, WritableSignal<PagedState<unknown>>>();
  private readonly values = new Map<string, WritableSignal<ValueState<unknown>>>();
  /** Bumped by the Refresh button; the screen on display reloads. */
  readonly refreshTick = signal(0);
  private readonly inFlight = signal(0);
  /** Something is loading, for the Refresh button's busy state. */
  readonly busy = computed(() => this.inFlight() > 0);

  refresh(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  /**
   * The held list for `key`. On the first visit, when `savedPath` names an
   * endpoint the read cache keeps (Home, notifications, bookmarks, lists), its
   * saved first page is shown at once and the newest page replaces it when it
   * arrives; otherwise the first page loads as usual.
   */
  pagedState<T extends { id: string }>(
    key: string,
    loader: PageLoader<T>,
    savedPath?: string,
  ): WritableSignal<PagedState<T>> {
    const full = this.scoped(key);
    let state = this.paged.get(full) as WritableSignal<PagedState<T>> | undefined;
    if (!state) {
      // Created loading, and started a moment later: this is often called from
      // a computed, where writing signals is not allowed.
      const created = signal<PagedState<T>>({ ...emptyPaged<T>(), loading: true });
      state = created;
      this.paged.set(full, created as WritableSignal<PagedState<unknown>>);
      queueMicrotask(() => this.startPaged(created, loader, savedPath));
    }
    return state;
  }

  private startPaged<T extends { id: string }>(
    state: WritableSignal<PagedState<T>>,
    loader: PageLoader<T>,
    savedPath?: string,
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
        state.set({
          ...emptyPaged<T>(),
          ...byLastId(items),
          loadedAt: saved.savedAt,
          fromSaved: true,
        });
        this.reload(state, loader);
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
      next: (page) =>
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
        }),
      error: () => state.update((s) => ({ ...s, loading: false, failed: true })),
    });
  }

  /**
   * Fetch the newest page and put it in place of what is held. The held
   * items stay on screen until the answer arrives; a failure keeps them.
   */
  reload<T>(state: WritableSignal<PagedState<T>>, loader: PageLoader<T>): void {
    if (state().refreshing) return;
    state.update((s) => ({ ...s, refreshing: true, failed: false }));
    this.track(loader(undefined)).subscribe({
      next: (page) =>
        state.set({
          ...emptyPaged<T>(),
          items: page.items,
          cursor: page.cursor,
          done: page.items.length === 0,
          loadedAt: Date.now(),
        }),
      error: () => state.update((s) => ({ ...s, refreshing: false, failed: true })),
    });
  }

  /** A single held value (a post's thread, a profile, search results). */
  valueState<T>(key: string, fetch: () => Observable<T>): WritableSignal<ValueState<T>> {
    const full = this.scoped(key);
    let state = this.values.get(full) as WritableSignal<ValueState<T>> | undefined;
    if (!state) {
      const created = signal<ValueState<T>>({
        value: null,
        loading: true,
        failed: false,
        loadedAt: null,
      });
      state = created;
      this.values.set(full, created as WritableSignal<ValueState<unknown>>);
      queueMicrotask(() => this.runValue(created, fetch));
    }
    return state;
  }

  /** Reload a held value; what is held stays on screen until the answer arrives. */
  fetchValue<T>(state: WritableSignal<ValueState<T>>, fetch: () => Observable<T>): void {
    if (state().loading) return;
    this.runValue(state, fetch);
  }

  private runValue<T>(state: WritableSignal<ValueState<T>>, fetch: () => Observable<T>): void {
    state.update((s) => ({ ...s, loading: true, failed: false }));
    this.track(fetch()).subscribe({
      next: (value) => state.set({ value, loading: false, failed: false, loadedAt: Date.now() }),
      error: () => state.update((s) => ({ ...s, loading: false, failed: true })),
    });
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
