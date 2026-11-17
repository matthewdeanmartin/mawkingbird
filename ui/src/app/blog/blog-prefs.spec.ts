import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogPrefs } from './blog-prefs';
import { DEFAULT_BLOG_THRESHOLDS } from './blog-classifier';

describe('BlogPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts at the defaults', () => {
    const prefs = TestBed.inject(BlogPrefs);
    expect(prefs.thresholds()).toEqual(DEFAULT_BLOG_THRESHOLDS);
    expect(prefs.isDefault()).toBe(true);
  });

  it('clamps, saves and reads back', () => {
    TestBed.inject(BlogPrefs).set({ minPosts: 1, minWords: 2000 });
    expect(JSON.parse(localStorage.getItem('mockingbird_blog_prefs')!)).toEqual({
      minPosts: 2,
      minStormWords: 80,
      minWords: 2000,
    });
    TestBed.resetTestingModule();
    const again = TestBed.inject(BlogPrefs);
    expect(again.thresholds()).toEqual({ minPosts: 2, minStormWords: 80, minWords: 2000 });
    expect(again.isDefault()).toBe(false);
  });

  it('reads a value saved before words replaced characters, keeping the posts', () => {
    localStorage.setItem('mockingbird_blog_prefs', '{"minPosts":4,"minChars":1250}');
    expect(TestBed.inject(BlogPrefs).thresholds()).toEqual({
      minPosts: 4,
      minStormWords: 80,
      minWords: 200,
    });
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem('mockingbird_blog_prefs', '{not json');
    expect(TestBed.inject(BlogPrefs).thresholds()).toEqual(DEFAULT_BLOG_THRESHOLDS);
  });

  it('reset removes the key', () => {
    const prefs = TestBed.inject(BlogPrefs);
    prefs.set({ minPosts: 5 });
    prefs.reset();
    expect(prefs.thresholds()).toEqual(DEFAULT_BLOG_THRESHOLDS);
    expect(localStorage.getItem('mockingbird_blog_prefs')).toBeNull();
  });

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const prefs = TestBed.inject(BlogPrefs);
    prefs.set({ minWords: 900 });
    expect(prefs.thresholds().minWords).toBe(900);
  });
});
