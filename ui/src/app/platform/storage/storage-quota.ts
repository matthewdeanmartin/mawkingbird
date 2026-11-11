import { classifyStorageKey, Sensitivity } from './storage-registry';

/**
 * Surviving a full `localStorage`, and finding out why it filled.
 *
 * Browsers give an origin about 5 MB, and caches (feed corpora, instance probes,
 * fetched articles) can fill it. Then *any* write throws `QuotaExceededError`,
 * including the few bytes that switching accounts needs. That used to leave a
 * user stuck: the switch failed half-way and every retry failed the same way.
 *
 * Keys the storage registry classifies as `cache` are, by definition, data held
 * only to avoid a request. Dropping them is always safe, so a write that hits the
 * quota frees them and tries once more before giving up.
 *
 * Freeing is a fallback, not a cache policy. Every time it happens, a
 * {@link StoragePressure} event says what was using the space before anything was
 * dropped, so a cache that grows without bound shows up in the diagnostic log and
 * bug reports and can be fixed at its source.
 */

/** Whether an error is the browser saying storage is full (every engine spells it differently). */
export function isQuotaExceeded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/** One key's share of storage. Sizes are UTF-16 characters of key plus value; values are never reported. */
export interface StorageKeyUsage {
  key: string;
  /** The registry entry the key belongs to, or null when nobody registered it. */
  base: string | null;
  sensitivity: Sensitivity | 'unregistered';
  characters: number;
}

/** What is using storage: totals, totals per sensitivity, per registry entry, and the largest keys. */
export interface StorageUsage {
  keys: number;
  characters: number;
  bySensitivity: Partial<Record<Sensitivity | 'unregistered', number>>;
  /** Registry bases (or unregistered keys) by total size, largest first. */
  byBase: {
    base: string;
    sensitivity: Sensitivity | 'unregistered';
    keys: number;
    characters: number;
  }[];
  largest: StorageKeyUsage[];
}

function keysOf(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (key): key is string => key !== null,
  );
}

/** Measure what is in storage, for a diagnostic. Reads sizes, never reports values. */
export function describeStorage(storage: Storage = localStorage, top = 10): StorageUsage {
  const usage: StorageUsage = {
    keys: 0,
    characters: 0,
    bySensitivity: {},
    byBase: [],
    largest: [],
  };
  const all: StorageKeyUsage[] = [];
  try {
    for (const key of keysOf(storage)) {
      const spec = classifyStorageKey(key);
      const characters = key.length + (storage.getItem(key)?.length ?? 0);
      all.push({
        key,
        base: spec?.base ?? null,
        sensitivity: spec?.sensitivity ?? 'unregistered',
        characters,
      });
    }
  } catch {
    // Unreadable storage: report what was measured.
  }
  const bases = new Map<string, StorageUsage['byBase'][number]>();
  for (const item of all) {
    usage.keys++;
    usage.characters += item.characters;
    usage.bySensitivity[item.sensitivity] =
      (usage.bySensitivity[item.sensitivity] ?? 0) + item.characters;
    const name = item.base ?? item.key;
    const group = bases.get(name) ?? {
      base: name,
      sensitivity: item.sensitivity,
      keys: 0,
      characters: 0,
    };
    group.keys++;
    group.characters += item.characters;
    bases.set(name, group);
  }
  usage.byBase = [...bases.values()].sort((a, b) => b.characters - a.characters).slice(0, top);
  usage.largest = all.sort((a, b) => b.characters - a.characters).slice(0, top);
  return usage;
}

/** What freeing caches removed. */
export interface FreedStorage {
  keys: number;
  /** UTF-16 characters of key plus value. */
  characters: number;
  /** The keys removed. */
  removed: string[];
}

/** Remove every `localStorage` key the registry classifies as a refetchable cache. */
export function freeCachedStorage(storage: Storage = localStorage): FreedStorage {
  const freed: FreedStorage = { keys: 0, characters: 0, removed: [] };
  let keys: string[];
  try {
    keys = keysOf(storage);
  } catch {
    return freed;
  }
  for (const key of keys) {
    if (classifyStorageKey(key)?.sensitivity !== 'cache') continue;
    try {
      freed.characters += key.length + (storage.getItem(key)?.length ?? 0);
      storage.removeItem(key);
      freed.keys++;
      freed.removed.push(key);
    } catch {
      // A key that cannot be read or removed is left alone.
    }
  }
  return freed;
}

/** One time storage ran out: what was being written, what filled it, what was freed, and whether that was enough. */
export interface StoragePressure {
  /** The key whose write hit the quota, or null when the error surfaced elsewhere. */
  writing: string | null;
  writingCharacters: number;
  /** Measured before anything was freed: this is the part that says why storage filled. */
  usage: StorageUsage;
  freed: FreedStorage;
  /** True when the write succeeded after freeing caches. */
  recovered: boolean;
}

const listeners = new Set<(event: StoragePressure) => void>();
const reported = new WeakSet<object>();

/** Hear about every storage-full incident (the diagnostic log subscribes). Returns an unsubscribe. */
export function onStoragePressure(listener: (event: StoragePressure) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(event: StoragePressure): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A diagnostic must never turn a recoverable write into a crash.
    }
  }
}

/**
 * Measure, free caches, and report one storage-full incident. For callers that
 * caught a quota error themselves (the global error handler). Skips the report
 * when {@link setItemFreeingCache} already reported this same error.
 */
export function relieveStoragePressure(
  error: unknown,
  storage: Storage = localStorage,
): FreedStorage {
  const alreadyReported = typeof error === 'object' && error !== null && reported.has(error);
  const usage = alreadyReported ? null : describeStorage(storage);
  const freed = freeCachedStorage(storage);
  if (usage) notify({ writing: null, writingCharacters: 0, usage, freed, recovered: false });
  return freed;
}

/**
 * `storage.setItem`, but a full storage first gives up its caches and the write
 * is retried once. Either way the incident is reported with what filled storage.
 * Still full after freeing: the original error is thrown, for the caller (or the
 * global error handler) to explain.
 */
export function setItemFreeingCache(
  key: string,
  value: string,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(key, value);
    return;
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error;
    const usage = describeStorage(storage);
    const freed = freeCachedStorage(storage);
    const event = { writing: key, writingCharacters: key.length + value.length, usage, freed };
    if (freed.keys > 0) {
      try {
        storage.setItem(key, value);
        notify({ ...event, recovered: true });
        return;
      } catch {
        // Still full: report and throw the original error below.
      }
    }
    notify({ ...event, recovered: false });
    if (typeof error === 'object' && error !== null) reported.add(error);
    throw error;
  }
}
