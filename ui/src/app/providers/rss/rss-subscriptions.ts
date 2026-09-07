import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

const FEEDS_KEY_BASE = 'mockingbird_rss_feeds';
const LIMIT_KEY_BASE = 'mockingbird_rss_feed_limit';

/**
 * The suggested ceiling, and the default.
 *
 * Ten is a recommendation, not a rule. Every feed is fetched by every view that
 * shows them, so a large list is slower to open and burns more of a free CORS
 * proxy's quota — but that is the user's tradeoff to make, not ours, and
 * somebody importing a real OPML file from a decade of reading has a different
 * idea of "too many" than this default does.
 */
export const RSS_SUBSCRIPTION_LIMIT = 10;

/**
 * The ceiling on the ceiling. Not a judgement about patience — it is the point
 * past which the storage this feature is built on stops being appropriate:
 * subscriptions live in localStorage, which is synchronous and shared with
 * every other preference in the app.
 */
export const RSS_SUBSCRIPTION_LIMIT_MAX = 500;

/** Clamp a requested limit into something this storage can honour. */
export function normalizeLimit(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    return RSS_SUBSCRIPTION_LIMIT;
  }
  return Math.min(n, RSS_SUBSCRIPTION_LIMIT_MAX);
}

/**
 * The separator between levels of a nested folder path.
 *
 * Folders are stored as a single display string rather than a tree of ids (see
 * {@link RssFeedSub.folder}), so a nested OPML path becomes `Tech / Rust`. The
 * spaces are part of it: `Tech/Rust` would be ambiguous against a folder someone
 * legitimately named with a slash, and this way the stored string is exactly
 * what the UI shows.
 */
export const FOLDER_SEPARATOR = ' / ';

/**
 * How deep a nested OPML path is allowed to be before the remainder is joined
 * into the last segment.
 *
 * Three, per `spec/ui/folders_for_all.md`: OPML nests arbitrarily and an import
 * must not lose data, but a tree deep enough to get lost in is a tree nobody
 * maintains. Deeper paths keep every name — `A / B / C / D` becomes
 * `A / B / C — D` — so this is lossy in the display name only.
 */
export const MAX_FOLDER_DEPTH = 3;

/**
 * Normalize an OPML folder path into the stored `folder` string.
 *
 * Empty segments are dropped (some exporters nest under titleless outlines),
 * and a path past {@link MAX_FOLDER_DEPTH} folds its tail into the last
 * segment rather than being truncated.
 */
export function folderPathToName(path: readonly string[]): string | undefined {
  const parts = path.map((p) => p.trim()).filter(Boolean);
  if (!parts.length) {
    return undefined;
  }
  if (parts.length <= MAX_FOLDER_DEPTH) {
    return parts.join(FOLDER_SEPARATOR);
  }
  const head = parts.slice(0, MAX_FOLDER_DEPTH - 1);
  const tail = parts.slice(MAX_FOLDER_DEPTH - 1).join(' — ');
  return [...head, tail].join(FOLDER_SEPARATOR);
}

/** One subscribed feed. `title` is captured when the feed is first fetched. */
export interface RssFeedSub {
  url: string;
  title: string;
  enabled: boolean;
  /**
   * The folder this feed is filed under, or absent when it is unfiled.
   *
   * The folder's *name* is the identity — there is no id, no ordering, and no
   * folder record anywhere else. That is deliberate for this sprint: it makes a
   * folder come into existence by being typed and vanish by having nothing left
   * in it, which is the whole of what the reading rail needs, and it keeps the
   * shared `Folder{id,name,parentId,position}` primitive in
   * `spec/ui/folders_for_all.md` a proposal rather than a dependency. The cost
   * is that a rename is a bulk reassignment (see {@link renameFolder}) instead
   * of a one-field write; the name is the natural join key if this is ever
   * migrated to that model.
   *
   * Populated from OPML on import — the one place a user's own organisation of
   * their own subscriptions actually comes from. A feed added by pasting a URL
   * is unfiled: RSS and Atom documents carry publisher-assigned `<category>`
   * labels, but those are a topic taxonomy, not a statement about how this
   * reader wants their list arranged, and filing a new subscription under a
   * label nobody chose is worse than leaving it visibly in "Unsorted".
   */
  folder?: string;
  /**
   * Fetch this feed through the configured CORS proxy instead of directly.
   *
   * Opt-in per feed and absent by default, which is what makes the upgrade
   * safe: a subscription stored before this field existed reads as `undefined`
   * and keeps fetching directly. Turning it on is always a deliberate act on
   * one feed the user has watched fail — the app never enables it on their
   * behalf, because doing so would silently route a request through a third
   * party they did not choose.
   */
  useProxy?: boolean;
  /**
   * How many items the feed held when it was last read.
   *
   * Recorded opportunistically — whenever a fetch happens for some
   * other reason — rather than fetched on demand. The Feeds page wants to show
   * "· 12 items" next to every subscription, and fetching ten feeds to render
   * one hub page would be a lot of network for a decoration. Absent until the
   * feed has been read once, and the UI simply omits the count until then.
   */
  itemCount?: number;
}

