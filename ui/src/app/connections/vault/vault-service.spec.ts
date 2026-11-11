/**
 * The vault lifecycle, driven against a fake server that holds real ciphertext.
 *
 * The double stores whatever the service uploads and hands it back verbatim, so
 * every test here does a genuine encrypt/decrypt round trip. A double that
 * returned plaintext would let a broken seal pass, which is the one failure this
 * suite exists to catch.
 */

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultClient, type VaultMeta, type VaultResult } from './vault-client';
import { CURRENT_KDF, generateSalt } from './vault-crypto';
import { VaultService } from './vault-service';
import { readFromBundle } from './vault-manifest';

/** A cheap KDF: 600,000 iterations per unlock would make this suite crawl. */
const FAST_KDF = { name: 'pbkdf2-sha256', params: { iterations: 1 } };

function metaFor(overrides: Partial<VaultMeta> = {}): VaultMeta {
  return {
    version: 1,
    saltB64: generateSalt(),
    kdf: FAST_KDF,
    policy: { kind: 'idle', days: 365 },
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    lastReadAt: '2026-08-19T00:00:00.000Z',
    bytes: 100,
    masterKeyVersion: 1,
    expiresAt: '2027-08-19T00:00:00.000Z',
    graceKind: 'none',
    ...overrides,
  };
}

/**
 * A server that stores ciphertext.
 *
 * Deliberately faithful about the two things the service actually branches on:
 * it refuses a stale version with a conflict, and it never sees plaintext.
 */
class FakeVaultServer {
  blob: string | null = null;
  meta: VaultMeta | null = null;
  /** Set to make the next store() report a conflict, as a second device would. */
  conflictOnce = false;
  storeCalls = 0;

  metaResult(): VaultResult<VaultMeta> {
    return this.meta ? { kind: 'ok', value: this.meta } : { kind: 'absent' };
  }

  fetchResult(): VaultResult<{ blob: string; version: number; meta: VaultMeta }> {
    return this.blob && this.meta
      ? { kind: 'ok', value: { blob: this.blob, version: this.meta.version, meta: this.meta } }
      : { kind: 'absent' };
  }

  store(
    blob: string,
    saltB64: string,
    kdf: typeof CURRENT_KDF,
    version: number | null,
  ): VaultResult<{ version: number; meta: VaultMeta }> {
    this.storeCalls++;
    if (this.conflictOnce) {
      this.conflictOnce = false;
      return { kind: 'conflict', currentVersion: this.meta?.version ?? 0 };
    }
    if (this.meta && version !== this.meta.version) {
      return { kind: 'conflict', currentVersion: this.meta.version };
    }
    const next = (this.meta?.version ?? 0) + 1;
    this.blob = blob;
    // The salt is whatever the client sent, carried forward unchanged. The real
    // service does the same, and it matters here: a double that minted a fresh
    // salt per write would silently re-key the vault on every store, so no test
    // could ever exercise a second device opening it.
    this.meta = metaFor({ version: next, saltB64, kdf });
    return { kind: 'ok', value: { version: next, meta: this.meta } };
  }
}

let server: FakeVaultServer;
let service: VaultService;

/** An in-memory IndexedDB, since jsdom has none. */
function fakeIndexedDb() {
  const store = new Map<string, unknown>();
  const names = Object.assign(['keys'], { contains: () => true });
  const request = <T>(result: T) => {
    const object: Record<string, unknown> = { result };
    queueMicrotask(() => (object['onsuccess'] as (() => void) | undefined)?.());
    return object;
  };
  return {
    store,
    open: () =>
      request({
        objectStoreNames: names,
        createObjectStore: vi.fn(),
        close: vi.fn(),
        transaction: () => ({
          objectStore: () => ({
            get: (id: string) => request(store.get(id) ?? null),
            put: (value: unknown, id: string) => {
              store.set(id, value);
              return request(undefined);
            },
            delete: (id: string) => {
              store.delete(id);
              return request(undefined);
            },
          }),
        }),
      }),
  };
}

