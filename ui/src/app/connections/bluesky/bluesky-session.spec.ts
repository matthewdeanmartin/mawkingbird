/**
 * BlueskySession: OAuth links, and the end of app passwords.
 *
 * App passwords were retired (spec/bsky_parity.md): nothing creates one, and a
 * stored link that used one is retired at start-up. What remains to prove here
 * is that a retired link still asks for sign-in and that any app password left
 * in the vault from before is removed the first time the account runs.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession } from './bluesky-session';
import { BlueskyOAuth } from './bluesky-oauth';
import { saveBlueskyIdentity } from './bluesky-identity-store';
import { VaultService } from '../vault/vault-service';
import { VAULT_TEST_ROLLOUT } from '../vault/vault-preference';

const CONNECTOR_BASE = 'mockingbird_bsky_credentials';

/** An open vault over a mutable map, so a write can be read back. */
function openVault(values: Record<string, string> = {}) {
  return {
    values,
    unlocked: signal(true),
    read: (base: string, accountKey: string | null = null) =>
      values[accountKey ? `${accountKey}/${base}` : base] ?? null,
    write: vi.fn((base: string, value: string, accountKey: string | null = null) => {
      values[accountKey ? `${accountKey}/${base}` : base] = value;
      return Promise.resolve({ ok: true, overwritten: [] });
    }),
    remove: vi.fn().mockResolvedValue({ ok: true, overwritten: [] }),
  };
}

function lockedVault() {
  return {
    unlocked: signal(false),
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
  };
}

function sessionWith(vault: unknown): {
  session: BlueskySession;
  httpMock: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideHttpClientTesting(),
      { provide: VaultService, useValue: vault },
      { provide: VAULT_TEST_ROLLOUT, useValue: true },
    ],
  });
  return {
    session: TestBed.inject(BlueskySession),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('BlueskySession after app passwords were retired', () => {
  it('drops a vaulted app password the first time a retired connector runs', async () => {
    localStorage.setItem(
      'mockingbird_bsky_profile',
      JSON.stringify({ service: 'https://bsky.social', handle: 'me.example', did: 'did:plc:me' }),
    );
    localStorage.setItem(CONNECTOR_BASE, JSON.stringify({ authMethod: 'retired' }));
    const vault = openVault({
      [CONNECTOR_BASE]: JSON.stringify({ identifier: 'me.example', appPassword: 'old' }),
    });
    const { session } = sessionWith(vault);
    await new Promise((resolve) => setTimeout(resolve));

    expect(session.usesAppPassword()).toBe(true);
    expect(vault.remove).toHaveBeenCalled();
  });

  it('never reads a locked vault for a retired link', () => {
    localStorage.setItem(
      'mockingbird_bsky_profile',
      JSON.stringify({ service: 'https://bsky.social', handle: 'me.example', did: 'did:plc:me' }),
    );
    localStorage.setItem(CONNECTOR_BASE, JSON.stringify({ authMethod: 'retired' }));
    const vault = lockedVault();
    sessionWith(vault);
    expect(vault.write).not.toHaveBeenCalled();
  });
});

describe('BlueskySession OAuth connector', () => {
  const profile = { service: 'https://pds.example', handle: 'me.example', did: 'did:plc:me' };

  function oauthSession(state: string): {
    session: BlueskySession;
    oauth: {
      signIn: ReturnType<typeof vi.fn>;
      callback: ReturnType<typeof vi.fn>;
      revoke: ReturnType<typeof vi.fn>;
    };
  } {
    const oauth = {
      signIn: vi.fn(() => new Promise<never>(() => undefined)),
      callback: vi.fn().mockResolvedValue({ profile, state }),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: VaultService, useValue: lockedVault() },
        { provide: BlueskyOAuth, useValue: oauth },
      ],
    });
    return { session: TestBed.inject(BlueskySession), oauth };
  }

  function stored(fragment: string): string {
    return Object.keys(localStorage)
      .filter((k) => k.includes(fragment))
      .map((k) => localStorage.getItem(k) ?? '')
      .join('|');
  }

  it('starts the redirect with the connector intent', () => {
    const { session, oauth } = oauthSession('connector:link');
    void session.beginOAuthConnector('https://bsky.social');
    expect(oauth.signIn).toHaveBeenCalledWith('https://bsky.social', 'connector:link');
  });

  it('stores the connector as profile plus marker, with no tokens', async () => {
    const { session } = oauthSession('connector:link');

    const result = await session.finishOAuth();

    expect(result.kind).toBe('connector');
    expect(session.session()?.authMethod).toBe('oauth');
    expect(session.isOAuthSession()).toBe(true);
    expect(JSON.parse(stored('bsky_credentials'))).toEqual({
      authMethod: 'oauth',
      connectedAt: expect.any(Number),
    });
    expect(stored('bsky_profile')).toContain('me.example');
    // A connector link never touches who the app is signed in as.
    expect(localStorage.getItem('mastodon_mock_account_mode')).toBeNull();
  });

  it('reloads an OAuth connector from storage on the next boot', async () => {
    await oauthSession('connector:link').session.finishOAuth();

    const { session } = oauthSession('connector:link');

    expect(session.session()?.handle).toBe('me.example');
    expect(session.isOAuthSession()).toBe(true);
  });

  it('revokes the grant when an OAuth connector is unlinked', async () => {
    const { session, oauth } = oauthSession('connector:link');
    await session.finishOAuth();

    session.unlink();

    expect(oauth.revoke).toHaveBeenCalledWith('did:plc:me');
    expect(stored('bsky_credentials')).toBe('');
  });

  it('keeps another connector for the same DID when one is unlinked', async () => {
    const { session, oauth } = oauthSession('connector:link');
    await session.finishOAuth();
    localStorage.setItem('mockingbird_bsky_profile_mastodon_other', JSON.stringify(profile));
    localStorage.setItem(
      'mockingbird_bsky_credentials_mastodon_other',
      JSON.stringify({ authMethod: 'oauth' }),
    );
    session.unlink();
    expect(oauth.revoke).not.toHaveBeenCalled();
  });

  it('keeps an identity signed in when a connector for the same DID is unlinked', async () => {
    saveBlueskyIdentity(profile, { authMethod: 'oauth' });
    const { session, oauth } = oauthSession('connector:link');
    await session.finishOAuth();

    session.unlink();

    expect(oauth.revoke).not.toHaveBeenCalled();
  });
});
