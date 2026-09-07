import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShortenerSettings } from './shortener-settings';
import { VAULT_TEST_ROLLOUT } from '../vault/vault-preference';

describe('ShortenerSettings', () => {
  let settings: ShortenerSettings;

  /**
   * A fresh instance reading whatever localStorage now holds.
   *
   * Through the injector rather than `new ShortenerSettings()`: the service
   * injects `VaultBridge`, and constructing it outside an injection context
   * throws NG0203. Resetting the module is what makes it re-read storage.
   */
  function rebuild(): ShortenerSettings {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: VAULT_TEST_ROLLOUT, useValue: true }],
    });
    return TestBed.inject(ShortenerSettings);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: VAULT_TEST_ROLLOUT, useValue: true }],
    });
    settings = TestBed.inject(ShortenerSettings);
  });

  it('starts with nothing configured', () => {
    expect(settings.activeId()).toBeNull();
    expect(settings.usable()).toBe(false);
    expect(settings.resolve()).toBeNull();
  });

  it('resolves a provider once it has a key, applying the auth prefix', () => {
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');

    // Dub wants `Bearer `; the prefix comes from the catalog, not the caller.
    expect(settings.resolve()?.auth).toEqual({
      header: 'Authorization',
      value: 'Bearer dub-token',
    });
    expect(settings.usable()).toBe(true);
  });

  it('sends the Short.io key with no Bearer prefix', () => {
    settings.setKey('shortio', 'sk_live_123');
    settings.setDomain('shortio', 'go.example.com');
    settings.activate('shortio');

    // The single most common way to get Short.io wrong.
    expect(settings.resolve()?.auth).toEqual({ header: 'Authorization', value: 'sk_live_123' });
  });

  it('refuses to resolve Short.io without a short domain', () => {
    settings.setKey('shortio', 'sk_live_123');
    settings.activate('shortio');

    // A key alone is not a working Short.io configuration: its create endpoint
    // rejects a request with no domain, and failing here produces a message
    // about setup instead of a confusing provider validation error.
    expect(settings.resolve()).toBeNull();
    expect(settings.blockedReason()).toContain('short domain');

    settings.setDomain('shortio', 'go.example.com');
    expect(settings.resolve()?.domain).toBe('go.example.com');
  });

  it('keeps a key per provider so switching back is cheap', () => {
    settings.setKey('dub', 'dub-token');
    settings.setKey('tly', 'tly-token');
    settings.activate('tly');

    expect(settings.hasKey('dub')).toBe(true);
    expect(settings.resolve()?.auth?.value).toBe('Bearer tly-token');

    settings.activate('dub');
    expect(settings.resolve()?.auth).toEqual({
      header: 'Authorization',
      value: 'Bearer dub-token',
    });
  });

  it('stores keys separately from the choice, and never in the config blob', () => {
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');

    const config = localStorage.getItem('mockingbird_shortener') ?? '';
    expect(config).toContain('dub');
    // The exportable half must never carry the secret.
    expect(config).not.toContain('dub-token');
    expect(localStorage.getItem('mockingbird_shortener_keys')).toContain('dub-token');
  });

  it('deactivates when the active provider loses its key', () => {
    settings.setKey('dub', 'dub-token');
    settings.activate('dub');

    settings.clearKey('dub');

    // Leaving it "active" would mean a shortener selected with no way to use it.
    expect(settings.activeId()).toBeNull();
    expect(settings.usable()).toBe(false);
  });

  it('treats an empty key as a request to clear the stored one', () => {
    settings.setKey('dub', 'dub-token');
    settings.setKey('dub', '   ');

    expect(settings.hasKey('dub')).toBe(false);
  });

  it('forgets a provider entirely, including its domain', () => {
    settings.setKey('shortio', 'sk_live_123');
    settings.setDomain('shortio', 'go.example.com');
    settings.activate('shortio');

    settings.forget('shortio');

    expect(settings.hasKey('shortio')).toBe(false);
    expect(settings.domain('shortio')).toBe('');
    expect(settings.activeId()).toBeNull();
  });

  it('discards a stored provider id it no longer ships', () => {
    localStorage.setItem('mockingbird_shortener', JSON.stringify({ active: 'bitly' }));

    const reloaded = rebuild();

    // A dangling selection would render as a provider that cannot be configured.
    expect(reloaded.activeId()).toBeNull();
  });

  it('survives a corrupt key blob rather than throwing on construction', () => {
    localStorage.setItem('mockingbird_shortener_keys', '{not json');

    const reloaded = rebuild();

    expect(reloaded.hasKey('dub')).toBe(false);
  });

  it('locks rather than drops a key that has outlived the retention policy', () => {
    const longAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'mockingbird_shortener_keys',
      JSON.stringify({ dub: { key: 'stale', connectedAt: longAgo } }),
    );
    localStorage.setItem('mockingbird_shortener', JSON.stringify({ active: 'dub' }));

    const reloaded = rebuild();

    // The default policy is 90 days, and the plaintext still leaves this browser
    // on read. What changed with the vault is what that *means*: these keys are
    // vaulted, so the provider stays active and `needsFetch` marks it as locked.
    // Deactivating here would tell the user to reconnect something the next
    // resolve() would have pulled back out of the vault on its own.
    expect(reloaded.hasKey('dub')).toBe(false);
    expect(reloaded.activeId()).toBe('dub');
    expect(reloaded.needsFetch()).toEqual(['dub']);
  });
});
