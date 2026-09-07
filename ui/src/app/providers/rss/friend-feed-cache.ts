/**
 * What we have already learned about the links on people's profiles, and the
 * OPML built from it.
 *
 * ## Why a cache is the whole feature
 *
 * Probing one profile URL is a cross-origin fetch of a stranger's homepage. A
 * scan of 500 sites is 500 of them, most through the shared CORS proxy — easily
 * the most expensive thing this app can be asked to do, which is why the scan
 * is Plus-only and asks before it starts.
 *
 * Paying that once is defensible. Paying it again on the next scan is not, and
 * the difference is entirely this file: a re-scan probes only the profile URLs
 * it has *never seen before*, so following ten new people costs ten probes
 * rather than five hundred.
 *
 * ## Remembering the misses matters more than remembering the hits
 *
 * Most profile links are not blogs. They are GitHub profiles, shop pages and
 * link aggregators, and they will still not be blogs next month. If only the
 * successes were cached, every re-scan would re-probe the entire feedless
 * majority forever — which is the expensive half.
 *
 * So a "checked it, there was nothing" record is a first-class result here,
 * stored exactly like a hit. This mirrors `rss-cache.ts`, where a record can
 * exist purely to hold a failure, and for the same reason.
 *
 * ## Unreachable is not the same as feedless
 *
 * A site that timed out, or that the proxy refused, has not been *answered* —
 * it has failed to be asked. Recording that as "no feed" would poison the cache
 * with a permanent wrong answer from one bad afternoon, and the user would have
 * no way to know why their friend's blog never appears.
 *
 * Those are stored as {@link ProbeOutcome} `unreachable` and are retried by the
 * next scan, while `none` is believed and never re-probed. That distinction is
 * the reason this stores an outcome rather than a boolean.
 *
 * ## Why it shares the RSS database
 *
 * A new IndexedDB database would need its own teardown wiring
 * (`session-teardown.ts`), its own storage-settings row, and its own name to
 * classify. These stores are RSS data by every meaningful definition, so they
 * live in `mockingbird_rss` at version 2 and inherit all of that for free.
 */

import { Injectable } from '@angular/core';

/**
 * The RSS database, shared with {@link RssCache}.
 *
 * Version 2 adds this file's two stores. `onupgradeneeded` in both files
 * creates only what is missing, so whichever opens first migrates and the other
 * finds its store already there.
 */
const DB_NAME = 'mockingbird_rss';
const DB_VERSION = 2;

/** Probe results, keyed by normalized profile URL. */
const PROBE_STORE = 'profile_probes';

/** The generated OPML documents, keyed by account. */
const OPML_STORE = 'friend_opml';

/** The feed store owned by {@link RssCache}; created here only on upgrade. */
const FEED_STORE = 'feeds';

/** What probing one profile URL concluded. */
export type ProbeOutcome =
  /** The page declared at least one feed. */
  | 'feeds'
  /** The page was read and declared nothing. Believed permanently. */
  | 'none'
  /** Could not be asked — timeout, refusal, no proxy. Retried next scan. */
  | 'unreachable'
  /** On the skip list: a platform known not to publish per-profile feeds. */
  | 'skipped';

/** One feed found behind somebody's profile link. */
export interface FoundFeed {
  /** The feed URL, absolute. */
  url: string;
  /** The feed's own title, or the site host when it gave none. */
  title: string;
  /**
   * Whether the feed needed the CORS proxy.
   *
   * Unset by the scan on purpose: discovery reads the *page*, and how that was
   * fetched says nothing about the feed. The follow path settles it by trying
   * both and recording what worked.
   */
  useProxy?: boolean;
  /** The profile URL this was found behind, for attribution in the dialog. */
  siteUrl: string;
  /** Handle of the followed account whose profile linked it. */
  via: string;
}

/** One probed profile URL, as persisted. */
export interface ProbeRecord {
  /** Normalized profile URL — the key path. */
  url: string;
  outcome: ProbeOutcome;
  /** Feeds found; empty for every outcome but `feeds`. */
  feeds: FoundFeed[];
  /** Epoch ms of the probe this came from. */
  probedAt: number;
}

/** A generated OPML document, as persisted. */
export interface FriendOpmlRecord {
  /** Account key — the key path, so alts keep their own result. */
  accountKey: string;
  /** The OPML document itself. */
  opml: string;
  /** Epoch ms the scan finished. */
  generatedAt: number;
  /** Feeds in the document. */
  feedCount: number;
  /** Profile URLs looked at, for the "checked N sites" line. */
  checkedCount: number;
  /**
   * True when the scan stopped at the user's cap or their stop button rather
   * than running out of accounts. The dialog says so, because a partial result
   * that claims to be complete is the one dishonest state here.
   */
  partial: boolean;
}

