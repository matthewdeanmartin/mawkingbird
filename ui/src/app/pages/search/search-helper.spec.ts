import { describe, expect, it, vi } from 'vitest';
import {
  describeAttempts,
  describeContext,
  gradeUntilSuccess,
  SEARCH_SUCCESS_THRESHOLD,
  thresholdFor,
} from './search-helper';

describe('gradeUntilSuccess', () => {
  /** A probe that answers from a lookup table and records what it was asked. */
  function prober(counts: Record<string, number>) {
    const asked: string[] = [];
    const run = vi.fn(async (query: string) => {
      asked.push(query);
      return counts[query] ?? 0;
    });
    return { run, asked };
  }

  it('stops at the first query that clears the threshold', async () => {
    const { run, asked } = prober({ a: 9 });

    const outcome = await gradeUntilSuccess(['a', 'b', 'c', 'd', 'e'], run);

    // The whole point of the algorithm: one API call, not five.
    expect(outcome.winner).toBe('a');
    expect(outcome.callsUsed).toBe(1);
    expect(asked).toEqual(['a']);
    expect(outcome.attempts).toEqual([{ query: 'a', count: 9 }]);
  });

  it('walks past thin results to the first good one', async () => {
    const { run, asked } = prober({ a: 0, b: 2, c: 7, d: 100 });

    const outcome = await gradeUntilSuccess(['a', 'b', 'c', 'd'], run);

    expect(outcome.winner).toBe('c');
    expect(outcome.callsUsed).toBe(3);
    // 'd' was never tried — that is the saving.
    expect(asked).toEqual(['a', 'b', 'c']);
  });

  it('treats exactly the threshold as a success', async () => {
    const { run } = prober({ a: SEARCH_SUCCESS_THRESHOLD });
    expect((await gradeUntilSuccess(['a', 'b'], run)).winner).toBe('a');
  });

  it('reports no winner when every query is thin', async () => {
    const { run, asked } = prober({ a: 0, b: 1, c: 4 });

    const outcome = await gradeUntilSuccess(['a', 'b', 'c'], run);

    expect(outcome.winner).toBeNull();
    expect(outcome.callsUsed).toBe(3);
    expect(asked).toEqual(['a', 'b', 'c']);
  });

  it('keeps going when one probe throws, rather than discarding the rest', async () => {
    const run = vi.fn(async (query: string) => {
      if (query === 'a') {
        throw new Error('network');
      }
      return 8;
    });

    const outcome = await gradeUntilSuccess(['a', 'b'], run);

    expect(outcome.winner).toBe('b');
    expect(outcome.attempts).toEqual([
      { query: 'a', count: null },
      { query: 'b', count: 8 },
    ]);
  });

  it('honours a call ceiling', async () => {
    const { run, asked } = prober({});

    const outcome = await gradeUntilSuccess(['a', 'b', 'c', 'd', 'e'], run, { maxCalls: 2 });

    expect(asked).toEqual(['a', 'b']);
    expect(outcome.callsUsed).toBe(2);
    expect(outcome.winner).toBeNull();
  });

  it('honours a custom threshold', async () => {
    const { run } = prober({ a: 3 });
    expect((await gradeUntilSuccess(['a'], run, { threshold: 3 })).winner).toBe('a');
    expect((await gradeUntilSuccess(['a'], run, { threshold: 4 })).winner).toBeNull();
  });

  it('spends nothing on an empty suggestion list', async () => {
    const { run } = prober({});
    const outcome = await gradeUntilSuccess([], run);
    expect(outcome).toEqual({ attempts: [], winner: null, callsUsed: 0 });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('describeAttempts', () => {
  it('gives the model the counts and names the failure mode', () => {
    const feedback = describeAttempts([
      { query: '+rust +compiler +bootstrap', count: 0 },
      { query: 'from:@a@b rust', count: 2 },
    ]);

    expect(feedback).toContain('+rust +compiler +bootstrap → 0 results');
    expect(feedback).toContain('from:@a@b rust → 2 results');
    // "Too narrow" is actionable in a way that bare numbers are not.
    expect(feedback).toContain('too narrow');
    expect(feedback).toContain('Do not repeat any query');
  });

  it('singularises one result', () => {
    expect(describeAttempts([{ query: 'a', count: 1 }])).toContain('1 result\n');
  });

  it('says so when a probe failed rather than reporting zero', () => {
    expect(describeAttempts([{ query: 'a', count: null }])).toContain('the search failed');
  });

  it('is empty when there is nothing to report', () => {
    expect(describeAttempts([])).toBe('');
  });
});

describe('thresholdFor', () => {
  it('holds post search to a real result set', () => {
    expect(thresholdFor('statuses')).toBe(SEARCH_SUCCESS_THRESHOLD);
  });

  it('accepts a single hit for accounts and hashtags', () => {
    // There is often exactly one account you meant. Demanding five would
    // reject the right answer in favour of a vaguer one.
    expect(thresholdFor('accounts')).toBe(1);
    expect(thresholdFor('hashtags')).toBe(1);
  });
});

describe('describeContext', () => {
  /**
   * Account search is two searches merged — a name/bio lookup and a full-text
   * post search grouped by author (`fetchAccounts`) — and `q` reaches both
   * verbatim, so operators are live on the post half.
   *
   * The brief used to say the operators did NOT apply, following Mastodon's API
   * docs rather than what this app does. That made the helper withhold exactly
   * the queries "find me people who post about X" needs.
   */
  it('tells the model operators reach the post half of an account search', () => {
    const text = describeContext({ target: 'accounts' });

    expect(text).toContain('Accounts');
    expect(text).toContain('TWO searches');
    expect(text).toContain('DO apply');
    // The asymmetry has to survive too: operators do nothing to names and bios.
    expect(text).toContain('post half');
  });

  it('says hashtags want bare words without the #', () => {
    expect(describeContext({ target: 'hashtags' })).toContain('without the leading #');
  });

  it('leaves post search with its full operator set', () => {
    const text = describeContext({ target: 'statuses' });

    expect(text).toContain('Posts');
    expect(text).not.toContain('do NOT apply');
  });

  it('lists what the advanced form already set, so the query does not repeat it', () => {
    const text = describeContext({
      target: 'statuses',
      filters: ['Language: en', 'From account: @a@b.social'],
    });

    expect(text).toContain('- Language: en');
    expect(text).toContain('- From account: @a@b.social');
    expect(text).toContain('do not repeat them');
  });

  it('says nothing about filters when none are set', () => {
    expect(describeContext({ target: 'statuses', filters: ['', '  '] })).not.toContain(
      'do not repeat',
    );
  });
});
