import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIBRARY_KEY_BASE,
  LIBRARY_MAX_AGE_MS,
  LIBRARY_MAX_ENTRIES,
  LibraryEntry,
  LibraryMap,
  ReaderLibrary,
  dedupeLibrary,
  libraryDocumentUrl,
  mergeLibraries,
  progressOf,
  pruneLibrary,
} from './reader-library';
import { Shelf } from './reader-library';
import { scopedKey } from '../../account-scope';

/** The key the store writes to, resolved the same way the store resolves it. */
function storageKey(): string {
  return scopedKey(LIBRARY_KEY_BASE);
}

function entry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    url: 'https://example.com/a',
    title: 'A piece',
    siteName: 'Example',
    shelf: 'reading',
    pinnedShelf: false,
    page: 1,
    pages: 1,
    addedAt: 1_000,
    openedAt: 1_000,
    ...over,
  };
}

// ------------------------------------------------------------------ pure parts

describe('pruneLibrary', () => {
  it('keeps an entry exactly at the age boundary', () => {
    const now = 2_000_000_000_000;
    const map: LibraryMap = { a: entry({ openedAt: now - LIBRARY_MAX_AGE_MS }) };
    expect(pruneLibrary(map, now).dropped).toBe(0);
  });

  it('drops one that is older', () => {
    const now = 2_000_000_000_000;
    const map: LibraryMap = { a: entry({ openedAt: now - LIBRARY_MAX_AGE_MS - 1 }) };
    expect(pruneLibrary(map, now).dropped).toBe(1);
  });

  it('ages from openedAt, so a long-held document reopened last week survives', () => {
    const now = 2_000_000_000_000;
    const map: LibraryMap = {
      a: entry({ addedAt: now - LIBRARY_MAX_AGE_MS * 3, openedAt: now - 1000 }),
    };
    expect(pruneLibrary(map, now).dropped).toBe(0);
  });

  it('returns the original map object when nothing was dropped', () => {
    const map: LibraryMap = { a: entry() };
    expect(pruneLibrary(map, 2_000).map).toBe(map);
  });

  /**
   * The rule that makes the cap safe to have. Losing a finished document costs
   * a memory; losing an unread one deletes a plan the reader made.
   */
  it('evicts read before reading, and reading before intend', () => {
    const now = 2_000_000_000_000;
    const map: LibraryMap = {};
    // Three shelves, equal ages, more than the cap.
    const shelves: Shelf[] = ['read', 'reading', 'intend'];
    for (let i = 0; i < 30; i++) {
      map[`x${i}`] = entry({ shelf: shelves[i % 3], openedAt: now - i });
    }
    const { map: kept } = pruneLibrary(map, now, LIBRARY_MAX_AGE_MS, 12);

    const byShelf = { intend: 0, reading: 0, read: 0 };
    for (const e of Object.values(kept)) {
      byShelf[e.shelf]++;
    }
    expect(Object.keys(kept)).toHaveLength(12);
    // All ten intend survive; the rest of the budget goes to reading; read is gone.
    expect(byShelf.intend).toBe(10);
    expect(byShelf.reading).toBe(2);
    expect(byShelf.read).toBe(0);
  });

  it('drops least-recently-opened first within a shelf', () => {
    const now = 2_000_000_000_000;
    const map: LibraryMap = {
      old: entry({ shelf: 'read', openedAt: now - 10_000 }),
      recent: entry({ shelf: 'read', openedAt: now - 1 }),
    };
    const { map: kept } = pruneLibrary(map, now, LIBRARY_MAX_AGE_MS, 1);
    expect(Object.keys(kept)).toEqual(['recent']);
  });

  it('does not exempt a pinned entry from the cap', () => {
    // Pinning protects a shelf from automation, not from localStorage limits.
    const now = 2_000_000_000_000;
    const map: LibraryMap = {
      pinned: entry({ shelf: 'read', pinnedShelf: true, openedAt: now - 10_000 }),
      recent: entry({ shelf: 'read', openedAt: now - 1 }),
    };
    const { map: kept } = pruneLibrary(map, now, LIBRARY_MAX_AGE_MS, 1);
    expect(Object.keys(kept)).toEqual(['recent']);
  });

  it('leaves a library under both caps entirely alone', () => {
    const map: LibraryMap = {};
    for (let i = 0; i < LIBRARY_MAX_ENTRIES - 1; i++) {
      map[`x${i}`] = entry({ openedAt: 2_000_000_000_000 - i });
    }
    expect(pruneLibrary(map, 2_000_000_000_000).dropped).toBe(0);
  });
});

