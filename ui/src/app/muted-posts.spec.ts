import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MutedPosts } from './muted-posts';

const KEY = 'mockingbird_muted_posts';

describe('MutedPosts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('mute() hides a post and persists it', () => {
    const svc = TestBed.inject(MutedPosts);
    expect(svc.isMuted('s1')).toBe(false);

    svc.mute('s1');
    expect(svc.isMuted('s1')).toBe(true);

    const stored = JSON.parse(localStorage.getItem(KEY)!) as Record<string, number>;
    expect(stored['s1']).toBeGreaterThan(Date.now());
  });

  it('unmute() clears the entry', () => {
    const svc = TestBed.inject(MutedPosts);
    svc.mute('s1');
    svc.unmute('s1');
    expect(svc.isMuted('s1')).toBe(false);
  });

  it('drops expired entries on load', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ old: Date.now() - 1000, fresh: Date.now() + 100_000 }),
    );
    const svc = TestBed.inject(MutedPosts);
    expect(svc.isMuted('old')).toBe(false);
    expect(svc.isMuted('fresh')).toBe(true);
    const stored = JSON.parse(localStorage.getItem(KEY)!) as Record<string, number>;
    expect(stored['old']).toBeUndefined();
  });
});
