/**
 * The unlock cache.
 *
 * jsdom implements no IndexedDB, so one is faked here — a working in-memory
 * store rather than per-call stubs, so the module's real branching (expiry,
 * deletion on the way past, a database that will not open) is exercised instead
 * of mocked away. Same approach and the same unstubbing discipline as
 * `indexed-db-inspector.spec.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetVaultKey,
  recallVaultKey,
  rememberVaultKey,
  unlockExpiresAt,
  UNLOCK_TTL_MS,
} from './vault-key-store';

/** A request that resolves on the next microtask, like the real thing. */
function fakeRequest<T>(result: T, fail = false) {
  const request: Record<string, unknown> = { result, error: fail ? new Error('nope') : null };
  queueMicrotask(() => {
    (request[fail ? 'onerror' : 'onsuccess'] as (() => void) | undefined)?.();
  });
  return request;
}

/** A working in-memory IndexedDB, enough for one object store. */
function fakeIndexedDb(store = new Map<string, unknown>()) {
  const names = Object.assign(['keys'], { contains: (name: string) => name === 'keys' });
  return {
    store,
    binding: {
      open: () => {
        const request = fakeRequest({
          objectStoreNames: names,
          createObjectStore: vi.fn(),
          close: vi.fn(),
          transaction: () => ({
            objectStore: () => ({
              get: (id: string) => fakeRequest(store.get(id) ?? null),
              put: (value: unknown, id: string) => {
                store.set(id, value);
                return fakeRequest(undefined);
              },
              delete: (id: string) => {
                store.delete(id);
                return fakeRequest(undefined);
              },
            }),
          }),
        });
        return request;
      },
    },
  };
}

/** A real non-extractable key, so the structured-clone claim is tested honestly. */
async function realKey(): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('passphrase'),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(16), iterations: 1, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

let db: ReturnType<typeof fakeIndexedDb>;

beforeEach(() => {
  db = fakeIndexedDb();
  vi.stubGlobal('indexedDB', db.binding);
});

afterEach(() => vi.unstubAllGlobals());

describe('remembering a key', () => {
  it('recalls what it stored', async () => {
    const key = await realKey();
    await rememberVaultKey(key);
    expect(await recallVaultKey()).toBe(key);
  });

  it('stores the CryptoKey itself, not its bytes', async () => {
    // The property the whole design rests on. What lands in storage is a handle
    // to a key the browser will use on this page's behalf but will not hand
    // over — so an XSS can decrypt during this session but cannot take a key
    // that keeps working from the attacker's own machine afterwards.
    const key = await realKey();
    await rememberVaultKey(key);

    const stored = db.store.get('vaultKey') as CryptoKey;
    expect(stored.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', stored)).rejects.toThrow();
  });

  it('records an expiry 30 days out', async () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    await rememberVaultKey(await realKey(), now);
    expect(db.store.get('vaultKeyExpires')).toBe(now + UNLOCK_TTL_MS);
    expect(UNLOCK_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('reports when the unlock lapses', async () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    await rememberVaultKey(await realKey(), now);
    expect((await unlockExpiresAt(now))?.getTime()).toBe(now + UNLOCK_TTL_MS);
  });
});

describe('expiry', () => {
  it('refuses a key past its expiry', async () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    await rememberVaultKey(await realKey(), now);
    expect(await recallVaultKey(now + UNLOCK_TTL_MS + 1)).toBeNull();
  });

  it('deletes an expired key rather than leaving it lying about', async () => {
    // A key sitting in storage past its own expiry is a credential nobody
    // believes exists, which is the worst kind to leave behind.
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    await rememberVaultKey(await realKey(), now);
    await recallVaultKey(now + UNLOCK_TTL_MS + 1);
    expect(db.store.has('vaultKey')).toBe(false);
    expect(db.store.has('vaultKeyExpires')).toBe(false);
  });

  it('still holds a key one moment before expiry', async () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    await rememberVaultKey(await realKey(), now);
    expect(await recallVaultKey(now + UNLOCK_TTL_MS - 1)).not.toBeNull();
  });

  it('reports no expiry once locked', async () => {
    expect(await unlockExpiresAt()).toBeNull();
  });
});

describe('forgetting', () => {
  it('clears both records', async () => {
    await rememberVaultKey(await realKey());
    await forgetVaultKey();
    expect(db.store.size).toBe(0);
    expect(await recallVaultKey()).toBeNull();
  });

  it('is harmless when nothing is stored', async () => {
    await expect(forgetVaultKey()).resolves.toBeUndefined();
  });
});

describe('when storage is unavailable', () => {
  it('reports no key rather than throwing', async () => {
    // Private browsing, or storage disabled. Every caller's answer to "IndexedDB
    // is unavailable" is the same as to "nothing is stored" — prompt for the
    // passphrase — so this must not become an exception each of them handles.
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('SecurityError');
      },
    });
    await expect(recallVaultKey()).resolves.toBeNull();
  });

  it('survives a database that fails to open', async () => {
    vi.stubGlobal('indexedDB', { open: () => fakeRequest(null, true) });
    await expect(recallVaultKey()).resolves.toBeNull();
    await expect(rememberVaultKey(await realKey())).resolves.toBeUndefined();
  });
});

describe('nothing sensitive reaches localStorage', () => {
  it('leaves no key material behind after a full cycle', async () => {
    // The rule with no exceptions, asserted against real storage. This is the
    // shortcut a future refactor takes when IndexedDB's async API is annoying,
    // and it is the one that would undo the entire XSS argument.
    localStorage.clear();
    const key = await realKey();
    await rememberVaultKey(key);
    await recallVaultKey();
    await forgetVaultKey();

    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain('passphrase');
    expect(dump).not.toContain('vaultKey');
    expect(localStorage.getItem('vaultKey')).toBeNull();
  });
});
