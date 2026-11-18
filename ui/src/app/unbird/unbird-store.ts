import { Injectable } from '@angular/core';
import type { UnbirdArchive } from './unbird-archive';

/**
 * Where a read archive and its search progress live between visits: IndexedDB,
 * on this device only.
 *
 * This is what makes Unbird resumable. A reader can drop the archive, see the
 * first matches, leave to create a Mastodon account (often in another tab, or
 * after an email confirmation) and come back to the same results. The classic
 * importer's `sessionStorage` hand-off cannot survive that trip.
 *
 * One archive per browser for now; the store is keyed so Native can hold
 * several import points later. Every failure resolves rather than rejects:
 * without IndexedDB (a private window, blocked storage) Unbird still works for
 * the visit, it just cannot resume.
 *
 * "Forget this archive" deletes both stores. The full sign-out wipe deletes the
 * database (`session-teardown.ts`).
 */

export const UNBIRD_DB_NAME = 'mockingbird_unbird';
const DB_VERSION = 1;
const ARCHIVES = 'archives';
const MATCHES = 'matches';
const CURRENT = 'current';

/** One account found for a Twitter person, kept small enough to store thousands. */
export interface StoredMatch {
  /** Full handle with server: `bob@hachyderm.io`. */
  acct: string;
  url: string;
  displayName: string;
  avatar: string;
  signals: string[];
  confidence: 'likely' | 'possible';
  lastStatusAt: string | null;
  bot: boolean;
  statuses: number;
  followers: number;
}

export interface StoredMatchRow {
  /** Lower-cased Twitter handle: the key. */
  handle: string;
  status: 'complete' | 'failed';
  matches: StoredMatch[];
  checkedAt: number;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(UNBIRD_DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ARCHIVES)) db.createObjectStore(ARCHIVES);
      if (!db.objectStoreNames.contains(MATCHES))
        db.createObjectStore(MATCHES, { keyPath: 'handle' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function done(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
}

function result<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

@Injectable({ providedIn: 'root' })
export class UnbirdStore {
  private db: Promise<IDBDatabase | null> | null = null;

  private database(): Promise<IDBDatabase | null> {
    this.db ??= open();
    return this.db;
  }

  /** Save a freshly read archive, replacing the previous one and its search results. */
  async saveArchive(archive: UnbirdArchive): Promise<boolean> {
    const db = await this.database();
    if (!db) return false;
    try {
      const transaction = db.transaction([ARCHIVES, MATCHES], 'readwrite');
      transaction.objectStore(MATCHES).clear();
      transaction.objectStore(ARCHIVES).put(archive, CURRENT);
      return await done(transaction);
    } catch {
      return false;
    }
  }

  async loadArchive(): Promise<UnbirdArchive | null> {
    const db = await this.database();
    if (!db) return null;
    try {
      const archive = await result<UnbirdArchive>(
        db.transaction(ARCHIVES).objectStore(ARCHIVES).get(CURRENT),
      );
      return archive?.version === 1 ? archive : null;
    } catch {
      return null;
    }
  }

  async saveMatches(rows: readonly StoredMatchRow[]): Promise<boolean> {
    if (!rows.length) return true;
    const db = await this.database();
    if (!db) return false;
    try {
      const transaction = db.transaction(MATCHES, 'readwrite');
      const store = transaction.objectStore(MATCHES);
      for (const row of rows) store.put(row);
      return await done(transaction);
    } catch {
      return false;
    }
  }

  async loadMatches(): Promise<StoredMatchRow[]> {
    const db = await this.database();
    if (!db) return [];
    try {
      return (await result(db.transaction(MATCHES).objectStore(MATCHES).getAll())) ?? [];
    } catch {
      return [];
    }
  }

  /** Delete the archive and everything found from it. */
  async forget(): Promise<void> {
    const db = await this.database();
    if (!db) return;
    try {
      const transaction = db.transaction([ARCHIVES, MATCHES], 'readwrite');
      transaction.objectStore(ARCHIVES).clear();
      transaction.objectStore(MATCHES).clear();
      await done(transaction);
    } catch {
      // Nothing stored, or storage is gone already.
    }
  }
}
