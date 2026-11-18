import { Injectable } from '@angular/core';
import type { UnbirdArchive } from './unbird-archive';

/**
 * Where read archives, their search progress and their replay ledger live
 * between visits: IndexedDB, on this device only.
 *
 * This is what makes Unbird resumable. A reader can drop the archive, see the
 * first matches, leave to create a Mastodon account (often in another tab, or
 * after an email confirmation) and come back to the same results; a replay
 * picks up where it stopped. The classic importer's `sessionStorage` hand-off
 * cannot survive that trip.
 *
 * ## Import points
 *
 * Each archive has an id, and matches and ledger rows are keyed under it. The
 * web keeps one archive (a new one replaces the old); Native keeps several
 * "import points", say two archives, or one archive replayed into a main and
 * an alt account. `meta/current` names the one in use.
 *
 * Every failure resolves rather than rejects: without IndexedDB (a private
 * window, blocked storage) Unbird still works for the visit, it just cannot
 * resume. "Forget" deletes one archive and everything keyed under it; the full
 * sign-out wipe deletes the database (`session-teardown.ts`).
 */

export const UNBIRD_DB_NAME = 'mockingbird_unbird';
const DB_VERSION = 2;
const ARCHIVES = 'archives';
const MATCHES = 'matches';
const REPLAY = 'replay';
const META = 'meta';
const CURRENT = 'current';
/** The id version 1 stored its only archive under. */
export const LEGACY_ARCHIVE_ID = 'current';

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
  /** Lower-cased Twitter handle. */
  handle: string;
  status: 'complete' | 'failed';
  matches: StoredMatch[];
  checkedAt: number;
}

/** One tweet's place in a replay to Mastodon. */
export interface ReplayEntry {
  tweetId: string;
  /** The first tweet of its unit; a thread's posts share it. */
  unitId: string;
  /** Position within the unit, 0 for the first post. */
  index: number;
  /** When it should appear, ISO. */
  at: string;
  /** The Mastodon account it goes to, so an alt never receives a main's queue. */
  account: string;
  visibility: 'public' | 'unlisted' | 'private';
  /** Add the "(From Twitter, date)" line to the first post. */
  dateLine?: boolean;
  /** Attach the archive's photos when the archive is open this visit. */
  media?: boolean;
  state: 'planned' | 'scheduled' | 'posted' | 'failed';
  scheduledId?: string;
  statusId?: string;
  error?: string;
}

/** What a list of import points shows without loading each archive. */
export interface ArchiveSummary {
  id: string;
  userName: string | null;
  readAt: number;
  tweets: number;
}