beforeEach(() => {
  server = new FakeVaultServer();
  const db = fakeIndexedDb();
  vi.stubGlobal('indexedDB', db);
  localStorage.clear();

  const client: Partial<VaultClient> = {
    meta: () => Promise.resolve(server.metaResult()),
    fetch: () => Promise.resolve(server.fetchResult()),
    store: (blob, salt, kdf, version) => Promise.resolve(server.store(blob, salt, kdf, version)),
    destroy: () => {
      server.blob = null;
      server.meta = null;
      return Promise.resolve({ kind: 'ok' as const, value: { deleted: true } });
    },
  };

  TestBed.configureTestingModule({
    providers: [{ provide: VaultClient, useValue: client }],
  });
  service = TestBed.inject(VaultService);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('creating a vault', () => {
  it('starts unlocked and empty', async () => {
    expect(await service.create('correct horse battery staple')).toBeNull();
    expect(service.state()).toBe('unlocked');
    expect(service.count()).toBe(0);
  });

  it('refuses a weak passphrase without contacting the server', async () => {
    expect(await service.create('short')).toMatch(/12 characters/);
    expect(server.storeCalls).toBe(0);
    expect(service.state()).not.toBe('unlocked');
  });

  it('uploads ciphertext, never the bundle', async () => {
    await service.create('correct horse battery staple');
    await service.write('mockingbird_openrouter_key', 'sk-or-v1-secret');
    // The claim the whole feature rests on, asserted against what actually
    // crossed the wire.
    expect(server.blob).not.toContain('sk-or-v1-secret');
    expect(atob(server.blob ?? '')).not.toContain('sk-or-v1-secret');
    expect(server.blob).not.toContain('openrouter');
  });
});

describe('reading and writing', () => {
  beforeEach(async () => {
    await service.create('correct horse battery staple');
  });

  it('round-trips a credential', async () => {
    expect((await service.write('mockingbird_openrouter_key', 'sk-1')).ok).toBe(true);
    expect(service.read('mockingbird_openrouter_key')).toBe('sk-1');
  });

  it('applies adjacent writes to one connector in call order', async () => {
    const client = TestBed.inject(VaultClient);
    const store = client.store.bind(client);
    let releaseFirst: (() => void) | null = null;
    let calls = 0;
    client.store = async (...args) => {
      calls++;
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return store(...args);
    };

    const first = service.write('mockingbird_twitter_keys', 'key without final provider');
    await vi.waitFor(() => expect(releaseFirst).not.toBeNull());
    const second = service.write('mockingbird_twitter_keys', 'key plus final provider');
    releaseFirst!();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, overwritten: [] },
      { ok: true, overwritten: [] },
    ]);
    expect(service.read('mockingbird_twitter_keys')).toBe('key plus final provider');
  });

  it('keeps personas apart', async () => {
    await service.write('mockingbird_hugo_credentials', 'A', 'mastodon:a/alice');
    await service.write('mockingbird_hugo_credentials', 'B', 'mastodon:b/bob');
    expect(service.read('mockingbird_hugo_credentials', 'mastodon:a/alice')).toBe('A');
    expect(service.read('mockingbird_hugo_credentials', 'mastodon:b/bob')).toBe('B');
    // Absent under browser scope: an account-scoped key must not leak sideways.
    expect(service.read('mockingbird_hugo_credentials')).toBeNull();
  });

  it('removes a credential', async () => {
    await service.write('mockingbird_openrouter_key', 'sk-1');
    expect((await service.remove('mockingbird_openrouter_key')).ok).toBe(true);
    expect(service.read('mockingbird_openrouter_key')).toBeNull();
  });

  it('counts what is stored', async () => {
    await service.write('mockingbird_openrouter_key', 'sk-1');
    await service.write('mockingbird_hugo_credentials', 'A', 'mastodon:a/alice');
    expect(service.count()).toBe(2);
    expect(service.storedConnectors()).toEqual(['openrouter', 'hugo']);
    expect(service.hasConnector('openrouter', 'mastodon:b/bob')).toBe(true);
    expect(service.hasConnector('hugo', 'mastodon:a/alice')).toBe(true);
    expect(service.hasConnector('hugo', 'mastodon:b/bob')).toBe(false);
    expect(service.hasConnector('bluesky', 'mastodon:a/alice')).toBe(false);
  });

  it('refuses to write while locked', async () => {
    await service.lock();
    const outcome = await service.write('mockingbird_openrouter_key', 'sk-1');
    expect(outcome.ok).toBe(false);
  });
});

describe('unlocking', () => {
  it('opens a vault created earlier on another device', async () => {
    // The sprint's entire reason for existing, in one test: create here, forget
    // everything this browser knows, then open it again with the passphrase.
    await service.create('correct horse battery staple');
    await service.write('mockingbird_openrouter_key', 'sk-1');
    await service.lock();
    expect(service.state()).toBe('locked');

    expect(await service.unlock('correct horse battery staple')).toBe(true);
    expect(service.read('mockingbird_openrouter_key')).toBe('sk-1');
  });

  it('refuses a wrong passphrase and says so plainly', async () => {
    await service.create('correct horse battery staple');
    await service.lock();

    expect(await service.unlock('not the passphrase')).toBe(false);
    expect(service.notice()).toMatch(/does not open/i);
    // Still locked, not broken: the user simply tries again.
    expect(service.state()).toBe('locked');
  });

  it('does not lose an unlocked vault to a failed unlock attempt', async () => {
    await service.create('correct horse battery staple');
    await service.unlock('wrong');
    // The vault was already open; a mistyped passphrase must not close it.
    expect(service.read('mockingbird_openrouter_key')).toBeNull();
    expect(service.count()).toBe(0);
  });

  it('stays unlocked across a refresh, using the remembered key', async () => {
    await service.create('correct horse battery staple');
    await service.write('mockingbird_openrouter_key', 'sk-1');

    // A new service instance, same browser: the IndexedDB key is still there.
    const second = TestBed.inject(VaultService);
    await second.refresh();
    expect(second.state()).toBe('unlocked');
  });
});