describe('mergeLibraries', () => {
  it('takes the more recently opened side per document', () => {
    const local: LibraryMap = { a: entry({ page: 3, openedAt: 100 }) };
    const remote: LibraryMap = { a: entry({ page: 9, openedAt: 200 }) };
    expect(mergeLibraries(local, remote)['a'].page).toBe(9);
  });

  it('keeps the local side when it is newer', () => {
    const local: LibraryMap = { a: entry({ page: 9, openedAt: 200 }) };
    const remote: LibraryMap = { a: entry({ page: 3, openedAt: 100 }) };
    expect(mergeLibraries(local, remote)['a'].page).toBe(9);
  });

  it('adds documents the other device has and this one does not', () => {
    const merged = mergeLibraries({ a: entry() }, { b: entry() });
    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
  });

  it('keeps the earlier addedAt — when it joined the library is not the winner’s to decide', () => {
    const local: LibraryMap = { a: entry({ addedAt: 50, openedAt: 100 }) };
    const remote: LibraryMap = { a: entry({ addedAt: 900, openedAt: 200 }) };
    expect(mergeLibraries(local, remote)['a'].addedAt).toBe(50);
  });

  it('does not mutate either input', () => {
    const local: LibraryMap = { a: entry({ openedAt: 100 }) };
    const remote: LibraryMap = { a: entry({ openedAt: 200 }) };
    mergeLibraries(local, remote);
    expect(local['a'].openedAt).toBe(100);
    expect(remote['a'].openedAt).toBe(200);
  });
});

describe('progressOf', () => {
  it('is 1 for anything on the read shelf, whatever the page says', () => {
    expect(progressOf(entry({ shelf: 'read', page: 1, pages: 40 }))).toBe(1);
  });

  it('is 0 at the first page of many', () => {
    expect(progressOf(entry({ page: 1, pages: 10 }))).toBe(0);
  });

  it('is complete when the whole document is one page', () => {
    expect(progressOf(entry({ page: 1, pages: 1 }))).toBe(1);
  });

  it('is 1 at the last page', () => {
    expect(progressOf(entry({ page: 10, pages: 10 }))).toBe(1);
  });

  it('is a fraction in between', () => {
    expect(progressOf(entry({ page: 6, pages: 11 }))).toBeCloseTo(0.5);
  });
});

describe('library document identity', () => {
  it('ignores fragments and tracking parameters when comparing URLs', () => {
    expect(libraryDocumentUrl('https://Example.com/story?utm_source=x#comments')).toBe(
      'https://example.com/story',
    );
  });

  it('collapses route-id duplicates and preserves the completed copy', () => {
    const unique = dedupeLibrary({
      oldRoute: entry({
        url: 'https://example.com/story?utm_source=feed',
        shelf: 'read',
        page: 8,
        pages: 8,
        openedAt: 100,
      }),
      newRoute: entry({
        url: 'https://example.com/story#top',
        shelf: 'reading',
        page: 1,
        pages: 8,
        openedAt: 200,
      }),
    });

    expect(Object.keys(unique)).toEqual(['newRoute']);
    expect(unique['newRoute'].shelf).toBe('read');
    expect(unique['newRoute'].page).toBe(8);
  });
});

// ------------------------------------------------------------------ the store

