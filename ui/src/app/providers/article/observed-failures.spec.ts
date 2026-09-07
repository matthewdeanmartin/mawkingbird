import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evictLeastRecent,
  FAILURES_BEFORE_WARNING,
  HostMap,
  hostOf,
  isHostAttributable,
  ObservedFailures,
  OBSERVED_FAILURES_KEY_BASE,
  OBSERVED_HOSTS_MAX,
} from './observed-failures';

const url = (host: string, path = '/article') => `https://${host}${path}`;

describe('which verdicts say something about the host', () => {
  /**
   * The distinction the whole feature rests on. A paywall will still be a
   * paywall tomorrow; a timed-out request will not still be timed out.
   */
  it('counts facts about the publisher', () => {
    for (const verdict of [
      'paywall',
      'bot-check',
      'consent-wall',
      'needs-js',
      'blocked-destination',
      'site-rate-limited',
    ] as const) {
      expect(isHostAttributable(verdict)).toBe(true);
    }
  });

  it('does not count facts about us or about the moment', () => {
    for (const verdict of ['network', 'rate-limited', 'upstream-timeout'] as const) {
      expect(isHostAttributable(verdict)).toBe(false);
    }
  });

  /** One PDF does not make a domain unreadable. */
  it('does not count facts about one URL', () => {
    for (const verdict of ['junk', 'not-html', 'too-large', 'not-found'] as const) {
      expect(isHostAttributable(verdict)).toBe(false);
    }
  });
});

describe('reading a host out of a URL', () => {
  it('lower-cases it and ignores the path', () => {
    expect(hostOf('https://Example.COM/a/b?c=d')).toBe('example.com');
  });

  it('returns nothing for something that is not a URL', () => {
    expect(hostOf('not a url')).toBeNull();
  });
});

describe('the LRU bound', () => {
  /** A map of every host a reader ever touched is unbounded by construction. */
  it('never exceeds its cap, tested by overfilling it', () => {
    const map: HostMap = {};
    for (let i = 0; i < OBSERVED_HOSTS_MAX + 50; i++) {
      map[`host${i}.test`] = { attempts: 1, failures: 1, lastDiagnosis: 'paywall', lastSeen: i };
    }
    const kept = evictLeastRecent(map);

    expect(Object.keys(kept)).toHaveLength(OBSERVED_HOSTS_MAX);
    // The 50 least-recently-seen went.
    expect(kept['host0.test']).toBeUndefined();
    expect(kept[`host${OBSERVED_HOSTS_MAX + 49}.test`]).toBeDefined();
  });

  it('leaves a map under the cap alone', () => {
    const map: HostMap = {
      'a.test': { attempts: 1, failures: 1, lastDiagnosis: null, lastSeen: 1 },
    };
    expect(evictLeastRecent(map)).toBe(map);
  });
});

describe('ObservedFailures', () => {
  let store: ObservedFailures;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ObservedFailures);
  });

  afterEach(() => localStorage.clear());

  it('says nothing about a host it has never seen', () => {
    expect(store.warnFor(url('unknown.test'))).toBeNull();
  });

  /** Sites have bad days; a single refusal is as likely the moment as the site. */
  it('stays quiet until the failures add up', () => {
    for (let i = 1; i < FAILURES_BEFORE_WARNING; i++) {
      store.record(url('paywalled.test'), 'paywall');
      expect(store.warnFor(url('paywalled.test'))).toBeNull();
    }

    store.record(url('paywalled.test'), 'paywall');
    expect(store.warnFor(url('paywalled.test'))).toBe('paywall');
  });

  it('warns on any URL from a host it has learned about', () => {
    for (let i = 0; i < FAILURES_BEFORE_WARNING; i++) {
      store.record(url('paywalled.test', `/story-${i}`), 'paywall');
    }
    expect(store.warnFor(url('paywalled.test', '/a-different-story'))).toBe('paywall');
  });

  /**
   * The evidence is that it works. A reader who just read an article there must
   * not still be warned about it because of last month.
   */
  it('forgets a host entirely after one success', () => {
    for (let i = 0; i < FAILURES_BEFORE_WARNING; i++) {
      store.record(url('flaky.test'), 'paywall');
    }
    expect(store.warnFor(url('flaky.test'))).toBe('paywall');

    store.record(url('flaky.test'), 'ok');

    expect(store.warnFor(url('flaky.test'))).toBeNull();
    expect(store.get('flaky.test')).toBeUndefined();
  });

  it('treats a partial extraction as a success — the reader got prose', () => {
    for (let i = 0; i < FAILURES_BEFORE_WARNING; i++) {
      store.record(url('flaky.test'), 'paywall');
    }
    store.record(url('flaky.test'), 'partial');
    expect(store.get('flaky.test')).toBeUndefined();
  });

  /**
   * The correctness case: a network failure must never teach the reader that a
   * perfectly good site is hopeless.
   */
  it('never records a failure that was about us or the moment', () => {
    for (let i = 0; i < FAILURES_BEFORE_WARNING * 2; i++) {
      store.record(url('innocent.test'), 'network');
      store.record(url('innocent.test'), 'rate-limited');
    }

    expect(store.get('innocent.test')).toBeUndefined();
    expect(store.warnFor(url('innocent.test'))).toBeNull();
  });

  it('remembers the most recent reason, so the warning can name it', () => {
    store.record(url('mixed.test'), 'paywall');
    store.record(url('mixed.test'), 'bot-check');
    store.record(url('mixed.test'), 'consent-wall');

    expect(store.warnFor(url('mixed.test'))).toBe('consent-wall');
  });

  it('ignores a URL with no host', () => {
    store.record('not a url', 'paywall');
    expect(store.size()).toBe(0);
  });

  it('lets a reader forget a host it disagrees with', () => {
    for (let i = 0; i < FAILURES_BEFORE_WARNING; i++) {
      store.record(url('disputed.test'), 'paywall');
    }
    store.forget('DISPUTED.test');
    expect(store.warnFor(url('disputed.test'))).toBeNull();
  });

  it('survives a reload', () => {
    for (let i = 0; i < FAILURES_BEFORE_WARNING; i++) {
      store.record(url('paywalled.test'), 'paywall');
    }

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(ObservedFailures).warnFor(url('paywalled.test'))).toBe('paywall');
  });

  it('drops malformed entries on load without losing the good ones', () => {
    localStorage.setItem(
      OBSERVED_FAILURES_KEY_BASE,
      JSON.stringify({
        'good.test': { attempts: 3, failures: 3, lastDiagnosis: 'paywall', lastSeen: 1 },
        'bad.test': { attempts: 'three' },
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(ObservedFailures);

    expect(reloaded.get('good.test')).toBeDefined();
    expect(reloaded.get('bad.test')).toBeUndefined();
  });

  /** Exportable so it can be read — and so nothing has to be taken on trust. */
  it('exports readable JSON in a stable order', () => {
    store.record(url('zeta.test'), 'paywall');
    store.record(url('alpha.test'), 'bot-check');

    const exported = JSON.parse(store.exportJson()) as HostMap;
    expect(Object.keys(exported)).toEqual(['alpha.test', 'zeta.test']);
    expect(exported['alpha.test'].lastDiagnosis).toBe('bot-check');
  });

  it('clears everything', () => {
    store.record(url('a.test'), 'paywall');
    store.clear();
    expect(store.size()).toBe(0);
  });
});
