import { describe, expect, it } from 'vitest';
import {
  brandLogoSrc,
  corsProxyOrigin,
  failWhaleArt,
  isCanaryBuild,
  isTestBuild,
} from './build-flavor';

describe('build-flavor', () => {
  it('detects canary from a /canary/ base href', () => {
    expect(isCanaryBuild('https://mawkingbird.com/canary/')).toBe(true);
    expect(isCanaryBuild('https://mawkingbird.com/canary')).toBe(true);
  });

  it('treats production and sub-paths that merely contain "canary" correctly', () => {
    expect(isCanaryBuild('https://mawkingbird.com/')).toBe(false);
    expect(isCanaryBuild('https://mawkingbird.com/canary-notes/')).toBe(false);
    expect(isCanaryBuild('http://localhost:4200/')).toBe(false);
  });

  it('falls back to production on an unparseable base href', () => {
    expect(isCanaryBuild('not a url')).toBe(false);
  });

  it('picks the canary logo only on canary', () => {
    expect(brandLogoSrc('ai', 'https://mawkingbird.com/canary/')).toBe('canary_logo_104.png');
    expect(brandLogoSrc('ai', 'https://mawkingbird.com/')).toBe('mockigbird_logo_104.png');
  });

  it('picks the hand-drawn mark by default, on both flavors', () => {
    expect(brandLogoSrc(undefined, 'https://mawkingbird.com/canary/')).toBe('canary_hand_104.png');
    expect(brandLogoSrc(undefined, 'https://mawkingbird.com/')).toBe('mockingbird_hand_104.png');
  });

  it('keeps canary distinguishable in either illustration set', () => {
    // The two dimensions are independent: canary must not look like production
    // just because the reader switched the artwork.
    for (const style of ['hand', 'ai'] as const) {
      expect(brandLogoSrc(style, 'https://mawkingbird.com/canary/')).not.toBe(
        brandLogoSrc(style, 'https://mawkingbird.com/'),
      );
    }
  });

  it('carries each whale drawing its own true shape', () => {
    // A wrong width/height here stretches the art — the whole reason the
    // dimensions live with the file rather than in each template.
    expect(failWhaleArt('ai')).toEqual({
      src: 'insufficient_whale_640.png',
      width: 640,
      height: 480,
    });
    expect(failWhaleArt('hand')).toEqual({
      src: 'insufficient_whale_hand_640.png',
      width: 640,
      height: 451,
    });
    expect(failWhaleArt()).toEqual(failWhaleArt('hand'));
  });
});

describe('isTestBuild', () => {
  it('recognises the /test/ deployment, with or without a trailing slash', () => {
    expect(isTestBuild('https://mawkingbird.com/test/')).toBe(true);
    expect(isTestBuild('https://mawkingbird.com/test')).toBe(true);
    // The github.io mirror nests everything one level deeper.
    expect(isTestBuild('https://matthewdeanmartin.github.io/mawkingbird/test/')).toBe(true);
  });

  it('does not mistake production, canary or a lookalike path for it', () => {
    expect(isTestBuild('https://mawkingbird.com/')).toBe(false);
    expect(isTestBuild('https://mawkingbird.com/canary/')).toBe(false);
    // The suffix check is on a whole path segment: a page about testing is not
    // the test deployment, and treating it as one would point real users at
    // sandbox billing.
    expect(isTestBuild('https://mawkingbird.com/testing/')).toBe(false);
    expect(isTestBuild('https://mawkingbird.com/latest/')).toBe(false);
  });

  it('is false for an unparseable base', () => {
    expect(isTestBuild('not a url')).toBe(false);
  });
});

describe('corsProxyOrigin', () => {
  it('sends the test deployment to the sandbox Worker', () => {
    expect(corsProxyOrigin('https://mawkingbird.com/test/')).toBe(
      'https://mawkingbird-cors-proxy-test.matthewdeanmartin.workers.dev',
    );
  });

  it('sends production AND canary to the real Worker', () => {
    // Canary is production: real customers, real billing, new features first.
    // Pointing it at the sandbox would mean canary users could not subscribe.
    const real = 'https://cors.mawkingbird.com';
    expect(corsProxyOrigin('https://mawkingbird.com/')).toBe(real);
    expect(corsProxyOrigin('https://mawkingbird.com/canary/')).toBe(real);
  });

  it('never returns a URL with a trailing slash', () => {
    // Callers append '/plus/token' and '/health'; a trailing slash here would
    // produce '//plus/token', which the Worker routes as a different path.
    for (const base of ['https://mawkingbird.com/', 'https://mawkingbird.com/test/']) {
      expect(corsProxyOrigin(base).endsWith('/')).toBe(false);
    }
  });
});
