import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOG_HISTORY_LIMIT, BlogHistory } from './blog-history';

describe('BlogHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.restoreAllMocks());

  const visit = (handle: string) => ({ handle, name: handle, avatar: '' });

  it('keeps the newest first, once per blog, ignoring case', () => {
    const history = TestBed.inject(BlogHistory);
    history.record(visit('a@x.example'));
    history.record(visit('b@x.example'));
    history.record(visit('A@X.example'));
    expect(history.visits().map((v) => v.handle)).toEqual(['a@x.example', 'b@x.example']);
  });

  it(`keeps at most ${BLOG_HISTORY_LIMIT} and survives a reload`, () => {
    const history = TestBed.inject(BlogHistory);
    for (let i = 0; i < BLOG_HISTORY_LIMIT + 3; i++) history.record(visit(`u${i}@x.example`));
    expect(history.visits()).toHaveLength(BLOG_HISTORY_LIMIT);
    TestBed.resetTestingModule();
    expect(TestBed.inject(BlogHistory).visits()[0].handle).toBe(
      `u${BLOG_HISTORY_LIMIT + 2}@x.example`,
    );
  });

  it('clears, and ignores corrupt or throwing storage', () => {
    const history = TestBed.inject(BlogHistory);
    history.record(visit('a@x.example'));
    history.clear();
    expect(history.visits()).toEqual([]);
    localStorage.setItem(
      Object.keys(localStorage)[0] ?? 'mockingbird_blog_history',
      '[{"handle":1},"x"]',
    );
    expect(history.visits()).toEqual([]);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    history.record(visit('b@x.example'));
    expect(history.visits()).toEqual([]);
  });
});
