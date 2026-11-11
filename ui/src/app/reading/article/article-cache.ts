import { Injectable } from '@angular/core';
import { ArticleResult } from './article-models';

/**
 * Extracted articles, in IndexedDB.
 *
 * Its own database rather than a new store inside `mockingbird_rss`: bumping
 * that database's version would couple article work to feed-cache migrations
 * for no benefit, and the two have no shared queries.
 *
 * ## What is cached, and for how long
 *
 * Results are retained for one hour. Reopening a recent article should not
 * spend another request or reading allowance; live articles can change later.
 *
 * ## Why bounded
 *
 * Markdown is small, but unbounded growth in a shared origin quota is how
 * `QuotaExceededError` lands on an unrelated write — the hazard `rss-cache.ts`
 * already documents. An LRU trim on write keeps this from being that.
 */

const DB_NAME = 'mockingbird_articles';
const DB_VERSION = 1;
const STORE = 'articles';

/** One hour, including when returning after navigation or a reload. */
export const ARTICLE_TTL_MS = 60 * 60 * 1000;

/** An hour. Long enough to stop a retry loop, short enough to recover. */
export const FAILURE_TTL_MS = 60 * 60 * 1000;

/** Most articles retained before the oldest are trimmed. */
export const MAX_CACHED_ARTICLES = 200;

interface CacheRecord {
  /** Normalized URL; the key path. */
  url: string;
  result: ArticleResult;
  /** Epoch ms, for TTL and LRU. */
  storedAt: number;
}

/**
 * The cache key for a URL.
 *
 * Tracking parameters are stripped so that the same article shared from three
 * places is cached once. The fragment goes too — it addresses a position within
 * a document, not a different document.
 */
export function normalizeArticleUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  const drop: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (/^(utm_.*|fbclid|gclid|mc_[ce]id|igshid|ref|ref_src|source)$/i.test(key)) {
      drop.push(key);
    }
  });
  for (const key of drop) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

@Injectable({ providedIn: 'root' })
export class ArticleCache {
  private db: Promise<IDBDatabase | null> | null = null;
  /** Storage can be unavailable; navigation in the same tab should still be free. */
  private readonly memory = new Map<string, CacheRecord>();

  private open(): Promise<IDBDatabase | null> {
    if (this.db) {
      return this.db;
    }
    this.db = new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        // Private mode or disabled storage: the in-memory cache still works.
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'url' });
          store.createIndex('storedAt', 'storedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return this.db;
  }

  /** A cached result, or `null` when absent or expired. */
  async get(url: string): Promise<ArticleResult | null> {
    const key = normalizeArticleUrl(url);
    const recent = this.memory.get(key);
    if (recent && this.fresh(recent)) return recent.result;
    this.memory.delete(key);
    const db = await this.open();
    if (!db) {
      return null;
    }
    const record = await new Promise<CacheRecord | null>((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        request.onsuccess = () => resolve((request.result as CacheRecord) ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (!record) {
      return null;
    }
    if (!this.fresh(record)) return null;
    this.remember(record);
    return record.result;
  }

  private fresh(record: CacheRecord): boolean {
    const ttl = record.result.article ? ARTICLE_TTL_MS : FAILURE_TTL_MS;
    const age = Date.now() - record.storedAt;
    return age >= 0 && age < ttl;
  }

  private remember(record: CacheRecord): void {
    this.memory.delete(record.url);
    this.memory.set(record.url, record);
    while (this.memory.size > MAX_CACHED_ARTICLES) {
      this.memory.delete(this.memory.keys().next().value!);
    }
  }

  /** Store a result, trimming the oldest entries if the cache is full. */
  async put(url: string, result: ArticleResult): Promise<void> {
    const record: CacheRecord = {
      url: normalizeArticleUrl(url),
      result,
      storedAt: Date.now(),
    };
    this.remember(record);
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    await this.trim();
  }

  /** Drop the oldest records once the store grows past its bound. */
  private async trim(): Promise<void> {
    const db = await this.open();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          const excess = countRequest.result - MAX_CACHED_ARTICLES;
          if (excess <= 0) {
            resolve();
            return;
          }
          let removed = 0;
          const cursorRequest = store.index('storedAt').openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor || removed >= excess) {
              resolve();
              return;
            }
            cursor.delete();
            removed += 1;
            cursor.continue();
          };
          cursorRequest.onerror = () => resolve();
        };
        countRequest.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Forget one article, so "re-fetch" genuinely re-fetches. */
  async remove(url: string): Promise<void> {
    this.memory.delete(normalizeArticleUrl(url));
    const db = await this.open();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(normalizeArticleUrl(url));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
