import { describe, expect, it } from 'vitest';
import { endpointFromHtml, endpointFromLinkHeader, resolveEndpoint } from './webmention-discovery';

const TARGET = 'https://blog.example/posts/hello/';

describe('endpointFromLinkHeader', () => {
  it('reads a single rel=webmention link', () => {
    expect(endpointFromLinkHeader('<https://wm.example/endpoint>; rel="webmention"')).toBe(
      'https://wm.example/endpoint',
    );
  });

  it('accepts an unquoted rel', () => {
    expect(endpointFromLinkHeader('<https://wm.example/e>; rel=webmention')).toBe(
      'https://wm.example/e',
    );
  });

  it('picks the webmention link out of several', () => {
    const header =
      '<https://blog.example/feed>; rel="alternate", <https://wm.example/e>; rel="webmention"';

    expect(endpointFromLinkHeader(header)).toBe('https://wm.example/e');
  });

  it('handles a URL containing a comma', () => {
    const header = '<https://wm.example/e?a=1,2>; rel="webmention"';

    // Splitting naively on every comma would truncate this.
    expect(endpointFromLinkHeader(header)).toBe('https://wm.example/e?a=1,2');
  });

  it('accepts webmention as one token among several', () => {
    expect(endpointFromLinkHeader('<https://wm.example/e>; rel="webmention noopener"')).toBe(
      'https://wm.example/e',
    );
  });

  it('is not fooled by a rel that merely contains the word', () => {
    expect(endpointFromLinkHeader('<https://wm.example/e>; rel="webmentions"')).toBeNull();
    expect(endpointFromLinkHeader('<https://wm.example/e>; rel="not-webmention"')).toBeNull();
  });

  it('returns null for no header at all', () => {
    expect(endpointFromLinkHeader(null)).toBeNull();
    expect(endpointFromLinkHeader('')).toBeNull();
  });
});

describe('endpointFromHtml', () => {
  it('reads a <link rel=webmention>', () => {
    expect(endpointFromHtml('<html><head><link rel="webmention" href="/wm"></head></html>')).toBe(
      '/wm',
    );
  });

  it('falls back to <a rel=webmention>', () => {
    expect(endpointFromHtml('<body><a rel="webmention" href="/wm">wm</a></body>')).toBe('/wm');
  });

  it('prefers <link> over <a>', () => {
    const html =
      '<head><link rel="webmention" href="/from-link"></head><body><a rel="webmention" href="/from-a">x</a></body>';

    expect(endpointFromHtml(html)).toBe('/from-link');
  });

  it('keeps an empty href, which legally means "this page"', () => {
    expect(endpointFromHtml('<link rel="webmention" href="">')).toBe('');
  });

  it('ignores a rel with no href at all', () => {
    expect(endpointFromHtml('<link rel="webmention">')).toBeNull();
  });

  it('returns null when the page advertises nothing', () => {
    expect(endpointFromHtml('<html><body><p>Just a post.</p></body></html>')).toBeNull();
  });
});

describe('resolveEndpoint', () => {
  it('prefers the Link header over the markup', () => {
    const endpoint = resolveEndpoint(
      TARGET,
      '<https://wm.example/from-header>; rel="webmention"',
      '<link rel="webmention" href="https://wm.example/from-html">',
    );

    // A site can change its headers without a rebuild, so the header is the
    // fresher claim.
    expect(endpoint).toBe('https://wm.example/from-header');
  });

  it('resolves a relative endpoint against the target', () => {
    expect(resolveEndpoint(TARGET, null, '<link rel="webmention" href="/wm">')).toBe(
      'https://blog.example/wm',
    );
  });

  it('treats an empty href as the target page itself', () => {
    expect(resolveEndpoint(TARGET, null, '<link rel="webmention" href="">')).toBe(TARGET);
  });

  it('returns null for a page with no endpoint — the normal case', () => {
    // Mastodon, Bluesky, RSS items and tweets all land here.
    expect(resolveEndpoint(TARGET, null, '<html><body>a post</body></html>')).toBeNull();
  });

  it('refuses a non-http endpoint', () => {
    // A hostile page must not turn into something we POST to.
    expect(
      resolveEndpoint(TARGET, null, '<link rel="webmention" href="javascript:alert(1)">'),
    ).toBeNull();
    expect(
      resolveEndpoint(TARGET, null, '<link rel="webmention" href="data:text/html,x">'),
    ).toBeNull();
  });
});
