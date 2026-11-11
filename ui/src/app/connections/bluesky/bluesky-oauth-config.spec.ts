import { describe, expect, it } from 'vitest';
import {
  BSKY_OAUTH_SCOPE,
  blueskyOAuthClientMetadata,
  blueskyOAuthRedirectUri,
  isBlueskyOAuthLoopback,
} from './bluesky-oauth-config';

describe('Bluesky OAuth deployment configuration', () => {
  it('keeps metadata and callback inside a subpath deployment', () => {
    const metadata = blueskyOAuthClientMetadata('https://mawkingbird.com/canary/index.html');

    expect(metadata.client_id).toBe('https://mawkingbird.com/canary/oauth-client-metadata.json');
    expect(metadata.redirect_uris).toEqual([
      'https://mawkingbird.com/canary/oauth/bluesky/callback',
    ]);
    expect(metadata.client_uri).toBe('https://mawkingbird.com/canary/');
    expect(metadata.scope).toBe(BSKY_OAUTH_SCOPE);
    expect(metadata.scope).toContain('rpc:com.atproto.moderation.createReport?aud=*');
    expect(metadata.token_endpoint_auth_method).toBe('none');
    expect(metadata.dpop_bound_access_tokens).toBe(true);
  });

  it('supports the github.io project and canary base together', () => {
    expect(
      blueskyOAuthClientMetadata(
        'https://matthewdeanmartin.github.io/mawkingbird/canary/index.html',
      ).client_id,
    ).toBe('https://matthewdeanmartin.github.io/mawkingbird/canary/oauth-client-metadata.json');
  });

  it('uses the ATProto-required IP address for localhost callbacks', () => {
    expect(blueskyOAuthRedirectUri('http://localhost:4200/_ui/index.html')).toBe(
      'http://127.0.0.1:4200/_ui/oauth/bluesky/callback',
    );
    expect(isBlueskyOAuthLoopback('localhost')).toBe(true);
    expect(isBlueskyOAuthLoopback('mawkingbird.com')).toBe(false);
  });
});
