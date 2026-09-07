import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CorsProxySettings } from './cors-proxy-settings';
import {
  availableCorsProxies,
  corsProxyEntry,
  headerCapableCorsProxies,
  isDevelopmentOrigin,
} from './cors-proxy-catalog';
import { enableProxyFlags } from '../../testing/enable-proxy-flags';
import { FEATURE_FLAGS, FeatureFlags, proxyFeatureFlag } from '../../feature-flags';
import { SupporterStatus } from '../account/supporter-status';

describe('CorsProxySettings', () => {
  let settings: CorsProxySettings;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    // These specs use a third-party proxy as the vehicle for testing proxy
    // mechanics; those vendors ship flagged off. See enable-proxy-flags.ts.
    enableProxyFlags();
    settings = TestBed.inject(CorsProxySettings);
  });

  it('starts with nothing configured, so feeds are fetched directly', () => {
    expect(settings.currentId()).toBeNull();
    expect(settings.usable()).toBe(false);
    expect(settings.resolve()).toBeNull();
  });

  it('resolves a keyless proxy as soon as it is chosen', () => {
    settings.select('allorigins');
    const config = settings.resolve();
    expect(config?.entry.id).toBe('allorigins');
    expect(config?.header).toBeNull();
    expect(settings.usable()).toBe(true);
  });

  it('refuses to resolve a key-requiring proxy that has no key', () => {
    settings.select('corssh');
    // Unusable rather than half-configured: a request built from this would
    // just be rejected by the proxy, and the failure would look like the feed's.
    expect(settings.resolve()).toBeNull();
    expect(settings.usable()).toBe(false);

    settings.setKey('a-key');
    expect(settings.resolve()?.header).toEqual({ name: 'x-cors-api-key', value: 'a-key' });
  });

  it('stores the key separately from the choice, and never in the config blob', () => {
    settings.select('corssh');
    settings.setKey('super-secret');

    expect(localStorage.getItem('mockingbird_cors_proxy')).not.toContain('super-secret');
    expect(localStorage.getItem('mockingbird_cors_proxy_key')).toContain('super-secret');
  });

  it('stamps the key so the retention policy can expire it', () => {
    settings.select('corssh');
    settings.setKey('k');
    const stored = JSON.parse(localStorage.getItem('mockingbird_cors_proxy_key')!);
    expect(typeof stored.connectedAt).toBe('number');
    expect(settings.expiresAt()).toBeTypeOf('number');
  });

  it('drops a key that has outlived the policy', () => {
    settings.select('corssh');
    settings.setKey('k');
    // Backdate well past the default 90-day window.
    const stored = JSON.parse(localStorage.getItem('mockingbird_cors_proxy_key')!);
    stored.connectedAt = Date.now() - 400 * 24 * 60 * 60 * 1000;
    localStorage.setItem('mockingbird_cors_proxy_key', JSON.stringify(stored));

    // Re-resolved through the injector rather than `new`: the service injects
    // FeatureFlags, and `inject()` needs an injection context to run in.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(CorsProxySettings);
    expect(fresh.hasKey()).toBe(false);
    // The choice survives: the user re-pastes a key, they don't reconfigure.
    expect(fresh.currentId()).toBe('corssh');
  });

  it('clears the key when handed an empty one', () => {
    settings.select('corssh');
    settings.setKey('k');
    settings.setKey('   ');
    expect(settings.hasKey()).toBe(false);
  });

  it('requires {url} in a custom template before it will resolve', () => {
    settings.select('custom', { template: 'https://my-worker.example.com/fetch' });
    expect(settings.resolve()).toBeNull();

    settings.select('custom', { template: 'https://my-worker.example.com/?url={url}' });
    expect(settings.resolve()?.pattern).toContain('{url}');
  });

  it('carries a custom header name alongside the key', () => {
    settings.select('custom', { template: 'https://mine.example.com/?url={url}' });
    settings.setKey('mykey', 'x-my-auth');
    expect(settings.resolve()?.header).toEqual({ name: 'x-my-auth', value: 'mykey' });
  });

  it('forgets everything, key included, when cleared', () => {
    settings.select('corssh');
    settings.setKey('k');
    settings.clear();

    expect(settings.currentId()).toBeNull();
    expect(settings.hasKey()).toBe(false);
    expect(localStorage.getItem('mockingbird_cors_proxy_key')).toBeNull();
  });

  it('ignores a stored id the app no longer ships', () => {
    localStorage.setItem('mockingbird_cors_proxy', JSON.stringify({ id: 'defunct-proxy' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(CorsProxySettings).currentId()).toBeNull();
  });

  it('survives a corrupt config blob', () => {
    localStorage.setItem('mockingbird_cors_proxy', 'not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(CorsProxySettings).currentId()).toBeNull();
  });

  // corsproxy-io, not corsfix: Corsfix stopped being localhost-only once
  // testing showed its free tier is allowlist-based and works from a registered
  // production domain. corsproxy-io is now the genuinely dev-only entry.
  it('drops a localhost-only proxy when the app is deployed', () => {
    settings.select('corsproxy-io');
    expect(settings.dropUnavailableSelection('mockingbird.example.com')).toBe(true);
    expect(settings.currentId()).toBeNull();
  });

  it('keeps a localhost-only proxy while running locally', () => {
    settings.select('corsproxy-io');
    expect(settings.dropUnavailableSelection('localhost')).toBe(false);
    expect(settings.currentId()).toBe('corsproxy-io');
  });

  it('keeps Corsfix selected on a deployed origin', () => {
    // The regression this guards: Corsfix was `devOnly`, so a user who picked it
    // under `ng serve` had the selection silently cleared in production.
    settings.select('corsfix');
    expect(settings.dropUnavailableSelection('mockingbird.example.com')).toBe(false);
    expect(settings.currentId()).toBe('corsfix');
  });
});

/**
 * Every third-party proxy ships flagged off, so `availableCorsProxies` hides
 * them unless told otherwise. These tests are about the *other* filter — the
 * devOnly/localhost rule — so they pass an all-on predicate to isolate it.
 * `flagsOff` below covers the flag filter itself.
 */
const allFlagsOn = () => true;

describe('the supporter tier upgrade', () => {
  let settings: CorsProxySettings;
  let status: SupporterStatus;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    enableProxyFlags();
    settings = TestBed.inject(CorsProxySettings);
    status = TestBed.inject(SupporterStatus);
    // The Plus proxy ships `test`, so it is off in a jsdom run (base href `/`).
    // Lifted explicitly here rather than in `enableProxyFlags`, which is about
    // third-party vendors — and leaving it out of that helper keeps every other
    // spec running against the shipped default.
    TestBed.inject(FeatureFlags).setState('proxy-mawkingbird-plus', 'production');
    settings.select('mawkingbird');
  });

  it('leaves a non-supporter on the free proxy', () => {
    expect(settings.chosen()?.id).toBe('mawkingbird');
  });

  it('offers the supporter tier as soon as entitlement is known', () => {
    status.isSupporter.set(true);

    // No second visit to Settings, no picker, no Save. Somebody who paid for a
    // higher rate limit should not have to go and configure one.
    expect(settings.chosen()?.id).toBe('mawkingbird-plus');
  });

  it('drops back to free when a subscription lapses', () => {
    status.isSupporter.set(true);
    status.isSupporter.set(false);

    // The reason the upgrade is never written to storage: a lapsed subscriber
    // must degrade to the free tier by themselves, not stay pinned to a paid
    // entry they can no longer use.
    expect(settings.chosen()?.id).toBe('mawkingbird');
    expect(settings.currentId()).toBe('mawkingbird');
  });

  it('does not touch the stored selection', () => {
    status.isSupporter.set(true);

    // What the user picked stays what the user picked. Entitlement is a fact
    // about the account, layered on at read time.
    expect(settings.currentId()).toBe('mawkingbird');
  });

  it('leaves a deliberately chosen third-party proxy alone', () => {
    settings.select('allorigins');
    status.isSupporter.set(true);

    // Only ever promotes the free Mawkingbird proxy to its own paid tier.
    // Someone who picked another vendor chose it for a reason.
    expect(settings.chosen()?.id).toBe('allorigins');
  });

  it('stays on free when the Plus proxy flag is off', () => {
    const flags = TestBed.inject(FeatureFlags);
    flags.setState('proxy-mawkingbird-plus', 'off');
    status.isSupporter.set(true);

    expect(settings.chosen()?.id).toBe('mawkingbird');
  });
});

