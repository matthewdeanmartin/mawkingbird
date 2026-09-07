import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ElizaFollow } from './eliza-follow';
import { ELIZA_ID } from './eliza-identity';

describe('ElizaFollow', () => {
  let follow: ElizaFollow;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    follow = TestBed.inject(ElizaFollow);
  });

  it('starts not-following', () => {
    expect(follow.following()).toBe(false);
    expect(follow.relationship().following).toBe(false);
  });

  it('follows, persists, and reports the relationship', () => {
    follow.follow();
    expect(follow.following()).toBe(true);
    const rel = follow.relationship();
    expect(rel.id).toBe(ELIZA_ID);
    expect(rel.following).toBe(true);
    expect(rel.followed_by).toBe(true); // she follows back
  });

  it('persists across a fresh service instance (localStorage)', () => {
    follow.follow();
    // Re-read from storage via refresh (new instance would read the same key).
    const fresh = TestBed.inject(ElizaFollow);
    fresh.refresh();
    expect(fresh.following()).toBe(true);
  });

  it('unfollows and clears the flag', () => {
    follow.follow();
    // Some key was written; unfollow must remove it entirely.
    expect(Object.keys(localStorage).some((k) => k.startsWith('mockingbird_eliza_following'))).toBe(
      true,
    );
    follow.unfollow();
    expect(follow.following()).toBe(false);
    expect(Object.keys(localStorage).some((k) => k.startsWith('mockingbird_eliza_following'))).toBe(
      false,
    );
  });

  it('toggle flips and returns the new value', () => {
    expect(follow.toggle()).toBe(true);
    expect(follow.toggle()).toBe(false);
  });

  it('is idempotent', () => {
    follow.follow();
    follow.follow();
    expect(follow.following()).toBe(true);
    follow.unfollow();
    follow.unfollow();
    expect(follow.following()).toBe(false);
  });
});
