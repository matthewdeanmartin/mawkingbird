import { Injectable } from '@angular/core';
import { TranslationEngine } from '../translation-usage';

/**
 * Translations already paid for, so seeing a post again costs nothing.
 *
 * The same post reaches a reader many times: on scrolling back, after a
 * reload, as a renote or boost, and as the same federated post on another
 * server. Each of those used to spend a translation again. Keyed by the
 * post's ActivityPub `uri` (the same on every server), the target language
 * and a hash of the exact text, so an edited post is translated afresh.
 *
 * Only plain-text chain results are kept (every engine but the Mastodon
 * server, whose answer is structured HTML). A reader who asks for a specific
 * source language, or for a different engine, bypasses the cache; see
 * `TranslationRouter.translate`.
 *
 * IndexedDB, not localStorage: hundreds of entries would crowd the 5 MB
 * localStorage quota the rest of the app relies on. Without IndexedDB
 * (private windows, blocked storage) an in-memory map still serves the visit.
 */

const DB_NAME = 'mockingbird_translations';
const DB_VERSION = 1;
const STORE = 'translations';

/** Old translations are not wrong, but engines improve; refresh after a month. */
export const TRANSLATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_CACHED_TRANSLATIONS = 2000;

export interface CachedTranslation {
  text: string;
  engine: TranslationEngine;
  source: string;
  target: string;
}

interface CacheRecord extends CachedTranslation {
  /** `target|post|textHash`; the key path. */
  key: string;
  storedAt: number;
}

/** FNV-1a over the text, enough to notice an edit. */
function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The cache key for one post's text into one language. */
export function translationCacheKey(post: string, text: string, target: string): string {
  return `${target}|${post}|${textHash(text)}`;
}

@Injectable({ providedIn: 'root' })
export class TranslationCache {
  private db: Promise<IDBDatabase | null> | null = null;
  private readonly memory = new Map<string, CacheRecord>();

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
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('storedAt', 'storedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return this.db;
  }

  async get(key: string): Promise<CachedTranslation | null> {
    const recent = this.memory.get(key);
    if (recent && this.fresh(recent)) return strip(recent);
    this.memory.delete(key);
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
    if (!record || !this.fresh(record)) return null;
    this.remember(record);
    return strip(record);
  }

  async put(key: string, translation: CachedTranslation): Promise<void> {
    const record: CacheRecord = { ...translation, key, storedAt: Date.now() };
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
    await this.trim(db);
  }

  private fresh(record: CacheRecord): boolean {
    const age = Date.now() - record.storedAt;
    return age >= 0 && age < TRANSLATION_TTL_MS;
  }

  private remember(record: CacheRecord): void {
    this.memory.delete(record.key);
    this.memory.set(record.key, record);
    while (this.memory.size > MAX_CACHED_TRANSLATIONS) {
      this.memory.delete(this.memory.keys().next().value!);
    }
  }

  /** Drop the oldest entries beyond the cap. */
  private async trim(db: IDBDatabase): Promise<void> {
    await new Promise<void>((resolve) => {
      try {
        const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
        const count = store.count();
        count.onsuccess = () => {
          let excess = count.result - MAX_CACHED_TRANSLATIONS;
          if (excess <= 0) return resolve();
          const cursor = store.index('storedAt').openCursor();
          cursor.onsuccess = () => {
            const current = cursor.result;
            if (!current || excess <= 0) return resolve();
            current.delete();
            excess -= 1;
            current.continue();
          };
          cursor.onerror = () => resolve();
        };
        count.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

function strip(record: CacheRecord): CachedTranslation {
  return { text: record.text, engine: record.engine, source: record.source, target: record.target };
}
