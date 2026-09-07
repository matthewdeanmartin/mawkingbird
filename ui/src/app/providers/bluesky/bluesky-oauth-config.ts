import type { AuthorizeOptions, OAuthClientMetadataInput } from '@atproto/oauth-client-browser';

/** Permissions Mawkingbird needs to provide its existing Bluesky feature set. */
export const BSKY_OAUTH_SCOPE =
  'atproto transition:generic transition:chat.bsky rpc:com.atproto.moderation.createReport?aud=*';
export type BlueskyOAuthRedirectUri = NonNullable<AuthorizeOptions['redirect_uri']>;

/** The application root, including a deployment subpath such as `/canary/`. */
export function blueskyOAuthAppRoot(baseUri: string = document.baseURI): URL {
  return new URL('.', baseUri);
}

/** The exact callback URI for the build currently running. */
export function blueskyOAuthRedirectUri(
  baseUri: string = document.baseURI,
): BlueskyOAuthRedirectUri {
  const callback = new URL('oauth/bluesky/callback', blueskyOAuthAppRoot(baseUri));
  // ATProto loopback clients deliberately reject `localhost`; the SDK moves
  // the browser to the equivalent IP origin before authorization.
  if (callback.hostname === 'localhost') callback.hostname = '127.0.0.1';
  return callback.href as BlueskyOAuthRedirectUri;
}

/**
 * Public metadata burned into the browser bundle.
 *
 * The deployment workflow writes the same object to `oauth-client-metadata.json`.
 * Building it from the document base keeps production, canary, test, and the
 * github.io mirror independent OAuth clients instead of coupling every preview
 * to the production root document.
 */
export function blueskyOAuthClientMetadata(
  baseUri: string = document.baseURI,
): OAuthClientMetadataInput {
  const root = blueskyOAuthAppRoot(baseUri);
  return {
    client_id: new URL('oauth-client-metadata.json', root).href,
    client_name: 'Mawkingbird',
    client_uri: root.href,
    logo_uri: new URL('android-chrome-192x192.png', root).href,
    tos_uri: new URL('terms', root).href,
    redirect_uris: [blueskyOAuthRedirectUri(baseUri)],
    scope: BSKY_OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  };
}

/** ATProto has special non-discoverable metadata for loopback development. */
export function isBlueskyOAuthLoopback(hostname: string = location.hostname): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