describe('adopting the proxy a subscriber is entitled to', () => {
  let settings: CorsProxySettings;
  let status: SupporterStatus;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    enableProxyFlags();
    settings = TestBed.inject(CorsProxySettings);
    status = TestBed.inject(SupporterStatus);
    TestBed.inject(FeatureFlags).setState('proxy-mawkingbird-plus', 'production');
  });

  it('reports the gap for a subscriber who never chose a proxy', () => {
    // The default, and the common case: someone subscribes and the thing they
    // paid for sits unused because the picker was never opened.
    status.isSupporter.set(true);

    expect(settings.currentId()).toBeNull();
    expect(settings.missingEntitledProxy()).toBe(true);
  });

  it('reports the gap for a custom proxy with no template', () => {
    // Selected `custom`, never filled in the URL. Resolves to null, so no
    // request can be built — indistinguishable from having no proxy.
    settings.select('custom', { template: '' });
    status.isSupporter.set(true);

    expect(settings.missingEntitledProxy()).toBe(true);
  });

  it('reports the gap for a legacy proxy whose flag was turned off', () => {
    settings.select('allorigins');
    status.isSupporter.set(true);
    TestBed.inject(FeatureFlags).setState('proxy-allorigins', 'off');

    expect(settings.missingEntitledProxy()).toBe(true);
  });

  it('reports no gap for a working deliberate choice', () => {
    // Funding the project and not wanting to route traffic through it are
    // compatible positions, so a proxy that works is never overridden.
    settings.select('allorigins');
    status.isSupporter.set(true);

    expect(settings.missingEntitledProxy()).toBe(false);
  });

  it('reports no gap for someone who is not entitled', () => {
    expect(settings.missingEntitledProxy()).toBe(false);
  });

  it('switches a subscriber onto the proxy they are paying for', () => {
    status.isSupporter.set(true);

    settings.adoptSupporterProxy();

    // Stored as the free entry and promoted on read, so a lapse degrades by
    // itself rather than stranding them on a paid entry.
    expect(settings.currentId()).toBe('mawkingbird');
    expect(settings.chosen()?.id).toBe('mawkingbird-plus');
    expect(settings.missingEntitledProxy()).toBe(false);
  });

  it('does nothing for an account with no entitlement', () => {
    settings.adoptSupporterProxy();

    expect(settings.currentId()).toBeNull();
  });

  it('does nothing when the Plus proxy flag is off', () => {
    TestBed.inject(FeatureFlags).setState('proxy-mawkingbird-plus', 'off');
    status.isSupporter.set(true);

    settings.adoptSupporterProxy();

    expect(settings.currentId()).toBeNull();
  });
});

