import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../platform/api/models';
import { lastPublished, stampPublished } from '../platform/storage/publish-stamp';
import { BLOG_CACHE_TTL_MS, BlogCache, blogCacheKey, isFresh } from './blog-cache';

const author = {
  handle: 'alice@far.example',
  account: { id: '7', acct: 'alice' } as Account,
  via: 'home' as const,
};

describe('isFresh', () => {
  it('lasts four hours, unless something was published since', () => {
    const now = 10 * BLOG_CACHE_TTL_MS;
    expect(isFresh(now - 1000, now, 0)).toBe(true);
    expect(isFresh(now - BLOG_CACHE_TTL_MS, now, 0)).toBe(false);
    expect(isFresh(now - 1000, now, now - 500)).toBe(false);
    expect(isFresh(now + 1000, now, 0)).toBe(false);
  });
});

describe('publish stamp', () => {
  beforeEach(() => localStorage.clear());

  it('records the latest publish', () => {
    expect(lastPublished()).toBe(0);
    stampPublished(1234);
    expect(lastPublished()).toBe(1234);
  });
});

describe('BlogCache', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keys by reading account and handle, ignoring case', () => {
    expect(blogCacheKey('Alice@Far.Example', ':me')).toBe(':me|alice@far.example');
  });

  it('remembers a blog, and forgets it once anything is published', async () => {
    const cache = TestBed.inject(BlogCache);
    await cache.put('alice@far.example', { author, statuses: [], exhausted: false, maxId: '9' });
    expect(await cache.get('Alice@far.example')).toMatchObject({ maxId: '9', author });
    stampPublished(Date.now() + 1);
    expect(await cache.get('alice@far.example')).toBeNull();
  });
});
