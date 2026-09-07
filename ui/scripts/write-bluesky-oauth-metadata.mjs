/**
 * Stamp the public ATProto client metadata for one static deployment.
 *
 * Usage:
 *   node scripts/write-bluesky-oauth-metadata.mjs <build-dir> <public-base-url>
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [buildDir, publicBase] = process.argv.slice(2);
if (!buildDir || !publicBase) {
  throw new Error('Expected <build-dir> and <public-base-url>.');
}

const root = new URL(publicBase);
if (root.protocol !== 'https:' || !root.pathname.endsWith('/')) {
  throw new Error('The public base must be an HTTPS URL ending in /.');
}

const metadata = {
  client_id: new URL('oauth-client-metadata.json', root).href,
  client_name: 'Mawkingbird',
  client_uri: root.href,
  logo_uri: new URL('android-chrome-192x192.png', root).href,
  tos_uri: new URL('terms', root).href,
  redirect_uris: [new URL('oauth/bluesky/callback', root).href],
  scope:
    'atproto transition:generic transition:chat.bsky rpc:com.atproto.moderation.createReport?aud=*',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'web',
  dpop_bound_access_tokens: true,
};

const target = join(buildDir, 'oauth-client-metadata.json');
writeFileSync(target, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Wrote ${target} for ${root.href}`);
