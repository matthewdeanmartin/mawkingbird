import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeDiagnostics } from '../../home-diagnostics';
import { ClientPrefs } from '../../client-prefs';
import { seedBskyIdentity } from '../../testing/seed-storage';
import { FeedAggregator } from '../feed-aggregator';
import { BlueskyProvider } from './bluesky-provider';
import { BlueskyOAuth } from './bluesky-oauth';
import { BlueskySignInRequiredError } from './bluesky-auth-error';
import { saveBlueskyIdentity } from './bluesky-identity-store';

describe('Bluesky-primary Home feed transport', () => {
  let http: HttpTestingController;
  const diagnostics = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const timeline = {
    feed: [
      {
        post: {
          uri: 'at://did:plc:writer/app.bsky.feed.post/one',
          cid: 'cid',
          author: { did: 'did:plc:writer', handle: 'writer.bsky.social' },
          record: { text: 'hello', createdAt: '2026-09-12T12:00:00Z' },
          indexedAt: '2026-09-12T12:00:00Z',
        },
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HomeDiagnostics, useValue: diagnostics },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(ClientPrefs).setHomeWindow('all');
  });
  afterEach(() => http.verify());

  it('loads the selected identity through the real registry without a Mastodon request', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    aggregator.reset();
    const result = firstValueFrom(aggregator.nextPage());
    const request = http.expectOne('https://bsky.social/xrpc/app.bsky.feed.getTimeline?limit=20');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-jwt');
    request.flush(timeline);
    expect((await result).map((s) => s.provider)).toEqual(['bluesky']);
    http.expectNone((r) => r.url.includes('/api/v1/timelines/home'));
  });

  it('logs a failed refresh as a provider error and can recover on refresh', async () => {
    const aggregator = TestBed.inject(FeedAggregator);
    aggregator.reset();
    const result = firstValueFrom(aggregator.nextPage());
    http
      .expectOne('https://bsky.social/xrpc/app.bsky.feed.getTimeline?limit=20')
      .flush({ error: 'ExpiredToken' }, { status: 400, statusText: 'Bad Request' });
    http
      .expectOne('https://bsky.social/xrpc/com.atproto.server.refreshSession')
      .flush(
        { error: 'ExpiredToken', message: 'private response detail' },
        { status: 401, statusText: 'Unauthorized' },
      );
    expect(await result).toEqual([]);
    expect(TestBed.inject(BlueskyProvider).errors().length).toBe(1);
    expect(TestBed.inject(BlueskyProvider).errors()[0]).toContain(
      'session refresh failed (HTTP 401; ExpiredToken)',
    );
    expect(TestBed.inject(BlueskyProvider).errors()[0]).not.toContain('private response detail');
    expect(diagnostics.error).toHaveBeenCalledWith(
      'foreign:page-error',
      expect.anything(),
      expect.objectContaining({ provider: 'bluesky' }),
    );
    aggregator.reset();
    const retry = firstValueFrom(aggregator.nextPage());
    http.expectOne('https://bsky.social/xrpc/app.bsky.feed.getTimeline?limit=20').flush(timeline);
    expect(await retry).toHaveLength(1);
    expect(TestBed.inject(BlueskyProvider).errors()).toEqual([]);
  });

  it('loads an OAuth identity without requiring an app-password bearer token', async () => {
    saveBlueskyIdentity(
      { did: 'did:plc:oauth', handle: 'oauth.bsky.social', service: 'https://pds.example' },
      { authMethod: 'oauth', connectedAt: Date.now() },
      true,
    );
    const oauth = TestBed.inject(BlueskyOAuth);
    vi.spyOn(oauth, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(timeline), { status: 200 }),
    );
    const aggregator = TestBed.inject(FeedAggregator);
    aggregator.reset();
    expect(await firstValueFrom(aggregator.nextPage())).toHaveLength(1);
    expect(oauth.fetch).toHaveBeenCalledWith(
      'did:plc:oauth',
      'https://pds.example/xrpc/app.bsky.feed.getTimeline?limit=20',
      expect.anything(),
    );
    http.expectNone((r) => r.url.includes('/api/v1/timelines/home'));
  });

  it('recognizes the reported missing-session error even when its SDK subclass was lost', async () => {
    const oauth = TestBed.inject(BlueskyOAuth);
    const cause = new Error('The session was deleted by another process');
    vi.spyOn(oauth, 'restore').mockRejectedValue(cause);
    await expect(
      oauth.fetch('did:plc:me', '/xrpc/app.bsky.feed.getTimeline'),
    ).rejects.toMatchObject({
      name: 'BlueskySignInRequiredError',
      cause,
    });
    await expect(
      oauth.fetch('did:plc:me', '/xrpc/app.bsky.feed.getTimeline'),
    ).rejects.toBeInstanceOf(BlueskySignInRequiredError);
  });

  it.each([true, false])(
    'classifies OAuth restore failures without blaming credentials for network errors (missing session: %s)',
    async (missing) => {
      saveBlueskyIdentity(
        { did: 'did:plc:oauth', handle: 'oauth.bsky.social', service: 'https://pds.example' },
        { authMethod: 'oauth', connectedAt: Date.now() },
        true,
      );
      const { TokenRefreshError } = await import('@atproto/oauth-client-browser');
      const error = missing
        ? new TokenRefreshError('did:plc:oauth', 'The session was deleted by another process')
        : new TypeError('Failed to fetch');
      vi.spyOn(TestBed.inject(BlueskyOAuth), 'restore').mockRejectedValue(error);
      const provider = TestBed.inject(BlueskyProvider);
      await expect(firstValueFrom(provider.fetchPage())).rejects.toThrow(
        missing ? 'Sign in again' : 'Failed to fetch',
      );
      expect(provider.authenticationFailed()).toBe(missing);
      expect(provider.errors()[0]).toContain(
        missing ? 'saved Bluesky session is missing' : 'Failed to fetch',
      );
      http.expectNone((r) => r.url.includes('getTimeline'));
    },
  );
});
