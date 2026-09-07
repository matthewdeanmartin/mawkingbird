/**
 * The pin between the vault manifest and the storage registry.
 *
 * These are the tests that make "adding a key to the vault is a deliberate act"
 * enforceable rather than aspirational. A new credential in the registry fails
 * the build until somebody decides which list it belongs in — which is the
 * point at which the decision is cheapest and most visible.
 */

import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../storage-registry';
import {
  bundleCount,
  emptyBundle,
  isBundle,
  isVaulted,
  mergeBundles,
  NOT_VAULTED,
  readFromBundle,
  removeFromBundle,
  VAULTED_KEYS,
  vaultedKey,
  writeToBundle,
  type ConnectionBundle,
} from './vault-manifest';

const SECRET_BASES = STORAGE_KEYS.filter((key) => key.sensitivity === 'secret').map(
  (key) => key.base,
);

describe('the manifest is pinned to the registry', () => {
  it('vaults only keys that exist in the registry', () => {
    // Catches a typo or a rename. Without this, a misspelled base silently
    // vaults nothing at all, and the connector looks like it simply does not
    // sync.
    for (const entry of VAULTED_KEYS) {
      expect(STORAGE_KEYS.map((key) => key.base)).toContain(entry.base);
    }
  });

  it('vaults only keys classified secret', () => {
    // A `setting` in here would mean encrypting something that belongs in the
    // ordinary settings document, which is the wrong store and a needless
    // passphrase prompt.
    for (const entry of VAULTED_KEYS) {
      expect(SECRET_BASES).toContain(entry.base);
    }
  });

  it('accounts for every secret key, in one list or the other', () => {
    // The assertion that does the real work. A new credential added to the app
    // fails here until it is either vaulted or explicitly excluded with a
    // reason — so "not vaulted" and "nobody has looked at this yet" stop being
    // the same state.
    const decided = new Set([
      ...VAULTED_KEYS.map((entry) => entry.base),
      ...NOT_VAULTED.map((entry) => entry.base),
    ]);
    const undecided = SECRET_BASES.filter((base) => !decided.has(base));
    expect(undecided).toEqual([]);
  });

  it('does not list a key in both directions', () => {
    const vaulted = new Set(VAULTED_KEYS.map((entry) => entry.base));
    for (const entry of NOT_VAULTED) {
      expect(vaulted.has(entry.base)).toBe(false);
    }
  });

  it('gives every exclusion a reason worth reading', () => {
    for (const entry of NOT_VAULTED) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('never vaults a session-scoped key', () => {
    // Lifetimes measured in seconds, meaningless on another device. Syncing one
    // would be pure risk for no benefit.
    const sessionBases = STORAGE_KEYS.filter((key) => key.storage === 'session').map(
      (key) => key.base,
    );
    for (const entry of VAULTED_KEYS) {
      expect(sessionBases).not.toContain(entry.base);
    }
  });

  it('excludes the identity tokens by name', () => {
    // Pinned explicitly rather than left to the general rule, because these are
    // the ones somebody will eventually be tempted to add for convenience. The
    // reason they stay out is in NOT_VAULTED; this makes reversing it loud.
    //
    // The Bluesky keys used to be on this list and were removed deliberately.
    // The line these draw is not "session token vs API key" but *who issued it
    // to whom*: a Mastodon OAuth token IS the account, minted by a sign-in flow
    // that is cheap to repeat (PKCE). A Bluesky app password is a revocable,
    // per-app credential the user went and created by hand, with no re-auth
    // flow to fall back on — the same shape as every other key in VAULTED_KEYS.
    // The full argument is on the manifest entry.
    for (const base of ['mastodon_mock_token', 'mastodon_mock_session_tokens']) {
      expect(isVaulted(base)).toBe(false);
    }
  });

  it('vaults both Bluesky credential keys, connector and identity', () => {
    // Bluesky is the same credential in two storage locations: scoped per
    // account when it is a connector, unscoped when it IS the identity (the DID
    // it would be scoped by lives inside it — see bluesky-identity-store.ts).
    // Vaulting only the connector half would leave a Bluesky-primary account
    // still re-pasting, which is the case the change exists to fix.
    expect(isVaulted('mockingbird_bsky_credentials')).toBe(true);
    expect(vaultedKey('mockingbird_bsky_credentials')?.scope).toBe('account');
    expect(isVaulted('mockingbird_bsky_identity_credentials')).toBe(true);
    expect(vaultedKey('mockingbird_bsky_identity_credentials')?.scope).toBe('browser');
  });

  it('vaults the eleven live credentials', () => {
    // The roadmap named ten. `mockingbird_raindrop_credentials` was moved to
    // NOT_VAULTED when wiring the connector showed that nothing writes it —
    // `RaindropSession` only ever deletes it. Vaulting a key the app is trying
    // to forget would resurrect it on every device on the next read.
    //
    // Then the two Bluesky keys came the other way, out of NOT_VAULTED: nine
    // plus two. See the entries for why that reversal was right.
    expect(VAULTED_KEYS).toHaveLength(11);
    expect(isVaulted('mockingbird_openrouter_key')).toBe(true);
    expect(vaultedKey('mockingbird_openrouter_key')?.scope).toBe('browser');
    expect(vaultedKey('mockingbird_mataroa_connection')?.scope).toBe('account');
  });
});

describe('bundle operations', () => {
  it('writes and reads a browser-scoped credential', () => {
    const bundle = writeToBundle(emptyBundle(), 'mockingbird_openrouter_key', null, 'sk-1', 'Mac');
    expect(readFromBundle(bundle, 'mockingbird_openrouter_key', null)).toBe('sk-1');
  });

  it('keeps personas apart', () => {
    // The failure this prevents is unpickable afterwards: one account's key
    // surfacing under another's, with no way to tell which is which.
    let bundle = writeToBundle(
      emptyBundle(),
      'mockingbird_hugo_credentials',
      'mastodon:a/alice',
      'A',
      'Mac',
    );
    bundle = writeToBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:b/bob', 'B', 'Mac');

    expect(readFromBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:a/alice')).toBe('A');
    expect(readFromBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:b/bob')).toBe('B');
    expect(readFromBundle(bundle, 'mockingbird_hugo_credentials', null)).toBeNull();
  });

  it('removes a credential and tidies the empty account', () => {
    let bundle = writeToBundle(
      emptyBundle(),
      'mockingbird_hugo_credentials',
      'mastodon:a/alice',
      'A',
      'Mac',
    );
    bundle = removeFromBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:a/alice');
    expect(bundle.accounts['mastodon:a/alice']).toBeUndefined();
  });

  it('does not mutate the bundle it was given', () => {
    const original = emptyBundle();
    writeToBundle(original, 'mockingbird_openrouter_key', null, 'sk-1', 'Mac');
    expect(original.browser['mockingbird_openrouter_key']).toBeUndefined();
  });

  it('counts across both scopes', () => {
    let bundle = writeToBundle(emptyBundle(), 'mockingbird_openrouter_key', null, 'sk', 'Mac');
    bundle = writeToBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:a/alice', 'A', 'Mac');
    expect(bundleCount(bundle)).toBe(2);
  });

  it('recognises a bundle and refuses anything else', () => {
    expect(isBundle(emptyBundle())).toBe(true);
    expect(isBundle(null)).toBe(false);
    expect(isBundle({ v: 2, browser: {}, accounts: {} })).toBe(false);
    expect(isBundle('a string')).toBe(false);
  });
});

describe('merging', () => {
  const older = new Date('2026-08-01T00:00:00.000Z');
  const newer = new Date('2026-08-19T00:00:00.000Z');

  it('keeps both sides when each added a different credential', () => {
    // The realistic conflict, and the reason merging is per credential rather
    // than whole-blob last-write-wins: taking the newer blob would silently
    // discard one of these.
    const mine = writeToBundle(
      emptyBundle(),
      'mockingbird_shortener_keys',
      null,
      'S',
      'Mac',
      newer,
    );
    const theirs = writeToBundle(
      emptyBundle(),
      'mockingbird_mataroa_connection',
      'mastodon:a/alice',
      'M',
      'Windows',
      newer,
    );

    const { bundle } = mergeBundles(mine, theirs);
    expect(readFromBundle(bundle, 'mockingbird_shortener_keys', null)).toBe('S');
    expect(readFromBundle(bundle, 'mockingbird_mataroa_connection', 'mastodon:a/alice')).toBe('M');
  });

  it('takes the newer value and names the device that won', () => {
    const mine = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'mine',
      'Mac',
      older,
    );
    const theirs = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'theirs',
      'Windows',
      newer,
    );

    const { bundle, overwritten } = mergeBundles(mine, theirs);
    expect(readFromBundle(bundle, 'mockingbird_openrouter_key', null)).toBe('theirs');
    // Reported rather than resolved silently — otherwise someone spends an
    // afternoon wondering why the key they just pasted does not work.
    expect(overwritten).toEqual([{ base: 'mockingbird_openrouter_key', device: 'Windows' }]);
  });

  it('keeps ours when ours is newer, and reports nothing', () => {
    const mine = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'mine',
      'Mac',
      newer,
    );
    const theirs = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'theirs',
      'Windows',
      older,
    );

    const { bundle, overwritten } = mergeBundles(mine, theirs);
    expect(readFromBundle(bundle, 'mockingbird_openrouter_key', null)).toBe('mine');
    expect(overwritten).toEqual([]);
  });

  it('reports nothing when both sides agree', () => {
    const mine = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'same',
      'Mac',
      older,
    );
    const theirs = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'same',
      'Windows',
      newer,
    );
    expect(mergeBundles(mine, theirs).overwritten).toEqual([]);
  });

  it('keeps ours when our timestamp is unreadable', () => {
    // NaN comparisons are false, so this lands on "keep ours" — the
    // conservative direction, since the local copy is the one the user can see
    // in front of them.
    const mine = writeToBundle(emptyBundle(), 'mockingbird_openrouter_key', null, 'mine', 'Mac');
    mine.meta['mockingbird_openrouter_key'] = { addedAt: 'not-a-date', device: 'Mac' };
    const theirs = writeToBundle(
      emptyBundle(),
      'mockingbird_openrouter_key',
      null,
      'theirs',
      'Windows',
      older,
    );
    expect(
      readFromBundle(mergeBundles(mine, theirs).bundle, 'mockingbird_openrouter_key', null),
    ).toBe('theirs');
  });

  it('merges account scopes independently', () => {
    const mine = writeToBundle(
      emptyBundle(),
      'mockingbird_hugo_credentials',
      'mastodon:a/alice',
      'A',
      'Mac',
      newer,
    );
    const theirs = writeToBundle(
      emptyBundle(),
      'mockingbird_hugo_credentials',
      'mastodon:b/bob',
      'B',
      'Windows',
      newer,
    );
    const { bundle } = mergeBundles(mine, theirs);
    expect(readFromBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:a/alice')).toBe('A');
    expect(readFromBundle(bundle, 'mockingbird_hugo_credentials', 'mastodon:b/bob')).toBe('B');
  });

  it('handles a bundle with no meta at all', () => {
    const bare: ConnectionBundle = { v: 1, browser: { a: '1' }, accounts: {}, meta: {} };
    expect(() => mergeBundles(bare, bare)).not.toThrow();
  });
});
