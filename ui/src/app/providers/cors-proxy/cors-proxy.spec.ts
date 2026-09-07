import { describe, expect, it } from 'vitest';
import {
  assertProxyable,
  assertProxyableIgnoringCredentialHosts,
  buildProxiedUrl,
  canProxy,
  CorsProxyRefusal,
  proxyHeaders,
} from './cors-proxy';
import { CorsProxyConfig } from './cors-proxy-settings';
import { corsProxyEntry } from './cors-proxy-catalog';

const INSTANCE = 'https://mastodon.social';

function configFor(id: 'allorigins' | 'corssh', key?: string): CorsProxyConfig {
  const entry = corsProxyEntry(id)!;
  return {
    entry,
    pattern: entry.template.pattern,
    encodeTarget: entry.template.encodeTarget,
    header: key && entry.keyHeader ? { name: entry.keyHeader, value: key } : null,
  };
}

describe('buildProxiedUrl', () => {
  it('percent-encodes the target when the proxy reads it from a query parameter', () => {
    const url = buildProxiedUrl(configFor('allorigins'), 'https://example.com/feed?a=1&b=2');
    // The target's own query must not become the proxy's — that is the whole
    // reason encodeTarget exists.
    expect(url).toBe(
      'https://api.allorigins.win/raw?url=https%3A%2F%2Fexample.com%2Ffeed%3Fa%3D1%26b%3D2',
    );
  });

  it('leaves the target raw for a proxy that takes it as a path suffix', () => {
    expect(buildProxiedUrl(configFor('corssh'), 'https://example.com/feed.xml')).toBe(
      'https://proxy.cors.sh/https://example.com/feed.xml',
    );
  });

  it('puts the API key in the header the proxy documents', () => {
    const headers = proxyHeaders(configFor('corssh', 'secret-key'));
    expect(headers.get('x-cors-api-key')).toBe('secret-key');
  });

  it('sends no headers at all when there is no key', () => {
    expect(proxyHeaders(configFor('allorigins')).keys()).toEqual([]);
  });
});

describe('assertProxyable', () => {
  it('allows an ordinary public feed', () => {
    expect(() => assertProxyable('https://example.com/feed.xml', INSTANCE)).not.toThrow();
  });

  it('refuses the selected Mastodon instance', () => {
    expect(() =>
      assertProxyable('https://mastodon.social/api/v1/timelines/home', INSTANCE),
    ).toThrow(CorsProxyRefusal);
  });

  it('refuses a subdomain of the selected instance', () => {
    expect(() => assertProxyable('https://files.mastodon.social/x.json', INSTANCE)).toThrow(
      CorsProxyRefusal,
    );
  });

  it.each([
    'https://bsky.social/xrpc/com.atproto.server.getSession',
    'https://morel.us-east.host.bsky.network/xrpc/x',
    'https://openrouter.ai/api/v1/chat/completions',
    'https://api.raindrop.io/rest/v1/raindrop',
    'https://api.github.com/user',
    'https://api.dropboxapi.com/2/files/list_folder',
    // The link shorteners. Reachable only through proxyCredentialedRequest,
    // which demands recorded consent; the ordinary path must refuse them.
    'https://api.dub.co/links',
    'https://api.short.io/links',
    'https://api.t.ly/api/v1/link/shorten',
  ])('refuses %s, where a connected account has a credential', (url) => {
    expect(() => assertProxyable(url, INSTANCE)).toThrow(CorsProxyRefusal);
  });

  it('lets the credential-host-free variant through for the consented path', () => {
    // assertProxyableIgnoringCredentialHosts is the half of the checks that are
    // about the URL rather than about which secrets this app holds. It must
    // still enforce those, but must not block a shortener host — that is the
    // one thing the consented path exists to allow.
    expect(() =>
      assertProxyableIgnoringCredentialHosts('https://api.dub.co/links', INSTANCE),
    ).not.toThrow();
    expect(() =>
      assertProxyableIgnoringCredentialHosts(`${INSTANCE}/api/v1/timelines/home`, INSTANCE),
    ).toThrow(CorsProxyRefusal);
    expect(() =>
      assertProxyableIgnoringCredentialHosts('https://user:pw@api.dub.co/links', INSTANCE),
    ).toThrow(CorsProxyRefusal);
  });

  it('does not mistake a lookalike host for a credential host', () => {
    // Suffix matching must be on a dot boundary, or an attacker registers
    // "notbsky.social" and gets a free pass to the blocklist's reputation.
    expect(() => assertProxyable('https://notbsky.social/feed', INSTANCE)).not.toThrow();
  });

  it('refuses a URL carrying a username and password', () => {
    expect(() => assertProxyable('https://user:pass@example.com/feed', INSTANCE)).toThrow(
      /username or password/i,
    );
  });

  it('refuses a non-http scheme', () => {
    expect(() => assertProxyable('file:///etc/passwd', INSTANCE)).toThrow(CorsProxyRefusal);
  });

  it('refuses a malformed URL rather than passing it through', () => {
    expect(() => assertProxyable('not a url', INSTANCE)).toThrow(CorsProxyRefusal);
  });

  it("refuses the app's own origin", () => {
    expect(() => assertProxyable(`${location.origin}/anything`, INSTANCE)).toThrow(
      CorsProxyRefusal,
    );
  });

  it('allows a different port on the same hostname', () => {
    // Regression: comparing hostnames instead of origins refused a feed served
    // on another port of localhost — which is a genuine cross-origin request,
    // and the exact shape of local development.
    const other = location.port === '8901' ? '8902' : '8901';
    expect(() =>
      assertProxyable(`${location.protocol}//${location.hostname}:${other}/feed.xml`, INSTANCE),
    ).not.toThrow();
  });

  it('still refuses credential hosts when no instance is selected', () => {
    // The mock build has an empty baseUrl; the blocklist must not depend on it.
    expect(() => assertProxyable('https://openrouter.ai/api/v1/key', '')).toThrow(CorsProxyRefusal);
  });

  it('reports refusals without throwing, for UI that needs to ask', () => {
    expect(canProxy('https://example.com/feed.xml', INSTANCE)).toBe(true);
    expect(canProxy('https://api.github.com/user', INSTANCE)).toBe(false);
  });
});
