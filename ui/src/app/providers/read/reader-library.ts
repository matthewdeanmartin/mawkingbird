import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

/**
 * The library: every document the reader has picked up, and where they are in it.
 *
 * ## Shaped after `rss-read-state.ts`, deliberately
 *
 * The operator's instruction, and the right call: that file already solved this
 * problem. A flat `Record` keyed by the same id the rest of the app uses, a
 * tolerant `load()` that drops malformed entries rather than losing the whole
 * store, an age cap and an entry cap, and a startup prune whose drop count is
 * visible in diagnostics. Everything here follows it.
 *
 * The differences are the ones the data forces:
 *
 * - **Entries are records, not timestamps.** ~150 bytes rather than 8, which is
 *   why the entry cap is 2,000 and not 20,000.
 * - **A year, not 90 days.** Forgetting a read mark shows one stale item as
 *   unread. Forgetting a library entry loses something the reader deliberately
 *   kept.
 * - **Pruning has a priority order.** See {@link pruneLibrary}.
 *
 * ## Not the same store as RSS read/unread
 *
 * They overlap and stay separate, because they answer different questions:
 * *have I seen this headline* versus *is this on my shelf*. Reading an RSS item
 * in the pane marks it read in one and puts it on `reading` in the other. What
 * they share is this shape and, in the UI, the rail's look.
 *
 * See `sprint/kindle-2-library-and-progress.md`.
 */

/** Where a document sits. */
export type Shelf = 'intend' | 'reading' | 'read';

/** One document the reader has picked up. */
export interface LibraryEntry {
  /** Where it came from, for the row and for re-opening. */
  url: string;
  title: string;
  siteName: string | null;
  shelf: Shelf;
  /**
   * True when the reader filed this by hand.
   *
   * Automation stops moving a pinned entry. Without it, a reader who files a
   * half-finished article under "read" watches it move itself back the moment
   * they reopen it, which reads as the app arguing with them.
   */
  pinnedShelf: boolean;
  /** Furthest page reached, 1-based, and the page count it was measured against. */
  page: number;
  pages: number;
  /** First added, and last opened. Both drive pruning, sorting and merging. */
  addedAt: number;
  openedAt: number;
}

export type LibraryMap = Record<string, LibraryEntry>;

/** Where the library lives. Registered in `storage-registry.ts` as `private`. */
export const LIBRARY_KEY_BASE = 'mockingbird_reader_library';

/**
 * How long an entry is kept.
 *
 * A year rather than the read-state store's 90 days. The asymmetry is the point:
 * a read mark that ages out shows one item as unread again, while a library
 * entry that ages out loses a document someone put on a shelf on purpose.
 */
export const LIBRARY_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * How many entries survive regardless of age.
 *
 * `localStorage` is a ~5MB budget shared with every other key in
 * `storage-registry.ts`, and overrunning it does not fail here — it fails in
 * whatever writes next, which is the worst possible place to discover it. At
 * ~150 bytes an entry, 2,000 is ~300KB: far above ordinary use, far below where
 * this becomes anyone else's problem.
 */
export const LIBRARY_MAX_ENTRIES = 2_000;

/** Shelves in the order they are dropped when the cap is hit. See {@link pruneLibrary}. */
const EVICTION_ORDER: readonly Shelf[] = ['read', 'reading', 'intend'];

function isEntry(value: unknown): value is LibraryEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const e = value as Partial<LibraryEntry>;
  return (
    typeof e.url === 'string' &&
    typeof e.title === 'string' &&
    (e.shelf === 'intend' || e.shelf === 'reading' || e.shelf === 'read') &&
    typeof e.addedAt === 'number' &&
    Number.isFinite(e.addedAt) &&
    typeof e.openedAt === 'number' &&
    Number.isFinite(e.openedAt)
  );
}

/**
 * Read the store, dropping anything malformed.
 *
 * One hand-edited or half-written entry costs that entry, never the library.
 * The numeric fields are repaired rather than rejected: a missing `page` is a
 * document opened before positions were stored, and refusing it would throw
 * away a shelf placement over a field that has an obvious default.
 */
function load(key: string): LibraryMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: LibraryMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isEntry(value)) {
        continue;
      }
      out[id] = {
        ...value,
        siteName: typeof value.siteName === 'string' ? value.siteName : null,
        pinnedShelf: value.pinnedShelf === true,
        page: Number.isFinite(value.page) && value.page > 0 ? Math.floor(value.page) : 1,
        pages: Number.isFinite(value.pages) && value.pages > 0 ? Math.floor(value.pages) : 1,
      };
    }
    return dedupeLibrary(out);
  } catch {
    return {};
  }
}

