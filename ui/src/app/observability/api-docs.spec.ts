import { describe, expect, it } from 'vitest';
import { endpointDoc } from './api-docs';
import { normalizeEndpoint } from './api-metrics';

/** What the page actually does: record a real URL, then look up its docs. */
function docFor(method: string, url: string) {
  return endpointDoc(`${method} ${normalizeEndpoint(url)}`);
}

describe('endpointDoc', () => {
  it('links a real request URL to its exact documentation anchor', () => {
    expect(docFor('PATCH', '/api/v1/accounts/update_credentials')?.url).toBe(
      'https://docs.joinmastodon.org/methods/accounts/#update_credentials',
    );
  });

  it('matches an id-bearing path through the :id placeholder', () => {
    const doc = docFor(
      'GET',
      'https://mastodon.social/api/v1/accounts/110447291640403778/statuses',
    );
    expect(doc?.match).toBe('exact');
    expect(doc?.url).toBe('https://docs.joinmastodon.org/methods/accounts/#statuses');
  });

  it('prefers a literal segment over the :id wildcard', () => {
    // /accounts/verify_credentials also fits the /accounts/{id} template; the
    // more literal match has to win or every such call links to the wrong page.
    expect(docFor('GET', '/api/v1/accounts/verify_credentials')?.url).toBe(
      'https://docs.joinmastodon.org/methods/accounts/#verify_credentials',
    );
    expect(docFor('GET', '/api/v1/accounts/12345')?.url).toBe(
      'https://docs.joinmastodon.org/methods/accounts/#get',
    );
  });

  it('finds docs for an id that does not look like an id', () => {
    // A tag name is a real path parameter that normalizeEndpoint leaves alone,
    // so only the wildcard-tolerant match can place it.
    const doc = docFor('GET', '/api/v1/tags/cats');
    expect(doc?.match).toBe('exact');
    expect(doc?.url).toContain('/methods/tags/');
  });

  it('distinguishes methods on the same path', () => {
    expect(docFor('GET', '/api/v1/statuses/1')?.url).toBe(
      'https://docs.joinmastodon.org/methods/statuses/#get',
    );
    expect(docFor('DELETE', '/api/v1/statuses/1')?.url).toBe(
      'https://docs.joinmastodon.org/methods/statuses/#delete',
    );
  });

  it('covers unversioned paths like OAuth', () => {
    expect(docFor('POST', '/oauth/token')?.url).toBe(
      'https://docs.joinmastodon.org/methods/oauth/#token',
    );
  });

  it('falls back to the section page when the operation is unknown', () => {
    const doc = docFor('GET', '/api/v1/accounts/1/not_a_real_endpoint');
    expect(doc).toEqual({
      url: 'https://docs.joinmastodon.org/methods/accounts/',
      match: 'section',
      summary: '',
    });
  });

  it('returns nothing for endpoints that are not the Mastodon API', () => {
    expect(docFor('GET', 'https://bsky.social/xrpc/app.bsky.feed.getTimeline')).toBeNull();
    expect(docFor('GET', 'https://example.test/feed.rss')).toBeNull();
  });

  it('ignores a malformed key rather than throwing', () => {
    expect(endpointDoc('nonsense')).toBeNull();
  });

  it('supplies a human summary for an exact match', () => {
    expect(docFor('GET', '/api/v1/timelines/home')?.summary).toBeTruthy();
  });
});