/**
 * A bare domain someone typed without a scheme: `example.com`.
 *
 * Kept in step with `BARE_DOMAIN` in `paste-resolve.ts` — the same judgement
 * about what deserves a fetch, made in the two places that have to make it.
 */
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * Reduce a profile URL to its cache key.
 *
 * Folds away the differences that do not change what gets fetched — case in the
 * host, a trailing slash, a leading `www.`, the fragment — so `Example.com` and
 * `https://www.example.com/#about` are one probe rather than three. The query
 * string is kept: plenty of sites still route by it.
 *
 * Returns null for anything that is not an http(s) URL, which is how `mailto:`,
 * `xmpp:` and free text in a profile field get dropped before they cost
 * anything.
 */
export function normalizeProfileUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Reject a non-web scheme *before* the bare-domain fallback below, not after.
  // `mailto:someone@example.com` contains no `://`, so prefixing it first
  // yields `https://mailto:someone@example.com`, which parses as the host
  // `example.com` — turning an address in a profile field into a probe of
  // somebody's website. Anything with a scheme must be judged on that scheme.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    return null;
  }
  // Without a scheme, only something shaped like a domain may be promoted to
  // one. Profile fields are free text — pronouns, a city, a favourite band —
  // and `new URL('https://she/her')` parses happily, which would spend a probe
  // on the host `she`. Same rule and same regex as `BARE_DOMAIN` in
  // `paste-resolve.ts`, which meets this problem from the other direction.
  if (!scheme && !BARE_DOMAIN.test(trimmed.split('/')[0])) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(scheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const host = url.host.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${host}${path}${url.search}`;
}

/**
 * Opens the shared RSS database, creating whichever stores are missing.
 *
 * Resolves `null` on every failure rather than rejecting, exactly as
 * `rss-cache.ts` does: IndexedDB is absent in Firefox private windows and can
 * be blocked outright. Losing the cache must degrade to "probe again", never to
 * a broken feature.
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
      // `feeds` belongs to RssCache. Created here too because whichever file
      // opens the database first is the one that runs the upgrade for both.
      if (!db.objectStoreNames.contains(FEED_STORE)) {
        db.createObjectStore(FEED_STORE, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains(PROBE_STORE)) {
        db.createObjectStore(PROBE_STORE, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains(OPML_STORE)) {
        db.createObjectStore(OPML_STORE, { keyPath: 'accountKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

@Injectable({ providedIn: 'root' })
export class FriendFeedCache {
  /** Opened once and shared, so concurrent callers queue rather than race. */
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= openDatabase();
    return this.dbPromise;
  }

  /**
   * Every probe already on record, as `normalized url -> record`.
   *
   * Read once at the start of a scan rather than queried per URL: a scan asks
   * about hundreds of URLs, and one `getAll` is far cheaper than hundreds of
   * separate transactions.
   */
  async probes(): Promise<Map<string, ProbeRecord>> {
    const rows = await this.all<ProbeRecord>(PROBE_STORE);
    return new Map(rows.map((row) => [row.url, row]));
  }

  /** Record what probing one profile URL concluded. */
  async recordProbe(url: string, outcome: ProbeOutcome, feeds: FoundFeed[] = []): Promise<void> {
    await this.put(PROBE_STORE, { url, outcome, feeds, probedAt: Date.now() });
  }

  /** The stored OPML for one account, or null. */
  async opml(accountKey: string): Promise<FriendOpmlRecord | null> {
    return this.get<FriendOpmlRecord>(OPML_STORE, accountKey);
  }

  /** Store a generated OPML, replacing any earlier one for the account. */
  async saveOpml(record: FriendOpmlRecord): Promise<void> {
    await this.put(OPML_STORE, record);
  }

  /**
   * Forget everything learned for one account.
   *
   * Drops that account's OPML *and* every probe, which is what makes this the
   * "my friend started a blog and it still is not showing up" repair: the probe
   * cache is the thing that would otherwise keep answering `none` for their
   * site until the end of time.
   */
  async clear(accountKey: string): Promise<void> {
    await this.delete(OPML_STORE, accountKey);
    await this.clearStore(PROBE_STORE);
  }

  private async all<T>(store: string): Promise<T[]> {
    const db = await this.db();
    if (!db) {
      return [];
    }
    return new Promise((resolve) => {
      try {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve((request.result as T[]) ?? []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private async get<T>(store: string, key: string): Promise<T | null> {
    const db = await this.db();
    if (!db) {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const request = db.transaction(store, 'readonly').objectStore(store).get(key);
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async put(store: string, record: unknown): Promise<void> {
    await this.write(store, (objectStore) => objectStore.put(record));
  }

  private async delete(store: string, key: string): Promise<void> {
    await this.write(store, (objectStore) => objectStore.delete(key));
  }

  private async clearStore(store: string): Promise<void> {
    await this.write(store, (objectStore) => objectStore.clear());
  }

  /** One readwrite transaction, resolving however it ends. */
  private async write(store: string, run: (objectStore: IDBObjectStore) => void): Promise<void> {
    const db = await this.db();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(store, 'readwrite');
        run(tx.objectStore(store));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