/**
 * Drop entries that are too old, then too many.
 *
 * Pure and exported so it can be tested without booting Angular's DI — the same
 * reasoning as `pruneReadMap`, and the same payoff.
 *
 * ## The eviction order is not "oldest first"
 *
 * Age decides *whether* anything is dropped; shelf decides *what*. Finished
 * documents go first, then ones in progress, and `intend` last. A finished book
 * is a receipt — losing it costs a memory. An unread one is an intention, and
 * losing that is the app quietly deleting a plan the reader made. Within a
 * shelf, least-recently-opened goes first.
 *
 * A pinned entry is not protected from the cap. It is protected from
 * *automation moving its shelf*, which is a different promise; pretending the
 * cap can be opted out of would just mean overrunning `localStorage` instead.
 *
 * @returns the surviving map, and how many entries went, so a caller can say so
 */
export function pruneLibrary(
  map: LibraryMap,
  now = Date.now(),
  maxAge = LIBRARY_MAX_AGE_MS,
  maxEntries = LIBRARY_MAX_ENTRIES,
): { map: LibraryMap; dropped: number } {
  const before = Object.keys(map).length;
  // An entry exactly at the boundary is kept: the rule is "older than a year",
  // and one exactly a year old is not yet older than a year. Measured from
  // `openedAt` — a document reopened last week is current however long ago it
  // was first added.
  let entries = Object.entries(map).filter(([, e]) => now - e.openedAt <= maxAge);

  if (entries.length > maxEntries) {
    const byShelf = new Map<Shelf, [string, LibraryEntry][]>();
    for (const shelf of EVICTION_ORDER) {
      byShelf.set(shelf, []);
    }
    for (const pair of entries) {
      byShelf.get(pair[1].shelf)?.push(pair);
    }
    // Keep from the most-protected shelf inward, newest-opened first within each.
    const kept: [string, LibraryEntry][] = [];
    for (const shelf of [...EVICTION_ORDER].reverse()) {
      const group = (byShelf.get(shelf) ?? []).sort((a, b) => b[1].openedAt - a[1].openedAt);
      kept.push(...group.slice(0, Math.max(0, maxEntries - kept.length)));
    }
    entries = kept;
  }

  const dropped = before - entries.length;
  return { map: dropped ? Object.fromEntries(entries) : map, dropped };
}

/**
 * Merge a remote snapshot into a local one, last-write-wins per document.
 *
 * Pure, exported and tested from day one, and **nothing calls it yet**. It is
 * the seam for a later Plus sync, shaped the way `article-reading-tally.ts`
 * shaped its own: local stays authoritative, and the sync is an addition rather
 * than a migration of data already living in other people's browsers.
 *
 * `openedAt` is the comparison, not a sequence number or a server clock. Two
 * devices disagreeing about a document is settled by which one read it more
 * recently, which is both the obvious answer and one that needs no coordination.
 *
 * No tombstones. Deleting on one device and having it reappear from another is
 * an acceptable v1 outcome; building a CRDT for a reading list is not.
 */
export function mergeLibraries(local: LibraryMap, remote: LibraryMap): LibraryMap {
  const out: LibraryMap = { ...local };
  for (const [id, incoming] of Object.entries(remote)) {
    const mine = out[id];
    if (!mine || incoming.openedAt > mine.openedAt) {
      // `addedAt` keeps the earlier of the two: when a document joined the
      // library is a fact about the library, not about the winning device.
      out[id] = mine
        ? { ...incoming, addedAt: Math.min(mine.addedAt, incoming.addedAt) }
        : incoming;
    }
  }
  return out;
}

/** How far through a document a stored position is, as a fraction. */
export function progressOf(entry: LibraryEntry): number {
  if (entry.shelf === 'read') {
    return 1;
  }
  if (entry.pages <= 1) {
    return 1;
  }
  return Math.min(1, Math.max(0, (entry.page - 1) / (entry.pages - 1)));
}

/** A stable comparison key for one document reached through different route ids. */
export function libraryDocumentUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    const drop: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (/^(utm_.+|fbclid|gclid|mc_[ce]id|igshid|ref|ref_src|source)$/i.test(key)) {
        drop.push(key);
      }
    });
    for (const key of drop) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * Collapse entries that name the same URL under different route ids.
 *
 * The newer route id is retained because it is the one most recently proven to
 * open. A hand-filed shelf wins; otherwise Read wins over in-progress, while
 * the furthest proportional position supplies progress.
 */
