/**
 * Read-only inspection of this origin's IndexedDB and its overall storage
 * budget, for the Observability page.
 *
 * Almost everything durable lives in localStorage (see `storage-registry.ts`).
 * The one exception is the RSS feed cache (`mockingbird_rss`), which is here
 * precisely because a single feed can be megabytes — far past what localStorage
 * can hold for the whole origin. That is also why this report is worth showing:
 * IndexedDB is where that cache, a dependency, or a browser extension's page
 * script can quietly put megabytes, and localStorage's own few-MB budget is not
 * the whole story. `navigator.storage.estimate()` reports the origin's *total*
 * usage against its quota, which is the number that actually predicts an
 * eviction.
 *
 * Everything here degrades rather than throws:
 *
 *  - `indexedDB.databases()` is unsupported on Firefox and older Safari; the
 *    report says so instead of showing an empty list that would read as "you
 *    have no databases".
 *  - Opening a database to count its records is done at its *current* version
 *    with no upgrade handler, so we never migrate or create anything. A
 *    `versionchange`/blocked situation resolves by giving up on that database.
 *  - `estimate()` is absent in some browsers and its numbers are deliberately
 *    imprecise (padded, to defeat cross-origin size probing) — labelled as an
 *    estimate in the UI for that reason.
 */

/** One object store inside a database. */
export interface StoreInfo {
  name: string;
  /** Record count, or null if it couldn't be read. */
  count: number | null;
  /** Approximate serialized payload size, or null if it couldn't be measured. */
  bytes: number | null;
}

/** One IndexedDB database on this origin. */
export interface DatabaseInfo {
  name: string;
  version: number | null;
  stores: StoreInfo[];
  /** Set when the database could not be opened or read. */
  error?: string;
}

/** Origin-wide quota numbers from the Storage API. */
export interface QuotaInfo {
  usage: number | null;
  quota: number | null;
  /** Fraction of quota used (0–1), or null if either number is missing. */
  ratio: number | null;
  /** True when the origin's data is exempt from automatic eviction. */
  persisted: boolean | null;
}

export interface IndexedDbReport {
  /** Whether this browser can enumerate databases at all. */
  supported: boolean;
  /** Why enumeration is unavailable, when `supported` is false. */
  note: string;
  databases: DatabaseInfo[];
  quota: QuotaInfo;
}

/** Give up on a database that won't open rather than hanging the page. */
const OPEN_TIMEOUT_MS = 2_000;

/** Wrap an IndexedDB request as a promise that rejects instead of hanging. */
function requestToPromise<T>(request: IDBRequest<T>, timeoutMs = OPEN_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    request.onsuccess = () => done(() => resolve(request.result));
    request.onerror = () => done(() => reject(request.error ?? new Error('request failed')));
    // Another tab holds an upgrade open, or we'd have to wait on one. Only open
    // requests have this; count() requests don't.
    if ('onblocked' in request) {
      (request as unknown as IDBOpenDBRequest).onblocked = () =>
        done(() => reject(new Error('blocked')));
    }
  });
}

/** JSON is not IndexedDB's wire format, but it gives a useful, stable payload estimate. */
function estimateBytes(values: unknown[]): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(values)).byteLength;
  } catch {
    return null;
  }
}

/** Open a database read-only and report its stores and record counts. */
async function describeDatabase(name: string, version: number | null): Promise<DatabaseInfo> {
  let db: IDBDatabase | null = null;
  try {
    // No version argument: open whatever exists, never trigger an upgrade.
    db = await requestToPromise(indexedDB.open(name));
    const storeNames = [...db.objectStoreNames];
    if (!storeNames.length) {
      return { name, version: db.version ?? version, stores: [] };
    }
    const tx = db.transaction(storeNames, 'readonly');
    const stores = await Promise.all(
      storeNames.map(async (storeName): Promise<StoreInfo> => {
        try {
          const store = tx.objectStore(storeName);
          // Start both requests before awaiting either one. IndexedDB may close
          // a transaction as soon as the current task stops scheduling work.
          const count = requestToPromise(store.count());
          const values = requestToPromise(store.getAll());
          return {
            name: storeName,
            count: await count,
            bytes: estimateBytes(await values),
          };
        } catch {
          return { name: storeName, count: null, bytes: null };
        }
      }),
    );
    return { name, version: db.version ?? version, stores };
  } catch (error) {
    return {
      name,
      version,
      stores: [],
      error: error instanceof Error ? error.message : 'could not open',
    };
  } finally {
    // Always close: an open handle blocks another tab's upgrade.
    db?.close();
  }
}

/** Delete every record in one object store without dropping the database schema. */
export async function clearIndexedDbStore(databaseName: string, storeName: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser context.');
  }
  let db: IDBDatabase | null = null;
  try {
    db = await requestToPromise(indexedDB.open(databaseName));
    if (!db.objectStoreNames.contains(storeName)) {
      throw new Error(`Object store "${storeName}" no longer exists.`);
    }
    const tx = db.transaction(storeName, 'readwrite');
    await requestToPromise(tx.objectStore(storeName).clear());
  } finally {
    db?.close();
  }
}

/** Read the origin's usage against its quota, if the browser reports it. */
async function readQuota(): Promise<QuotaInfo> {
  const empty: QuotaInfo = { usage: null, quota: null, ratio: null, persisted: null };
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return empty;
  }
  try {
    const { usage = null, quota = null } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return {
      usage,
      quota,
      ratio: usage !== null && quota ? usage / quota : null,
      persisted,
    };
  } catch {
    return empty;
  }
}

/**
 * Snapshot IndexedDB and the storage budget. Never rejects: a browser that
 * can't answer produces a report saying so.
 */
export async function inspectIndexedDb(): Promise<IndexedDbReport> {
  const quota = await readQuota();
  if (typeof indexedDB === 'undefined') {
    return {
      supported: false,
      note: 'IndexedDB is not available in this browser context.',
      databases: [],
      quota,
    };
  }
  if (typeof indexedDB.databases !== 'function') {
    return {
      supported: false,
      note: 'This browser cannot list IndexedDB databases (Firefox and older Safari); anything stored there is invisible here.',
      databases: [],
      quota,
    };
  }
  let names: { name?: string; version?: number }[];
  try {
    names = await indexedDB.databases();
  } catch {
    return {
      supported: false,
      note: 'Listing IndexedDB databases failed.',
      databases: [],
      quota,
    };
  }
  const databases = await Promise.all(
    names
      .filter((d): d is { name: string; version?: number } => typeof d.name === 'string')
      .map((d) => describeDatabase(d.name, d.version ?? null)),
  );
  databases.sort((a, b) => a.name.localeCompare(b.name));
  return { supported: true, note: '', databases, quota };
}

/** Total records across every store of a database, ignoring unreadable ones. */
export function totalRecords(db: DatabaseInfo): number {
  return db.stores.reduce((sum, s) => sum + (s.count ?? 0), 0);
}
