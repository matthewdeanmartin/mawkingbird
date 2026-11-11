import { afterEach, describe, expect, it } from 'vitest';
import { BskyFacet } from '../connections/bluesky/bluesky-types';
import { SHORTENER_CONFIG_KEY } from '../connections/shortener/short-domains';
import { cleanPostLinks, cleanPostUrl } from './post-link-cleaning';

// Cleaning itself is tested in src/lib/link-cleaning. These pin what Mawkingbird
// protects, and the Bluesky facet bookkeeping that only this app needs.
describe('post link cleaning in Mawkingbird', () => {
  afterEach(() => localStorage.removeItem(SHORTENER_CONFIG_KEY));

  it('still removes tracking parameters from ordinary links', () => {
    expect(cleanPostUrl('https://example.org/?id=1&utm_source=me')).toBe(
      'https://example.org/?id=1',
    );
  });

  it("leaves links on the providers' shared short domains alone", () => {
    for (const url of [
      'https://dub.sh/abc?utm_source=x',
      'https://tinyurl.com/abc?utm_source=x',
      'https://is.gd/abc?utm_source=x',
    ])
      expect(cleanPostUrl(url)).toBe(url);
  });

  it('leaves links on a custom short domain configured in this browser alone', () => {
    const url = 'https://go.example.com/abc?utm_source=x';
    expect(cleanPostUrl(url)).toBe('https://go.example.com/abc');
    localStorage.setItem(
      SHORTENER_CONFIG_KEY,
      JSON.stringify({ active: 'shortio', domains: { shortio: 'go.example.com' } }),
    );
    expect(cleanPostUrl(url)).toBe(url);
  });

  it('keeps the campaign tags the invite tool added on purpose', () => {
    const invite =
      'https://mawkingbird.com/invites?mastodon.social&utm_source=bluesky&utm_medium=invite&utm_campaign=a';
    expect(cleanPostLinks(`Come over: ${invite}`).text).toBe(`Come over: ${invite}`);
  });

  it('preserves UTF-8 link and mention facet offsets after cleaning, without changing the input', () => {
    const url = 'https://example.org/?utm_source=me';
    const text = `🍍 ${url} @pizza`;
    const size = (s: string) => new TextEncoder().encode(s).length;
    const start = size('🍍 ');
    const end = start + size(url);
    const facets: BskyFacet[] = [
      {
        index: { byteStart: start, byteEnd: end },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      },
      {
        index: { byteStart: end + 1, byteEnd: size(text) },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:pizza' }],
      },
    ];
    const result = cleanPostLinks(text, facets);
    expect(result.text).toBe('🍍 https://example.org/ @pizza');
    const bytes = new TextEncoder().encode(result.text);
    expect(
      result.facets!.map((facet) =>
        new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd)),
      ),
    ).toEqual(['https://example.org/', '@pizza']);
    expect(result.facets![0].features[0]).toEqual({
      $type: 'app.bsky.richtext.facet#link',
      uri: 'https://example.org/',
    });
    expect(facets[0].index.byteEnd).toBe(end);
  });
});
