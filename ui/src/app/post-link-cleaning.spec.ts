import { describe, expect, it } from 'vitest';
import { cleanPostLinks, cleanPostUrl } from './post-link-cleaning';
import { BskyFacet } from './providers/bluesky/bluesky-types';

describe('post link cleaning', () => {
  it('removes known tracking parameters without re-encoding functional parameters or fragments', () => {
    expect(cleanPostUrl('https://example.org/p?q=a%20b&utm_source=me&FBCLID=secret#part')).toBe(
      'https://example.org/p?q=a%20b#part',
    );
    expect(cleanPostUrl('https://example.org/?%75tm_source=me')).toBe('https://example.org/');
    expect(cleanPostUrl('https://example.org/?id=42&ref=person')).toBe(
      'https://example.org/?id=42&ref=person',
    );
  });

  it('leaves signed, malformed and non-http URLs unchanged', () => {
    for (const url of [
      'https://example.org/?sig=abc&utm_source=x',
      'https://example.org/?X-Amz-Credential=x&utm_source=y',
      'mailto:me@example.org',
      'not a url',
      'https://example.org/?%=bad&utm_source=x',
    ])
      expect(cleanPostUrl(url)).toBe(url);
  });

  it('cleans multiple URLs while preserving surrounding text and punctuation', () => {
    expect(
      cleanPostLinks(
        'Pizza (https://example.org/?utm_source=me), then https://other.org/?id=2&gclid=x!',
      ).text,
    ).toBe('Pizza (https://example.org/), then https://other.org/?id=2!');
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
