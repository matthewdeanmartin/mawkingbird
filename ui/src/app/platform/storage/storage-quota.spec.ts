import { afterEach, describe, expect, it } from 'vitest';
import {
  describeStorage,
  freeCachedStorage,
  isQuotaExceeded,
  onStoragePressure,
  relieveStoragePressure,
  setItemFreeingCache,
  StoragePressure,
} from './storage-quota';

/** A Storage with a character budget, failing the way browsers do when it runs out. */
class FullStorage implements Storage {
  private readonly items = new Map<string, string>();
  constructor(private readonly capacity: number) {}
  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const used = [...this.items].reduce(
      (sum, [k, v]) => sum + (k === key ? 0 : k.length + v.length),
      0,
    );
    if (used + key.length + value.length > this.capacity)
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
  }
}

// Classified in the storage registry: a refetchable cache, and a credential.
const CACHE = 'mockingbird_translation_pairs_cache';
const SECRET = 'mastodon_mock_token';

describe('isQuotaExceeded', () => {
  it('recognises every engine spelling of a full storage', () => {
    expect(isQuotaExceeded(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceeded({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceeded({ code: 22 })).toBe(true);
    expect(isQuotaExceeded(new Error('network'))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});

describe('freeCachedStorage', () => {
  it('removes only keys the registry classifies as caches', () => {
    const storage = new FullStorage(1000);
    storage.setItem(CACHE, 'x'.repeat(100));
    storage.setItem(SECRET, 'token');
    storage.setItem('someone_elses_key', 'kept');

    expect(freeCachedStorage(storage)).toEqual({
      keys: 1,
      characters: CACHE.length + 100,
      removed: [CACHE],
    });
    expect(storage.getItem(CACHE)).toBeNull();
    expect(storage.getItem(SECRET)).toBe('token');
    expect(storage.getItem('someone_elses_key')).toBe('kept');
  });
});

describe('setItemFreeingCache', () => {
  it('drops caches and retries when the storage is full', () => {
    const storage = new FullStorage(CACHE.length + 200);
    storage.setItem(CACHE, 'x'.repeat(200));

    setItemFreeingCache(SECRET, 'new-token', storage);

    expect(storage.getItem(SECRET)).toBe('new-token');
    expect(storage.getItem(CACHE)).toBeNull();
  });

  it('rethrows the quota error when there are no caches to drop', () => {
    const storage = new FullStorage(20);
    storage.setItem('someone_elses_key', 'abc');
    expect(() => setItemFreeingCache(SECRET, 'x'.repeat(50), storage)).toThrow(
      /quota has been exceeded/,
    );
    expect(storage.getItem('someone_elses_key')).toBe('abc');
  });

  it('rethrows other errors untouched, without dropping caches', () => {
    const storage = new FullStorage(1000);
    storage.setItem(CACHE, 'cached');
    storage.setItem = () => {
      throw new Error('blocked');
    };
    expect(() => setItemFreeingCache(SECRET, 'x', storage)).toThrow('blocked');
    expect(storage.getItem(CACHE)).toBe('cached');
  });
});

describe('storage pressure reports', () => {
  const events: StoragePressure[] = [];
  const stop = onStoragePressure((event) => events.push(event));
  afterEach(() => {
    events.length = 0;
  });

  it('measures what is using the space by class, registry entry and key, never values', () => {
    const storage = new FullStorage(10_000);
    storage.setItem(CACHE, 'x'.repeat(300));
    storage.setItem(SECRET, 'token-value');
    storage.setItem('someone_elses_key', 'abc');

    const usage = describeStorage(storage);

    expect(usage.keys).toBe(3);
    expect(usage.bySensitivity.cache).toBe(CACHE.length + 300);
    expect(usage.bySensitivity.unregistered).toBe('someone_elses_key'.length + 3);
    expect(usage.byBase[0]).toEqual({
      base: CACHE,
      sensitivity: 'cache',
      keys: 1,
      characters: CACHE.length + 300,
    });
    expect(usage.largest[0].key).toBe(CACHE);
    expect(JSON.stringify(usage)).not.toContain('token-value');
  });

  it('reports a write that freeing rescued, with usage measured before anything was dropped', () => {
    const storage = new FullStorage(CACHE.length + 200);
    storage.setItem(CACHE, 'x'.repeat(200));

    setItemFreeingCache(SECRET, 'new-token', storage);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      writing: SECRET,
      recovered: true,
      freed: { removed: [CACHE] },
    });
    expect(events[0].usage.byBase[0].base).toBe(CACHE);
  });

  it('reports a write that could not be rescued, once, even when the error is handled again', () => {
    const storage = new FullStorage(20);
    let thrown: unknown;
    try {
      setItemFreeingCache(SECRET, 'x'.repeat(50), storage);
    } catch (error) {
      thrown = error;
    }
    relieveStoragePressure(thrown, storage);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ writing: SECRET, recovered: false });
  });

  it('reports a quota error that surfaced somewhere else', () => {
    const storage = new FullStorage(1000);
    storage.setItem(CACHE, 'cached');

    relieveStoragePressure(new DOMException('full', 'QuotaExceededError'), storage);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ writing: null, recovered: false, freed: { keys: 1 } });
  });

  it('stops reporting to a listener that unsubscribed', () => {
    stop();
    relieveStoragePressure(new DOMException('full', 'QuotaExceededError'), new FullStorage(10));
    expect(events).toHaveLength(0);
  });
});
