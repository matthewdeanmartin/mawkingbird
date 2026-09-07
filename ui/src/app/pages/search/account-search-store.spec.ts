import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../models';
import { AccountSearchStore, AccountSearchSnapshot } from './account-search-store';
import { SearchServer } from '../../search-server';

function makeSnapshot(query: string): AccountSearchSnapshot {
  return {
    query,
    items: [{ account: { id: 'a', acct: 'a' } as Account, matchingPosts: [] }],
    relationships: {},
    expanded: [],
    facets: [],
    filter: '',
    sort: 'relevance',
    bounds: { text: query },
    callsUsed: 2,
    scrollTop: 120,
  };
}

describe('AccountSearchStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  /** TestBed, not `new`: the store reads the search-server epoch via inject(). */
  function newStore(): AccountSearchStore {
    return TestBed.inject(AccountSearchStore);
  }

  it('returns a saved snapshot only for a matching query', () => {
    const store = newStore();
    store.save(makeSnapshot('economist'));

    expect(store.take('economist')?.items).toHaveLength(1);
    expect(store.take('physicist')).toBeNull();
  });

  it('take does not consume the snapshot', () => {
    const store = newStore();
    store.save(makeSnapshot('economist'));

    expect(store.take('economist')).not.toBeNull();
    // Still there on a second read — the caller decides when to clear.
    expect(store.take('economist')).not.toBeNull();
  });

  it('clear drops the snapshot', () => {
    const store = newStore();
    store.save(makeSnapshot('economist'));
    store.clear();

    expect(store.take('economist')).toBeNull();
  });

  it('a newer save replaces the previous snapshot', () => {
    const store = newStore();
    store.save(makeSnapshot('economist'));
    store.save(makeSnapshot('historian'));

    expect(store.take('economist')).toBeNull();
    expect(store.take('historian')).not.toBeNull();
  });
});

describe('AccountSearchStore and the search server', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('refuses a snapshot taken against a different search server', () => {
    // Account ids are local to an instance. Restoring kolectiva's results while
    // search now points at mastodon.social gives cards that link to whatever
    // account happens to hold that id there — the "wrong profile" bug.
    const store = TestBed.inject(AccountSearchStore);
    const searchServer = TestBed.inject(SearchServer);
    store.save(makeSnapshot('economist'));
    expect(store.take('economist')).not.toBeNull();

    searchServer.setBaseUrl('kolectiva.social');

    expect(store.take('economist')).toBeNull();
  });

  it('also drops it when the search server is cleared back to the primary', () => {
    const store = TestBed.inject(AccountSearchStore);
    const searchServer = TestBed.inject(SearchServer);
    searchServer.setBaseUrl('kolectiva.social');
    store.save(makeSnapshot('economist'));

    searchServer.clear();

    expect(store.take('economist')).toBeNull();
  });

  it('keeps the snapshot when the same server is re-applied', () => {
    // Re-setting the identical host is not a change and must not throw work away.
    const store = TestBed.inject(AccountSearchStore);
    const searchServer = TestBed.inject(SearchServer);
    searchServer.setBaseUrl('kolectiva.social');
    store.save(makeSnapshot('economist'));

    searchServer.setBaseUrl('kolectiva.social');

    expect(store.take('economist')).not.toBeNull();
  });
});