/** A URL's hostname, or null when it isn't a parseable absolute URL. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function loadFeeds(key: string, limit: number): RssFeedSub[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch {
    return [];
  }
}

function loadLimit(key: string): number {
  return normalizeLimit(localStorage.getItem(key) ?? RSS_SUBSCRIPTION_LIMIT);
}

/**
 * The user's RSS subscriptions, persisted in localStorage like every other
 * Mockingbird preference (client-side only; works against any instance).
 *
 * The storage key is scoped to the active account (see {@link scopedKey}) so one
 * account's feeds don't bleed into another's. The key is resolved once at
 * construction; switching accounts hard-reloads the app, which reconstructs this
 * service against the new account's key.
 */
@Injectable({ providedIn: 'root' })
export class RssSubscriptions {
  private readonly storageKey = scopedKey(FEEDS_KEY_BASE);
  private readonly limitKey = scopedKey(LIMIT_KEY_BASE);

  /**
   * How many feeds this account may subscribe to.
   *
   * Account-scoped alongside the feeds themselves: the limit is a property of
   * one reading list, and an alt with three feeds should not inherit a ceiling
   * someone raised to import an OPML file into their main account.
   */
  readonly limit = signal<number>(loadLimit(this.limitKey));

  readonly feeds = signal<RssFeedSub[]>(loadFeeds(this.storageKey, this.limit()));

  readonly enabledFeeds = computed(() => this.feeds().filter((f) => f.enabled));

  /** Room left under the current limit. */
  readonly remaining = computed(() => Math.max(0, this.limit() - this.feeds().length));

  /**
   * Raise or lower the ceiling. Lowering below the current count is allowed and
   * does *not* delete anything — removing feeds someone deliberately added
   * because they moved a number down would be the worst possible reading of the
   * intent. It only stops new ones being added until they are back under.
   */
  setLimit(value: number): void {
    const limit = normalizeLimit(value);
    this.limit.set(limit);
    localStorage.setItem(this.limitKey, String(limit));
  }

  has(url: string): boolean {
    return this.feeds().some((f) => f.url === url);
  }

  /**
   * Subscribe to a feed.
   *
   * `useProxy` is recorded only when the caller has just *proved* the proxy
   * fetches this feed, so a subscription never claims a route that has not
   * worked at least once.
   */
  add(
    url: string,
    title: string,
    useProxy = false,
    itemCount?: number,
    folder?: string,
  ): string | null {
    if (this.has(url)) {
      return null;
    }
    if (this.feeds().length >= this.limit()) {
      return `You have reached your limit of ${this.limit()} RSS feeds. Raise it on the RSS feeds settings page.`;
    }
    const filed = folder?.trim();
    this.persist([
      ...this.feeds(),
      {
        url,
        title,
        enabled: true,
        ...(filed ? { folder: filed } : {}),
        ...(useProxy ? { useProxy } : {}),
        ...(typeof itemCount === 'number' ? { itemCount } : {}),
      },
    ]);
    return null;
  }

  /**
   * Replace the whole subscription list with one reconciled against the account.
   *
   * A bulk write rather than repeated {@link add} calls: `add` enforces the
   * subscription limit one feed at a time and would silently drop the tail of an
   * adopted list, and each call persists, so N feeds meant N writes and N
   * signal updates for what is one operation.
   *
   * Per-feed operational flags are preserved from the existing local entry where
   * there is one, and default off otherwise — `useProxy` especially, which is a
   * decision to route a request through a third party and must never be turned
   * on by machinery the user did not ask for.
   */
  adoptAll(feeds: { url: string; title: string }[]): void {
    const existing = new Map(this.feeds().map((feed) => [feed.url, feed]));
    this.persist(
      feeds.slice(0, this.limit()).map((feed) => {
        const previous = existing.get(feed.url);
        return {
          url: feed.url,
          title: feed.title,
          enabled: previous?.enabled ?? true,
          ...(previous?.folder ? { folder: previous.folder } : {}),
          ...(previous?.useProxy ? { useProxy: true } : {}),
          ...(previous?.itemCount === undefined ? {} : { itemCount: previous.itemCount }),
        };
      }),
    );
  }

