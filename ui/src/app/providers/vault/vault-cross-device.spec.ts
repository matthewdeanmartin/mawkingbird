import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '../../feature-flags';
import { ProfileAccountKey } from '../account/profile-account-key';
import { SupporterStatus } from '../account/supporter-status';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { GitHubSession } from '../github/github-session';
import { HugoSettings, type HugoRepo } from '../hugo/hugo-settings';
import { MataroaSettings } from '../mataroa/mataroa-settings';
import { OpenRouterSession } from '../openrouter/openrouter-session';
import { GistSettings } from '../paste/gist-settings';
import { RaindropSession } from '../raindrop/raindrop-session';
import { ShortenerSettings } from '../shortener/shortener-settings';
import { TwitterSettings } from '../twitter/twitter-settings';
import { VaultAdoption } from './vault-adoption';
import { VaultBridge } from './vault-bridge';

const ACCOUNT = 'mastodon:mastodon.social/mistersql';
const NOW = 1_786_000_000_000;

const HUGO_REPO: HugoRepo = {
  owner: 'alice',
  repo: 'notes',
  branch: 'main',
  contentPath: 'content/posts',
  siteUrl: 'https://alice.example/',
  includeInProfile: true,
};

describe('connection vault across devices', () => {
  let remote: Map<string, string>;
  let writes: Map<string, string>;
  let readThrough: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    remote = new Map<string, string>([
      ['mockingbird_openrouter_key', 'sk-or-desktop'],
      [
        'mockingbird_cors_proxy_key',
        JSON.stringify({
          v: 1,
          secret: { key: 'cors-desktop', customHeader: 'x-proxy-key', connectedAt: NOW },
          config: {
            id: 'custom',
            customTemplate: 'https://proxy.example/?url={url}',
            customEncodeTarget: true,
          },
        }),
      ],
      [
        'mockingbird_shortener_keys',
        JSON.stringify({ dub: { key: 'dub-desktop', connectedAt: NOW } }),
      ],
      ['mockingbird_raindrop_token', 'raindrop-desktop'],
      [
        'mockingbird_twitter_keys',
        JSON.stringify({ 'twitterapi-io': { key: 'twitter-desktop', connectedAt: NOW } }),
      ],
      [
        'mockingbird_mataroa_connection',
        JSON.stringify({
          apiKey: 'mataroa-desktop',
          blogUrl: 'https://alice.mataroa.blog/',
          includeInProfile: true,
          connectedAt: NOW,
        }),
      ],
      [
        'mockingbird_hugo_credentials',
        JSON.stringify({
          v: 1,
          credentials: { accessToken: 'hugo-desktop', connectedAt: NOW },
          repo: HUGO_REPO,
        }),
      ],
      [
        'mockingbird_github_credentials',
        JSON.stringify({
          accessToken: 'github-desktop',
          user: { login: 'alice', avatar_url: '', html_url: 'https://github.com/alice' },
        }),
      ],
      [
        'mockingbird_gist_credentials',
        JSON.stringify({
          accessToken: 'gist-desktop',
          connectedAt: NOW,
          profile: { login: 'alice' },
        }),
      ],
    ]);
    writes = new Map<string, string>();

    readThrough = vi.fn((base: string) => remote.get(base) ?? null);
    const bridge = {
      readThrough,
      writeThrough: vi.fn(async (base: string, value: string) => {
        writes.set(base, value);
        remote.set(base, value);
        return { kind: 'stored' as const, overwritten: [] };
      }),
      removeThrough: vi.fn(async () => ({ kind: 'stored' as const, overwritten: [] })),
      verdictFor: vi.fn(() => ({ kind: 'keep' as const })),
      syncs: vi.fn(() => true),
      get open() {
        return true;
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: VaultBridge, useValue: bridge },
        { provide: ProfileAccountKey, useValue: { current: () => ACCOUNT } },
        { provide: FeatureFlags, useValue: { enabled: () => true } },
        { provide: SupporterStatus, useValue: { isSupporter: () => false } },
      ],
    });
  });

  it('lets remote something fill an empty phone for every vaulted connector', async () => {
    const result = await TestBed.inject(VaultAdoption).reconcileExisting();

    expect(result.failed).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.restored).toEqual([
      'OpenRouter',
      'CORS proxy',
      'Link shorteners',
      'Raindrop',
      'Twitter',
      'Mataroa',
      'Hugo',
      'GitHub',
      'GitHub Gist',
    ]);

    expect(TestBed.inject(OpenRouterSession).apiKey()).toBe('sk-or-desktop');
    expect(TestBed.inject(CorsProxySettings).resolve()).toMatchObject({
      entry: { id: 'custom' },
      header: { name: 'x-proxy-key', value: 'cors-desktop' },
    });
    expect(TestBed.inject(ShortenerSettings).resolve()?.auth?.value).toBe('Bearer dub-desktop');
    expect(TestBed.inject(RaindropSession).accessToken()).toBe('raindrop-desktop');
    expect(TestBed.inject(TwitterSettings).resolve()?.auth.value).toBe('twitter-desktop');
    expect(TestBed.inject(MataroaSettings).resolve()?.apiKey).toBe('mataroa-desktop');
    expect(TestBed.inject(HugoSettings).connected()).toBe(true);
    expect(TestBed.inject(HugoSettings).slug()).toBe('alice/notes');
    expect(TestBed.inject(GitHubSession).connected()).toBe(true);
    expect(TestBed.inject(GitHubSession).user()?.login).toBe('alice');
    expect(TestBed.inject(GistSettings).connected()).toBe(true);
    expect(TestBed.inject(GistSettings).profile()?.login).toBe('alice');
    expect(readThrough).toHaveBeenCalledWith('mockingbird_hugo_credentials', ACCOUNT);

    // Legacy keyed maps are upgraded with the inferred single provider, so a
    // third empty device receives enough state to be usable too.
    expect(JSON.parse(writes.get('mockingbird_twitter_keys')!)).toMatchObject({
      v: 1,
      active: 'twitterapi-io',
    });
    expect(JSON.parse(writes.get('mockingbird_shortener_keys')!)).toMatchObject({
      v: 1,
      active: 'dub',
    });
  });

  it('lets a local Twitter connection fill an empty encrypted copy', async () => {
    remote.delete('mockingbird_twitter_keys');
    const twitter = TestBed.inject(TwitterSettings);
    twitter.setKey('twitterapi-io', 'phone-key');
    twitter.activate('twitterapi-io');
    // Simulate a vault that was still empty when reconciliation started; the
    // eager mirror from setKey is deliberately not what this test exercises.
    remote.delete('mockingbird_twitter_keys');
    writes.clear();

    await expect(twitter.reconcileVault()).resolves.toEqual({ kind: 'stored' });
    expect(JSON.parse(writes.get('mockingbird_twitter_keys')!)).toMatchObject({
      v: 1,
      active: 'twitterapi-io',
      keys: { 'twitterapi-io': { key: 'phone-key' } },
    });
  });

  it('does not choose between different non-empty keys for one provider', async () => {
    localStorage.setItem(
      'mockingbird_twitter_keys',
      JSON.stringify({ 'twitterapi-io': { key: 'phone-key', connectedAt: NOW + 1 } }),
    );
    localStorage.setItem('mockingbird_twitter', JSON.stringify({ active: 'twitterapi-io' }));
    const twitter = TestBed.inject(TwitterSettings);
    writes.clear();

    await expect(twitter.reconcileVault()).resolves.toMatchObject({ kind: 'conflict' });
    expect(twitter.resolve()?.auth.value).toBe('phone-key');
    expect(JSON.parse(remote.get('mockingbird_twitter_keys')!)).toMatchObject({
      'twitterapi-io': { key: 'twitter-desktop' },
    });
    expect(writes.has('mockingbird_twitter_keys')).toBe(false);
  });
});