export function dedupeLibrary(map: LibraryMap): LibraryMap {
  const out: LibraryMap = {};
  const idByUrl = new Map<string, string>();
  for (const [id, candidate] of Object.entries(map)) {
    const key = libraryDocumentUrl(candidate.url);
    const previousId = key ? idByUrl.get(key) : undefined;
    if (!previousId) {
      out[id] = candidate;
      if (key) {
        idByUrl.set(key, id);
      }
      continue;
    }
    const previous = out[previousId];
    const newerIsCandidate = candidate.openedAt >= previous.openedAt;
    const keepId = newerIsCandidate ? id : previousId;
    const newer = newerIsCandidate ? candidate : previous;
    // A newly opened entry starts as pages=1/page=1 before measurement. That is
    // not evidence it outranks a measured ten-page position, even though a
    // genuinely settled one-page document is complete once recorded.
    const mergeProgress = (entry: LibraryEntry): number =>
      entry.pages <= 1 && entry.shelf !== 'read' ? 0 : progressOf(entry);
    const progressEntry =
      mergeProgress(candidate) >= mergeProgress(previous) ? candidate : previous;
    const shelfRank: Record<Shelf, number> = { intend: 0, reading: 1, read: 2 };
    const shelfEntry =
      candidate.pinnedShelf !== previous.pinnedShelf
        ? candidate.pinnedShelf
          ? candidate
          : previous
        : shelfRank[candidate.shelf] >= shelfRank[previous.shelf]
          ? candidate
          : previous;
    delete out[previousId];
    out[keepId] = {
      ...newer,
      shelf: shelfEntry.shelf,
      pinnedShelf: shelfEntry.pinnedShelf,
      page: progressEntry.page,
      pages: progressEntry.pages,
      addedAt: Math.min(candidate.addedAt, previous.addedAt),
      openedAt: Math.max(candidate.openedAt, previous.openedAt),
    };
    idByUrl.set(key, keepId);
  }
  return out;
}

/**
 * At what fraction a document counts as read.
 *
 * 95% rather than 100%: the last page is often notes, comments or a footer, and
 * a reader who never technically lands on it should not accumulate a shelf of
 * nearly-finished documents.
 */
export const READ_THRESHOLD = 0.95;

