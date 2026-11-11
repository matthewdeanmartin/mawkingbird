import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_REJECTS, rejectKey, rejectReason, SearchServerRejects } from './search-server-rejects';

const KEY = 'mockingbird_search_server_rejects_v1';

describe('rejectKey', () => {
  it('reduces any spelling of a host to one key', () => {
    // Otherwise the same dud gets remembered three times and skipped none.
    expect(rejectKey('https://Foo.Social/')).toBe('foo.social');
    expect(rejectKey('foo.social')).toBe('foo.social');
    expect(rejectKey('  http://foo.social/api/v2/search  ')).toBe('foo.social');
  });
});

describe('rejectReason', () => {
  it('says what actually went wrong', () => {
    expect(rejectReason('auth-required')).toBe('search needs a login');
    expect(rejectReason('no-results')).toBe('no search results');
    expect(rejectReason('unreachable')).toBe('unreachable');
  });

  it('describes the accounts-only server, which answered but is still unusable', () => {
    expect(rejectReason('ok')).toBe('no post search');
  });
});

describe('SearchServerRejects', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  function rejects(): SearchServerRejects {
    return TestBed.inject(SearchServerRejects);
  }

  it('starts empty', () => {
    expect(rejects().count()).toBe(0);
  });

  it('remembers a rejection and skips it afterwards', () => {
    const store = rejects();
    store.add('https://closed.example', 'auth-required');

    expect(store.has('closed.example')).toBe(true);
    expect(store.has('CLOSED.example')).toBe(true);
    expect(store.has('other.example')).toBe(false);
  });

  it('persists across a reload', () => {
    rejects().add('closed.example', 'auth-required');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SearchServerRejects).has('closed.example')).toBe(true);
  });

  it('refreshes the reason instead of duplicating the host', () => {
    const store = rejects();
    store.add('flaky.example', 'unreachable');
    store.add('flaky.example', 'auth-required');

    expect(store.count()).toBe(1);
    expect(store.all()[0].status).toBe('auth-required');
  });

  it('hands discovery a set it can exclude directly', () => {
    const store = rejects();
    store.add('a.example', 'no-results');
    store.add('b.example', 'unreachable');

    expect(store.domains()).toEqual(new Set(['a.example', 'b.example']));
  });

  it('lists newest first, because that is the useful order', () => {
    const store = rejects();
    store.add('first.example', 'unreachable');
    store.add('second.example', 'unreachable');

    expect(store.recent().map((server) => server.domain)).toEqual([
      'second.example',
      'first.example',
    ]);
  });

  it('forgets one host on request', () => {
    const store = rejects();
    store.add('a.example', 'no-results');
    store.add('b.example', 'no-results');

    store.remove('https://a.example/');

    expect(store.has('a.example')).toBe(false);
    expect(store.has('b.example')).toBe(true);
  });

  it('clears everything, so a server that fixed its index is findable again', () => {
    const store = rejects();
    store.add('a.example', 'no-results');
    store.clear();

    expect(store.count()).toBe(0);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('evicts the oldest past the cap rather than growing forever', () => {
    const store = rejects();
    for (let i = 0; i < MAX_REJECTS + 10; i += 1) {
      store.add(`host${i}.example`, 'unreachable');
    }

    expect(store.count()).toBe(MAX_REJECTS);
    expect(store.has('host0.example')).toBe(false);
    expect(store.has(`host${MAX_REJECTS + 9}.example`)).toBe(true);
  });

  it('ignores an empty domain rather than storing a blank entry', () => {
    const store = rejects();
    store.add('   ', 'unreachable');

    expect(store.count()).toBe(0);
  });

  it('treats a corrupt payload as an empty list rather than throwing', () => {
    localStorage.setItem(KEY, 'not json at all');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SearchServerRejects).count()).toBe(0);
  });

  it('drops malformed entries but keeps the good ones', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        servers: [
          { domain: 'good.example', status: 'no-results', rejectedAt: '2026-01-01T00:00:00Z' },
          { domain: '', status: 'no-results', rejectedAt: '2026-01-01T00:00:00Z' },
          { nonsense: true },
        ],
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const store = TestBed.inject(SearchServerRejects);
    expect(store.count()).toBe(1);
    expect(store.has('good.example')).toBe(true);
  });

  it('discards a payload from a future version rather than guessing at it', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, servers: [{ domain: 'x.example' }] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SearchServerRejects).count()).toBe(0);
  });
});
