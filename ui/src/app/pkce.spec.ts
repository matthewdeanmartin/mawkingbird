import { describe, expect, it } from 'vitest';
import {
  codeChallengeFor,
  createCodeVerifier,
  createOAuthState,
  randomBase64Url,
  sha256Base64Url,
  statesMatch,
} from './pkce';

/** Base64url alphabet only: no +, /, or = padding. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe('randomBase64Url', () => {
  it('emits padding-free base64url', () => {
    expect(randomBase64Url(32)).toMatch(BASE64URL);
  });

  it('does not repeat', () => {
    const values = new Set(Array.from({ length: 50 }, () => randomBase64Url(32)));
    expect(values.size).toBe(50);
  });
});

describe('createCodeVerifier', () => {
  it('stays inside the RFC 7636 length window (43–128 chars)', () => {
    const verifier = createCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(BASE64URL);
  });
});

describe('createOAuthState', () => {
  it('is unguessably long and unique per call', () => {
    expect(createOAuthState().length).toBeGreaterThanOrEqual(32);
    expect(createOAuthState()).not.toBe(createOAuthState());
  });
});

describe('sha256Base64Url', () => {
  // RFC 7636 appendix B's worked example: this exact verifier must produce this
  // exact challenge, which pins the whole S256 encoding (digest + base64url).
  it('matches the RFC 7636 test vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await expect(sha256Base64Url(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('is what codeChallengeFor returns', async () => {
    const verifier = createCodeVerifier();
    await expect(codeChallengeFor(verifier)).resolves.toBe(await sha256Base64Url(verifier));
  });

  it('differs for different verifiers', async () => {
    expect(await sha256Base64Url('a')).not.toBe(await sha256Base64Url('b'));
  });
});

describe('statesMatch', () => {
  it('accepts an exact match', () => {
    const state = createOAuthState();
    expect(statesMatch(state, state)).toBe(true);
  });

  it('rejects a different value of the same length', () => {
    expect(statesMatch('abcdef', 'abcdeg')).toBe(false);
  });

  it('rejects a length mismatch (no prefix match)', () => {
    expect(statesMatch('abcdef', 'abcde')).toBe(false);
    expect(statesMatch('abcdef', 'abcdefg')).toBe(false);
  });

  it('rejects missing or empty values rather than treating them as equal', () => {
    expect(statesMatch(null, null)).toBe(false);
    expect(statesMatch('', '')).toBe(false);
    expect(statesMatch('abc', null)).toBe(false);
    expect(statesMatch(null, 'abc')).toBe(false);
  });
});