/** What a caller knows about a document when it is opened. */
export interface DocumentIdentity {
  id: string;
  url: string;
  title: string;
  siteName?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReaderLibrary {
  private readonly key = scopedKey(LIBRARY_KEY_BASE);
  private readonly entries = signal<LibraryMap>(load(this.key));

  /**
   * How many entries the startup prune dropped, for Storage Diagnostics.
   *
   * Zero on every subsequent read of a healthy store, which is the point: a
   * non-zero number here is the only visible evidence that the prune runs at
   * all, and silent maintenance nobody can observe is indistinguishable from
   * maintenance that is not happening.
   */
  readonly prunedOnLoad = signal(0);

  constructor() {
    // Once, at construction: the store is already being read and parsed here,
    // so pruning costs nothing extra now and would be intrusive at any other
    // moment. Root-provided, so this is once per session.
    const { map, dropped } = pruneLibrary(this.entries());
    if (dropped) {
      this.prunedOnLoad.set(dropped);
      this.persist(map);
    }
  }

  /** Everything on one shelf, most recently opened first. */
  shelf(shelf: Shelf): (LibraryEntry & { id: string })[] {
    return Object.entries(this.entries())
      .filter(([, e]) => e.shelf === shelf)
      .sort((a, b) => b[1].openedAt - a[1].openedAt)
      .map(([id, e]) => ({ ...e, id }));
  }

  readonly counts = computed<Record<Shelf, number>>(() => {
    const counts: Record<Shelf, number> = { intend: 0, reading: 0, read: 0 };
    for (const entry of Object.values(this.entries())) {
      counts[entry.shelf]++;
    }
    return counts;
  });

  readonly total = computed(() => Object.keys(this.entries()).length);

  get(id: string): LibraryEntry | undefined {
    return this.entries()[id];
  }

  has(id: string): boolean {
    return this.entries()[id] !== undefined;
  }

  /**
   * Put a document on a shelf without opening it.
   *
   * The "save for later" path. Lands on `intend` and stays there: nothing has
   * been read, so there is no progress to derive a shelf from.
   */
  save(doc: DocumentIdentity, at = Date.now()): void {
    if (this.has(doc.id)) {
      return;
    }
    this.write(doc.id, {
      url: doc.url,
      title: doc.title,
      siteName: doc.siteName ?? null,
      shelf: 'intend',
      pinnedShelf: false,
      page: 1,
      pages: 1,
      addedAt: at,
      openedAt: at,
    });
  }

  /**
   * Record that a document was opened in the reader.
   *
   * **The caller decides whether it qualifies.** This does not ask
   * `isDocument()` itself: the same reasoning `markManyRead` gives for taking
   * an explicit id list. A store that resolves its own scope is where the
   * embarrassing bug lives — here, filling someone's library with every
   * two-line post they glanced at.
   */
  open(doc: DocumentIdentity, at = Date.now()): void {
    const existing = this.entries()[doc.id];
    if (!existing) {
      this.write(doc.id, {
        url: doc.url,
        title: doc.title,
        siteName: doc.siteName ?? null,
        shelf: 'reading',
        pinnedShelf: false,
        page: 1,
        pages: 1,
        addedAt: at,
        openedAt: at,
      });
      return;
    }
    this.write(doc.id, {
      ...existing,
      // The title can improve between visits — a post's linked article is
      // fetched and suddenly has a real headline instead of a URL.
      title: doc.title || existing.title,
      siteName: doc.siteName ?? existing.siteName,
      openedAt: at,
      shelf: existing.pinnedShelf || existing.shelf === 'read' ? existing.shelf : 'reading',
    });
  }

  /**
   * Record a position, and let it move the shelf.
   *
   * `pages` is stored alongside `page` because re-pagination changes what a
   * page number means — see `restorePage`.
   */
  recordPosition(id: string, page: number, pages: number, at = Date.now()): void {
    const existing = this.entries()[id];
    if (!existing) {
      return;
    }
    const safePages = Math.max(1, Math.floor(pages));
    const safePage = Math.min(Math.max(1, Math.floor(page)), safePages);
    // Furthest reached, not last seen: paging back to check something earlier
    // must not un-finish a document.
    const furthest = safePages === existing.pages ? Math.max(existing.page, safePage) : safePage;
    const next: LibraryEntry = {
      ...existing,
      page: furthest,
      pages: safePages,
      openedAt: at,
    };
    if (!existing.pinnedShelf) {
      next.shelf = progressOf(next) >= READ_THRESHOLD ? 'read' : 'reading';
    }
    this.write(id, next);
  }

  /**
   * Where to resume, and whether the answer is exact.
   *
   * Re-fetching an article, or changing the type size, changes the pagination —
   * and "you were on page 7" is meaningless against a different total. When the
   * totals differ the position is restored proportionally and the caller is
   * told, so the reader can be told too. Never restore silently to a wrong
   * place: a reader who cannot trust the resume will stop using it.
   */
  restorePage(id: string, pages: number): { page: number; approximate: boolean } {
    const entry = this.entries()[id];
    const safePages = Math.max(1, Math.floor(pages));
    if (!entry || entry.page <= 1) {
      return { page: 1, approximate: false };
    }
    if (entry.pages === safePages) {
      return { page: Math.min(entry.page, safePages), approximate: false };
    }
    const fraction = entry.pages > 1 ? (entry.page - 1) / (entry.pages - 1) : 0;
    const page = Math.min(safePages, Math.max(1, Math.round(fraction * (safePages - 1)) + 1));
    return { page, approximate: true };
  }

  /**
   * File a document by hand. Automation stops moving it afterwards.
   *
   * Un-pinning is `setShelf(id, entry.shelf, false)` — the reader putting it
   * back under automatic control without also moving it.
   */
  setShelf(id: string, shelf: Shelf, pinned = true): void {
    const existing = this.entries()[id];
    if (!existing) {
      return;
    }
    this.write(id, { ...existing, shelf, pinnedShelf: pinned });
  }

  /** Take a document off the shelves entirely. */
  remove(id: string): void {
    if (!this.has(id)) {
      return;
    }
    const { [id]: _dropped, ...rest } = this.entries();
    this.persist(rest);
  }

  /** Forget everything. For Storage Diagnostics' "clear my library". */
  clear(): void {
    this.persist({});
  }

  /** The whole library, for a later sync and for export. */
  snapshot(): LibraryMap {
    return { ...this.entries() };
  }

  /** Fold a remote snapshot in. Nothing calls this yet — see {@link mergeLibraries}. */
  merge(remote: LibraryMap): void {
    this.persist(mergeLibraries(this.entries(), remote));
  }

  private write(id: string, entry: LibraryEntry): void {
    this.persist({ ...this.entries(), [id]: entry });
  }

  private persist(map: LibraryMap): void {
    const unique = dedupeLibrary(map);
    this.entries.set(unique);
    localStorage.setItem(this.key, JSON.stringify(unique));
  }
}
