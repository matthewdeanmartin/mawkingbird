import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MawkingbirdMetrics } from '../../observability/mawkingbird-metrics';
import { RemoteStorageUsage } from '../../observability/remote-storage-usage';
import { PageDiagnostics } from '../../page-diagnostics';
import { MawkingbirdSession } from './mawkingbird-session';
import { PROFILE_ORIGIN, ProfileClient, type SettingsDocument } from './profile-client';

const PROFILE = 'https://profile.example.test';

const document: SettingsDocument = {
  kind: 'mawkingbird-profile-settings',
  schemaVersion: 1,
  minimumReaderVersion: 1,
  revision: 1,
  updatedAt: '2026-08-20T00:00:00.000Z',
  writer: 'browser-test',
  values: { mockingbird_client_prefs: '{}' },
  keys: ['mockingbird_client_prefs'],
};

function manifestResponse(): Response {
  return Response.json({
    readOnly: false,
    quota: { used: 2_048, limit: 100_000_000 },
    conflicts: 0,
    accounts: [],
  });
}

describe('ProfileClient wire contract', () => {
  let client: ProfileClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  let session: {
    token: ReturnType<typeof vi.fn>;
    heldTier: ReturnType<typeof vi.fn>;
    canOwnStorage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    session = {
      token: vi.fn().mockResolvedValue('signed-token'),
      heldTier: vi.fn().mockReturnValue('plus'),
      canOwnStorage: vi.fn().mockReturnValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        ProfileClient,
        { provide: PROFILE_ORIGIN, useValue: PROFILE },
        { provide: MawkingbirdSession, useValue: session },
        { provide: PageDiagnostics, useValue: { info: vi.fn(), warn: vi.fn() } },
        { provide: MawkingbirdMetrics, useValue: { record: vi.fn() } },
        { provide: RemoteStorageUsage, useValue: { record: vi.fn() } },
      ],
    });
    client = TestBed.inject(ProfileClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the global account inventory only when diagnostics opts in', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse()).mockResolvedValueOnce(manifestResponse());

    await client.manifest();
    await client.manifest({ includeAccounts: true });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${PROFILE}/manifest`,
      `${PROFILE}/manifest?accounts=all`,
    ]);
  });

  it('uses bearer authorization and never sends profile cookies', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse());

    await client.manifest({ includeAccounts: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer signed-token');
  });

  it('round-trips the quoted HTTP ETag unchanged into If-Match', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(document), { headers: { ETag: '"etag-1"' } }),
      )
      .mockResolvedValueOnce(Response.json({ etag: '"etag-2"', revision: 2 }));

    const fetched = await client.fetchSettings();
    expect(fetched.kind).toBe('ok');
    if (fetched.kind !== 'ok') {
      throw new Error('Expected stored settings');
    }
    await client.putSettings({ ...fetched.value.document, revision: 2 }, fetched.value.etag);

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('If-Match')).toBe('"etag-1"');
    expect(headers.has('If-None-Match')).toBe(false);
  });

  it('uses If-None-Match star when creating the first settings document', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ etag: '"etag-1"', revision: 1 }));

    await client.putSettings(document);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('If-None-Match')).toBe('*');
    expect(headers.has('If-Match')).toBe(false);
  });

  it.each([
    [402, 'payment_required', 'payment-required'],
    [403, 'forbidden', 'forbidden'],
  ] as const)('preserves HTTP %i as the distinct %s outcome', async (status, code, kind) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: `server said ${code}`, code }, { status }),
    );

    await expect(client.manifest()).resolves.toMatchObject({
      kind,
      message: `server said ${code}`,
    });
  });

  it('does not call Profile when no auth token can be minted', async () => {
    session.token.mockResolvedValueOnce(null);

    await expect(client.manifest()).resolves.toMatchObject({
      kind: 'failed',
      message: expect.stringContaining('account service'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  /**
   * Regression: production fired `GET /manifest` for anonymous visitors.
   *
   * The profile service refuses any anonymous session with
   * `403 code: anonymous` — storage requires an identity that outlives its
   * token, which is a property of the session and not an entitlement. Sync's
   * `start()` runs on every cold load, so every signed-out visitor spent one
   * guaranteed-403 round trip on an answer already knowable locally.
   *
   * Reported as `forbidden`, matching what the service's own 403 would have
   * produced: a signed-out visitor must not be told the service is unreachable
   * when it is reachable and simply says no.
   */
  it('does not call the service at all for an anonymous session', async () => {
    session.canOwnStorage.mockReturnValue(false);

    const result = await client.manifest();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.kind).toBe('forbidden');
  });

  /**
   * The guard keys on `canOwnStorage() === false`, so the "no token yet"
   * answer (null) must not be mistaken for "anonymous". `send()` awaits the
   * mint before asking, so in practice a null here means the mint produced
   * nothing — but the distinction is worth pinning: unknown is not anonymous.
   */
  it('still calls when the session cannot yet say whether it owns storage', async () => {
    session.canOwnStorage.mockReturnValue(null);
    fetchMock.mockResolvedValueOnce(manifestResponse());

    const result = await client.manifest();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.kind).toBe('ok');
  });
  /**
   * A 2xx that is not a settings document must not wedge sync.
   *
   * `GET /settings` answers 200, 304 or 404 and always sets an ETag on the 200,
   * so a bodyless success did not come from that handler — a preflight answered
   * as the request, or something in between rewrote it. Reported as `absent`
   * because there is demonstrably no document, which the caller already handles
   * by writing one; `failed` only produces a sync that never recovers.
   */
  it('treats a 204 as nothing stored rather than as a broken document', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await client.fetchSettings();

    expect(result.kind).toBe('absent');
  });

  it('refuses a 200 with no ETag, because it could never be written back', async () => {
    // The header is the whole concurrency mechanism: without it a later PUT has
    // no `If-Match` to send, so accepting this would produce a document that
    // can be read forever and updated never.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await client.fetchSettings();

    expect(result.kind).toBe('failed');
  });
});
