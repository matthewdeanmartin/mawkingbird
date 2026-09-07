import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import {
  credentialExpired,
  credentialExpiresAt,
  CredentialLifetimeStore,
  DEFAULT_CREDENTIAL_LIFETIME,
  ensureStamped,
  ExpiringConnection,
  readCredentialLifetime,
  stampCredential,
} from './credential-lifetime';

const DAY = 24 * 60 * 60 * 1000;

// Specs share one jsdom realm, so localStorage must be reset explicitly.
beforeEach(() => {
  localStorage.clear();
});

describe('readCredentialLifetime', () => {
  it('defaults to 90 days when nothing is stored', () => {
    expect(readCredentialLifetime()).toBe('90d');
    expect(DEFAULT_CREDENTIAL_LIFETIME).toBe('90d');
  });

  it('falls back to the default for an unrecognised stored value', () => {
    localStorage.setItem('mockingbird_credential_lifetime', 'forever-and-ever');
    expect(readCredentialLifetime()).toBe(DEFAULT_CREDENTIAL_LIFETIME);
  });

  it('reads back a value the store wrote', () => {
    TestBed.inject(CredentialLifetimeStore).set('30d');
    expect(readCredentialLifetime()).toBe('30d');
  });
});

describe('credentialExpiresAt', () => {
  it('adds the policy window to the connect time', () => {
    expect(credentialExpiresAt(1_000, '30d')).toBe(1_000 + 30 * DAY);
    expect(credentialExpiresAt(1_000, '90d')).toBe(1_000 + 90 * DAY);
  });

  it('is null under the never policy', () => {
    expect(credentialExpiresAt(1_000, 'never')).toBeNull();
  });

  it('is null when the credential carries no stamp', () => {
    expect(credentialExpiresAt(undefined, '30d')).toBeNull();
  });
});

describe('credentialExpired', () => {
  const connectedAt = 1_000_000;

  it('is false inside the window and true at or past the edge', () => {
    expect(credentialExpired(connectedAt, '30d', connectedAt + 29 * DAY)).toBe(false);
    expect(credentialExpired(connectedAt, '30d', connectedAt + 30 * DAY)).toBe(true);
    expect(credentialExpired(connectedAt, '30d', connectedAt + 31 * DAY)).toBe(true);
  });

  it('honours the longer window', () => {
    expect(credentialExpired(connectedAt, '90d', connectedAt + 60 * DAY)).toBe(false);
    expect(credentialExpired(connectedAt, '90d', connectedAt + 91 * DAY)).toBe(true);
  });

  it('never expires under the never policy', () => {
    expect(credentialExpired(connectedAt, 'never', connectedAt + 3650 * DAY)).toBe(false);
  });

  it('treats an unstamped credential as not expired', () => {
    // Records written before retention existed must not vanish on upgrade.
    expect(credentialExpired(undefined, '30d', Date.now())).toBe(false);
  });

  it('uses the stored policy when none is passed', () => {
    TestBed.inject(CredentialLifetimeStore).set('30d');
    expect(credentialExpired(Date.now() - 60 * DAY)).toBe(true);
    expect(credentialExpired(Date.now() - 10 * DAY)).toBe(false);
  });
});

describe('stampCredential', () => {
  it('records now without disturbing the payload', () => {
    const before = Date.now();
    const stamped = stampCredential({ accessToken: 'secret' });
    expect(stamped.accessToken).toBe('secret');
    expect(stamped.connectedAt).toBeGreaterThanOrEqual(before);
    expect(stamped.connectedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('ensureStamped', () => {
  it('backfills a missing stamp and persists it', () => {
    const stamped = ensureStamped('k', { accessToken: 'secret' } as {
      accessToken: string;
      connectedAt?: number;
    });
    expect(stamped.connectedAt).toBeTypeOf('number');
    expect(JSON.parse(localStorage.getItem('k')!).connectedAt).toBe(stamped.connectedAt);
  });

  it('leaves an existing stamp alone and writes nothing', () => {
    const original = { accessToken: 'secret', connectedAt: 42 };
    expect(ensureStamped('k', original)).toBe(original);
    expect(localStorage.getItem('k')).toBeNull();
  });
});

describe('CredentialLifetimeStore', () => {
  function connection(): ExpiringConnection & { enforceLifetime: Mock<() => void> } {
    return { enforceLifetime: vi.fn<() => void>(), expiresAt: () => null };
  }

  it('applies a policy change to every governed connector at once', () => {
    const store = TestBed.inject(CredentialLifetimeStore);
    const a = connection();
    const b = connection();
    store.govern([a, b]);

    store.set('30d');

    expect(store.lifetime()).toBe('30d');
    expect(a.enforceLifetime).toHaveBeenCalledOnce();
    expect(b.enforceLifetime).toHaveBeenCalledOnce();
  });

  it('persists the choice across a fresh store', () => {
    TestBed.inject(CredentialLifetimeStore).set('never');
    TestBed.resetTestingModule();
    expect(TestBed.inject(CredentialLifetimeStore).lifetime()).toBe('never');
  });
});
