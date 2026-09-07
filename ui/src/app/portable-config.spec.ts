import { beforeEach, describe, expect, it } from 'vitest';
import {
  configChanges,
  exportPortableConfig,
  importPortableConfig,
  parsePortableConfig,
  PORTABLE_CONFIG_KIND,
} from './portable-config';

describe('portable config', () => {
  beforeEach(() => localStorage.clear());

  it('exports global preferences and excludes secrets, private data, and account-scoped values', () => {
    localStorage.setItem('mockingbird_client_prefs', JSON.stringify({ theme: 'dark' }));
    localStorage.setItem('mockingbird_default_visibility_deadbeef', 'private');
    localStorage.setItem('mockingbird_rss_feeds_deadbeef', '["https://private.example/feed"]');
    localStorage.setItem('mastodon_mock_token', 'definitely-a-secret-token');

    const exported = exportPortableConfig(localStorage, false);

    expect(exported.values['mockingbird_client_prefs']).toContain('dark');
    expect(exported.values['mockingbird_default_visibility_deadbeef']).toBeUndefined();
    expect(exported.values['mockingbird_rss_feeds_deadbeef']).toBeUndefined();
    expect(exported.values['mastodon_mock_token']).toBeUndefined();
  });

  it('adds only the approved configuration-like private values when opted in', () => {
    localStorage.setItem('mastodon_mock_server', 'social.example');
    localStorage.setItem('mockingbird_cors_proxy', JSON.stringify({ id: 'custom' }));
    localStorage.setItem('mockingbird_shortener', JSON.stringify({ active: 'isgd' }));
    localStorage.setItem('mockingbird_saved_searches', '["medical topic"]');
    localStorage.setItem('mastodon_mock_sessions', '[{"account":"someone"}]');

    const exported = exportPortableConfig(localStorage, true);

    expect(Object.keys(exported.values).sort()).toEqual([
      'mastodon_mock_server',
      'mockingbird_cors_proxy',
      'mockingbird_shortener',
    ]);
  });

  it('runs a second leak check against credentials currently in storage', () => {
    localStorage.setItem('mastodon_mock_token', 'secret-value-123');
    localStorage.setItem(
      'mockingbird_openrouter_prompts',
      JSON.stringify({ search: 'accidentally secret-value-123' }),
    );

    expect(() => exportPortableConfig(localStorage, false)).toThrow(/stored credential/i);
  });

  it('rejects unknown keys and configs requiring a newer reader', () => {
    const base = {
      kind: PORTABLE_CONFIG_KIND,
      schemaVersion: 1,
      minimumReaderVersion: 1,
      exportedAt: '2026-08-02T00:00:00.000Z',
      privacy: 'standard',
      values: { mockingbird_unknown: 'surprise' },
    };
    expect(() => parsePortableConfig(JSON.stringify(base))).toThrow(/unsafe key/i);
    expect(() =>
      parsePortableConfig(JSON.stringify({ ...base, values: {}, minimumReaderVersion: 2 })),
    ).toThrow(/newer version/i);
  });

  it('previews and replaces every key covered by the imported profile', () => {
    localStorage.setItem('mockingbird_client_prefs', 'old');
    localStorage.setItem('mockingbird_feature_flags', 'remove-me');
    localStorage.setItem('mastodon_mock_server', 'keep-private.example');
    const config = parsePortableConfig(
      JSON.stringify({
        kind: PORTABLE_CONFIG_KIND,
        schemaVersion: 1,
        minimumReaderVersion: 1,
        exportedAt: '2026-08-02T00:00:00.000Z',
        privacy: 'standard',
        values: { mockingbird_client_prefs: 'new' },
      }),
    );

    expect(configChanges(config, localStorage)).toEqual(
      expect.arrayContaining([
        { key: 'mockingbird_client_prefs', action: 'change' },
        { key: 'mockingbird_feature_flags', action: 'remove' },
      ]),
    );
    importPortableConfig(config, localStorage);

    expect(localStorage.getItem('mockingbird_client_prefs')).toBe('new');
    expect(localStorage.getItem('mockingbird_feature_flags')).toBeNull();
    expect(localStorage.getItem('mastodon_mock_server')).toBe('keep-private.example');
  });
});
