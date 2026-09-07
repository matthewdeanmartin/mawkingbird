import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { pruneReadMap, READ_MAX_AGE_MS, READ_MAX_ENTRIES, RssReadState } from './rss-read-state';

const A = 'rss:https://a.example/feed::item-1';
const B = 'rss:https://a.example/feed::item-2';
const C = 'rss:https://b.example/feed::item-1';

describe('RssReadState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with nothing read or starred', () => {
    const store = TestBed.inject(RssReadState);
    expect(store.isRead(A)).toBe(false);
    expect(store.isStarred(A)).toBe(false);
    expect(store.readCount()).toBe(0);
  });

  it('marks read and unread', () => {
    const store = TestBed.inject(RssReadState);
    store.markRead(A);
    expect(store.isRead(A)).toBe(true);
    expect(store.isRead(B)).toBe(false);

    store.markUnread(A);
    expect(store.isRead(A)).toBe(false);
  });

  it('stores a timestamp, for the prune that does not exist yet', () => {
    TestBed.inject(RssReadState).markRead(A, 1234);
    const raw = JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find((k) => k.startsWith('mockingbird_rss_read'))!,
      )!,
    );
    expect(raw[A]).toBe(1234);
  });

  it('survives a reload', () => {
    TestBed.inject(RssReadState).markRead(A);
    TestBed.resetTestingModule();
    expect(TestBed.inject(RssReadState).isRead(A)).toBe(true);
  });

  it('marks many read in one go, leaving others alone', () => {
    const store = TestBed.inject(RssReadState);
    store.markManyRead([A, B]);

    expect(store.isRead(A)).toBe(true);
    expect(store.isRead(B)).toBe(true);
    // The whole point of the scoped API: an id nobody passed stays unread.
    expect(store.isRead(C)).toBe(false);
    expect(store.readCount()).toBe(2);
  });

  it('keeps read and starred independent', () => {
    const store = TestBed.inject(RssReadState);
    store.setStarred(A, true);

    // Starred but unread is a legitimate state and must not imply the other.
    expect(store.isStarred(A)).toBe(true);
    expect(store.isRead(A)).toBe(false);

    store.markRead(A);
    expect(store.isStarred(A)).toBe(true);

    store.markUnread(A);
    expect(store.isStarred(A)).toBe(true);
  });

  it('toggles a star', () => {
    const store = TestBed.inject(RssReadState);
    store.toggleStarred(A);
    expect(store.isStarred(A)).toBe(true);
    store.toggleStarred(A);
    expect(store.isStarred(A)).toBe(false);
  });

  it('lists starred ids newest first', () => {
    const store = TestBed.inject(RssReadState);
    store.setStarred(A, true, 100);
    store.setStarred(B, true, 300);
    store.setStarred(C, true, 200);

    expect(store.starredIds()).toEqual([B, C, A]);
  });

  it('clears everything', () => {
    const store = TestBed.inject(RssReadState);
    store.markRead(A);
    store.setStarred(B, true);

    store.clear();

    expect(store.readCount()).toBe(0);
    expect(store.starredCount()).toBe(0);
  });

  it('survives corrupt stored data rather than throwing', () => {
    localStorage.setItem('mockingbird_rss_read', 'not json');
    TestBed.resetTestingModule();
    expect(TestBed.inject(RssReadState).readCount()).toBe(0);
  });

  it('drops non-numeric entries but keeps the rest of the store', () => {
    const key = 'mockingbird_rss_read';
    // A real timestamp, not a token like `5`: the startup prune ages read marks
    // out, and epoch-1970 is well past ninety days ago — which would make this
    // pass for the wrong reason. This test is about the non-numeric filter.
    localStorage.setItem(key, JSON.stringify({ [A]: Date.now(), [B]: 'nope' }));
    TestBed.resetTestingModule();

    const store = TestBed.inject(RssReadState);
    expect(store.isRead(A)).toBe(true);
    expect(store.isRead(B)).toBe(false);
  });
});

describe('pruneReadMap', () => {
  const NOW = 1_800_000_000_000;
  const day = 24 * 60 * 60 * 1000;

  it('drops a read mark older than ninety days', () => {
    const { map, dropped } = pruneReadMap({ old: NOW - 91 * day }, NOW);

    expect(dropped).toBe(1);
    expect(map).toEqual({});
  });

  it('keeps a recent one', () => {
    const { map, dropped } = pruneReadMap({ fresh: NOW - day }, NOW);

    expect(dropped).toBe(0);
    expect(map).toEqual({ fresh: NOW - day });
  });

  it('keeps a mark sitting exactly on the boundary', () => {
    // The rule is "older than 90 days"; exactly 90 days is not yet older.
    // Asserted so the inequality cannot be flipped by accident later.
    const { dropped } = pruneReadMap({ edge: NOW - READ_MAX_AGE_MS }, NOW);

    expect(dropped).toBe(0);
  });

  it('caps a heavy reader by count, keeping the newest', () => {
    // Age alone does not bound anyone: a few hundred items a day inside the
    // window overruns a localStorage budget shared with every other feature.
    const map: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      map[`item-${i}`] = NOW - i * 1000;
    }
    const { map: kept, dropped } = pruneReadMap(map, NOW, READ_MAX_AGE_MS, 10);

    expect(dropped).toBe(2);
    expect(Object.keys(kept)).toHaveLength(10);
    // The two oldest went; the newest stayed.
    expect(kept['item-0']).toBeDefined();
    expect(kept['item-11']).toBeUndefined();
  });

  it('returns the same object when nothing needs dropping', () => {
    // Cheap identity check: a healthy store should not be rewritten to
    // localStorage on every startup for no reason.
    const map = { fresh: NOW };
    expect(pruneReadMap(map, NOW).map).toBe(map);
  });

  it('has a default cap well above ordinary reading', () => {
    expect(READ_MAX_ENTRIES).toBeGreaterThan(10_000);
  });
});

describe('RssReadState pruning on load', () => {
  const NOW = Date.now();
  const day = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  /** The store is account-scoped, so read the key the service itself derives. */
  function seed(read: Record<string, number>, starred: Record<string, number>): void {
    const store = TestBed.inject(RssReadState);
    for (const [id, at] of Object.entries(read)) store.markRead(id, at);
    for (const [id, at] of Object.entries(starred)) store.setStarred(id, true, at);
    TestBed.resetTestingModule();
  }

  it('forgets stale read marks the next time it loads', () => {
    seed({ [A]: NOW - 200 * day, [B]: NOW - day }, {});

    const reloaded = TestBed.inject(RssReadState);
    expect(reloaded.isRead(A)).toBe(false);
    expect(reloaded.isRead(B)).toBe(true);
    expect(reloaded.prunedOnLoad()).toBe(1);
  });

  it('never ages out a star, however old', () => {
    // The one change in this file that would destroy data if got wrong. A star
    // is the user saying "keep this"; only read marks are allowed to expire.
    seed({ [C]: NOW - 200 * day }, { [C]: NOW - 200 * day });

    const reloaded = TestBed.inject(RssReadState);
    expect(reloaded.isStarred(C)).toBe(true);
    expect(reloaded.starredCount()).toBe(1);
    // Its read mark did go — leaving it unread-and-starred, which is fine.
    expect(reloaded.isRead(C)).toBe(false);
  });

  it('reports nothing pruned for a healthy store', () => {
    seed({ [A]: NOW - day }, {});

    expect(TestBed.inject(RssReadState).prunedOnLoad()).toBe(0);
  });
});