describe('availableCorsProxies', () => {
  it('hides localhost-only proxies on a deployed origin', () => {
    const ids = availableCorsProxies('mockingbird.example.com', allFlagsOn).map(
      (entry) => entry.id,
    );
    expect(ids).toContain('allorigins');
    expect(ids).toContain('custom');
    expect(ids).not.toContain('corsproxy-io');
  });

  it('offers Corsfix in production, because its free tier is allowlisted not localhost-only', () => {
    // It used to be marked devOnly and hidden here. That was wrong: localhost is
    // merely allowed *implicitly*, and a registered domain works from anywhere.
    // Hiding it in production hid the fastest free option there is.
    const ids = availableCorsProxies('mockingbird.example.com', allFlagsOn).map(
      (entry) => entry.id,
    );
    expect(ids).toContain('corsfix');
  });

  it('offers everything under ng serve', () => {
    const ids = availableCorsProxies('localhost', allFlagsOn).map((entry) => entry.id);
    expect(ids).toContain('corsfix');
    expect(ids).toContain('corsproxy-io');
  });

  it.each(['localhost', '127.0.0.1', 'app.localhost'])('treats %s as development', (host) => {
    expect(isDevelopmentOrigin(host)).toBe(true);
  });

  it('does not treat a deployed host as development', () => {
    expect(isDevelopmentOrigin('mockingbird.example.com')).toBe(false);
  });
});

