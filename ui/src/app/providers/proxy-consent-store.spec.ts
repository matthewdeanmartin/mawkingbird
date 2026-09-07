import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProxyConsent } from './proxy-consent-store';
import { ShortenerProxyConsent } from './shortener/proxy-consent';

describe('ProxyConsent', () => {
  let consent: ProxyConsent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [] });
    consent = TestBed.inject(ProxyConsent);
  });

  it('scopes a grant to both the connector and the proxy', () => {
    consent.grant('twitterapi-io', 'corssh');
    expect(consent.granted('twitterapi-io', 'corssh')).toBe(true);
    // A different proxy means a different company sees the key.
    expect(consent.granted('twitterapi-io', 'allorigins')).toBe(false);
    // A different connector means a different key with different powers.
    expect(consent.granted('dub', 'corssh')).toBe(false);
  });

  it('revokes one pairing without touching the others', () => {
    consent.grant('twitterapi-io', 'corssh');
    consent.grant('dub', 'corssh');
    consent.revoke('twitterapi-io', 'corssh');
    expect(consent.granted('twitterapi-io', 'corssh')).toBe(false);
    expect(consent.granted('dub', 'corssh')).toBe(true);
  });

  it('persists across instances', () => {
    consent.grant('twitterapi-io', 'corssh');
    expect(TestBed.inject(ProxyConsent).granted('twitterapi-io', 'corssh')).toBe(true);
  });

  it('lists a connector own grants', () => {
    consent.grant('twitterapi-io', 'corssh');
    consent.grant('dub', 'corsfix');
    expect(consent.forSubject('twitterapi-io')).toHaveLength(1);
    expect(consent.forSubject('twitterapi-io')[0].proxy).toBe('corssh');
  });
});

describe('migration from the shortener-only store', () => {
  beforeEach(() => localStorage.clear());

  it('honours grants written before the generalization', () => {
    // Users must not be re-asked for consent because a type widened.
    localStorage.setItem(
      'mockingbird_shortener_proxy_consent',
      JSON.stringify({ 'dub:corssh': { shortener: 'dub', proxy: 'corssh', grantedAt: 111 } }),
    );
    TestBed.configureTestingModule({ providers: [] });
    const consent = TestBed.inject(ProxyConsent);
    expect(consent.granted('dub', 'corssh')).toBe(true);
    expect(consent.record('dub', 'corssh')?.grantedAt).toBe(111);
  });

  it('does not resurrect a legacy grant after it is revoked', () => {
    // The bug this guards: revoking writes the new key, and if the legacy key
    // survived, the next load would merge the grant straight back in.
    localStorage.setItem(
      'mockingbird_shortener_proxy_consent',
      JSON.stringify({ 'dub:corssh': { shortener: 'dub', proxy: 'corssh', grantedAt: 111 } }),
    );
    TestBed.configureTestingModule({ providers: [] });
    TestBed.inject(ProxyConsent).revoke('dub', 'corssh');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [] });
    expect(TestBed.inject(ProxyConsent).granted('dub', 'corssh')).toBe(false);
  });

  it('ignores a malformed legacy blob', () => {
    localStorage.setItem('mockingbird_shortener_proxy_consent', 'not json');
    TestBed.configureTestingModule({ providers: [] });
    expect(TestBed.inject(ProxyConsent).all()).toEqual([]);
  });
});

describe('ShortenerProxyConsent facade', () => {
  let shortener: ShortenerProxyConsent;
  let store: ProxyConsent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [] });
    shortener = TestBed.inject(ShortenerProxyConsent);
    store = TestBed.inject(ProxyConsent);
  });

  it('shares one store with the generalized service', () => {
    shortener.grant('dub', 'corssh');
    expect(store.granted('dub', 'corssh')).toBe(true);
  });

  it('lists only shortener grants', () => {
    shortener.grant('dub', 'corssh');
    store.grant('twitterapi-io', 'corssh');
    expect(shortener.all().map((r) => r.subject)).toEqual(['dub']);
  });

  it('revokeAll leaves the Twitter data consent alone', () => {
    // Disconnecting the link shortener says nothing about the user's X
    // connection, and silently revoking it would be a surprise.
    shortener.grant('dub', 'corssh');
    store.grant('twitterapi-io', 'corssh');
    shortener.revokeAll();
    expect(store.granted('twitterapi-io', 'corssh')).toBe(true);
    expect(store.granted('dub', 'corssh')).toBe(false);
  });
});
