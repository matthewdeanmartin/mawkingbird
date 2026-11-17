import { Injectable } from '@angular/core';
import { Status } from '../platform/api/models';
import { accountScopeSuffix } from '../platform/session/account-scope';
import { lastPublished } from '../platform/storage/publish-stamp';
import { BlogAuthor } from './blog-source';

/**
 * What a blog page has read, kept for four hours (owner, 2026-11-17).
 *
 * Reading a blog costs a request per 40 posts, so a few hundred posts is
 * several seconds of requests. The cache holds the author and the posts read
 * so far — not the classified result: what counts as a blog post is a
 * setting, and changing it must not need a re-read — plus where to continue.
 *
 * Any publish, edit or delete in this browser makes every entry stale
 * (`publish-stamp.ts`): a new post must show up at once, wherever it was
 * written. Per reading account, because the same blog read through another
 * account can come from another server.
 *
 * IndexedDB, with a memory layer in front, like `article-cache.ts`; both fail
 * soft, and then the page simply reads again.
 */

const DB_NAME = 'mockingbird_blogs';
const DB_VERSION = 1;
const STORE = 'blogs';

export const BLOG_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
/** Most blogs kept before the oldest are dropped. */
export const MAX_CACHED_BLOGS = 20;

export interface BlogCacheEntry {
  author: BlogAuthor;
  statuses: Status[];
  exhausted: boolean;
  /** Where a live read continues; absent for the Native archive, which is local. */
  maxId?: string;
}

interface CacheRecord extends BlogCacheEntry {
  key: string;
  storedAt: number;
}

export function blogCacheKey(handle: string, scope = accountScopeSuffix()): string {
  return `${scope}|${handle.toLowerCase()}`;
}

/** Fresh: younger than the TTL and than the last publish. */
export function isFresh(storedAt: number, now = Date.now(), published = lastPublished()): boolean {
  const age = now - storedAt;
  return age >= 0 && age < BLOG_CACHE_TTL_MS && storedAt > published;
}

@Injectable({ providedIn: 'root' })
export class BlogCache {
  private db: Promise<IDBDatabase | null> | null = null;
  private readonly memory = new Map<string, CacheRecord>();

  async get(handle: string): Promise<BlogCacheEntry | null> {
    const key = blogCacheKey(handle);
    const remembered = this.memory.get(key);
    if (remembered) {
      if (isFresh(remembered.storedAt)) return remembered;
      this.memory.delete(key);
    }
    const db = await this.open();
    if (!db) return null;
    const record = await new Promise<CacheRecord | null>((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        request.onsuccess = () => resolve((request.result as CacheRecord) ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (!record || !isFresh(record.storedAt)) return null;
    this.memory.set(key, record);
    return record;
  }

  async put(handle: string, entry: BlogCacheEntry): Promise<void> {
    const record: CacheRecord = { ...entry, key: blogCacheKey(handle), storedAt: Date.now() };
    this.memory.delete(record.key);
    this.memory.set(record.key, record);
    while (this.memory.size > MAX_CACHED_BLOGS) {
      this.memory.delete(this.memory.keys().next().value!);
    }
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        store.put(record);
        // Keep the newest few: walk oldest first and delete past the cap.
        const count = store.count();
        count.onsuccess = () => {
          let excess = count.result - MAX_CACHED_BLOGS;
          if (excess <= 0) return;
          const cursor = store.index('storedAt').openCursor();
          cursor.onsuccess = () => {
            const at = cursor.result;
            if (!at || excess <= 0) return;
            at.delete();
            excess--;
            at.continue();
          };
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private open(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    this.db = new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' }).createIndex('storedAt', 'storedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return this.db;
  }
}
