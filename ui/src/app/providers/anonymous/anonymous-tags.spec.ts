import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANONYMOUS_TAG_LIMIT, AnonymousTags } from './anonymous-tags';
import { AnonymousHomeFeedCache } from './anonymous-home-feed-cache';

describe('AnonymousTags', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('normalizes, deduplicates, and persists followed tags', () => {
    const tags = TestBed.inject(AnonymousTags);
    expect(tags.follow('#Cats')).toEqual({ ok: true });
    expect(tags.follow('cats')).toEqual({ ok: true });
    expect(tags.tags()).toEqual(['cats']);
    expect(JSON.parse(localStorage.getItem('mockingbird_anonymous_tags') ?? '{}').tags).toEqual([
      'cats',
    ]);
  });

  it('rejects an eleventh followed tag', () => {
    const tags = TestBed.inject(AnonymousTags);
    for (let index = 0; index < ANONYMOUS_TAG_LIMIT; index += 1) tags.follow(`tag${index}`);
    const result = tags.follow('one-too-many');
    expect(result.ok).toBe(false);
    expect(tags.count()).toBe(ANONYMOUS_TAG_LIMIT);
  });

  it('invalidates the populated home feed when following or unfollowing a hashtag', () => {
    const cache = TestBed.inject(AnonymousHomeFeedCache);
    const tags = TestBed.inject(AnonymousTags);
    cache.store([{ id: 'cached', account: { username: 'alice' } } as never]);

    tags.follow('cats');
    expect(cache.populated()).toBe(false);

    cache.store([{ id: 'cached-again', account: { username: 'alice' } } as never]);
    tags.unfollow('cats');
    expect(cache.populated()).toBe(false);
  });
});
