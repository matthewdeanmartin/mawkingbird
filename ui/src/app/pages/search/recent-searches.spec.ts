import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECENT_SEARCH_LIMIT, RecentSearches } from './recent-searches';

describe('RecentSearches', () => {
  let recent: RecentSearches;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    recent = TestBed.inject(RecentSearches);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('records what was searched, newest first', () => {
    recent.record('birds', 'statuses');
    recent.record('cats', 'statuses');

    expect(recent.all().map((r) => r.query)).toEqual(['cats', 'birds']);
  });

  it('moves a repeated search to the front instead of duplicating it', () => {
    // A list where "cats" appears four times is a worse answer to "what did I
    // search for?" than one where it appears once, at the top.
    recent.record('cats', 'statuses');
    recent.record('birds', 'statuses');
    recent.record('cats', 'statuses');

    expect(recent.all().map((r) => r.query)).toEqual(['cats', 'birds']);
    expect(recent.count()).toBe(2);
  });

  it('keeps the same words on different tabs apart', () => {
    // Searching "rust" as posts and as people are different searches with
    // different results, so collapsing them would re-run the wrong one.
    recent.record('rust', 'statuses');
    recent.record('rust', 'accounts');

    expect(recent.count()).toBe(2);
    expect(recent.all().map((r) => r.type)).toEqual(['accounts', 'statuses']);
  });

  it('ignores an empty or whitespace-only query', () => {
    recent.record('   ', 'statuses');
    recent.record('', 'accounts');

    expect(recent.count()).toBe(0);
  });

  it('trims what it stores', () => {
    recent.record('  birds  ', 'statuses');

    expect(recent.all()[0].query).toBe('birds');
  });

  it('rolls the oldest off the end at the limit', () => {
    for (let i = 0; i < RECENT_SEARCH_LIMIT + 5; i++) {
      recent.record(`q${i}`, 'statuses');
    }

    expect(recent.count()).toBe(RECENT_SEARCH_LIMIT);
    // The most recent survives, the first is gone.
    expect(recent.all()[0].query).toBe(`q${RECENT_SEARCH_LIMIT + 4}`);
    expect(recent.all().some((r) => r.query === 'q0')).toBe(false);
  });

  it('forgets one entry without touching the rest', () => {
    recent.record('birds', 'statuses');
    recent.record('cats', 'statuses');

    recent.remove('birds', 'statuses');

    expect(recent.all().map((r) => r.query)).toEqual(['cats']);
  });

  it('removes only the matching tab', () => {
    recent.record('rust', 'statuses');
    recent.record('rust', 'accounts');

    recent.remove('rust', 'accounts');

    expect(recent.all()).toHaveLength(1);
    expect(recent.all()[0].type).toBe('statuses');
  });

  it('clears everything', () => {
    recent.record('birds', 'statuses');
    recent.record('cats', 'accounts');

    recent.clear();

    expect(recent.count()).toBe(0);
  });

  it('survives a reload', () => {
    recent.record('birds', 'statuses');

    // A fresh injector reads the same scoped localStorage key.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(
      TestBed.inject(RecentSearches)
        .all()
        .map((r) => r.query),
    ).toEqual(['birds']);
  });

  it('starts empty rather than throwing on a corrupt blob', () => {
    // This is convenience history: a corrupt row is worth nothing, and must not
    // break the page it renders under.
    // Record first, so the scoped key exists to corrupt.
    recent.record('birds', 'statuses');
    const key = Object.keys(localStorage).find((k) => k.startsWith('mockingbird_recent_searches'));
    expect(key).toBeDefined();
    localStorage.setItem(key as string, '{ not json');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(RecentSearches).count()).toBe(0);
  });

  it('drops malformed rows but keeps the good ones', () => {
    recent.record('good', 'statuses');
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('mockingbird_recent_searches'),
    ) as string;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        searches: [
          { query: 'good', type: 'statuses', ranAt: '2026-01-01T00:00:00.000Z' },
          { query: '', type: 'statuses', ranAt: '2026-01-01T00:00:00.000Z' },
          { query: 'bad-tab', type: 'nonsense', ranAt: '2026-01-01T00:00:00.000Z' },
          { type: 'statuses', ranAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(
      TestBed.inject(RecentSearches)
        .all()
        .map((r) => r.query),
    ).toEqual(['good']);
  });
});
