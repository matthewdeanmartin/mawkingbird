import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MawkingbirdMetrics } from '../../observability/mawkingbird-metrics';
import { ACCOUNT_ORIGIN, AUTH_ORIGIN, MawkingbirdSession, type Tier } from './mawkingbird-session';

const AUTH = 'https://auth.example.test';
const ACCOUNT = 'https://account.example.test';
const NOW = 1_800_000_000_000;

function minted(
  token: string,
  tier: Tier,
  expiresInSeconds = 3_600,
  auth: 'anon' | 'email' | 'idp' = 'email',
): Response {
  return Response.json({
    token,
    expiresAt: NOW / 1_000 + expiresInSeconds,
    auth,
    tier,
  });
}

describe('MawkingbirdSession token lifecycle', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let session: MawkingbirdSession;

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        MawkingbirdSession,
        { provide: AUTH_ORIGIN, useValue: AUTH },
        { provide: ACCOUNT_ORIGIN, useValue: ACCOUNT },
        { provide: MawkingbirdMetrics, useValue: { record: vi.fn() } },
      ],
    });
    session = TestBed.inject(MawkingbirdSession);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reuses a fresh token instead of spending another mint request', async () => {
    fetchMock.mockResolvedValueOnce(minted('free-token', 'free'));

    await expect(session.token()).resolves.toBe('free-token');
    await expect(session.token()).resolves.toBe('free-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws away a still-fresh free claim when Plus entitlement is confirmed', async () => {
    fetchMock
      .mockResolvedValueOnce(minted('stale-free-token', 'free'))
      .mockResolvedValueOnce(minted('fresh-plus-token', 'plus'));

    await expect(session.token()).resolves.toBe('stale-free-token');
    await expect(session.upgradeIfStale(true)).resolves.toBe(true);
    await expect(session.token()).resolves.toBe('fresh-plus-token');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as unknown),
    ).toEqual([{ grant: 'cookie' }, { grant: 'cookie' }]);
    expect(session.heldTier()).toBe('plus');
  });

  it('does not re-mint a free token without positive entitlement evidence', async () => {
    fetchMock.mockResolvedValueOnce(minted('free-token', 'free'));

    await session.token();
    await expect(session.upgradeIfStale(false)).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.heldTier()).toBe('free');
  });

  it('does not re-mint when the held claim is already Plus', async () => {
    fetchMock.mockResolvedValueOnce(minted('plus-token', 'plus'));

    await session.token();
    await expect(session.upgradeIfStale(true)).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one mint between concurrent profile callers', async () => {
    fetchMock.mockResolvedValueOnce(minted('shared-token', 'plus'));

    await expect(Promise.all([session.token(), session.token(), session.token()])).resolves.toEqual(
      ['shared-token', 'shared-token', 'shared-token'],
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-mints inside the two-minute expiry safety margin', async () => {
    fetchMock
      .mockResolvedValueOnce(minted('nearly-expired', 'plus', 119))
      .mockResolvedValueOnce(minted('replacement', 'plus'));

    await expect(session.token()).resolves.toBe('nearly-expired');
    await expect(session.token()).resolves.toBe('replacement');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * `canOwnStorage()` mirrors the profile service's own `canOwnStorage()` in
   * `authorize.ts`: an anonymous identity is designed to be forgotten when its
   * token expires, so it may never own stored data. Duplicating the rule here
   * is what lets `ProfileClient` skip a call the service would answer
   * `403 code: anonymous` — which is what production was doing on every cold
   * load for signed-out visitors.
   *
   * It is emphatically not a tier check: the free tier below is signed in, and
   * signed in is what matters.
   */
  it('reports whether the held session may own stored data', async () => {
    // Nothing minted yet: unknown, which callers must not read as anonymous.
    expect(session.canOwnStorage()).toBeNull();

    fetchMock.mockResolvedValueOnce(minted('anon-token', 'free', 3_600, 'anon'));
    await session.token();
    expect(session.canOwnStorage()).toBe(false);

    // Signed in on the free tier still owns storage: the rule is about identity
    // strength, not entitlement.
    fetchMock.mockResolvedValueOnce(minted('free-token', 'free', 3_600, 'email'));
    await session.refresh();
    expect(session.canOwnStorage()).toBe(true);
  });
});
