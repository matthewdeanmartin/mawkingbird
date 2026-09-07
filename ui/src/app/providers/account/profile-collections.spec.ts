import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MawkingbirdSession } from './mawkingbird-session';
import { PROFILE_ORIGIN } from './profile-client';
import { ProfileAccountKey } from './profile-account-key';
import { ProfileCollections } from './profile-collections';

/**
 * The collections wire client.
 *
 * The guard worth testing hardest is the one that costs nothing when it works:
 * **no request is made without an account key**. A request without one would be
 * refused by the service anyway, but refusing here means a signed-out browser
 * never spends a round trip — and, more importantly, that there is no code path
 * in which a default bucket could be substituted.
 */

const ORIGIN = 'https://profile-test.mawkingbird.com';
const ACCOUNT = 'mastodon:example.social/alice';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('ProfileCollections', () => {
  let collections: ProfileCollections;
  let fetchMock: ReturnType<typeof vi.fn>;
  let accountKey: string | null;

  beforeEach(() => {
    accountKey = ACCOUNT;
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PROFILE_ORIGIN, useValue: ORIGIN },
        { provide: MawkingbirdSession, useValue: { token: () => Promise.resolve('a-token') } },
        {
          provide: ProfileAccountKey,
          useValue: {
            current: () => accountKey,
            header: () => (accountKey === null ? null : { 'X-Account-Key': accountKey }),
          },
        },
      ],
    });
    collections = TestBed.inject(ProfileCollections);
  });

  it('sends the account key and bearer token', async () => {
    await collections.index('lists');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(`${ORIGIN}/collections/lists`);
    expect(headers['X-Account-Key']).toBe(ACCOUNT);
    expect(headers['Authorization']).toBe('Bearer a-token');
  });

  it('never sends cookies', async () => {
    // The service deliberately does not set Access-Control-Allow-Credentials,
    // so sending them would fail the request and invite a "fix" on the wrong side.
    await collections.index('lists');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('omit');
  });

  it('refuses before the network when there is no account key', async () => {
    accountKey = null;
    const result = await collections.index('lists');

    expect(result.kind).toBe('no-account');
    // The point: not one wasted round trip, and no path where a default bucket
    // could be substituted for a missing one.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a write with no account key too', async () => {
    accountKey = null;
    expect((await collections.put('lists', 'a', {})).kind).toBe('no-account');
    expect((await collections.remove('lists', 'a')).kind).toBe('no-account');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports 304 as unchanged', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    expect((await collections.index('lists', '"e1"')).kind).toBe('unchanged');
  });

  it('sends If-None-Match when an ETag is known', async () => {
    await collections.index('lists', '"e1"');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"e1"');
  });

  it('reports 402 distinctly from 403', async () => {
    // Opposite meanings to the UI: "your data is safe and readable" versus
    // "you are not signed in". Collapsing them is wrong half the time.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Plus required' }, 402));
    expect((await collections.index('lists')).kind).toBe('payment-required');

    fetchMock.mockResolvedValue(jsonResponse({ error: 'Sign in' }, 403));
    expect((await collections.index('lists')).kind).toBe('forbidden');
  });

  it('reports the service refusing an account key as no-account', async () => {
    // 400 means "could not tell which account this is", and the remedy is to
    // sign in properly rather than to retry later.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad key' }, 400));
    expect((await collections.index('lists')).kind).toBe('no-account');
  });

  it('treats a delete of something already gone as success', async () => {
    // Otherwise a double-click reports a failure for an outcome the user got.
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not found' }, 404));
    expect((await collections.remove('lists', 'a')).kind).toBe('ok');
  });

  it('reports an absent item on GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not found' }, 404));
    expect((await collections.get('lists', 'a')).kind).toBe('absent');
  });

  it('turns a network failure into a message rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await collections.index('lists');

    expect(result.kind).toBe('failed');
    expect(result.kind === 'failed' && result.message).toContain('offline');
  });

  it('relays the service error sentence, which is written for a person', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'That collection is not available yet.' }, 404),
    );
    const result = await collections.index('lists');
    expect(result.kind === 'failed' && result.message).toBe(
      'That collection is not available yet.',
    );
  });

  it('posts a batch as one request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ written: 2, deleted: 0, revision: 3 }));
    const result = await collections.batch('lists', [
      { op: 'put', id: 'a', value: { title: 'A' } },
      { op: 'put', id: 'b', value: { title: 'B' } },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.kind === 'ok' && result.value.written).toBe(2);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/collections/lists/batch`);
  });

  it('encodes an id so it cannot alter the path', async () => {
    await collections.get('lists', 'a/b');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/collections/lists/a%2Fb`);
  });
});