  remove(url: string): void {
    this.persist(this.feeds().filter((f) => f.url !== url));
  }

  setEnabled(url: string, enabled: boolean): void {
    this.persist(this.feeds().map((f) => (f.url === url ? { ...f, enabled } : f)));
  }

  /**
   * Every folder currently in use, sorted for display.
   *
   * Derived from the feeds rather than stored: a folder exists exactly as long
   * as something is filed under it, so there is no empty-folder state to clean
   * up and no way for the rail to disagree with the list it is describing.
   * Sorted case-insensitively — a rail ordered by ASCII would put `Zines` above
   * `apps`, which reads as broken rather than as sorted.
   */
  readonly folders = computed(() =>
    [...new Set(this.feeds().flatMap((f) => (f.folder ? [f.folder] : [])))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    ),
  );

  /** File a feed under a folder, or pass an empty name to unfile it. */
  setFolder(url: string, folder: string | undefined): void {
    const filed = folder?.trim();
    this.persist(
      this.feeds().map((f) => {
        if (f.url !== url) {
          return f;
        }
        const { folder: _dropped, ...rest } = f;
        return filed ? { ...rest, folder: filed } : rest;
      }),
    );
  }

  /**
   * Rename a folder, moving every feed in it.
   *
   * A bulk reassignment because the name *is* the identity in this model — see
   * {@link RssFeedSub.folder}. Renaming onto a name already in use merges the
   * two, which is the same thing the user would get by moving the feeds one at
   * a time and is the only sensible reading of the request.
   */
  renameFolder(from: string, to: string): void {
    const target = to.trim();
    if (!target || target === from) {
      return;
    }
    this.persist(this.feeds().map((f) => (f.folder === from ? { ...f, folder: target } : f)));
  }

  /**
   * Record what a fetch just learned about a feed: its current title and how
   * many items it holds.
   *
   * Called from the read paths rather than by the Feeds page, so the hub gets
   * counts for free from browsing you were doing anyway. A feed the user has
   * never opened simply has no count, and the row omits it.
   *
   * Writes only when something actually changed — this runs on every feed load,
   * and re-serializing the whole subscription list each time would be a
   * pointless localStorage write on every timeline refresh.
   */
  recordFetch(url: string, title: string, itemCount: number): void {
    const feeds = this.feeds();
    const existing = feeds.find((f) => f.url === url);
    if (!existing) {
      return;
    }
    const nextTitle = title.trim() || existing.title;
    if (existing.itemCount === itemCount && existing.title === nextTitle) {
      return;
    }
    this.persist(feeds.map((f) => (f.url === url ? { ...f, title: nextTitle, itemCount } : f)));
  }

  /** Route this feed through the configured CORS proxy, or stop doing so. */
  setUseProxy(url: string, useProxy: boolean): void {
    this.persist(this.feeds().map((f) => (f.url === url ? { ...f, useProxy } : f)));
  }

  /** How many feeds currently go through a proxy — for the settings summary. */
  proxiedCount(): number {
    return this.feeds().filter((f) => f.useProxy).length;
  }

  /**
   * Whether a URL should be fetched through the proxy, by subscription.
   *
   * Several read paths (a feed-as-profile page, a single item, a comment feed)
   * receive only a URL, with no subscription in hand. Resolving the flag from
   * the URL keeps one feed's setting consistent however it is reached, instead
   * of the timeline honouring it and a click-through silently not.
   *
   * A comment feed usually lives on the same host as the feed that linked it,
   * so it inherits that feed's setting via `hostFallback` — the alternative is
   * comments that fail on exactly the feeds the user fixed.
   */
  usesProxy(url: string, hostFallback = true): boolean {
    const exact = this.feeds().find((f) => f.url === url);
    if (exact) {
      return exact.useProxy === true;
    }
    if (!hostFallback) {
      return false;
    }
    const host = hostOf(url);
    return host !== null && this.feeds().some((f) => f.useProxy && hostOf(f.url) === host);
  }

  private persist(feeds: RssFeedSub[]): void {
    this.feeds.set(feeds);
    localStorage.setItem(this.storageKey, JSON.stringify(feeds));
  }
}
