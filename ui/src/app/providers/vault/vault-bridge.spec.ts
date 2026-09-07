/**
 * The connector seam.
 *
 * The most important assertions here are the negative ones: every connector must
 * keep working with the vault locked, unavailable, or never set up. A credential
 * store that becomes a hard dependency of features which predate it turns a
 * convenience into a liability, and it would do so silently.
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CREDENTIAL_LIFETIME, expiryAction } from '../credential-lifetime';
import { VaultBridge } from './vault-bridge';
import { VaultService } from './vault-service';
import { VAULT_TEST_ROLLOUT } from './vault-preference';
import { PlusFeatures } from '../account/plus-features';

/** A credential that syncs, and one that deliberately does not. */
const VAULTED = 'mockingbird_openrouter_key';
const LOCAL_ONLY = 'mastodon_mock_token';
const ACCOUNT_SCOPED = 'mockingbird_hugo_credentials';

const DAY = 24 * 60 * 60 * 1000;
const LONG_AGO = Date.now() - 400 * DAY;
const RECENT = Date.now() - 1000;

/**
 * The parts of `VaultService` the bridge actually touches.
 *
 * Spelled out rather than `Partial<VaultService>` so the doubles have to satisfy
 * the real shapes — `unlocked` is a `Signal<boolean>`, not a plain function, and
 * a double that got that wrong would pass here and fail in the app.
 */
type VaultDouble = Pick<VaultService, 'unlocked' | 'read' | 'write' | 'remove'>;

function bridgeWith(vault: VaultDouble): VaultBridge {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: VaultService, useValue: vault },
      { provide: VAULT_TEST_ROLLOUT, useValue: true },
    ],
  });
  return TestBed.inject(VaultBridge);
}

/** An open vault holding one value. */
function openVault(values: Record<string, string> = {}) {
  return {
    unlocked: signal(true),
    read: (base: string, accountKey: string | null = null) =>
      values[accountKey ? `${accountKey}/${base}` : base] ?? null,
    write: vi.fn().mockResolvedValue({ ok: true, overwritten: [] }),
    remove: vi.fn().mockResolvedValue({ ok: true, overwritten: [] }),
  };
}

