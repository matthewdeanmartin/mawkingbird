import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import {
  ANONYMOUS_CORPUS_LIMIT,
  ANONYMOUS_CORPUS_STORED_CHARACTERS,
  AnonymousFeedCorpus,
  canonicalStatusKey,
} from './anonymous-feed-corpus';

function status(id: string, url: string | null = `https://social.example/@alice/${id}`): Status {
  return {
    id,
    url,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, Number(id) || 0)).toISOString(),
    account: { id: 'alice', username: 'alice' },
    reblog: null,
  } as Status;
}

describe('AnonymousFeedCorpus', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('deduplicates instance ids by canonical post URL and persists snapshots', () => {
    const corpus = TestBed.inject(AnonymousFeedCorpus);
    corpus.ingest([status('1'), status('copy', 'https://social.example/@alice/1')]);
    expect(corpus.statuses()).toHaveLength(1);
    expect(canonicalStatusKey(corpus.statuses()[0])).toBe('https://social.example/@alice/1');
    expect(corpus.updatedAt()).not.toBeNull();
  });

  it('bounds retained corpus size', () => {
    const corpus = TestBed.inject(AnonymousFeedCorpus);
    corpus.ingest(
      Array.from({ length: ANONYMOUS_CORPUS_LIMIT + 25 }, (_, index) =>
        status(String(index), `https://social.example/post/${index}`),
      ),
    );
    expect(corpus.statuses()).toHaveLength(ANONYMOUS_CORPUS_LIMIT);
  });

  it('stores only the newest posts that fit its size budget, keeping all of them in memory', () => {
    const big = (id: string) => ({ ...status(id), content: 'x'.repeat(5_000) }) as Status;
    const corpus = TestBed.inject(AnonymousFeedCorpus);

    corpus.ingest(Array.from({ length: ANONYMOUS_CORPUS_LIMIT }, (_, i) => big(String(i + 1))));

    expect(corpus.statuses()).toHaveLength(ANONYMOUS_CORPUS_LIMIT);
    const raw = localStorage.getItem('mockingbird_anonymous_feed_corpus')!;
    expect(raw.length).toBeLessThanOrEqual(ANONYMOUS_CORPUS_STORED_CHARACTERS);
    const stored = JSON.parse(raw).statuses as Status[];
    expect(stored.length).toBeGreaterThan(50);
    expect(stored.length).toBeLessThan(ANONYMOUS_CORPUS_LIMIT);
    // Newest first, so a cold start shows the most recent posts.
    expect(stored[0].id).toBe(String(ANONYMOUS_CORPUS_LIMIT));
  });

  it('shrinks an oversized copy left by an older version as soon as it loads', () => {
    const statuses = Array.from(
      { length: 300 },
      (_, i) => ({ ...status(String(300 - i)), content: 'x'.repeat(5_000) }) as Status,
    );
    localStorage.setItem(
      'mockingbird_anonymous_feed_corpus',
      JSON.stringify({ version: 1, statuses, updatedAt: '2026-01-01T00:00:00.000Z' }),
    );

    const corpus = TestBed.inject(AnonymousFeedCorpus);

    // This visit still has everything; storage has room again.
    expect(corpus.statuses()).toHaveLength(300);
    const raw = localStorage.getItem('mockingbird_anonymous_feed_corpus')!;
    expect(raw.length).toBeLessThanOrEqual(ANONYMOUS_CORPUS_STORED_CHARACTERS);
    expect(JSON.parse(raw).updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('recovers from malformed storage', () => {
    localStorage.setItem('mockingbird_anonymous_feed_corpus', '{bad');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(AnonymousFeedCorpus).statuses()).toEqual([]);
  });
});
