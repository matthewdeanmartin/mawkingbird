import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleExpansion } from './article-expansion';
import { ArticleFetch } from '../../providers/article/article-fetch';
import { ArticleQuota } from '../../providers/article/article-quota';
import { ArticleReadingTally } from '../../providers/article/article-reading-tally';
import { ArticleResult } from '../../providers/article/article-models';
import { ObservedFailures } from '../../providers/article/observed-failures';
import { PageDiagnostics } from '../../page-diagnostics';

export const cachedStory: ArticleResult = {
  requestedUrl: 'https://example.test/story',
  finalUrl: 'https://example.test/story',
  diagnosis: 'ok',
  card: null,
  fetchedAt: '2026-09-04T00:00:00.000Z',
  fromCache: true,
  article: {
    title: 'A cached story',
    byline: null,
    siteName: 'Example',
    markdown: 'The complete article.',
    images: [],
    quality: 'good',
    metrics: { wordCount: 3, paragraphCount: 1, linkDensity: 0, textToMarkupRatio: 1 },
  },
};

describe('ArticleExpansion cache and navigation', () => {
  const fetch = { cached: vi.fn(), expand: vi.fn(), forget: vi.fn(), available: () => true };
  const quota = { allowed: () => false, authorize: vi.fn(), recordFetch: vi.fn() };
  const tally = { recordOne: vi.fn() };
  let expansion: ArticleExpansion;

  beforeEach(() => {
    vi.resetAllMocks();
    fetch.cached.mockResolvedValue(null);
    fetch.expand.mockResolvedValue({ ...cachedStory, fromCache: false });
    quota.authorize.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        ArticleExpansion,
        { provide: ArticleFetch, useValue: fetch },
        { provide: ArticleQuota, useValue: quota },
        { provide: ArticleReadingTally, useValue: tally },
        { provide: ObservedFailures, useValue: { record: vi.fn(), warnFor: () => null } },
        { provide: PageDiagnostics, useValue: { info: vi.fn() } },
      ],
    });
    expansion = TestBed.inject(ArticleExpansion);
  });

  it('restores a successful extraction without authorizing or fetching', async () => {
    fetch.cached.mockResolvedValue(cachedStory);
    await expansion.restore(cachedStory.requestedUrl);
    expect(expansion.result()).toEqual(cachedStory);
    expect(quota.authorize).not.toHaveBeenCalled();
    expect(fetch.expand).not.toHaveBeenCalled();
    expect(tally.recordOne).not.toHaveBeenCalled();
  });

  it('allows a cached read even when the free quota is exhausted', async () => {
    fetch.cached.mockResolvedValue(cachedStory);
    expect(await expansion.expand(cachedStory.requestedUrl)).toEqual(cachedStory);
    expect(quota.authorize).not.toHaveBeenCalled();
    expect(quota.recordFetch).not.toHaveBeenCalled();
    expect(tally.recordOne).not.toHaveBeenCalled();
  });

  it('counts a new successful fetch once and refuses to refetch the displayed article', async () => {
    await expansion.expand(cachedStory.requestedUrl);
    await expansion.expand(cachedStory.requestedUrl, true);
    expect(fetch.expand).toHaveBeenCalledTimes(1);
    expect(tally.recordOne).toHaveBeenCalledTimes(1);
    expect(fetch.forget).not.toHaveBeenCalled();
  });

  it('does not count a cache hit that arrives after authorization', async () => {
    fetch.expand.mockResolvedValue(cachedStory);
    await expansion.expand(cachedStory.requestedUrl);
    expect(tally.recordOne).not.toHaveBeenCalled();
  });

  it('discards a previous document fetch that completes after navigation', async () => {
    let finish!: (result: ArticleResult) => void;
    fetch.expand.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = expansion.expand(cachedStory.requestedUrl);
    await vi.waitFor(() => expect(fetch.expand).toHaveBeenCalled());
    expansion.reset();
    finish(cachedStory);
    expect(await pending).toBeNull();
    expect(expansion.result()).toBeNull();
    expect(expansion.expanding()).toBe(false);
    expect(tally.recordOne).not.toHaveBeenCalled();
  });

  it('discards a stale cache restore and resets the retry state', async () => {
    let finish!: (result: ArticleResult) => void;
    fetch.cached.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = expansion.restore(cachedStory.requestedUrl);
    expansion.reset();
    finish(cachedStory);
    expect(await pending).toBeNull();
    expect(expansion.result()).toBeNull();
  });
});