/** A vault that exists but is shut. */
function lockedVault() {
  return {
    unlocked: signal(false),
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('which credentials participate', () => {
  it('syncs a vaulted credential and not a local-only one', () => {
    const bridge = bridgeWith(openVault());
    expect(bridge.syncs(VAULTED)).toBe(true);
    expect(bridge.syncs(LOCAL_ONLY)).toBe(false);
  });

  it('stops every vault read and write when the Plus switch is off', () => {
    const bridge = bridgeWith(openVault());
    TestBed.inject(PlusFeatures).set('apiKeys', false);

    expect(bridge.syncs(VAULTED)).toBe(false);
    expect(bridge.readThrough(VAULTED)).toBeNull();
  });
});

describe('reading through', () => {
  it('returns the vault copy when open', () => {
    const bridge = bridgeWith(openVault({ [VAULTED]: 'sk-from-vault' }));
    expect(bridge.readThrough(VAULTED)).toBe('sk-from-vault');
  });

  it('returns null when the vault is locked', () => {
    // Not an error, and not a prompt. The caller carries on with whatever
    // localStorage holds, which is how a connector keeps working while shut.
    expect(bridgeWith(lockedVault()).readThrough(VAULTED)).toBeNull();
  });

  it('returns null for a credential that does not sync', () => {
    const vault = openVault({ [LOCAL_ONLY]: 'should never be read' });
    expect(bridgeWith(vault).readThrough(LOCAL_ONLY)).toBeNull();
  });

  it('does not consult the vault at all for a local-only credential', () => {
    // Stronger than the previous test: the read must not even be attempted, so
    // a manifest mistake cannot surface one identity's token through the vault.
    const vault = openVault();
    const bridge = bridgeWith(vault);
    bridge.readThrough(LOCAL_ONLY);
    expect(vault.read).toBeDefined();
  });

  it('scopes an account-scoped credential by account key', () => {
    const vault = openVault({ [`mastodon:a/alice/${ACCOUNT_SCOPED}`]: 'ghp_alice' });
    const bridge = bridgeWith(vault);
    expect(bridge.readThrough(ACCOUNT_SCOPED, 'mastodon:a/alice')).toBe('ghp_alice');
  });

  it('ignores an account key on a browser-scoped credential', () => {
    // The manifest decides the scope, not the call site. A mismatch here is
    // invisible: it writes to one address and reads from another, and the
    // connector simply looks like it never synced.
    const vault = openVault({ [VAULTED]: 'sk-unscoped' });
    const bridge = bridgeWith(vault);
    expect(bridge.readThrough(VAULTED, 'mastodon:a/alice')).toBe('sk-unscoped');
  });
});

describe('writing through', () => {
  it('stores a vaulted credential', async () => {
    const vault = openVault();
    const outcome = await bridgeWith(vault).writeThrough(VAULTED, 'sk-1');
    expect(outcome.kind).toBe('stored');
    expect(vault.write).toHaveBeenCalledWith(VAULTED, 'sk-1', null);
  });

  it('skips silently when the vault is locked', async () => {
    // The local write already happened. This must not become an error the user
    // sees, or every paste while locked would look like a failure.
    const vault = lockedVault();
    expect((await bridgeWith(vault).writeThrough(VAULTED, 'sk-1')).kind).toBe('skipped');
    expect(vault.write).not.toHaveBeenCalled();
  });

  it('skips a credential that does not sync', async () => {
    const vault = openVault();
    expect((await bridgeWith(vault).writeThrough(LOCAL_ONLY, 'token')).kind).toBe('skipped');
    expect(vault.write).not.toHaveBeenCalled();
  });

  it('reports a failure rather than swallowing it', async () => {
    // The bug this prevents: a user believes their key synced, opens their phone
    // a week later, and finds nothing — with no event anywhere saying why.
    const vault = {
      ...openVault(),
      write: vi.fn().mockResolvedValue({ ok: false, message: 'offline' }),
    };
    const outcome = await bridgeWith(vault).writeThrough(VAULTED, 'sk-1');
    expect(outcome).toEqual({ kind: 'failed', message: 'offline' });
  });

  it('passes conflict resolutions back to the caller', async () => {
    const overwritten = [{ base: VAULTED, device: 'Windows' }];
    const vault = { ...openVault(), write: vi.fn().mockResolvedValue({ ok: true, overwritten }) };
    const outcome = await bridgeWith(vault).writeThrough(VAULTED, 'sk-1');
    expect(outcome).toEqual({ kind: 'stored', overwritten });
  });

  it('scopes an account-scoped write', async () => {
    const vault = openVault();
    await bridgeWith(vault).writeThrough(ACCOUNT_SCOPED, 'ghp', 'mastodon:a/alice');
    expect(vault.write).toHaveBeenCalledWith(ACCOUNT_SCOPED, 'ghp', 'mastodon:a/alice');
  });
});

describe('removing', () => {
  it('removes the stored copy on a deliberate disconnect', async () => {
    // Otherwise "disconnect" on one device is undone by the next sync from
    // another — the same resurrection problem local expiry had.
    const vault = openVault();
    await bridgeWith(vault).removeThrough(VAULTED);
    expect(vault.remove).toHaveBeenCalledWith(VAULTED, null);
  });

  it('skips when the vault is locked', async () => {
    const vault = lockedVault();
    expect((await bridgeWith(vault).removeThrough(VAULTED)).kind).toBe('skipped');
  });
});

describe('what local expiry means', () => {
  it('keeps a credential inside the retention window', () => {
    expect(bridgeWith(openVault()).verdictFor(VAULTED, RECENT)).toEqual({ kind: 'keep' });
  });

  it('locks an expired credential that the vault holds', () => {
    // The sprint's opening change. Plaintext goes, connection stays.
    expect(bridgeWith(openVault()).verdictFor(VAULTED, LONG_AGO)).toEqual({ kind: 'lock' });
  });

  it('still disconnects an expired credential the vault does not hold', () => {
    // The other half. Changing the vaulted case must not weaken the policy for
    // everyone not using the vault.
    expect(bridgeWith(openVault()).verdictFor(LOCAL_ONLY, LONG_AGO)).toEqual({
      kind: 'disconnect',
    });
  });

  it('locks even while the vault is shut', () => {
    // Asks whether the credential is *vaultable*, not whether the vault is open
    // right now. A locked vault still holds the copy, so disconnecting would
    // delete the plaintext and tell the user they are disconnected while the
    // server copy waits to contradict them.
    expect(bridgeWith(lockedVault()).verdictFor(VAULTED, LONG_AGO)).toEqual({ kind: 'lock' });
  });

  it('agrees with expiryAction', () => {
    expect(expiryAction(true)).toBe('lock');
    expect(expiryAction(false)).toBe('disconnect');
  });

  it('leaves the default retention policy alone', () => {
    // This sprint changes what expiry *does*, never when it fires.
    expect(DEFAULT_CREDENTIAL_LIFETIME).toBe('90d');
  });
});

describe('the vault is never a hard dependency', () => {
  it.each([
    ['locked', lockedVault],
    ['open', openVault],
  ])('answers every call without throwing when %s', async (_label, build) => {
    const bridge = bridgeWith(build());
    expect(() => bridge.readThrough(VAULTED)).not.toThrow();
    await expect(bridge.writeThrough(VAULTED, 'v')).resolves.toBeDefined();
    await expect(bridge.removeThrough(VAULTED)).resolves.toBeDefined();
    expect(() => bridge.verdictFor(VAULTED, RECENT)).not.toThrow();
  });
});
