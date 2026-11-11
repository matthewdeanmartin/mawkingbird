import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_NITTER_HOST, nitterHost, setNitterHost, toNitterUrl } from './nitter';

describe('toNitterUrl', () => {
  beforeEach(() => localStorage.clear());

  it('spells a tweet the way the configured mirror spells it', () => {
    // Sotwe drops the author: /tweet/<id>, not /NASA/status/123. Swapping only
    // the host — which is what this used to do — produced a dead link for every
    // tweet when nitter.space went away and the default moved.
    expect(toNitterUrl('https://x.com/NASA/status/123')).toBe(
      `https://${DEFAULT_NITTER_HOST}/tweet/123`,
    );
  });

  it('keeps Twitter’s own shape on a mirror that mirrors it', () => {
    // Every remaining Nitter fork does; an unknown host is assumed to as well.
    expect(toNitterUrl('https://x.com/NASA/status/123', 'nitter.example.org')).toBe(
      'https://nitter.example.org/NASA/status/123',
    );
  });

  it('rewrites a profile URL', () => {
    expect(toNitterUrl('https://x.com/mistersql')).toBe(`https://${DEFAULT_NITTER_HOST}/mistersql`);
  });

  it.each([
    'https://twitter.com/NASA/status/1',
    'https://www.twitter.com/NASA/status/1',
    'https://mobile.twitter.com/NASA/status/1',
    'https://www.x.com/NASA/status/1',
  ])('rewrites the legacy and www hosts too: %s', (url) => {
    expect(toNitterUrl(url)).toContain(DEFAULT_NITTER_HOST);
    expect(toNitterUrl(url)).not.toContain('twitter.com');
  });

  it('leaves a non-X link alone', () => {
    // RSS items point at their publisher; rewriting those would be nonsense.
    const url = 'https://example.com/article';
    expect(toNitterUrl(url)).toBe(url);
  });

  it('returns a malformed URL unchanged rather than throwing', () => {
    // This is a convenience; a link that cannot be rewritten should still work.
    expect(toNitterUrl('not a url')).toBe('not a url');
  });

  it('handles a missing URL', () => {
    expect(toNitterUrl(null)).toBeNull();
    expect(toNitterUrl(undefined)).toBeNull();
  });

  it('preserves query and fragment where the path carries over', () => {
    expect(toNitterUrl('https://x.com/NASA/status/1?s=20#reply', 'nitter.example.org')).toBe(
      'https://nitter.example.org/NASA/status/1?s=20#reply',
    );
  });

  it('drops Twitter’s query when the mirror rewrites the path', () => {
    // `?s=20` is a Twitter share token; it means nothing on sotwe and carrying
    // it onto a rewritten path would just be noise.
    expect(toNitterUrl('https://x.com/NASA/status/1?s=20#reply')).toBe(
      `https://${DEFAULT_NITTER_HOST}/tweet/1`,
    );
  });
});

describe('the configured instance', () => {
  beforeEach(() => localStorage.clear());

  it('defaults when nothing is set', () => {
    expect(nitterHost()).toBe(DEFAULT_NITTER_HOST);
  });

  it('uses a chosen instance', () => {
    setNitterHost('nitter.example.org');
    expect(toNitterUrl('https://x.com/NASA')).toBe('https://nitter.example.org/NASA');
  });

  it('normalizes a pasted URL down to a host', () => {
    // People paste what is in their address bar; requiring a bare hostname
    // would reject the most likely input.
    setNitterHost('https://nitter.example.org/');
    expect(nitterHost()).toBe('nitter.example.org');
  });

  it('restores the default when cleared', () => {
    setNitterHost('nitter.example.org');
    setNitterHost('');
    expect(nitterHost()).toBe(DEFAULT_NITTER_HOST);
  });
});
