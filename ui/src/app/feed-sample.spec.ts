import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Status } from './models';
import { FeedSample, FeedSource, MAX_PAGES, isSupplied, sampleFeed } from './feed-sample';

function makeStatus(id: string): Status {
  return { id, created_at: '2026-03-10T12:00:00Z' } as Status;
}

/** Collect the single emission synchronously — every source here is sync. */
function collect(source: FeedSource, size: number): FeedSample {
  let result: FeedSample | undefined;
  sampleFeed(source, size).subscribe((sample) => (result = sample));
  if (!result) {
    throw new Error('sampleFeed did not emit');
  }
  return result;
}

/** A paged source serving `pages` in order, recording the cursors it was given. */
function paged(pages: Status[][], pageSize = 40) {
  const cursors: (string | null)[] = [];
  let call = 0;
  const source: FeedSource = {
    type: 'hashtag',
    query: '#test',
    pageSize,
    fetch: (after) => {
      cursors.push(after?.id ?? null);
      return of(pages[call++] ?? []);
    },
  };
  return { source, cursors, calls: () => call };
}

const fullPage = (prefix: string, n = 40) =>
  Array.from({ length: n }, (_, i) => makeStatus(prefix + i));

describe('isSupplied', () => {
  it('distinguishes a supplied feed from a paged one', () => {
    expect(isSupplied({ type: 'home', query: 'home', posts: [] })).toBe(true);
    expect(isSupplied(paged([[]]).source)).toBe(false);
  });
});

describe('sampleFeed — supplied sources', () => {
  it('uses the posts it was handed, at no request cost', () => {
    const posts = [makeStatus('1'), makeStatus('2')];
    const sample = collect({ type: 'home', query: 'home', posts }, 100);
    expect(sample.posts).toEqual(posts);
    expect(sample.apiCalls).toBe(0);
    expect(sample.failed).toBe(false);
  });

  it('still respects the requested size', () => {
    const posts = fullPage('p', 10);
    expect(collect({ type: 'home', query: 'home', posts }, 4).posts).toHaveLength(4);
  });

  it('handles being handed nothing', () => {
    const sample = collect({ type: 'home', query: 'home', posts: [] }, 100);
    expect(sample.posts).toEqual([]);
    expect(sample.failed).toBe(false);
  });
});

describe('sampleFeed — paged sources', () => {
  it('pages until the sample size is reached, then trims', () => {
    const { source, cursors, calls } = paged([fullPage('a'), fullPage('b'), fullPage('c')]);
    const sample = collect(source, 100);

    expect(calls()).toBe(3);
    expect(cursors).toEqual([null, 'a39', 'b39']);
    expect(sample.posts).toHaveLength(100);
    expect(sample.apiCalls).toBe(3);
  });

  it('stops as soon as a short page shows the feed is exhausted', () => {
    const { source, calls } = paged([[makeStatus('1'), makeStatus('2')]]);
    const sample = collect(source, 100);

    expect(calls()).toBe(1);
    expect(sample.posts).toHaveLength(2);
  });

  it('drops posts a later page repeats', () => {
    const first = fullPage('a');
    const overlapping = [...first.slice(38), ...fullPage('b', 38)];
    const sample = collect(paged([first, overlapping, []]).source, 100);

    const ids = sample.posts.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never pages past the hard cap', () => {
    // Every page is full, so only MAX_PAGES can stop it.
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 2,
      fetch: () => of([makeStatus(Math.random().toString()), makeStatus(Math.random().toString())]),
    };
    expect(collect(source, 10_000).apiCalls).toBe(MAX_PAGES);
  });

  it('keeps what it collected when a later page fails', () => {
    let call = 0;
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 40,
      fetch: (): Observable<Status[]> =>
        call++ === 0 ? of(fullPage('a')) : throwError(() => new Error('boom')),
    };
    const sample = collect(source, 100);

    expect(sample.posts).toHaveLength(40);
    expect(sample.failed).toBe(false);
  });

  it('reports failure only when the first page fails', () => {
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 40,
      fetch: () => throwError(() => new Error('boom')),
    };
    const sample = collect(source, 100);

    expect(sample.posts).toEqual([]);
    expect(sample.failed).toBe(true);
  });

  it('stops paging once unsubscribed', () => {
    let call = 0;
    const source: FeedSource = {
      type: 'hashtag',
      query: '#test',
      pageSize: 40,
      fetch: () => {
        call += 1;
        return new Observable<Status[]>(); // never emits
      },
    };
    const sub = sampleFeed(source, 100).subscribe();
    sub.unsubscribe();
    expect(call).toBe(1);
  });
});