describe('headerCapableCorsProxies', () => {
  // The distinction these tests protect is invisible in ordinary RSS use and
  // only bites when an API key must ride along. Measurements behind the values:
  // sprint/twitter-1-transport.md.
  it('excludes a proxy measured to strip custom headers', () => {
    const ids = headerCapableCorsProxies('mockingbird.example.com', allFlagsOn).map(
      (entry) => entry.id,
    );
    // AllOrigins fetches public feeds fine but drops X-API-Key, so the target
    // answers "no key supplied" and the user blames their own key.
    expect(ids).not.toContain('allorigins');
  });

  it('keeps the proxies verified to forward them', () => {
    const ids = headerCapableCorsProxies('mockingbird.example.com', allFlagsOn).map(
      (entry) => entry.id,
    );
    expect(ids).toContain('corssh');
    expect(ids).toContain('corsfix');
  });

  it('keeps unproven proxies rather than guessing they fail', () => {
    // `custom` is whatever the user deployed. Excluding it would remove the one
    // option nobody can rate-limit, on a guess.
    const ids = headerCapableCorsProxies('mockingbird.example.com', allFlagsOn).map(
      (entry) => entry.id,
    );
    expect(ids).toContain('custom');
    expect(corsProxyEntry('custom')!.forwardsCustomHeaders).toBeUndefined();
  });

  it('still honours the development-origin filter', () => {
    const ids = headerCapableCorsProxies('mockingbird.example.com', allFlagsOn).map(
      (entry) => entry.id,
    );
    expect(ids).not.toContain('corsproxy-io');
  });
});

describe('catalog facts measured against live proxies', () => {
  it('records that AllOrigins cannot carry a key', () => {
    expect(corsProxyEntry('allorigins')!.forwardsCustomHeaders).toBe(false);
  });

  it('offers cors.lol without claiming to know whether it forwards headers', () => {
    // It 429'd before a header-carrying request ever landed, so `undefined` is
    // the honest value — the Test button is what settles it. Re-added after
    // being struck off, because a day of blanket 429s is an exhausted shared
    // quota rather than a permanent property of the service.
    const corslol = corsProxyEntry('corslol')!;
    expect(corslol.forwardsCustomHeaders).toBeUndefined();
    expect(corslol.keyRequired).toBeUndefined();
    expect(availableCorsProxies('mockingbird.example.com', allFlagsOn).map((e) => e.id)).toContain(
      'corslol',
    );
  });

  it('records Corsfix as allowlist-based rather than localhost-only', () => {
    const corsfix = corsProxyEntry('corsfix')!;
    expect(corsfix.devOnly).toBeUndefined();
    expect(corsfix.forwardsCustomHeaders).toBe(true);
    // The 403 it returns for an unregistered origin is a setup step, and the UI
    // needs somewhere to send the user.
    expect(corsfix.originAllowlist?.dashboardUrl).toBeTruthy();
  });
});

describe('proxy feature flags', () => {
  /**
   * The four public proxies ship off. Between them they strip API keys, rate-limit
   * on the first request, require domain registration, or take 26s — each a
   * different way for setup to look broken. What is left is the Mawkingbird proxy
   * and a proxy the user runs themselves.
   */
  it('offers only the first-party and bring-your-own proxies by default', () => {
    const ids = availableCorsProxies(
      'mockingbird.example.com',
      (flagId) =>
        // Stand in for FeatureFlags at its shipped defaults.
        FEATURE_FLAGS.find((flag) => flag.id === flagId)?.defaultState === 'production',
    ).map((entry) => entry.id);

    expect(ids).toEqual(['mawkingbird', 'custom']);
  });

  it('ships all four third-party proxies off', () => {
    for (const id of ['proxy-allorigins', 'proxy-corssh', 'proxy-corsfix', 'proxy-corslol']) {
      const flag = FEATURE_FLAGS.find((f) => f.id === id);
      expect(flag, id).toBeDefined();
      expect(flag!.defaultState, id).toBe('off');
    }
  });

  // The first-party entries must never acquire a flag by accident: the
  // Mawkingbird proxy is the default this app stands behind, and `custom` is a
  // URL the user typed, which is not ours to switch off.
  it('leaves the first-party and custom proxies unflagged', () => {
    expect(proxyFeatureFlag('mawkingbird')).toBeNull();
    expect(proxyFeatureFlag('custom')).toBeNull();
  });

  /**
   * The important half: turning a flag off must also stop a proxy that was
   * already selected. Enforced on `chosen()`, which every consumer reads through,
   * so `resolve()` and every proxied request in the app inherit it.
   */
  it('stops using a proxy that was selected before its flag was turned off', () => {
    const flags = TestBed.inject(FeatureFlags);
    flags.setState('proxy-allorigins', 'production');
    const settings = TestBed.inject(CorsProxySettings);
    settings.select('allorigins');
    expect(settings.resolve()).not.toBeNull();

    flags.setState('proxy-allorigins', 'off');

    expect(settings.chosen()).toBeNull();
    expect(settings.resolve()).toBeNull();
    expect(settings.usable()).toBe(false);
  });
});
