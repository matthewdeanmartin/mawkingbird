import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

const READ_KEY_BASE = 'mockingbird_rss_read';
const STAR_KEY_BASE = 'mockingbird_rss_starred';

/**
 * When an item was read, keyed by the item's `Status.id`.
 *
 * A timestamp rather than a bare id set, even though nothing reads the value
 * yet: the 90-day wipe on the roadmap needs something to prune against, and
 * retrofitting a timestamp onto an id-only store later is a migration on data
 * that lives in other people's browsers. Storing a number now costs eight bytes
 * an item and removes that problem entirely.
 */
type ReadMap = Record<string, number>;

/** When an item was starred, same shape and same reasoning as {@link ReadMap}. */
type StarMap = Record<string, number>;

function load(key: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    // Drop anything that isn't a number — a hand-edited or half-written entry
    // should cost one item's state, not the whole store.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, at]) => typeof at === 'number' && Number.isFinite(at),
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * How long a read mark is kept.
 *
 * Ninety days, from the roadmap. The cost of being wrong is asymmetric:
 * forgetting an old read mark shows one stale item as unread, which is mildly
 * annoying; keeping every read mark forever eventually costs somebody their
 * `localStorage` budget, which breaks unrelated features with no visible cause.
 */
export const READ_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * How many read marks are kept regardless of age.
 *
 * Age alone does not bound a heavy reader: 300 items a day inside a 90-day
 * window is ~27,000 entries, and `localStorage` is a ~5MB budget *shared* with
 * every other key in `storage-registry.ts`. Overrunning it does not fail here —
 * it fails in whatever writes next, which is the worst place to discover it.
 *
 * 20,000 is far above ordinary use and far below where serializing this store
 * becomes noticeable.
 */
export const READ_MAX_ENTRIES = 20_000;

/**
 * Drop read marks that are too old, then too many.
 *
 * Pure and exported so it can be tested without booting Angular's DI — the same
 * reasoning as `people-cursor.ts`, and the same payoff.
 *
 * ## This never touches stars
 *
 * It deliberately takes only a {@link ReadMap}. Stars are a *deliberate act*:
 * the user saying "keep this". Ageing one out silently deletes something they
 * asked to keep — the one failure in this file that destroys data rather than
 * inconveniencing someone. A starred item whose read mark is pruned simply
 * becomes unread-and-starred, which is harmless and arguably correct.
 *
 * @returns the surviving map, and how many entries went, so a caller can say so
 */
export function pruneReadMap(
  map: ReadMap,
  now = Date.now(),
  maxAge = READ_MAX_AGE_MS,
  maxEntries = READ_MAX_ENTRIES,
): { map: ReadMap; dropped: number } {
  const before = Object.keys(map).length;
  // An entry exactly at the boundary is kept: the rule is "older than 90 days",
  // and a mark exactly 90 days old is not yet older than 90 days.
  let entries = Object.entries(map).filter(([, at]) => now - at <= maxAge);
  if (entries.length > maxEntries) {
    // Newest first, then cut: what survives is what the reader is most likely
    // to still care about seeing marked.
    entries = entries.sort((a, b) => b[1] - a[1]).slice(0, maxEntries);
  }
  const dropped = before - entries.length;
  return { map: dropped ? Object.fromEntries(entries) : map, dropped };
}

/**
 * Which RSS items have been read, and which are starred.
 *
 * Account-scoped `localStorage` like every other Mockingbird preference (see
 * {@link scopedKey}) — one person's reading history is not another's, and the
 * Anonymous account gets its own.
 *
 * ## Keyed by `Status.id`, not by (feed, guid)
 *
 * The adapter already builds `rss:<feedUrl>::<guid>` for every item
 * (`itemToStatus`), and that string is what the rendered card carries. Reusing
 * it verbatim is what guarantees read-state ids and rendered-item ids cannot
 * drift apart — the sprint's stated requirement — and it means marking a card
 * read never has to re-derive anything from the feed it came from.
 *
 * ## Read and starred are separate stores, deliberately
 *
 * They are independent booleans: a read item can be starred, an unread item can
 * be starred. Collapsing them into one per-item enum or record would make
 * "star an unread item" express something the data model has to special-case.
 * Two flat maps stay obvious, and each can be pruned on its own schedule (read
 * state ages out; a star is a deliberate act and should not).
 */
@Injectable({ providedIn: 'root' })
export class RssReadState {
  private readonly readKey = scopedKey(READ_KEY_BASE);
  private readonly starKey = scopedKey(STAR_KEY_BASE);

  private readonly readMap = signal<ReadMap>(load(this.readKey));
  private readonly starMap = signal<StarMap>(load(this.starKey));

  /**
   * How many read marks the startup prune dropped, for Storage Diagnostics.
   *
   * Zero on every subsequent read of a healthy store, which is the point: a
   * non-zero number here is the only visible evidence that the prune runs at
   * all, and silent maintenance that nobody can observe is indistinguishable
   * from maintenance that is not happening.
   */
  readonly prunedOnLoad = signal(0);

  constructor() {
    // Once, at construction. Not on a timer and not on every write: the store is
    // already being read and parsed here, so pruning costs nothing extra at this
    // moment and would be intrusive at any other. `RssReadState` is
    // root-provided, so this is once per session.
    //
    // Stars are deliberately not passed and deliberately not pruned — see
    // `pruneReadMap`.
    const { map, dropped } = pruneReadMap(this.readMap());
    if (dropped) {
      this.prunedOnLoad.set(dropped);
      this.persistRead(map);
    }
  }

  /** How many items are known-read. Exposed for diagnostics and settings copy. */
  readonly readCount = computed(() => Object.keys(this.readMap()).length);

  /** Every starred item id, newest star first. Backs the Starred filter. */
  readonly starredIds = computed(() =>
    Object.entries(this.starMap())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id),
  );

  readonly starredCount = computed(() => Object.keys(this.starMap()).length);

  isRead(itemId: string): boolean {
    return this.readMap()[itemId] !== undefined;
  }

  isStarred(itemId: string): boolean {
    return this.starMap()[itemId] !== undefined;
  }

  /** Mark one item read. A no-op when it already is, so callers can be careless. */
  markRead(itemId: string, at = Date.now()): void {
    if (this.isRead(itemId)) {
      return;
    }
    this.persistRead({ ...this.readMap(), [itemId]: at });
  }

  markUnread(itemId: string): void {
    if (!this.isRead(itemId)) {
      return;
    }
    const { [itemId]: _dropped, ...rest } = this.readMap();
    this.persistRead(rest);
  }

  /**
   * Mark many items read in one write.
   *
   * The bulk path exists because "mark all as read" on a folder can be hundreds
   * of items, and doing that as N calls to {@link markRead} would be N
   * serializations of the whole map to `localStorage`.
   *
   * **The caller decides the scope.** This takes an explicit list of ids rather
   * than a feed URL or folder name on purpose: the single most embarrassing bug
   * this feature could ship is marking everything read when the user asked for
   * one feed, and that is much easier to get wrong inside a store that resolves
   * scope for itself than in a caller that had to name the items.
   */
  markManyRead(itemIds: readonly string[], at = Date.now()): void {
    const next = { ...this.readMap() };
    let changed = false;
    for (const id of itemIds) {
      if (next[id] === undefined) {
        next[id] = at;
        changed = true;
      }
    }
    if (changed) {
      this.persistRead(next);
    }
  }

  /** Star or unstar one item. */
  setStarred(itemId: string, starred: boolean, at = Date.now()): void {
    if (starred === this.isStarred(itemId)) {
      return;
    }
    if (starred) {
      this.persistStar({ ...this.starMap(), [itemId]: at });
    } else {
      const { [itemId]: _dropped, ...rest } = this.starMap();
      this.persistStar(rest);
    }
  }

  toggleStarred(itemId: string): void {
    this.setStarred(itemId, !this.isStarred(itemId));
  }

  /** Forget everything. For the settings page's "clear reading history". */
  clear(): void {
    this.persistRead({});
    this.persistStar({});
  }

  private persistRead(map: ReadMap): void {
    this.readMap.set(map);
    localStorage.setItem(this.readKey, JSON.stringify(map));
  }

  private persistStar(map: StarMap): void {
    this.starMap.set(map);
    localStorage.setItem(this.starKey, JSON.stringify(map));
  }
}
