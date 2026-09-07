import { Injectable } from '@angular/core';
import { STORAGE_KEYS, classifyStorageKey, matchesKey } from './storage-registry';

/**
 * Erasing what this browser remembers, on the way out.
 *
 * The case this exists for: someone reads Mastodon on a machine that is not
 * theirs — an office desktop where signing in is not an option — and clicks
 * "Log out" expecting that to be the end of it. Before this, it was not. `Auth.logout`
 * clears the token and the mode and leaves everything else in place: who you follow,
 * your local lists, your muted words, and `mockingbird_anonymous_tags`, which the
 * registry itself flags as a disclosure risk because "subscribed to #<health topic>"
 * says something about a person. All of it sat there for the next user of the machine.
 *
 * Two teardowns, because "delete my data" has two honest answers:
 *
 *  - {@link clearAnonymousData} — the browser-local Anonymous session only. Saved
 *    signed-in accounts keep working. This is the one most people want, and the one
 *    that has to be *exactly* right: taking a signed-in user's data with it would be
 *    a betrayal of the narrower promise.
 *  - {@link clearAllData} — everything this app has ever written, including tokens.
 *
 * **The registry is the source of truth.** Neither method hand-writes a key list;
 * both walk `STORAGE_KEYS`. A key added without a registry entry already fails
 * `storage-registry.spec.ts`, which means it also cannot be silently missed here.
 */

/** IndexedDB databases the app creates. Not in the key registry, which is localStorage-only. */
const INDEXED_DB_NAMES = ['mockingbird_rss', 'mockingbird_twitter'] as const;

function isAnonymousData(key: string): boolean {
  const spec = classifyStorageKey(key);
  return spec?.group === 'anonymous' || (spec?.suffix === 'account' && key.endsWith('_anonymous'));
}

export const BACKUP_KIND = 'mawkingbird-browser-backup';
export const BACKUP_VERSION = 1;

export interface BrowserBackup {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  /** Raw localStorage values, keyed exactly as stored. */
  values: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class SessionTeardown {
  /**
   * Remove the Anonymous session's data, leaving saved accounts alone.
   *
   * Scoped by `group: 'anonymous'` on the registry rather than a name prefix: the
   * prefix would sweep in account-suffixed keys that signed-in sessions share, and
   * "delete my anonymous data" silently deleting a signed-in user's lists is the
   * failure this guards against.
   */
  clearAnonymousData(storage: Storage = localStorage): number {
    return this.removeMatching(storage, isAnonymousData);
  }

  /**
   * Remove everything the app has written: every registered key in both storages,
   * plus the IndexedDB caches.
   *
   * Unregistered keys are left alone on purpose. This app is not necessarily the
   * only thing on its origin, and a wipe that took keys it does not own would be a
   * worse bug than one that leaves a stale cache entry behind.
   */
  clearAllData(): number {
    let removed = this.removeMatching(localStorage, (key) => classifyStorageKey(key) !== null);
    removed += this.removeMatching(sessionStorage, (key) =>
      STORAGE_KEYS.some((spec) => spec.storage === 'session' && matchesKey(spec, key)),
    );
    this.clearIndexedDb();
    return removed;
  }

  /**
   * Best-effort: a delete blocked by another open tab must not strand the user on a
   * dialog that never resolves. The localStorage wipe is the part that matters, and
   * it has already happened by the time this runs.
   */
  private clearIndexedDb(): void {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    for (const name of INDEXED_DB_NAMES) {
      try {
        indexedDB.deleteDatabase(name);
      } catch {
        continue;
      }
    }
  }

  /**
   * A backup of exactly what a teardown is about to destroy.
   *
   * **Deliberately not `exportPortableConfig`.** That exporter builds a *shareable
   * setup* — it publishes `setting` keys plus a three-key private allowlist, and
   * none of the eight anonymous keys are in it. Offering it here would have handed
   * someone a file containing their theme and proxy choice while deleting the follow
   * list they thought they were saving, next to a button that says the action cannot
   * be undone.
   *
   * So this mirrors the teardown instead: same registry walk, same predicate, minus
   * credentials. Whatever the chosen wipe removes is what the file contains.
   *
   * `secret` keys are never included. A token in a Downloads folder outlives the
   * browser data it came from, and the tokens are the one thing genuinely re-obtainable
   * by signing in again.
   */
  backup(scope: 'anonymous' | 'all', storage: Storage = localStorage): BrowserBackup {
    const values: Record<string, string> = {};
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) {
        continue;
      }
      const spec = classifyStorageKey(key);
      if (!spec || spec.sensitivity === 'secret') {
        continue;
      }
      if (scope === 'anonymous' && !isAnonymousData(key)) {
        continue;
      }
      const value = storage.getItem(key);
      if (value !== null) {
        values[key] = value;
      }
    }
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      values,
    };
  }

  /** Collect first, then delete: removing while iterating by index skips entries. */
  private removeMatching(storage: Storage, predicate: (key: string) => boolean): number {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && predicate(key)) {
        doomed.push(key);
      }
    }
    for (const key of doomed) {
      storage.removeItem(key);
    }
    return doomed.length;
  }
}