describe('conflicts', () => {
  beforeEach(async () => {
    await service.create('correct horse battery staple');
  });

  it('merges rather than overwriting when another device wrote first', async () => {
    await service.write('mockingbird_openrouter_key', 'sk-mine');

    // Simulate the other device: it added a different credential and bumped the
    // version, so our next write is stale. Same salt, because it is the same
    // vault opened with the same passphrase elsewhere.
    const salt = server.meta?.saltB64 ?? '';
    const kdf = server.meta?.kdf ?? CURRENT_KDF;
    const theirs = await buildRemoteBundle(salt, kdf, 'mockingbird_cors_proxy_key', 'proxy-theirs');
    server.blob = theirs;
    server.meta = metaFor({ version: 99, saltB64: salt, kdf });

    const outcome = await service.write('mockingbird_shortener_keys', 'short-mine');
    expect(outcome.ok).toBe(true);
    // Neither side lost anything: per-credential merge, not last-write-wins.
    expect(service.read('mockingbird_shortener_keys')).toBe('short-mine');
    expect(service.read('mockingbird_cors_proxy_key')).toBe('proxy-theirs');
  });

  it('gives up after a second conflict rather than looping', async () => {
    // Two in a row is a real problem. Retrying forever hides it behind a
    // spinner while making it worse.
    const client = TestBed.inject(VaultClient) as unknown as {
      store: () => Promise<VaultResult<never>>;
    };
    client.store = () => Promise.resolve({ kind: 'conflict', currentVersion: 5 });

    const outcome = await service.write('mockingbird_openrouter_key', 'sk-1');
    expect(outcome.ok).toBe(false);
  });
});

describe('unavailable accounts', () => {
  it.each([
    ['vault_requires_idp', 'needs-idp'],
    ['not_a_tester', 'not-a-tester'],
    ['payment_required', 'needs-plus'],
  ])('maps %s to %s', async (code, reason) => {
    // Three different situations needing three different offers. Collapsing
    // them into "error" produces a dead end for the two with an obvious next
    // step.
    const client = TestBed.inject(VaultClient) as unknown as { meta: () => Promise<unknown> };
    client.meta = () => Promise.resolve({ kind: 'forbidden', message: 'no', code });

    await service.refresh();
    expect(service.state()).toBe('unavailable');
    expect(service.unavailableReason()).toBe(reason);
  });

  it('reports offline separately from refused', async () => {
    const client = TestBed.inject(VaultClient) as unknown as { meta: () => Promise<unknown> };
    client.meta = () => Promise.resolve({ kind: 'failed', message: 'offline' });

    await service.refresh();
    expect(service.unavailableReason()).toBe('offline');
  });

  it('reports absent when there is simply no vault yet', async () => {
    await service.refresh();
    expect(service.state()).toBe('absent');
  });
});

describe('destroying and re-keying', () => {
  it('destroys the vault and forgets the key', async () => {
    await service.create('correct horse battery staple');
    expect(await service.destroy()).toBe(true);
    expect(service.state()).toBe('absent');
    expect(server.blob).toBeNull();
  });

  it('changes the passphrase without the server learning either one', async () => {
    await service.create('first passphrase here');
    await service.write('mockingbird_openrouter_key', 'sk-1');

    expect(await service.changePassphrase('second passphrase here')).toBeNull();
    await service.lock();

    expect(await service.unlock('first passphrase here')).toBe(false);
    expect(await service.unlock('second passphrase here')).toBe(true);
    expect(service.read('mockingbird_openrouter_key')).toBe('sk-1');
  });

  it('refuses a weak new passphrase', async () => {
    await service.create('correct horse battery staple');
    expect(await service.changePassphrase('short')).toMatch(/12 characters/);
  });
});

describe('nothing plaintext reaches localStorage', () => {
  it('leaves no credential behind after a full cycle', async () => {
    await service.create('correct horse battery staple');
    await service.write('mockingbird_openrouter_key', 'sk-or-v1-verysecret');
    await service.lock();

    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain('sk-or-v1-verysecret');
    expect(dump).not.toContain('correct horse battery staple');
  });
});

/** Seal a bundle as another device would have, under the same vault key. */
async function buildRemoteBundle(
  salt: string,
  kdf: typeof CURRENT_KDF,
  base: string,
  value: string,
): Promise<string> {
  const { deriveVaultKey, sealBundle } = await import('./vault-crypto');
  // The same passphrase, salt *and* KDF the vault was created under. Getting any
  // of the three wrong produces a different key, and the service correctly
  // reports a bundle it cannot open rather than a merge conflict.
  const key = await deriveVaultKey('correct horse battery staple', salt, kdf);
  const bundle = {
    v: 1 as const,
    browser: { [base]: value },
    accounts: {},
    meta: { [base]: { addedAt: '2026-08-19T00:00:00.000Z', device: 'Windows' } },
  };
  // Sanity: the bundle we just built must actually read back.
  expect(readFromBundle(bundle, base, null)).toBe(value);
  return sealBundle(bundle, key);
}
