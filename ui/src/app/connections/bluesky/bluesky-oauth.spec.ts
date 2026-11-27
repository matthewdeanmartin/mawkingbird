import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthClient } from '@atproto/oauth-client-browser';
import { BlueskyOAuth } from './bluesky-oauth';
import { blueskyOAuthRedirectUri } from './bluesky-oauth-config';

/** Browser-shell contracts around the SDK core (the real store/refresh test runs in Chromium). */
describe('Bluesky OAuth browser shell', () => {
  const client = { authorize: vi.fn(), abortRequest: vi.fn(), callback: vi.fn() };
  let oauth: BlueskyOAuth;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.resetAllMocks();
    oauth = TestBed.inject(BlueskyOAuth);
    vi.spyOn(oauth as unknown as { client(): Promise<OAuthClient> }, 'client').mockResolvedValue(
      client as unknown as OAuthClient,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('passes the fragment and exact deployment redirect to the SDK before loading the profile', async () => {
    vi.stubGlobal('location', {
      hash: '#code=opaque&state=pkce-state&iss=https%3A%2F%2Fissuer.example',
      pathname: '/oauth/bluesky/callback',
      search: '',
    });
    const replace = vi.spyOn(history, 'replaceState').mockImplementation(() => undefined);
    client.callback.mockResolvedValue({
      state: 'connector:link',
      session: {
        did: 'did:plc:me',
        fetchHandler: vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({ handle: 'me.example' }))),
        getTokenInfo: vi.fn().mockResolvedValue({ aud: 'https://pds.example/' }),
      },
    });
    expect(await oauth.callback()).toEqual({
      state: 'connector:link',
      profile: { did: 'did:plc:me', handle: 'me.example', service: 'https://pds.example' },
    });
    expect(replace).toHaveBeenCalledWith(null, '', '/oauth/bluesky/callback');
    expect(client.callback.mock.calls[0][0].get('state')).toBe('pkce-state');
    expect(client.callback.mock.calls[0][1]).toEqual({ redirect_uri: blueskyOAuthRedirectUri() });
  });

  it.each(['identity:add', 'connector:link', 'identity:signup'] as const)(
    'preserves %s authorization intent and cancels the pending flow on back navigation',
    async (intent) => {
      vi.useFakeTimers();
      const assign = vi.fn();
      vi.stubGlobal('location', { hostname: 'mawkingbird.example', assign });
      const url = new URL('https://issuer.example/authorize?state=opaque');
      client.authorize.mockResolvedValue(url);
      client.abortRequest.mockResolvedValue(undefined);
      const pending = oauth.signIn('me.example', intent);
      const rejected = expect(pending).rejects.toThrow('User navigated back');
      await vi.advanceTimersByTimeAsync(5000);
      await rejected;
      expect(client.authorize).toHaveBeenCalledWith('me.example', {
        state: intent,
        redirect_uri: blueskyOAuthRedirectUri(),
        ...(intent === 'identity:signup' ? { prompt: 'create' } : {}),
      });
      expect(assign).toHaveBeenCalledWith(url.href);
      expect(client.abortRequest).toHaveBeenCalledWith(url);
    },
  );
});
