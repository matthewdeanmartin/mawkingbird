import { describe, expect, it } from 'vitest';
import { cleanLinks, cleanUrl } from './link-cleaning';

describe('post link cleaning', () => {
  it('removes known tracking parameters without re-encoding functional parameters or fragments', () => {
    expect(cleanUrl('https://example.org/p?q=a%20b&utm_source=me&FBCLID=secret#part')).toBe(
      'https://example.org/p?q=a%20b#part',
    );
    expect(cleanUrl('https://example.org/?%75tm_source=me')).toBe('https://example.org/');
    expect(cleanUrl('https://example.org/?id=42&ref=person')).toBe(
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
      expect(cleanUrl(url)).toBe(url);
  });

  it('cleans multiple URLs while preserving surrounding text and punctuation', () => {
    expect(
      cleanLinks(
        'Pizza (https://example.org/?utm_source=me), then https://other.org/?id=2&gclid=x!',
      ).text,
    ).toBe('Pizza (https://example.org/), then https://other.org/?id=2!');
  });

  it('reports each change at its UTF-16 position in the original text', () => {
    const text = '🍍 https://example.org/?utm_source=me ok';
    const { edits } = cleanLinks(text);
    expect(edits).toEqual([
      {
        start: 3,
        end: 3 + 'https://example.org/?utm_source=me'.length,
        original: 'https://example.org/?utm_source=me',
        replacement: 'https://example.org/',
      },
    ]);
    expect(text.slice(edits[0].start, edits[0].end)).toBe(edits[0].original);
  });
});

describe('link cleaning allowlist', () => {
  const tagged = 'https://go.example.com/abc?utm_source=newsletter';

  it('leaves kept hosts and their subdomains alone', () => {
    expect(cleanUrl(tagged, { keepHosts: ['example.com'] })).toBe(tagged);
    expect(cleanUrl(tagged, { keepHosts: ['go.example.com'] })).toBe(tagged);
    expect(cleanUrl(tagged, { keepHosts: ['other.com'] })).toBe('https://go.example.com/abc');
  });

  it('does not treat a lookalike host as a subdomain', () => {
    expect(cleanUrl('https://notexample.com/?utm_source=x', { keepHosts: ['example.com'] })).toBe(
      'https://notexample.com/',
    );
  });

  it('keeps named parameters while still removing the others', () => {
    expect(
      cleanUrl('https://shop.test/?utm_campaign=spring&utm_source=x&fbclid=y', {
        keepParams: ['UTM_CAMPAIGN'],
      }),
    ).toBe('https://shop.test/?utm_campaign=spring');
  });

  it('leaves links a predicate recognises', () => {
    const invite = 'https://mastodon.test/invite/abc?utm_medium=invite&utm_source=bluesky';
    const keep = (url: URL) => url.searchParams.get('utm_medium') === 'invite';
    expect(cleanLinks(`Join me: ${invite}`, { keep })).toEqual({
      text: `Join me: ${invite}`,
      edits: [],
    });
  });
});
