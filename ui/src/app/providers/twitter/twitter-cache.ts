import { Injectable } from '@angular/core';
import { Status } from '../../models';

/**
 * A durable cache of fetched Twitter timelines, in IndexedDB.
 *
 * ## Why this exists
 *
 * The timeline cache started in memory, and the comment justifying that said
 * persisting a stranger's posts "buys little". That reasoning was about
 * correctness and it got the trade-off wrong: here a cache miss is not a slow
 * render, it is a *billable request*. In-memory meant every page reload cost one
 * request per followed account — and reloads are ordinary (following a link out
 * and coming back, restarting the browser, a crash). At 200 follows that is 200
 * requests to look at a feed you were already looking at a minute ago.
 *
 * Expiring media URLs, the other half of the original argument, are a reason to
 * re-fetch an *image* when it fails to load. They were never a reason to throw
 * away the text.
 *
 * ## Two ages, not one
 *
 * A single TTL cannot express what this needs, so entries have two:
 *
 * - {@link TIMELINE_TTL_MS} (5 min) — "may I serve this without asking whether
 *   to refetch?" Unchanged from the in-memory cache.
 * - {@link CACHE_RETENTION_MS} (24 h) — "is this still worth showing at all?"
 *
 * Between the two an entry is *stale*: rendered immediately, marked as such, and
 * left alone until the reader presses Refresh. That is the whole point. Opening
 * the app must never spend money on its own, so a stale hit is strictly better
 * than a fresh fetch nobody asked for.
 *
 * ## Why IndexedDB rather than localStorage
 *
 * Same reason as {@link RssCache}: size. A timeline page is ~20 posts of
 * normalized `Status` objects with entities and media, and 200 followed accounts
 * of those would blow the origin's few-megabyte localStorage budget — taking out
 * unrelated settings with `QuotaExceededError` on some *other* key's write.
 *
 * Every failure path here resolves rather than rejecting. IndexedDB is
 * unavailable in Firefox private windows and can be blocked outright by storage
 * settings; in all such cases the correct behaviour is to degrade to the old
 * in-memory behaviour, not to break Twitter support.
 */

const DB_NAME = 'mockingbird_twitter';
const DB_VERSION = 1;
const TIMELINE_STORE = 'timelines';

/**
 * How long a persisted timeline is kept before it is dropped as too old to show.
 *
 * Matches the RSS cache's default. A day-old post is still a post someone wanted
 * to read; what it must not do is masquerade as current, which is what
 * {@link CachedTimeline.stale} is for.
 */
export const CACHE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** One handle's cached posts, as persisted. */
export interface CachedTimelineRecord {
  /** Lower-cased handle without the `@` — the key path. */
  handle: string;
  statuses: Status[];
  /** Epoch ms of the successful fetch this came from. */
  fetchedAt: number;
  /** The provider's numeric id for this account, if it was learned. */
  userId?: string;
}

/**
 * Opens (and if necessary creates) the database.
 *
 * Resolves `null` on every failure — see the class comment. A browser that
 * cannot open IndexedDB gets the pre-existing in-memory behaviour.
 */
function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TIMELINE_STORE)) {
        db.createObjectStore(TIMELINE_STORE, { keyPath: 'handle' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

@Injectable({ providedIn: 'root' })
export class TwitterCache {
  /**
   * The open database, opened once and shared, so concurrent callers during
   * startup queue on one open rather than racing to create the schema.
   */
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= openDatabase();
    return this.dbPromise;
  }

  /**
   * Every retained entry, for hydrating the in-memory cache at startup.
   *
   * Entries past {@link CACHE_RETENTION_MS} are filtered out *and* deleted here.
   * Doing the eviction on read rather than on a timer means it happens exactly
   * when it matters and never runs in a tab nobody is using.
   */
  async load(now: number = Date.now()): Promise<CachedTimelineRecord[]> {
    const all = await this.entries();
    const live: CachedTimelineRecord[] = [];
    const dead: string[] = [];
    for (const record of all) {
      if (now - record.fetchedAt < CACHE_RETENTION_MS) {
        live.push(record);
      } else {
        dead.push(record.handle);
      }
    }
    for (const handle of dead) {
      await this.evict(handle);
    }
    return live;
  }

  /** Store a successful read. Only ever called with posts that really arrived. */
  async put(record: CachedTimelineRecord): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(TIMELINE_STORE, 'readwrite');
        tx.objectStore(TIMELINE_STORE).put(record);
        tx.oncomplete = () => resolve();
        // A quota failure must not break the fetch that produced the data —
        // the posts are already in memory and about to be rendered.
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Drop one handle's entry — used by unfollow and by an explicit refresh. */
  async evict(handle: string): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(TIMELINE_STORE, 'readwrite');
        tx.objectStore(TIMELINE_STORE).delete(handle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Empty the cache. Surfaced on the connector page. */
  async clear(): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(TIMELINE_STORE, 'readwrite');
        tx.objectStore(TIMELINE_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Every stored entry, unfiltered. */
  async entries(): Promise<CachedTimelineRecord[]> {
    const db = await this.db();
    if (!db) {
      return [];
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(TIMELINE_STORE, 'readonly');
        const request = tx.objectStore(TIMELINE_STORE).getAll();
        request.onsuccess = () => {
          const rows = (request.result as CachedTimelineRecord[]) ?? [];
          // Defend against a partially-written or hand-edited record: a row with
          // no statuses array would render as "this account has no posts",
          // which is indistinguishable from a real empty timeline.
          resolve(rows.filter((row) => Array.isArray(row.statuses)));
        };
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
}
