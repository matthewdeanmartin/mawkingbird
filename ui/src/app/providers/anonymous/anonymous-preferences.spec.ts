import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnonymousPreferences, DEFAULT_FOLLOWED_POST_MAX_AGE_DAYS } from './anonymous-preferences';
import { AnonymousHomeFeedCache } from './anonymous-home-feed-cache';

describe('AnonymousPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('defaults the followed-post window to one year', () => {
    expect(TestBed.inject(AnonymousPreferences).followedPostMaxAgeDays()).toBe(
      DEFAULT_FOLLOWED_POST_MAX_AGE_DAYS,
    );
  });

  it('persists changes and invalidates the Anonymous Home cache', () => {
    const cache = TestBed.inject(AnonymousHomeFeedCache);
    cache.store([{ id: 'cached' }] as never);
    const prefs = TestBed.inject(AnonymousPreferences);

    prefs.setFollowedPostMaxAgeDays(90);

    expect(prefs.followedPostMaxAgeDays()).toBe(90);
    expect(cache.populated()).toBe(false);
    expect(JSON.parse(localStorage.getItem('mockingbird_anonymous_preferences') ?? '{}')).toEqual({
      version: 1,
      followedPostMaxAgeDays: 90,
    });
  });

  it('rejects followed-account posts older than the configured age', () => {
    const prefs = TestBed.inject(AnonymousPreferences);
    prefs.setFollowedPostMaxAgeDays(30);
    const now = Date.parse('2026-07-22T00:00:00.000Z');

    expect(prefs.allowsFollowedPost('2026-07-01T00:00:00.000Z', now)).toBe(true);
    expect(prefs.allowsFollowedPost('2026-06-01T00:00:00.000Z', now)).toBe(false);
    expect(prefs.allowsFollowedPost('not-a-date', now)).toBe(false);
  });
});
