import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArticleCache,
  ARTICLE_TTL_MS,
  MAX_CACHED_ARTICLES,
  normalizeArticleUrl,
} from './article-cache';
import { ArticleResult } from './article-models';

describe('ArticleCache', () => {
  const story: ArticleResult = {
    requestedUrl: 'https://example.test/a',
    finalUrl: 'https://example.test/a',
    diagnosis: 'ok',
    card: null,
    article: {
      title: 'Article',
      byline: null,
      siteName: null,
      markdown: 'Content',
      images: [],
      quality: 'good',
      metrics: { wordCount: 1, paragraphCount: 1, linkDensity: 0, textToMarkupRatio: 1 },
    },
    fetchedAt: '2026-09-04T00:00:00Z',
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps navigation free when IndexedDB is unavailable and expires after 60 minutes', async () => {
    const cache = new ArticleCache();
    await cache.put(story.requestedUrl, story);
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(await cache.get(story.requestedUrl)).toEqual(story);
    vi.advanceTimersByTime(60 * 1000);
    expect(await cache.get(story.requestedUrl)).toBeNull();
    expect(ARTICLE_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('shares cache entries across tracking links without extending their lifetime', async () => {
    const cache = new ArticleCache();
    await cache.put(story.requestedUrl + '?utm_source=feed&utm_campaign=one#part', story);
    expect(await cache.get(story.requestedUrl + '?utm_source=another')).toEqual(story);
    expect(normalizeArticleUrl(story.requestedUrl + '?page=2&utm_medium=social')).toBe(
      story.requestedUrl + '?page=2',
    );
    await cache.remove(story.requestedUrl);
    expect(await cache.get(story.requestedUrl)).toBeNull();
  });

  it('bounds the memory fallback', async () => {
    const cache = new ArticleCache();
    for (let i = 0; i <= MAX_CACHED_ARTICLES; i++)
      await cache.put('https://example.test/' + i, story);
    expect(await cache.get('https://example.test/0')).toBeNull();
    expect(await cache.get('https://example.test/' + MAX_CACHED_ARTICLES)).toEqual(story);
  });
});
