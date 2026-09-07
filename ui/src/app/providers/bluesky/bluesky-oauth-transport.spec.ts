import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { ACCOUNT_MODE_KEY, saveBlueskyIdentity } from './bluesky-identity-store';
import { BlueskyOAuth } from './bluesky-oauth';
import { BlueskySession } from './bluesky-session';

const DID = 'did:plc:oauth-user';
const SERVICE = 'https://pds.example';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Bluesky OAuth transport', () => {
  const oauth = { fetch: vi.fn(), callback: vi.fn(), signIn: vi.fn(), revoke: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    saveBlueskyIdentity(
      { service: SERVICE, handle: 'oauth.example', did: DID },
      { authMethod: 'oauth', connectedAt: 10 },
      true,
    );
    localStorage.setItem(ACCOUNT_MODE_KEY, 'bluesky');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BlueskyOAuth, useValue: oauth },
      ],
    });
  });

  it('routes reads through the SDK session instead of attaching a bearer JWT', async () => {
    oauth.fetch.mockResolvedValue(jsonResponse({ feed: [], cursor: 'next' }));

    const result = await firstValueFrom(TestBed.inject(BlueskyApi).getTimeline('cur'));

    expect(result.cursor).toBe('next');
    expect(oauth.fetch).toHaveBeenCalledWith(
      DID,
      `${SERVICE}/xrpc/app.bsky.feed.getTimeline?limit=20&cursor=cur`,
      { method: 'GET', headers: {} },
    );
  });

  it('routes writes through DPoP fetch with the original JSON body', async () => {
    oauth.fetch.mockResolvedValue(jsonResponse({ uri: 'at://like', cid: 'cid' }));

    await firstValueFrom(TestBed.inject(BlueskyApi).like('at://post', 'post-cid'));

    const [, url, init] = oauth.fetch.mock.calls[0] as [string, string, RequestInit];
    expect(url).toBe(`${SERVICE}/xrpc/com.atproto.repo.createRecord`);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({
      repo: DID,
      collection: 'app.bsky.feed.like',
      record: { subject: { uri: 'at://post', cid: 'post-cid' } },
    });
  });

  it('maps an OAuth fetch failure to HttpErrorResponse-compatible status data', async () => {
    oauth.fetch.mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403));

    await expect(firstValueFrom(TestBed.inject(BlueskyApi).getUnreadCount())).rejects.toMatchObject(
      {
        status: 403,
        error: { error: 'Forbidden' },
      },
    );
  });

  it('persists an OAuth callback as an alt marker without any token fields', async () => {
    oauth.callback.mockResolvedValue({
      state: 'identity:add',
      profile: {
        service: SERVICE,
        handle: 'second.example',
        did: 'did:plc:second',
        displayName: 'Second',
      },
    });

    const result = await TestBed.inject(BlueskySession).finishOAuthIdentity();
    const credentials = JSON.parse(
      localStorage.getItem('mockingbird_bsky_identity_credentials') ?? '{}',
    );

    expect(result.adding).toBe(true);
    expect(credentials['did:plc:second']).toMatchObject({ authMethod: 'oauth' });
    expect(credentials['did:plc:second']).not.toHaveProperty('accessJwt');
    expect(credentials['did:plc:second']).not.toHaveProperty('refreshJwt');
  });
});
