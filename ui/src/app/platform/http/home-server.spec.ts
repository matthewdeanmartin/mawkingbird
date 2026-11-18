import { describe, expect, it } from 'vitest';
import { defaultServer, FALLBACK_SERVER, HOME_SERVER_META, homeServer } from './home-server';
import { presets } from './server';

function page(content: string | null): Document {
  const doc = document.implementation.createHTMLDocument('t');
  if (content !== null) {
    const meta = doc.createElement('meta');
    meta.name = HOME_SERVER_META;
    meta.content = content;
    doc.head.append(meta);
  }
  return doc;
}

describe('homeServer', () => {
  it('is absent when the build names none', () => {
    expect(homeServer(page(null))).toBeNull();
    expect(homeServer(page(''))).toBeNull();
    expect(defaultServer(page(''))).toBe(FALLBACK_SERVER);
  });

  it('reads an HTTPS origin, from a URL or a bare host', () => {
    expect(homeServer(page('https://example.social/'))).toBe('https://example.social');
    expect(homeServer(page('example.social'))).toBe('https://example.social');
    expect(homeServer(page('https://example.social/some/path'))).toBe('https://example.social');
    expect(defaultServer(page('example.social'))).toBe('https://example.social');
  });

  it('refuses plain HTTP except on localhost', () => {
    expect(homeServer(page('http://example.social'))).toBeNull();
    expect(homeServer(page('http://localhost:3000'))).toBe('http://localhost:3000');
    expect(homeServer(page('javascript:alert(1)'))).toBeNull();
  });
});

describe('server presets', () => {
  it('lists the home server first, once', () => {
    const list = presets('https://example.social');
    expect(list[0]).toEqual({ label: 'example.social', baseUrl: 'https://example.social' });
    expect(
      presets('https://mastodon.social').filter((p) => p.baseUrl === 'https://mastodon.social'),
    ).toHaveLength(1);
    expect(presets(null).some((p) => p.baseUrl === 'https://example.social')).toBe(false);
  });
});
