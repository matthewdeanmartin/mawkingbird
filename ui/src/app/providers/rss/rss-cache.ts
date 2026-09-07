import { Injectable } from '@angular/core';
import { ParsedFeed } from './rss-parser';

/**
 * A durable cache of parsed feeds, in IndexedDB.
 *
 * ## Why this exists
 *
 * Nothing cached feeds before this, and three separate paths each fetched the
 * whole feed independently: the home timeline, the feed-as-profile page, and
 * `getFeedItem`, which re-downloads an entire feed to display *one* article
 * (feeds have no per-item endpoint). Opening a single article therefore cost at
 * least two network round trips, none of them shared, every single time.
 *
 * Against a publisher's own server that is merely wasteful. Against a free CORS
 * proxy — AllOrigins allows roughly twenty requests a minute — it exhausts the
 * rate limit, and the failure surfaces as an opaque 522 with no
 * `Access-Control-Allow-Origin` header, which reads to the user as "the feed is
 * broken" rather than "you have been throttled".
 *
 * ## Why IndexedDB rather than localStorage
 *
 * Feeds are big. `govinfo.gov/rss/statute.xml` is megabytes of XML, and
 * localStorage is a *few* megabytes for the entire origin, already shared with
 * every key in `storage-registry.ts` and the anonymous home-feed cache. Putting
 * one large feed there would not just fail — it would throw
 * `QuotaExceededError` on unrelated writes and take out settings that have
 * nothing to do with RSS. IndexedDB's quota is orders of magnitude larger and
 * is measured against the origin's real budget.
 *
 * What is stored is the *parsed* feed, not the source XML: it is substantially
 * smaller than the document it came from, and it means reading a cached feed
 * costs no XML parse at all.
 *
 * ## What is cached, and for how long
 *
 * Only successful reads. A failure never overwrites a good entry — it is
 * recorded separately as a cooldown, so a feed that is down or throttling us is
 * not retried on every page view. When the network fails and a cached copy
 * exists, that copy is served and flagged {@link CachedFeed.stale}, because a
 * day-old article is worth incomparably more than an error message.
 */

const DB_NAME = 'mockingbird_rss';
/**
 * Version 2 added the two stores in `friend-feed-cache.ts`.
 *
 * Both files must name the same version: IndexedDB refuses an `open` at a lower
 * version than the database already has, so leaving this at 1 would break every
 * feed read the moment a friend-feed scan had run once.
 *
 * Each file's `onupgradeneeded` creates only the stores it finds missing, so
 * whichever opens first performs the migration for both.
 */
const DB_VERSION = 2;
const FEED_STORE = 'feeds';

/** Stores owned by `friend-feed-cache.ts`, created here on upgrade. */
const FRIEND_STORES = [
  { name: 'profile_probes', keyPath: 'url' },
  { name: 'friend_opml', keyPath: 'accountKey' },
] as const;

/**
 * How long a failing feed is left alone before we try the network again.
 *
 * Deliberately much shorter than any TTL: the point is to stop a hammering
 * loop, not to give up on the feed. Fifteen minutes is long enough that a
 * throttled proxy recovers and short enough that a transient blip doesn't make
 * a feed look dead for the rest of the day.
 */
export const FAILURE_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * One cached feed, as persisted.
 *
 * A record may exist purely to hold {@link failedAt} — a feed that has only
 * ever failed has no content, and `fetchedAt` of 0 marks that. Use
 * {@link hasContent} rather than testing `feed` directly: an empty
 * {@link ParsedFeed} placeholder is truthy and reads as a real (but empty)
 * feed, which is exactly the bug that made proxied feeds show zero posts.
 */
export interface CachedFeedRecord {
  /** The feed URL — the key path. */
  url: string;
  feed: ParsedFeed;
  /** Epoch ms of the successful fetch this came from, or 0 if never fetched. */
  fetchedAt: number;
  /** Epoch ms of the last failed attempt, for the cooldown. */
  failedAt?: number;
}

/** Whether a record actually holds a feed someone once fetched successfully. */
function hasContent(record: CachedFeedRecord | null): record is CachedFeedRecord {
  return record !== null && record.fetchedAt > 0;
}

/** A cache hit handed back to callers. */
export interface CachedFeed {
  feed: ParsedFeed;
  fetchedAt: number;
  /**
   * True when this copy is older than the TTL and is only being shown because
   * the network could not replace it. The UI says so rather than pretending
   * the content is current.
   */
  stale: boolean;
}

