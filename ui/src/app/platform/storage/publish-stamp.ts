/**
 * When this browser last changed a post: published, edited or deleted one.
 *
 * Caches built from posts (the Blog cache) compare their age with this and
 * treat anything older as stale, so a new post shows up at once wherever it
 * was written from. A plain localStorage stamp rather than an event, so it
 * works across reloads and tabs and for caches that are not loaded yet.
 */
const STAMP_KEY = 'mockingbird_last_published';

export function stampPublished(now = Date.now()): void {
  try {
    localStorage.setItem(STAMP_KEY, String(now));
  } catch {
    // Without storage, caches simply live out their own TTL.
  }
}

/** Epoch ms of the last change, or 0 if none is known. */
export function lastPublished(): number {
  try {
    const value = Number(localStorage.getItem(STAMP_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