describe('ReaderLibrary', () => {
  let library: ReaderLibrary;

  const doc = { id: 'rss:feed::g1', url: 'https://example.com/a', title: 'A piece' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    library = TestBed.inject(ReaderLibrary);
  });

  it('starts empty', () => {
    expect(library.total()).toBe(0);
    expect(library.counts()).toEqual({ intend: 0, reading: 0, read: 0 });
  });

  it('save puts a document on the intend shelf without opening it', () => {
    library.save(doc);
    expect(library.get(doc.id)?.shelf).toBe('intend');
    expect(library.counts().intend).toBe(1);
  });

  it('open puts a new document on the reading shelf', () => {
    library.open(doc);
    expect(library.get(doc.id)?.shelf).toBe('reading');
  });

  it('opening a saved document moves it from intend to reading', () => {
    library.save(doc, 100);
    library.open(doc, 200);
    const entry = library.get(doc.id)!;
    expect(entry.shelf).toBe('reading');
    // Still the same entry, so "when did I save this" survives.
    expect(entry.addedAt).toBe(100);
    expect(entry.openedAt).toBe(200);
  });

  it('opening the same URL through another route id replaces rather than duplicates it', () => {
    library.open({ ...doc, id: 'old-route', url: 'https://example.com/a?utm_source=feed' }, 100);
    library.recordPosition('old-route', 10, 10, 150);

    library.open({ ...doc, id: 'new-route', url: 'https://example.com/a#article' }, 200);

    expect(Object.keys(library.snapshot())).toEqual(['new-route']);
    expect(library.get('new-route')?.shelf).toBe('read');
  });

  it('reaching the end moves a document to read', () => {
    library.open(doc);
    library.recordPosition(doc.id, 10, 10);
    expect(library.get(doc.id)?.shelf).toBe('read');
  });

  it('recording a settled one-page document moves it to read', () => {
    library.open(doc);
    library.recordPosition(doc.id, 1, 1);
    expect(library.get(doc.id)?.shelf).toBe('read');
  });

  it('does not mark a document read part-way through', () => {
    library.open(doc);
    library.recordPosition(doc.id, 5, 10);
    expect(library.get(doc.id)?.shelf).toBe('reading');
  });

  it('reopening a finished document does not un-finish it', () => {
    library.open(doc);
    library.recordPosition(doc.id, 10, 10);
    library.open(doc);
    expect(library.get(doc.id)?.shelf).toBe('read');
  });

  it('remembers the furthest page, not the last one seen', () => {
    // Paging back to check something earlier must not un-finish a document.
    library.open(doc);
    library.recordPosition(doc.id, 10, 10);
    library.recordPosition(doc.id, 2, 10);
    expect(library.get(doc.id)?.page).toBe(10);
    expect(library.get(doc.id)?.shelf).toBe('read');
  });

  it('a hand-filed shelf stops automation moving it', () => {
    library.open(doc);
    library.setShelf(doc.id, 'intend');
    library.recordPosition(doc.id, 10, 10);
    expect(library.get(doc.id)?.shelf).toBe('intend');
  });

  it('un-pinning hands it back to automation without moving it', () => {
    library.open(doc);
    library.setShelf(doc.id, 'intend');
    library.setShelf(doc.id, 'intend', false);
    expect(library.get(doc.id)?.shelf).toBe('intend');

    library.recordPosition(doc.id, 10, 10);
    expect(library.get(doc.id)?.shelf).toBe('read');
  });

  it('improves a placeholder title on a later visit', () => {
    // A post's linked article gets fetched and suddenly has a real headline.
    library.open({ ...doc, title: 'https://example.com/a' });
    library.open({ ...doc, title: 'The actual headline' });
    expect(library.get(doc.id)?.title).toBe('The actual headline');
  });

  it('recordPosition ignores a document that is not in the library', () => {
    library.recordPosition('never-opened', 3, 10);
    expect(library.total()).toBe(0);
  });

  it('shelf() lists most recently opened first', () => {
    library.open({ ...doc, id: 'a', url: 'https://example.com/a' }, 100);
    library.open({ ...doc, id: 'b', url: 'https://example.com/b' }, 300);
    library.open({ ...doc, id: 'c', url: 'https://example.com/c' }, 200);
    expect(library.shelf('reading').map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('remove takes a document off the shelves', () => {
    library.open(doc);
    library.remove(doc.id);
    expect(library.has(doc.id)).toBe(false);
  });

  // ------------------------------------------------------------ resume

  it('restores an exact page when the pagination has not changed', () => {
    library.open(doc);
    library.recordPosition(doc.id, 7, 12);
    expect(library.restorePage(doc.id, 12)).toEqual({ page: 7, approximate: false });
  });

  it('restores proportionally, and says so, when the pagination changed', () => {
    // Halfway through 11 pages is halfway through 21.
    library.open(doc);
    library.recordPosition(doc.id, 6, 11);
    expect(library.restorePage(doc.id, 21)).toEqual({ page: 11, approximate: true });
  });

  it('restores page 1 for a document it has never seen', () => {
    expect(library.restorePage('unknown', 9)).toEqual({ page: 1, approximate: false });
  });

  it('never restores past the end', () => {
    library.open(doc);
    library.recordPosition(doc.id, 40, 40);
    const { page } = library.restorePage(doc.id, 3);
    expect(page).toBeLessThanOrEqual(3);
  });

  // ------------------------------------------------------------ persistence

  it('survives a reload', () => {
    library.open(doc);
    library.recordPosition(doc.id, 4, 10);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ReaderLibrary);

    expect(reloaded.get(doc.id)?.page).toBe(4);
    expect(reloaded.get(doc.id)?.shelf).toBe('reading');
  });

  it('drops a malformed entry without losing the rest of the library', () => {
    library.open(doc);
    const key = Object.keys(JSON.parse(localStorage.getItem(storageKey())!))[0];
    const raw = JSON.parse(localStorage.getItem(storageKey())!) as Record<string, unknown>;
    raw['broken'] = { url: 5, title: null };
    localStorage.setItem(storageKey(), JSON.stringify(raw));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ReaderLibrary);

    expect(reloaded.has(key)).toBe(true);
    expect(reloaded.has('broken')).toBe(false);
  });

  it('recovers from unparseable storage rather than throwing', () => {
    localStorage.setItem(storageKey(), 'not json {{{');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(() => TestBed.inject(ReaderLibrary)).not.toThrow();
  });

  it('reports what the startup prune dropped', () => {
    const stale = Date.now() - LIBRARY_MAX_AGE_MS - 1;
    localStorage.setItem(
      storageKey(),
      JSON.stringify({
        a: entry({ url: 'https://example.com/a', openedAt: stale }),
        b: entry({ url: 'https://example.com/b', openedAt: stale }),
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ReaderLibrary);

    expect(reloaded.prunedOnLoad()).toBe(2);
    expect(reloaded.total()).toBe(0);
  });

  it('clear forgets everything', () => {
    library.open(doc);
    library.clear();
    expect(library.total()).toBe(0);
  });
});