interface Keyed<T> {
  key: string;
  archive: string;
  value: T;
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
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const upgrade = request.transaction!;
      if (!db.objectStoreNames.contains(ARCHIVES)) db.createObjectStore(ARCHIVES);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(REPLAY)) {
        db.createObjectStore(REPLAY, { keyPath: 'key' }).createIndex('archive', 'archive');
      }
      if (event.oldVersion === 1) {
        // Version 1 kept one archive under "current" and matches by handle alone.
        // Re-key them under that archive so a reader's search survives the upgrade.
        const old = upgrade.objectStore(MATCHES);
        const rows = old.getAll();
        rows.onsuccess = () => {
          db.deleteObjectStore(MATCHES);
          const matches = db.createObjectStore(MATCHES, { keyPath: 'key' });
          matches.createIndex('archive', 'archive');
          for (const row of rows.result as StoredMatchRow[]) {
            matches.put(keyed(LEGACY_ARCHIVE_ID, row.handle, row));
          }
          upgrade.objectStore(META).put(LEGACY_ARCHIVE_ID, CURRENT);
        };
      } else if (!db.objectStoreNames.contains(MATCHES)) {
        db.createObjectStore(MATCHES, { keyPath: 'key' }).createIndex('archive', 'archive');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function keyed<T>(archive: string, id: string, value: T): Keyed<T> {
  return { key: `${archive}|${id}`, archive, value };
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

/** An archive's id: who it belongs to and when Twitter made it. */
export function archiveId(archive: UnbirdArchive): string {
  if (archive.id) return archive.id;
  const owner = archive.owner.accountId ?? archive.owner.userName ?? 'unknown';
  return `${owner}-${archive.generatedAt ?? archive.readAt}`;
}

@Injectable({ providedIn: 'root' })
export class UnbirdStore {
  private db: Promise<IDBDatabase | null> | null = null;

  private database(): Promise<IDBDatabase | null> {
    this.db ??= open();
    return this.db;
  }

  /**
   * Save a freshly read archive and make it current. Without `keepOthers` (the
   * web) every other archive and everything keyed under it is deleted first.
   * Reading the same archive again keeps its matches and ledger.
   */
  async saveArchive(archive: UnbirdArchive, keepOthers = false): Promise<boolean> {
    const db = await this.database();
    if (!db) return false;
    const id = archiveId(archive);
    try {
      if (!keepOthers) {
        for (const other of await this.listArchives()) {
          if (other.id !== id) await this.forget(other.id);
        }
      }
      const transaction = db.transaction([ARCHIVES, META], 'readwrite');
      transaction.objectStore(ARCHIVES).put({ ...archive, id }, id);
      transaction.objectStore(META).put(id, CURRENT);
      return await done(transaction);
    } catch {
      return false;
    }
  }

  async currentId(): Promise<string | null> {
    const db = await this.database();
    if (!db) return null;
    try {
      return await result<string>(db.transaction(META).objectStore(META).get(CURRENT));
    } catch {
      return null;
    }
  }

  async setCurrent(id: string): Promise<void> {
    const db = await this.database();
    if (!db) return;
    try {
      const transaction = db.transaction(META, 'readwrite');
      transaction.objectStore(META).put(id, CURRENT);
      await done(transaction);
    } catch {
      // The choice holds for this visit.
    }
  }

  /** The current archive, or the one named. */
  async loadArchive(id?: string): Promise<UnbirdArchive | null> {
    const db = await this.database();
    if (!db) return null;
    try {
      const key = id ?? (await this.currentId()) ?? LEGACY_ARCHIVE_ID;
      const archive = await result<UnbirdArchive>(
        db.transaction(ARCHIVES).objectStore(ARCHIVES).get(key),
      );
      return archive?.version === 1 ? { ...archive, id: archive.id ?? key } : null;
    } catch {
      return null;
    }
  }

  async listArchives(): Promise<ArchiveSummary[]> {
    const db = await this.database();
    if (!db) return [];
    try {
      const store = db.transaction(ARCHIVES).objectStore(ARCHIVES);
      const [keys, values] = await Promise.all([
        result(store.getAllKeys()),
        result(store.getAll() as IDBRequest<UnbirdArchive[]>),
      ]);
      return (values ?? []).map((archive, index) => ({
        id: archive.id ?? String(keys?.[index] ?? LEGACY_ARCHIVE_ID),
        userName: archive.owner.userName,
        readAt: archive.readAt,
        tweets: archive.tweets.length,
      }));
    } catch {
      return [];
    }
  }

  async saveMatches(archive: string, rows: readonly StoredMatchRow[]): Promise<boolean> {
    return this.putAll(
      MATCHES,
      archive,
      rows.map((row) => [row.handle, row] as const),
    );
  }

  async loadMatches(archive: string): Promise<StoredMatchRow[]> {
    return this.getAll<StoredMatchRow>(MATCHES, archive);
  }

  async saveReplay(archive: string, entries: readonly ReplayEntry[]): Promise<boolean> {
    return this.putAll(
      REPLAY,
      archive,
      entries.map((entry) => [`${entry.account}|${entry.tweetId}`, entry] as const),
    );
  }

  async loadReplay(archive: string): Promise<ReplayEntry[]> {
    return this.getAll<ReplayEntry>(REPLAY, archive);
  }

  async deleteReplay(archive: string, entries: readonly ReplayEntry[]): Promise<void> {
    const db = await this.database();
    if (!db) return;
    try {
      const transaction = db.transaction(REPLAY, 'readwrite');
      const store = transaction.objectStore(REPLAY);
      for (const entry of entries) store.delete(`${archive}|${entry.account}|${entry.tweetId}`);
      await done(transaction);
    } catch {
      // Left in place; a later run sees them again.
    }
  }

  /** Delete one archive and everything found or planned from it. */
  async forget(id: string): Promise<void> {
    const db = await this.database();
    if (!db) return;
    try {
      const transaction = db.transaction([ARCHIVES, MATCHES, REPLAY, META], 'readwrite');
      transaction.objectStore(ARCHIVES).delete(id);
      for (const name of [MATCHES, REPLAY]) {
        const index = transaction.objectStore(name).index('archive');
        const keys = index.getAllKeys(id);
        keys.onsuccess = () => {
          for (const key of keys.result) transaction.objectStore(name).delete(key);
        };
      }
      const meta = transaction.objectStore(META);
      const current = meta.get(CURRENT);
      current.onsuccess = () => {
        if (current.result === id) meta.delete(CURRENT);
      };
      await done(transaction);
    } catch {
      // Nothing stored, or storage is gone already.
    }
  }

  private async putAll<T>(
    name: string,
    archive: string,
    rows: readonly (readonly [string, T])[],
  ): Promise<boolean> {
    if (!rows.length) return true;
    const db = await this.database();
    if (!db) return false;
    try {
      const transaction = db.transaction(name, 'readwrite');
      const store = transaction.objectStore(name);
      for (const [id, value] of rows) store.put(keyed(archive, id, value));
      return await done(transaction);
    } catch {
      return false;
    }
  }

  private async getAll<T>(name: string, archive: string): Promise<T[]> {
    const db = await this.database();
    if (!db) return [];
    try {
      const rows = await result(
        db.transaction(name).objectStore(name).index('archive').getAll(archive) as IDBRequest<
          Keyed<T>[]
        >,
      );
      return (rows ?? []).map((row) => row.value);
    } catch {
      return [];
    }
  }
}
