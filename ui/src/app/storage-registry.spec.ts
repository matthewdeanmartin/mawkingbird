import { describe, expect, it } from 'vitest';
import {
  classifyStorageKey,
  EXPORT_PROFILES,
  exportableKeys,
  isExportable,
  isKeyExportable,
  Sensitivity,
  specForKey,
  STORAGE_KEYS,
} from './storage-registry';

// The complementary check — that every key declared in the source appears in
// this registry — needs filesystem access, which the Angular test build has no
// types for. It lives in scripts/check-storage-registry.mjs (`npm run
// check:storage`), and is enforced in CI by the `ui-gates` job in
// .github/workflows/build.yml.
//
// This comment previously claimed the script was "wired into make check". It
// was not wired into anything — `make check-ci` is the Python Makefile and never
// ran it — so the script could only be invoked by hand, and the drift it exists
// to prevent accumulated unnoticed for as long as the comment stayed wrong. If
// you move where it runs, fix this sentence in the same commit.

describe('storage registry', () => {
  it('lists no duplicate key bases', () => {
    const bases = STORAGE_KEYS.map((spec) => spec.base);
    expect(new Set(bases).size).toBe(bases.length);
  });

  it('gives every entry a note explaining the classification', () => {
    for (const spec of STORAGE_KEYS) {
      expect(spec.note.length, `${spec.base} needs a note`).toBeGreaterThan(10);
    }
  });
});

describe('export profiles', () => {
  it('never export secrets, under any profile', () => {
    for (const profile of Object.keys(EXPORT_PROFILES) as (keyof typeof EXPORT_PROFILES)[]) {
      const leaked = exportableKeys(profile).filter((spec) => spec.sensitivity === 'secret');
      expect(leaked, `profile "${profile}" would export secrets`).toEqual([]);
    }
  });

  it('never export caches, under any profile', () => {
    for (const profile of Object.keys(EXPORT_PROFILES) as (keyof typeof EXPORT_PROFILES)[]) {
      const leaked = exportableKeys(profile).filter((spec) => spec.sensitivity === 'cache');
      expect(leaked).toEqual([]);
    }
  });

  it('keeps private and authored data out of a shareable export', () => {
    // This is the gist case: settings published for other people to read.
    const shared = exportableKeys('shareable').map((s) => s.sensitivity);
    expect(new Set(shared)).toEqual(new Set(['setting']));
  });

  it('excludes the specific keys that motivated the split', () => {
    for (const base of [
      'mastodon_mock_token',
      'mastodon_mock_session_tokens',
      'mockingbird_bsky_credentials',
      'mockingbird_github_credentials',
      'mockingbird_raindrop_token',
      'mockingbird_paste_edit_keys',
    ]) {
      expect(specForKey(base)?.sensitivity, base).toBe('secret');
      expect(isExportable(base, 'shareable'), base).toBe(false);
      expect(isExportable(base, 'personal'), base).toBe(false);
    }
  });

  it('keeps followed hashtags out of a shareable export', () => {
    // The #diabetesSufferers case: not a secret, but not for publication.
    expect(specForKey('mockingbird_anonymous_tags')?.sensitivity).toBe('private');
    expect(isExportable('mockingbird_anonymous_tags', 'shareable')).toBe(false);
    expect(isExportable('mockingbird_anonymous_tags', 'personal')).toBe(true);
  });

  it('still carries the actual preferences in a shareable export', () => {
    expect(isExportable('mockingbird_client_prefs', 'shareable')).toBe(true);
    expect(isExportable('mockingbird_feature_flags', 'shareable')).toBe(true);
  });

  it('refuses an unregistered key rather than defaulting to allowed', () => {
    expect(isExportable('mockingbird_something_nobody_classified', 'shareable')).toBe(false);
    expect(isExportable('mockingbird_something_nobody_classified', 'personal')).toBe(false);
  });

  it('never exports sessionStorage, which cannot outlive the tab anyway', () => {
    for (const profile of Object.keys(EXPORT_PROFILES) as (keyof typeof EXPORT_PROFILES)[]) {
      const leaked = exportableKeys(profile).filter((spec) => spec.storage === 'session');
      expect(leaked, `profile "${profile}" would export sessionStorage`).toEqual([]);
    }
  });

  it('classifies concrete keys including their runtime suffixes', () => {
    // Account-scoped: bare base (logged out) and hashed suffix both resolve.
    expect(classifyStorageKey('mockingbird_rss_feeds')?.base).toBe('mockingbird_rss_feeds');
    expect(classifyStorageKey('mockingbird_rss_feeds_xy3ge5')?.base).toBe('mockingbird_rss_feeds');
    expect(classifyStorageKey('mockingbird_rss_feeds_anonymous')?.base).toBe(
      'mockingbird_rss_feeds',
    );
    // Instance-suffixed.
    expect(classifyStorageKey('mockingbird_api_metrics:this-server')?.sensitivity).toBe('cache');
    expect(classifyStorageKey('mockingbird_api_metrics:mastodon.social')?.sensitivity).toBe(
      'cache',
    );
    // Unscoped keys must not swallow a longer, differently-classified key.
    expect(classifyStorageKey('mockingbird_anonymous_tags')?.base).toBe(
      'mockingbird_anonymous_tags',
    );
    expect(classifyStorageKey('mockingbird_totally_unknown')).toBeNull();
  });

  it('excludes a scoped secret whatever suffix it carries', () => {
    for (const key of [
      'mockingbird_github_credentials',
      'mockingbird_github_credentials_xy3ge5',
      'mockingbird_bsky_credentials_anonymous',
      'mockingbird_raindrop_token_abc123',
    ]) {
      expect(isKeyExportable(key, 'shareable'), key).toBe(false);
      expect(isKeyExportable(key, 'personal'), key).toBe(false);
    }
  });

  it('includes a scoped setting whatever suffix it carries', () => {
    expect(isKeyExportable('mockingbird_hidden_providers_xy3ge5', 'shareable')).toBe(true);
    expect(isKeyExportable('mockingbird_default_visibility', 'shareable')).toBe(true);
  });

  it('covers every sensitivity in the union', () => {
    const used = new Set<Sensitivity>(STORAGE_KEYS.map((spec) => spec.sensitivity));
    expect(used).toEqual(new Set(['secret', 'private', 'content', 'setting', 'cache']));
  });
});
