/**
 * Where the derived vault key lives between sessions.
 *
 * This is the security decision with the most weight on the client side, and it
 * is a choice between three bad options rather than a clever one:
 *
 * | Where | XSS can steal the key? | Prompts the user |
 * |---|---|---|
 * | `localStorage` | **Yes** — reads it as a string | Never |
 * | `sessionStorage` | Yes, within the tab | Every tab, forever |
 * | IndexedDB, non-extractable `CryptoKey` | **No** | Every 30 days |
 *
 * The third wins. The structured clone algorithm preserves a `CryptoKey`
 * including its non-extractability, so what is stored is a *handle* to a key the
 * browser will use on this page's behalf but will not hand over. Script here can
 * call `decrypt`; it cannot export the bytes and cannot POST them anywhere.
 *
 * **This is a reduction, not a fix**, and the threat model says so. An XSS while
 * the vault is unlocked can still read the plaintext credentials by decrypting
 * them. What it cannot do is take a key that keeps working from the attacker's
 * own machine after the tab closes — which is the difference between one
 * compromised session and a permanent breach.
 *
 * ## The rule with no exceptions
 *
 * The passphrase is never stored. The derived key's *bytes* are never stored.
 * Neither goes in `localStorage` under any circumstances. `vault-key-store.spec.ts`
 * asserts this against real storage after a full create/unlock/read/write cycle,
 * because it is exactly the shortcut a future refactor takes at 11pm when
 * IndexedDB's async API is annoying.
 */

/** Database and store names. Versioned so a schema change is explicit. */
const DB_NAME = 'mockingbird-vault';
const DB_VERSION = 1;
const STORE = 'keys';

/** The single record id. One vault per browser profile. */
const KEY_ID = 'vaultKey';
const EXPIRES_ID = 'vaultKeyExpires';

/**
 * How long an unlock lasts.
 *
 * Thirty days. Long enough that the feature does not feel like a nag — the whole
 * point is not re-pasting credentials — and short enough to bound how long a
 * stolen or borrowed device keeps working. Re-prompting is cheap; the user knows
 * their passphrase.
 */
export const UNLOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Private browsing in some engines, or storage disabled outright.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Resolving null rather than rejecting: every caller's answer to "IndexedDB
    // is unavailable" is the same as its answer to "nothing is stored" — prompt
    // for the passphrase. Making that an error would mean every call site
    // handling an exception to reach the same branch.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    void openDatabase().then((db) => {
      if (!db) {
        resolve(null);
        return;
      }
      let request: IDBRequest<T>;
      try {
        request = work(db.transaction(STORE, mode).objectStore(STORE));
      } catch {
        db.close();
        resolve(null);
        return;
      }
      request.onsuccess = () => {
        resolve(request.result);
        db.close();
      };
      request.onerror = () => {
        resolve(null);
        db.close();
      };
    });
  });
}

/** Remember an unlocked key for {@link UNLOCK_TTL_MS}. */
export async function rememberVaultKey(key: CryptoKey, now: number = Date.now()): Promise<void> {
  await withStore('readwrite', (store) => store.put(key, KEY_ID));
  await withStore('readwrite', (store) => store.put(now + UNLOCK_TTL_MS, EXPIRES_ID));
}

/**
 * The remembered key, or null if there is none or it has aged out.
 *
 * An expired key is **deleted on the way past** rather than merely ignored. A
 * key left sitting in storage past its own expiry is a credential nobody
 * believes exists, which is the worst kind to leave lying around.
 */
export async function recallVaultKey(now: number = Date.now()): Promise<CryptoKey | null> {
  const expires = await withStore<number>('readonly', (store) => store.get(EXPIRES_ID));
  if (typeof expires !== 'number' || expires <= now) {
    if (expires !== null) {
      await forgetVaultKey();
    }
    return null;
  }
  const key = await withStore<CryptoKey>('readonly', (store) => store.get(KEY_ID));
  // Duck-typed rather than `instanceof CryptoKey`: some engines expose the
  // constructor under a different global in workers, and a wrong answer here
  // would silently drop a perfectly good key.
  return key && typeof (key as CryptoKey).algorithm === 'object' ? key : null;
}

/** Forget the key. Used by explicit lock, sign-out, and data deletion. */
export async function forgetVaultKey(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(KEY_ID));
  await withStore('readwrite', (store) => store.delete(EXPIRES_ID));
}

/** When the current unlock lapses, or null if the vault is locked. */
export async function unlockExpiresAt(now: number = Date.now()): Promise<Date | null> {
  const expires = await withStore<number>('readonly', (store) => store.get(EXPIRES_ID));
  return typeof expires === 'number' && expires > now ? new Date(expires) : null;
}
