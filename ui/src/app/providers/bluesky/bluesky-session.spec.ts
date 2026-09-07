/**
 * Bluesky credential syncing.
 *
 * The problem this solves, in the reader's words: "I paste in my app password,
 * I go to my phone, log in to Mawkingbird Plus and sync my connector
 * credentials, and Bluesky still isn't there — but all my other API keys
 * synced."
 *
 * Bluesky was the one connector excluded from the vault, on the reasoning that
 * an app password is "re-issued in under a minute". That measured the cost once
 * rather than once per device, and mis-filed a revocable per-app credential as
 * an identity token. See the manifest entry for the full argument.
 *
 * What travels is the **app password**, never the JWTs: tokens rotate on every
 * refresh, so two devices sharing one pair would invalidate each other in a
 * loop. The app password is the stable thing the reader was hand-copying
 * between devices anyway.
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession } from './bluesky-session';
import { VaultService } from '../vault/vault-service';
import { VAULT_TEST_ROLLOUT } from '../vault/vault-preference';

const CREATE_SESSION = 'https://bsky.social/xrpc/com.atproto.server.createSession';
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
      provideHttpClient(),
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

/** Drive a connector login to completion. */
function login(
  session: BlueskySession,
  httpMock: HttpTestingController,
  password = 'app-pass-1234',
): void {
  session.login('someone.bsky.social', password).subscribe();
  httpMock.expectOne(CREATE_SESSION).flush({
    did: 'did:plc:abc123',
    handle: 'someone.bsky.social',
    accessJwt: 'access-1',
    refreshJwt: 'refresh-1',
  });
  httpMock.expectOne((r) => r.url.includes('app.bsky.actor.getProfile')).flush({});
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('BlueskySession vault sync', () => {
  it('writes the app password to the vault on login', async () => {
    const vault = openVault();
    const { session, httpMock } = sessionWith(vault);

    login(session, httpMock);
    // The vault write is fire-and-forget so login feels instant; let it settle.
    await Promise.resolve();

    expect(vault.write).toHaveBeenCalled();
    const [base, value] = vault.write.mock.calls[0];
    expect(base).toBe(CONNECTOR_BASE);
    expect(JSON.parse(value as string)).toEqual({
      identifier: 'someone.bsky.social',
      appPassword: 'app-pass-1234',
    });
  });

  it('never sends the rotating JWTs to the vault', async () => {
    // Two devices sharing one token pair would invalidate each other on the
    // next refresh. Only the stable credential travels.
    const vault = openVault();
    const { session, httpMock } = sessionWith(vault);

    login(session, httpMock);
    await Promise.resolve();

    const written = vault.write.mock.calls.map((c) => c[1]).join('|');
    expect(written).not.toContain('access-1');
    expect(written).not.toContain('refresh-1');
  });

  it('offers a vaulted credential to a device that has never logged in', () => {
    // The whole point: the second browser opens with the vault unlocked and
    // does not ask for the app password again.
    const vault = openVault({
      [CONNECTOR_BASE]: JSON.stringify({
        identifier: 'someone.bsky.social',
        appPassword: 'app-pass-1234',
      }),
    });
    const { session } = sessionWith(vault);

    expect(session.session()).toBeNull();
    expect(session.vaultedCredential()).toEqual({
      identifier: 'someone.bsky.social',
      appPassword: 'app-pass-1234',
    });
  });

  it('reports no vaulted credential when the vault is locked', () => {
    // Every connector must keep working with the vault shut — this returns
    // null so the caller falls back to asking, rather than throwing.
    const { session } = sessionWith(lockedVault());

    expect(session.vaultedCredential()).toBeNull();
  });

  it('logs in normally when the vault is locked', () => {
    const vault = lockedVault();
    const { session, httpMock } = sessionWith(vault);

    login(session, httpMock);

    expect(session.session()?.handle).toBe('someone.bsky.social');
    expect(vault.write).not.toHaveBeenCalled();
  });

  it('survives a corrupt vault entry rather than throwing', () => {
    const { session } = sessionWith(openVault({ [CONNECTOR_BASE]: '{ not json' }));

    expect(session.vaultedCredential()).toBeNull();
  });

  it('does not re-write the vault on a token refresh', async () => {
    // Refreshes rotate the JWTs and carry no app password, so they must not
    // touch the vault — otherwise every expired token would cost a write.
    const vault = openVault();
    const { session, httpMock } = sessionWith(vault);
    login(session, httpMock);
    await Promise.resolve();
    const afterLogin = vault.write.mock.calls.length;

    session.refresh().subscribe();
    httpMock
      .expectOne((r) => r.url.includes('refreshSession'))
      .flush({
        accessJwt: 'access-2',
        refreshJwt: 'refresh-2',
        did: 'did:plc:abc123',
        handle: 'someone.bsky.social',
      });
    await Promise.resolve();

    expect(vault.write.mock.calls.length).toBe(afterLogin);
    // …but the new tokens are live locally.
    expect(session.session()?.accessJwt).toBe('access-2');
  });

  it('re-writes the vault when the app password actually changes', async () => {
    // The complement of the refresh case: skipping unchanged writes must not
    // skip a real rotation, or revoking and re-issuing an app password would
    // leave every other device on the dead one.
    const vault = openVault();
    const { session, httpMock } = sessionWith(vault);
    login(session, httpMock, 'app-pass-1234');
    await Promise.resolve();
    const afterFirst = vault.write.mock.calls.length;

    login(session, httpMock, 'app-pass-5678');
    await Promise.resolve();

    expect(vault.write.mock.calls.length).toBe(afterFirst + 1);
    expect(JSON.parse(vault.write.mock.calls.at(-1)?.[1] as string).appPassword).toBe(
      'app-pass-5678',
    );
  });

  it('keeps the app password out of the exportable profile half', async () => {
    const { session, httpMock } = sessionWith(openVault());

    login(session, httpMock);
    await Promise.resolve();

    const profileRaw = Object.keys(localStorage)
      .filter((k) => k.includes('bsky_profile'))
      .map((k) => localStorage.getItem(k) ?? '')
      .join('|');
    expect(profileRaw).not.toContain('app-pass-1234');
  });
});
