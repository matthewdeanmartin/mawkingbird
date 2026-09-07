import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearIndexedDbStore, inspectIndexedDb, totalRecords } from './indexed-db-inspector';

/**
 * jsdom implements neither IndexedDB nor the Storage estimate API, so both are
 * stubbed here. Globals are unstubbed after every test — the spec files share
 * one jsdom realm, and a leaked `indexedDB` would follow this file into the
 * next one.
 */

/** Minimal stand-in for an IDBRequest that resolves on the next microtask. */
function fakeRequest<T>(result: T, error?: string) {
  const request: Record<string, unknown> = { result, error: error ? new Error(error) : null };
  queueMicrotask(() => {
    const handler = error ? request['onerror'] : request['onsuccess'];
    (handler as (() => void) | undefined)?.();
  });
  return request;
}

/** A fake database with the object stores and values a test asks for. */
function fakeDb(version: number, stores: Record<string, unknown[]>) {
  const names = Object.assign(Object.keys(stores), {
    contains: (name: string) => Object.hasOwn(stores, name),
  });
  return {
    version,
    objectStoreNames: names,
    close: vi.fn(),
    transaction: () => ({
      objectStore: (name: string) => ({
        count: () => fakeRequest(stores[name].length),
        getAll: () => fakeRequest(stores[name]),
        clear: () => fakeRequest(undefined),
      }),
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('inspectIndexedDb', () => {
  it('reports databases, stores and record counts', async () => {
    vi.stubGlobal('indexedDB', {
      databases: async () => [
        { name: 'zeta', version: 2 },
        { name: 'alpha', version: 1 },
      ],
      open: (name: string) =>
        fakeRequest(
          name === 'alpha'
            ? fakeDb(1, {
                posts: Array.from({ length: 12 }, (_, id) => ({ id, text: 'post' })),
                media: Array.from({ length: 3 }, (_, id) => ({ id })),
              })
            : fakeDb(2, { things: [{ id: 1 }] }),
        ),
    });

    const report = await inspectIndexedDb();

    expect(report.supported).toBe(true);
    // Sorted by name, so the list is stable between refreshes.
    expect(report.databases.map((d) => d.name)).toEqual(['alpha', 'zeta']);
    expect(report.databases[0].stores).toEqual([
      { name: 'posts', count: 12, bytes: expect.any(Number) },
      { name: 'media', count: 3, bytes: expect.any(Number) },
    ]);
    expect(totalRecords(report.databases[0])).toBe(15);
  });

  it('closes every database it opens, so it never blocks another tab upgrade', async () => {
    const db = fakeDb(1, { posts: [{ id: 1 }] });
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'alpha', version: 1 }],
      open: () => fakeRequest(db),
    });

    await inspectIndexedDb();

    expect(db.close).toHaveBeenCalled();
  });

  it('clears one requested schema category and closes the database', async () => {
    const db = fakeDb(1, { posts: [{ id: 1 }] });
    const clear = vi.fn(() => fakeRequest(undefined));
    db.transaction = () => ({
      objectStore: () => ({
        count: () => fakeRequest(1),
        getAll: () => fakeRequest([{ id: 1 }]),
        clear,
      }),
    });
    vi.stubGlobal('indexedDB', { open: () => fakeRequest(db) });

    await clearIndexedDbStore('alpha', 'posts');

    expect(clear).toHaveBeenCalledOnce();
    expect(db.close).toHaveBeenCalled();
  });

  it('records a database that will not open as an error row instead of failing', async () => {
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'locked', version: 1 }],
      open: () => fakeRequest(null, 'blocked by another tab'),
    });

    const report = await inspectIndexedDb();

    expect(report.databases[0].error).toBe('blocked by another tab');
    expect(report.databases[0].stores).toEqual([]);
  });

  it('says so when the browser cannot enumerate databases', async () => {
    // Firefox: IndexedDB exists, databases() does not.
    vi.stubGlobal('indexedDB', { open: () => fakeRequest(null) });

    const report = await inspectIndexedDb();

    expect(report.supported).toBe(false);
    expect(report.note).toContain('cannot list');
    expect(report.databases).toEqual([]);
  });

  it('survives databases() rejecting', async () => {
    vi.stubGlobal('indexedDB', {
      databases: async () => {
        throw new Error('nope');
      },
      open: () => fakeRequest(null),
    });

    await expect(inspectIndexedDb()).resolves.toMatchObject({ supported: false });
  });

  it('reports quota usage and the persisted flag', async () => {
    vi.stubGlobal('indexedDB', { databases: async () => [], open: () => fakeRequest(null) });
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 500, quota: 2_000 }),
        persisted: async () => true,
      },
    });

    const { quota } = await inspectIndexedDb();

    expect(quota).toEqual({ usage: 500, quota: 2_000, ratio: 0.25, persisted: true });
  });

  it('returns null quota numbers when the browser has no Storage estimate', async () => {
    vi.stubGlobal('indexedDB', { databases: async () => [], open: () => fakeRequest(null) });
    vi.stubGlobal('navigator', {});

    const { quota } = await inspectIndexedDb();

    expect(quota).toEqual({ usage: null, quota: null, ratio: null, persisted: null });
  });
});
