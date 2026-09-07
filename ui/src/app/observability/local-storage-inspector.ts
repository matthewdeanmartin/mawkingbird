/**
 * Read-only helpers for inspecting the origin's localStorage from the
 * Observability page: what keys exist, how big each is, and the total. Deletion
 * is a one-liner (`localStorage.removeItem`) the page calls directly.
 *
 * "Size" is the UTF-16 byte cost of key + value (2 bytes per code unit), which
 * is what browsers actually count against the storage quota — good enough to
 * show the user what's eating their budget.
 */

export interface StorageEntry {
  key: string;
  /** Approximate bytes this entry costs (key + value, UTF-16). */
  bytes: number;
  /** Character length of the value, for a quick "how big" read. */
  valueChars: number;
}

export interface StorageReport {
  entries: StorageEntry[];
  totalBytes: number;
}

/** UTF-16 byte cost of a string (2 bytes per code unit). */
function byteSize(s: string): number {
  return s.length * 2;
}

/** Snapshot every localStorage entry with its size, largest first. */
export function inspectLocalStorage(
  predicate: (key: string) => boolean = () => true,
): StorageReport {
  const entries: StorageEntry[] = [];
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null) {
      continue;
    }
    if (!predicate(key)) {
      continue;
    }
    const value = localStorage.getItem(key) ?? '';
    const bytes = byteSize(key) + byteSize(value);
    totalBytes += bytes;
    entries.push({ key, bytes, valueChars: value.length });
  }
  entries.sort((a, b) => b.bytes - a.bytes);
  return { entries, totalBytes };
}

/**
 * Human-readable byte size (B / KB / MB / GB). The GB tier is there for the
 * storage *quota*, which is a share of the disk and routinely runs to several
 * gigabytes; no single localStorage key will ever get near it.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
