import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TwitterSettings } from './twitter-settings';
import { availableTwitterSources, twitterApiHosts, twitterSourceEntry } from './twitter-source';

/**
 * A fresh instance reading whatever localStorage now holds.
 *
 * Through the injector rather than `new TwitterSettings()`: the service injects
 * `VaultBridge`, and constructing it outside an injection context throws
 * NG0203. Resetting the module is what makes it re-read storage.
 */
function newSettings(): TwitterSettings {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(TwitterSettings);
}

describe('TwitterSettings', () => {
  let settings: TwitterSettings;

  beforeEach(() => {
    localStorage.clear();
    settings = newSettings();
  });

  it('is unusable until both a source and a key are present', () => {
    expect(settings.usable()).toBe(false);
    settings.activate('twitterapi-io');
    // A source with no key must not resolve: firing a request that can only 401
    // would still be billed.
    expect(settings.usable()).toBe(false);
    expect(settings.blockedReason()).toMatch(/API key/i);

    settings.setKey('twitterapi-io', 'secret');
    expect(settings.usable()).toBe(true);
    expect(settings.blockedReason()).toBeNull();
  });

  it('builds the auth header the source documents', () => {
    settings.activate('twitterapi-io');
    settings.setKey('twitterapi-io', 'abc123');
    expect(settings.resolve()?.auth).toEqual({ header: 'X-API-Key', value: 'abc123' });
  });

  it('applies a prefix for a Bearer-style source', () => {
    settings.activate('getxapi');
    settings.setKey('getxapi', 'abc123');
    expect(settings.resolve()?.auth).toEqual({
      header: 'Authorization',
      value: 'Bearer abc123',
    });
  });

  it('keeps keys per source so switching back is cheap', () => {
    settings.setKey('twitterapi-io', 'one');
    settings.setKey('getxapi', 'two');
    settings.activate('getxapi');
    expect(settings.resolve()?.auth.value).toBe('Bearer two');
    settings.activate('twitterapi-io');
    expect(settings.resolve()?.auth.value).toBe('one');
  });

  it('treats an empty key as a removal', () => {
    settings.activate('twitterapi-io');
    settings.setKey('twitterapi-io', 'secret');
    settings.setKey('twitterapi-io', '   ');
    expect(settings.hasKey('twitterapi-io')).toBe(false);
    // Clearing the active source's key must also deactivate it, or the app
    // claims a connection it cannot use.
    expect(settings.activeId()).toBeNull();
  });

  it('persists across instances', () => {
    settings.activate('twitterapi-io');
    settings.setKey('twitterapi-io', 'secret');
    const reloaded = newSettings();
    expect(reloaded.activeId()).toBe('twitterapi-io');
    expect(reloaded.resolve()?.auth.value).toBe('secret');
  });

  it('survives a corrupt config blob', () => {
    localStorage.setItem('mockingbird_twitter', 'not json');
    expect(newSettings().activeId()).toBeNull();
  });

  it('survives a corrupt key blob', () => {
    localStorage.setItem('mockingbird_twitter_keys', '{{{');
    expect(newSettings().hasKey('twitterapi-io')).toBe(false);
  });

  it('discards a source id it no longer ships', () => {
    localStorage.setItem('mockingbird_twitter', JSON.stringify({ active: 'defunct-service' }));
    expect(newSettings().activeId()).toBeNull();
  });

  it('never exposes the key through a public accessor', () => {
    settings.setKey('twitterapi-io', 'secret');
    // hasKey answers the UI's question without handing the secret to a template.
    expect(settings.hasKey('twitterapi-io')).toBe(true);
    expect(JSON.stringify(settings.configured())).not.toContain('secret');
  });
});

describe('direct reachability verdict', () => {
  let settings: TwitterSettings;

  beforeEach(() => {
    localStorage.clear();
    settings = newSettings();
  });

  it('starts untested and records what the probe observed', () => {
    expect(settings.directReachability('twitterapi-io')).toBe('untested');
    settings.recordDirectReachability('twitterapi-io', 'blocked');
    expect(settings.directReachability('twitterapi-io')).toBe('blocked');
  });

  it('outlives a key rotation, being a fact about the service not the key', () => {
    settings.activate('twitterapi-io');
    settings.setKey('twitterapi-io', 'one');
    settings.recordDirectReachability('twitterapi-io', 'blocked');
    settings.setKey('twitterapi-io', 'two');
    expect(settings.directReachability('twitterapi-io')).toBe('blocked');
  });

  it('is cleared by forget, so reconnecting re-tests', () => {
    settings.recordDirectReachability('twitterapi-io', 'blocked');
    settings.forget('twitterapi-io');
    expect(settings.directReachability('twitterapi-io')).toBe('untested');
  });

  it('persists across instances', () => {
    settings.recordDirectReachability('twitterapi-io', 'blocked');
    expect(newSettings().directReachability('twitterapi-io')).toBe('blocked');
  });
});

describe('twitter source catalog', () => {
  it('offers only sources with a working adapter', () => {
    const ids = availableTwitterSources().map((entry) => entry.id);
    expect(ids).toContain('twitterapi-io');
    // GetXAPI is catalogued but has no adapter yet; offering it would be
    // offering a choice that cannot work.
    expect(ids).not.toContain('getxapi');
  });

  it('exposes every API host for the credential-host guard', () => {
    // These hosts must be refused by the ordinary proxy path — their keys spend
    // money. If a host is added here it must also reach CREDENTIAL_HOSTS.
    expect(twitterApiHosts()).toEqual(
      expect.arrayContaining(['api.twitterapi.io', 'api.getxapi.com']),
    );
  });

  it('records the auth header that forces the preflight', () => {
    // The reason direct browser access is impossible. If this ever changes, the
    // transport's proxy-first assumption needs revisiting.
    expect(twitterSourceEntry('twitterapi-io')?.authHeader).toBe('X-API-Key');
  });
});