/**
 * Opens (and if necessary creates) the database.
 *
 * Every failure path resolves to `null` rather than rejecting: IndexedDB is
 * unavailable in Firefox private windows, can be blocked by storage settings,
 * and can fail an upgrade if another tab holds the old version open. In all of
 * those cases the right behaviour is to fetch from the network exactly as
 * before, not to break RSS.
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
      if (!db.objectStoreNames.contains(FEED_STORE)) {
        db.createObjectStore(FEED_STORE, { keyPath: 'url' });
      }
      for (const store of FRIEND_STORES) {
        if (!db.objectStoreNames.contains(store.name)) {
          db.createObjectStore(store.name, { keyPath: store.keyPath });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

@Injectable({ providedIn: 'root' })
export class RssCache {
  /**
   * The open database, opened once and shared.
   *
   * Held as a promise rather than a value so concurrent callers during startup
   * queue on the same open instead of racing to create the schema.
   */
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  /** Route key -> epoch ms at which that route may be tried again. */
  private cooldowns = new Map<string, number>();

  private db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= openDatabase();
    return this.dbPromise;
  }

  /**
   * The cached feed for `url`, or null when there is nothing usable.
   *
   * `ttlMs` of 0 means "always refetch": the record is still returned when the
   * caller needs a stale fallback, but never counts as fresh.
   */
  async get(url: string, ttlMs: number): Promise<CachedFeed | null> {
    const record = await this.record(url);
    // A failure-only record is not a cache hit. Returning its empty placeholder
    // feed would render as "this feed has no posts", which is indistinguishable
    // from a real empty feed and hides the actual error.
    if (!hasContent(record)) {
      return null;
    }
    const age = Date.now() - record.fetchedAt;
    return {
      feed: record.feed,
      fetchedAt: record.fetchedAt,
      stale: ttlMs <= 0 || age >= ttlMs,
    };
  }

  /**
   * Whether a recent failure means we should not hit the network yet.
   *
   * `key` identifies a *route* (see `routeKey` in rss-fetch), not just a feed:
   * a direct fetch that failed on CORS must not suppress the proxied retry,
   * since they fail for entirely unrelated reasons.
   *
   * In memory only, and deliberately so. A cooldown is a "don't hammer this for
   * the next quarter hour" note whose whole purpose is served within one
   * session; persisting it would mean a feed that failed once stayed muted
   * across a reload, with no way for the user to tell why.
   */
  async inCooldown(key: string, now: number = Date.now()): Promise<boolean> {
    const until = this.cooldowns.get(key);
    if (until === undefined) {
      return false;
    }
    if (now >= until) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  /** Start (or restart) the cooldown for one route. */
  startCooldown(key: string, now: number = Date.now()): void {
    this.cooldowns.set(key, now + FAILURE_COOLDOWN_MS);
  }

  /** Clear a route's cooldown — a success on that route proves it works. */
  clearCooldown(key: string): void {
    this.cooldowns.delete(key);
  }

  /** Store a successful read, clearing any failure marker. */
  async put(url: string, feed: ParsedFeed): Promise<void> {
    await this.write(FEED_STORE, { url, feed, fetchedAt: Date.now() });
  }

  /**
   * Note that a route failed, so it is not retried for {@link FAILURE_COOLDOWN_MS}.
   *
   * Deliberately writes nothing to IndexedDB. An earlier version stored a
   * placeholder record here, which was a real bug: the empty `ParsedFeed` it
   * invented was later served as though it were cached content, so a feed that
   * had failed once rendered as a feed with zero posts instead of reporting the
   * error. Failures are now purely an in-memory cooldown, and the stored
   * records only ever hold feeds that were genuinely fetched.
   */
  markFailure(key: string): void {
    this.startCooldown(key);
  }

  /** Drop one feed's entry — used by "refresh now" and on unsubscribe. */
  async evict(url: string): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(FEED_STORE, 'readwrite');
        tx.objectStore(FEED_STORE).delete(url);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Empty the cache. Surfaced on the storage settings page. */
  async clear(): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(FEED_STORE, 'readwrite');
        tx.objectStore(FEED_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Every cached entry, for the storage settings summary. */
  async entries(): Promise<CachedFeedRecord[]> {
    const db = await this.db();
    if (!db) {
      return [];
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(FEED_STORE, 'readonly');
        const request = tx.objectStore(FEED_STORE).getAll();
        request.onsuccess = () => resolve((request.result as CachedFeedRecord[]) ?? []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private async record(url: string): Promise<CachedFeedRecord | null> {
    const db = await this.db();
    if (!db) {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(FEED_STORE, 'readonly');
        const request = tx.objectStore(FEED_STORE).get(url);
        request.onsuccess = () => {
          const value = request.result as CachedFeedRecord | undefined;
          resolve(value && value.feed ? value : null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async write(store: string, record: CachedFeedRecord): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(record);
        tx.oncomplete = () => resolve();
        // A quota failure here must not break the fetch that produced the data.
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
