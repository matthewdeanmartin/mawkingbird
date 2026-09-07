/**
 * The inner wrap.
 *
 * The assertions here are about properties rather than examples, because a bug
 * in this file does not throw — it produces bytes that look fine and cannot be
 * decrypted later, by which time the ciphertext is the only copy of something a
 * user needed.
 */

import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  CURRENT_KDF,
  deriveVaultKey,
  generateSalt,
  MIN_PASSPHRASE_LENGTH,
  openBundle,
  passphraseProblem,
  PBKDF2_ITERATIONS,
  sealBundle,
  UnsupportedKdfError,
} from './vault-crypto';

/** A cheap KDF, so the suite is not 600,000 iterations per test. */
const FAST_KDF = { name: 'pbkdf2-sha256', params: { iterations: 1 } };

const SALT = generateSalt();

async function key(passphrase = 'correct horse battery staple', salt = SALT) {
  return deriveVaultKey(passphrase, salt, FAST_KDF);
}

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const original = crypto.getRandomValues(new Uint8Array(512));
    expect(base64ToBytes(bytesToBase64(original))).toEqual(original);
  });

  it('survives a payload past the argument-spread limit', () => {
    // `String.fromCharCode(...bytes)` throws a RangeError somewhere around here.
    // A fixture-sized test would never reach it.
    const large = crypto.getRandomValues(new Uint8Array(64 * 1024));
    expect(base64ToBytes(bytesToBase64(large))).toEqual(large);
  });
});

describe('salts', () => {
  it('is a fresh 16 bytes each time', () => {
    const first = generateSalt();
    const second = generateSalt();
    expect(base64ToBytes(first)).toHaveLength(16);
    expect(first).not.toBe(second);
  });
});

describe('key derivation', () => {
  it('is non-extractable', async () => {
    // The security property the whole IndexedDB design rests on, asserted
    // directly rather than trusting the flag. Script in this page can decrypt
    // with the key; it cannot read the bytes out and ship them anywhere.
    const derived = await key();
    expect(derived.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', derived)).rejects.toThrow();
  });

  it('is deterministic for the same passphrase and salt', async () => {
    // Two browsers must derive the same key from the same passphrase, or the
    // second device reads a vault it cannot open.
    const bundle = { v: 1 as const, browser: { a: '1' }, accounts: {}, meta: {} };
    const sealed = await sealBundle(bundle, await key());
    expect(await openBundle(sealed, await key())).toEqual(bundle);
  });

  it('differs with the salt', async () => {
    const sealed = await sealBundle({ a: 1 }, await key('same passphrase', SALT));
    expect(await openBundle(sealed, await key('same passphrase', generateSalt()))).toBeNull();
  });

  it('differs with the passphrase', async () => {
    const sealed = await sealBundle({ a: 1 }, await key('passphrase one'));
    expect(await openBundle(sealed, await key('passphrase two'))).toBeNull();
  });

  it('refuses a KDF it does not implement, naming it', async () => {
    // A vault written by a future client. Failing loudly beats deriving a wrong
    // key and reporting a wrong passphrase, which would send the user hunting
    // for a passphrase that was never the problem.
    await expect(
      deriveVaultKey('x', SALT, { name: 'argon2id', params: { m: 65536 } }),
    ).rejects.toThrow(UnsupportedKdfError);
  });

  it('refuses a KDF with no usable iteration count', async () => {
    await expect(deriveVaultKey('x', SALT, { name: 'pbkdf2-sha256', params: {} })).rejects.toThrow(
      UnsupportedKdfError,
    );
  });

  it('ships 600,000 iterations by default', () => {
    // OWASP's current PBKDF2-SHA-256 guidance. Pinned so a "performance fix"
    // has to argue with a number rather than quietly weakening the KDF.
    expect(CURRENT_KDF.params['iterations']).toBe(PBKDF2_ITERATIONS);
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });
});

describe('sealing', () => {
  it('round-trips a bundle', async () => {
    const bundle = {
      v: 1 as const,
      browser: { mockingbird_openrouter_key: 'sk-or-v1-abc' },
      accounts: { 'mastodon:a/alice': { mockingbird_hugo_credentials: 'ghp_x' } },
      meta: {},
    };
    const derived = await key();
    expect(await openBundle(await sealBundle(bundle, derived), derived)).toEqual(bundle);
  });

  it('never repeats a ciphertext for the same input', async () => {
    // A fresh random IV per operation. AES-GCM with a repeated IV under one key
    // leaks the XOR of the plaintexts and the authentication subkey — a total
    // break, not a weakness. This is what a "cache the IV" optimisation has to
    // argue with.
    const derived = await key();
    const seen = new Set<string>();
    for (let index = 0; index < 200; index++) {
      seen.add(await sealBundle({ same: 'value' }, derived));
    }
    expect(seen.size).toBe(200);
  });

  it('does not leak the plaintext into the ciphertext', async () => {
    const sealed = await sealBundle({ browser: { k: 'sk-or-v1-secret' } }, await key());
    expect(sealed).not.toContain('sk-or-v1-secret');
    expect(atob(sealed)).not.toContain('sk-or-v1-secret');
  });

  it('detects tampering anywhere in the blob', async () => {
    const derived = await key();
    const sealed = base64ToBytes(await sealBundle({ a: 1 }, derived));

    // Every byte, not a spot check: the IV prefix, the ciphertext body and the
    // GCM tag are three different failure modes.
    for (let index = 0; index < sealed.length; index++) {
      const tampered = new Uint8Array(sealed);
      tampered[index] = (tampered[index] ?? 0) ^ 0x01;
      expect(await openBundle(bytesToBase64(tampered), derived)).toBeNull();
    }
  });
});

describe('opening', () => {
  it('returns null rather than throwing on a wrong key', async () => {
    // A wrong passphrase is the expected case, not an exception. Making it one
    // guarantees a crypto stack trace eventually reaches someone who mistyped.
    const sealed = await sealBundle({ a: 1 }, await key('right passphrase'));
    await expect(openBundle(sealed, await key('wrong passphrase'))).resolves.toBeNull();
  });

  it.each([
    ['not base64', 'not base64 !!'],
    ['too short to hold an IV', btoa('tiny')],
    ['empty', ''],
  ])('returns null for %s', async (_label, input) => {
    await expect(openBundle(input, await key())).resolves.toBeNull();
  });
});

describe('passphrase rules', () => {
  it('accepts a reasonable passphrase', () => {
    expect(passphraseProblem('correct horse battery staple')).toBeNull();
  });

  it('refuses one that is too short, saying what would work', () => {
    const problem = passphraseProblem('short');
    expect(problem).toContain(String(MIN_PASSPHRASE_LENGTH));
    // Names the fix rather than only the rule.
    expect(problem).toMatch(/words/i);
  });

  it('refuses the user’s own email address', () => {
    // A real habit, and the failure is total: the one string an attacker
    // already knows would be the one that opens everything.
    expect(passphraseProblem('person@example.com', 'person@example.com')).toMatch(/email/i);
    expect(passphraseProblem('PERSON@EXAMPLE.COM  ', 'person@example.com')).toMatch(/email/i);
  });

  it('allows a long passphrase that merely contains the email', () => {
    // The rule is "is your email", not "contains it". Being stricter here would
    // refuse a perfectly good passphrase for no gain.
    expect(passphraseProblem('person@example.com and more words', 'person@example.com')).toBeNull();
  });
});
