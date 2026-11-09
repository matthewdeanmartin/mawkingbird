import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRANSLATION_TTL_MS, TranslationCache, translationCacheKey } from './translation-cache';

describe('TranslationCache', () => {
  afterEach(() => vi.useRealTimers());

  it('keys by target, post and the exact text', () => {
    const a = translationCacheKey('https://x/notes/1', 'hello', 'en');
    expect(a).toBe(translationCacheKey('https://x/notes/1', 'hello', 'en'));
    expect(a).not.toBe(translationCacheKey('https://x/notes/1', 'hello!', 'en'));
    expect(a).not.toBe(translationCacheKey('https://x/notes/1', 'hello', 'de'));
    expect(a).not.toBe(translationCacheKey('https://x/notes/2', 'hello', 'en'));
  });

  it('returns what was stored', async () => {
    const cache = TestBed.inject(TranslationCache);
    const value = { text: 'Hi', engine: 'misskey' as const, source: 'ja', target: 'en' };
    await cache.put('k', value);
    await expect(cache.get('k')).resolves.toEqual(value);
    await expect(cache.get('other')).resolves.toBeNull();
  });

  it('forgets entries older than the TTL', async () => {
    const cache = TestBed.inject(TranslationCache);
    await cache.put('k', { text: 'Hi', engine: 'browser', source: 'ja', target: 'en' });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + TRANSLATION_TTL_MS + 1);
    await expect(cache.get('k')).resolves.toBeNull();
  });
});
