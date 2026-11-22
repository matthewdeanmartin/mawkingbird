import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/**
 * Saved copies of the reads a person most wants offline: the newest page of
 * Home and notifications, and the threads, posts and profiles they opened
 * (spec/low-bandwidth-offline.md, Sprint 5). Served by
 * `readCacheInterceptor` when there is no connection.
 *
 * Text only. Pictures and avatars are left to the browser's own HTTP cache:
 * Cache Storage charges an opaque cross-origin image several megabytes of
 * quota (Chromium pads each one), so storing avatars here would spend the
 * whole budget on a handful of faces.
 *
 * Every entry is scoped to one signed-in identity ({@link scope}) and the
 * scope's entries are deleted when that account signs out; followers-only
 * posts and DMs must not outlive the account that could see them.
 */

export const READ_CACHE_DB = 'mawkingbird-read-cache';
export const READ_CACHE_MAX_BYTES = 25 * 1024 * 1024;

export interface CachedRead {
  /** `scope + ' ' + url` — see {@link readCacheKey}. */
  key: string;
  scope: string;
  savedAt: number;
  /** Approximate stored size, bytes (UTF-16 string length × 2). */
  size: number;
  /** JSON response body as text. */
  body: string;
  /** The `Link` header, which carries the next-page cursor. */
  link: string | null;
}

export type CachedReadMeta = Pick<CachedRead, 'key' | 'scope' | 'savedAt' | 'size'>;

/** Where cached reads live; IndexedDB in the browser, memory in tests. */
export interface ReadCacheStore {
  get(key: string): Promise<CachedRead | null>;
  put(entry: CachedRead): Promise<void>;
  metas(): Promise<CachedReadMeta[]>;
  delete(keys: readonly string[]): Promise<void>;
}

export const READ_CACHE_STORE = new InjectionToken<ReadCacheStore>('READ_CACHE_STORE', {
  providedIn: 'root',
  factory: () => new IndexedDbReadCacheStore(),
});

/**
 * Endpoints worth keeping, as path patterns. Only first pages: a saved
 * `max_id` page is a page nobody will ask for again in the same form.
 */
const CACHEABLE: readonly RegExp[] = [
  /^\/api\/v1\/timelines\/home$/,
  /^\/api\/v1\/notifications$/,
  /^\/api\/v1\/statuses\/[^/]+$/,
  /^\/api\/v1\/statuses\/[^/]+\/context$/,
  /^\/api\/v1\/accounts\/verify_credentials$/,
  /^\/api\/v1\/accounts\/[^/]+$/,
  /^\/api\/v1\/accounts\/[^/]+\/statuses$/,
  /^\/api\/v1\/lists$/,
  /^\/api\/v1\/timelines\/list\/[^/]+$/,
  /^\/api\/v1\/bookmarks$/,
  /^\/api\/v1\/conversations$/,
];

const PAGING_PARAMS = ['max_id', 'min_id', 'since_id', 'offset'];

/** Whether a GET to this relative URL may be saved and served offline. */
export function isCacheableRead(url: string): boolean {
  if (!url.startsWith('/api/')) return false;
  const [path, query = ''] = url.split('?');
  if (!CACHEABLE.some((re) => re.test(path))) return false;
  const params = new URLSearchParams(query);
  return !PAGING_PARAMS.some((name) => params.has(name));
}

export function readCacheKey(scope: string, url: string): string {
  return `${scope} ${url}`;
}

/** Keys to delete, oldest first, to bring the store under `maxBytes`. */
export function evictionPlan(metas: readonly CachedReadMeta[], maxBytes: number): string[] {
  let total = metas.reduce((sum, m) => sum + m.size, 0);
  if (total <= maxBytes) return [];
  const doomed: string[] = [];
  for (const meta of [...metas].sort((a, b) => a.savedAt - b.savedAt)) {
    if (total <= maxBytes) break;
    doomed.push(meta.key);
    total -= meta.size;
  }
  return doomed;
}

/** Writes between eviction passes; a pass reads every entry's size. */
const EVICT_EVERY = 20;

@Injectable({ providedIn: 'root' })
export class ReadCache {
  private readonly store = inject(READ_CACHE_STORE);
  private writes = 0;

  /** When the newest saved copy shown to the reader was saved, or null. */
  readonly servedSavedAt = signal<number | null>(null);

  async get(scope: string, url: string): Promise<CachedRead | null> {
    try {
      return await this.store.get(readCacheKey(scope, url));
    } catch {
      return null;
    }
  }

