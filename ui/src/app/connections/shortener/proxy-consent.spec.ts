import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShortenerProxyConsent } from './proxy-consent';

describe('ShortenerProxyConsent', () => {
  let consent: ShortenerProxyConsent;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    consent = TestBed.inject(ShortenerProxyConsent);
  });

  it('grants nothing by default', () => {
    expect(consent.granted('dub', 'allorigins')).toBe(false);
  });

  it('records a grant for exactly one shortener-and-proxy pair', () => {
    consent.grant('dub', 'allorigins');

    expect(consent.granted('dub', 'allorigins')).toBe(true);
    // A different proxy is a different company seeing the key.
    expect(consent.granted('dub', 'corssh')).toBe(false);
    // A different shortener is a different key with different powers.
    expect(consent.granted('tly', 'allorigins')).toBe(false);
  });

  it('withdraws a single consent without touching the others', () => {
    consent.grant('dub', 'allorigins');
    consent.grant('tly', 'allorigins');

    consent.revoke('dub', 'allorigins');

    expect(consent.granted('dub', 'allorigins')).toBe(false);
    expect(consent.granted('tly', 'allorigins')).toBe(true);
  });

  it('withdraws every consent for one shortener when it is disconnected', () => {
    consent.grant('dub', 'allorigins');
    consent.grant('dub', 'corssh');
    consent.grant('tly', 'allorigins');

    consent.revokeAll('dub');

    expect(consent.granted('dub', 'allorigins')).toBe(false);
    expect(consent.granted('dub', 'corssh')).toBe(false);
    expect(consent.granted('tly', 'allorigins')).toBe(true);
  });

  // A reload is simulated by resetting the injector rather than by calling the
  // constructor: this service now delegates to the shared ProxyConsent store via
  // `inject()`, so a hand-built instance has no store to read from.
  function reload(): ShortenerProxyConsent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(ShortenerProxyConsent);
  }

  it('persists across a reload, so the user is not re-asked every request', () => {
    consent.grant('dub', 'allorigins');

    expect(reload().granted('dub', 'allorigins')).toBe(true);
  });

  it('treats a corrupt store as no consent rather than throwing', () => {
    localStorage.setItem('mockingbird_shortener_proxy_consent', 'not json');

    // Failing closed is the only safe direction here.
    expect(reload().granted('dub', 'allorigins')).toBe(false);
  });

  it('records when consent was given, for the connector page to show', () => {
    const before = Date.now();
    consent.grant('dub', 'allorigins');

    const record = consent.record('dub', 'allorigins');
    expect(record?.grantedAt).toBeGreaterThanOrEqual(before);
  });
});
