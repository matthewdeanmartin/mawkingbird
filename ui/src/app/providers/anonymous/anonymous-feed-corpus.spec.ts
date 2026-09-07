import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../models';
import {
  ANONYMOUS_CORPUS_LIMIT,
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

  it('recovers from malformed storage', () => {
    localStorage.setItem('mockingbird_anonymous_feed_corpus', '{bad');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(AnonymousFeedCorpus).statuses()).toEqual([]);
  });
});