  async save(scope: string, url: string, body: unknown, link: string | null): Promise<void> {
    if (!scope) return;
    try {
      const text = JSON.stringify(body);
      await this.store.put({
        key: readCacheKey(scope, url),
        scope,
        savedAt: Date.now(),
        size: text.length * 2,
        body: text,
        link,
      });
      this.writes++;
      if (this.writes % EVICT_EVERY === 1) await this.evict();
    } catch {
      // Quota or a closed database: the cache is a convenience, never a failure.
    }
  }

  /** Note that a saved copy was shown, for the offline banner's "saved N min ago". */
  noteServed(savedAt: number): void {
    const current = this.servedSavedAt();
    if (current === null || savedAt < current) this.servedSavedAt.set(savedAt);
  }

  /** A fresh answer arrived: whatever is on screen next is live again. */
  noteLive(): void {
    if (this.servedSavedAt() !== null) this.servedSavedAt.set(null);
  }

  /** Delete one identity's saved reads (sign-out). */
  async forgetScope(scope: string): Promise<void> {
    try {
      const keys = (await this.store.metas()).filter((m) => m.scope === scope).map((m) => m.key);
      await this.store.delete(keys);
    } catch {
      // Nothing saved, or no database: nothing to forget.
    }
  }

  async usage(): Promise<{ entries: number; bytes: number }> {
    try {
      const metas = await this.store.metas();
      return { entries: metas.length, bytes: metas.reduce((sum, m) => sum + m.size, 0) };
    } catch {
      return { entries: 0, bytes: 0 };
    }
  }

  private async evict(): Promise<void> {
    const doomed = evictionPlan(await this.store.metas(), READ_CACHE_MAX_BYTES);
    if (doomed.length) await this.store.delete(doomed);
  }
}

/**
 * Delete one identity's saved reads without the injector: called from
 * `Auth.logout`, which runs before the next account's services exist.
 */
export async function forgetSavedReads(scope: string): Promise<void> {
  if (!scope) return;
  const store = new IndexedDbReadCacheStore();
  try {
    const keys = (await store.metas()).filter((m) => m.scope === scope).map((m) => m.key);
    await store.delete(keys);
  } catch {
    // No database: nothing to forget.
  }
}

/** Kept in memory; the test store, and the fallback when IndexedDB is missing. */
export class MemoryReadCacheStore implements ReadCacheStore {
  readonly entries = new Map<string, CachedRead>();
  async get(key: string): Promise<CachedRead | null> {
    return this.entries.get(key) ?? null;
  }
  async put(entry: CachedRead): Promise<void> {
    this.entries.set(entry.key, entry);
  }
  async metas(): Promise<CachedReadMeta[]> {
    return [...this.entries.values()].map(({ key, scope, savedAt, size }) => ({
      key,
      scope,
      savedAt,
      size,
    }));
  }
  async delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }
}

const STORE = 'reads';

class IndexedDbReadCacheStore implements ReadCacheStore {
  private db: Promise<IDBDatabase | null> | null = null;
  private readonly fallback = new MemoryReadCacheStore();

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(READ_CACHE_DB, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('savedAt', 'savedAt');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore, done: (value: T) => void) => void,
    fallback: () => Promise<T>,
  ): Promise<T> {
    const db = await this.open();
    if (!db) return fallback();
    return new Promise<T>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, mode);
        let result: T;
        work(tx.objectStore(STORE), (value) => (result = value));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  get(key: string): Promise<CachedRead | null> {
    return this.run<CachedRead | null>(
      'readonly',
      (store, done) => {
        const request = store.get(key);
        request.onsuccess = () => done((request.result as CachedRead | undefined) ?? null);
      },
      () => this.fallback.get(key),
    );
  }

  put(entry: CachedRead): Promise<void> {
    return this.run<void>(
      'readwrite',
      (store, done) => {
        store.put(entry);
        done(undefined);
      },
      () => this.fallback.put(entry),
    );
  }

  metas(): Promise<CachedReadMeta[]> {
    return this.run<CachedReadMeta[]>(
      'readonly',
      (store, done) => {
        const metas: CachedReadMeta[] = [];
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) {
            done(metas);
            return;
          }
          const { key, scope, savedAt, size } = c.value as CachedRead;
          metas.push({ key, scope, savedAt, size });
          c.continue();
        };
      },
      () => this.fallback.metas(),
    );
  }

  delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return Promise.resolve();
    return this.run<void>(
      'readwrite',
      (store, done) => {
        for (const key of keys) store.delete(key);
        done(undefined);
      },
      () => this.fallback.delete(keys),
    );
  }
}
