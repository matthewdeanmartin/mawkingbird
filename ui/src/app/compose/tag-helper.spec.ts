import { describe, expect, it, vi } from 'vitest';
import {
  describeTagChecks,
  gradeTagsUntilEnough,
  isLive,
  recentUses,
  TAG_TARGET_LIVE,
} from './tag-helper';
import { TrendingTagHistory } from '../models';

describe('gradeTagsUntilEnough', () => {
  /** A probe answering from a table, recording what it was asked. */
  function prober(table: Record<string, number | { uses: number; similar?: string[] }>) {
    const asked: string[] = [];
    const probe = vi.fn(async (tag: string) => {
      asked.push(tag);
      const raw = table[tag] ?? 0;
      const entry = typeof raw === 'number' ? { uses: raw, similar: [] } : raw;
      return { uses: entry.uses, similar: entry.similar ?? [] };
    });
    return { probe, asked };
  }

  it('stops as soon as enough tags are alive', async () => {
    const { probe, asked } = prober({ a: 10, b: 5, c: 3, d: 9, e: 9 });

    const outcome = await gradeTagsUntilEnough(['a', 'b', 'c', 'd', 'e'], probe);

    // Three live tags is the target, so d and e are never looked up.
    expect(outcome.live).toEqual(['a', 'b', 'c']);
    expect(outcome.enough).toBe(true);
    expect(outcome.callsUsed).toBe(3);
    expect(asked).toEqual(['a', 'b', 'c']);
  });

  it('walks past dead tags to reach the target', async () => {
    const { probe, asked } = prober({ a: 0, b: 4, c: 0, d: 2, e: 7 });

    const outcome = await gradeTagsUntilEnough(['a', 'b', 'c', 'd', 'e'], probe);

    expect(outcome.live).toEqual(['b', 'd', 'e']);
    expect(outcome.enough).toBe(true);
    expect(asked).toHaveLength(5);
  });

  it('reports not-enough when too few are alive', async () => {
    const { probe } = prober({ a: 3, b: 0, c: 0, d: 0, e: 0 });

    const outcome = await gradeTagsUntilEnough(['a', 'b', 'c', 'd', 'e'], probe);

    expect(outcome.live).toEqual(['a']);
    expect(outcome.enough).toBe(false);
    expect(outcome.callsUsed).toBe(5);
  });

  it('keeps the similar tags the probe found', async () => {
    const { probe } = prober({ RustLang: { uses: 0, similar: ['rust', 'rustlang', 'ferris'] } });

    const outcome = await gradeTagsUntilEnough(['RustLang'], probe, { target: 1 });

    expect(outcome.checked[0].similar).toEqual(['rust', 'rustlang', 'ferris']);
  });

  it('caps how many similar tags it keeps', async () => {
    const { probe } = prober({ a: { uses: 0, similar: ['1', '2', '3', '4', '5'] } });
    const outcome = await gradeTagsUntilEnough(['a'], probe, { target: 1 });
    expect(outcome.checked[0].similar).toHaveLength(3);
  });

  it('treats a failed lookup as unknown, not dead, and keeps going', async () => {
    const probe = vi.fn(async (tag: string) => {
      if (tag === 'a') {
        throw new Error('network');
      }
      return { uses: 5, similar: [] };
    });

    const outcome = await gradeTagsUntilEnough(['a', 'b'], probe, { target: 1 });

    expect(outcome.checked[0]).toEqual({ tag: 'a', uses: null, similar: [] });
    expect(isLive(outcome.checked[0])).toBe(false);
    expect(outcome.live).toEqual(['b']);
  });

  it('honours a call ceiling', async () => {
    const { probe, asked } = prober({});
    await gradeTagsUntilEnough(['a', 'b', 'c', 'd', 'e'], probe, { maxCalls: 2 });
    expect(asked).toEqual(['a', 'b']);
  });

  it('spends nothing on an empty list', async () => {
    const { probe } = prober({});
    const outcome = await gradeTagsUntilEnough([], probe);
    expect(outcome).toEqual({ checked: [], live: [], enough: false, callsUsed: 0 });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('describeTagChecks', () => {
  it('hands the model the counts and the real alternatives', () => {
    const feedback = describeTagChecks([
      { tag: 'RustLang', uses: 0, similar: ['rust', 'rustlang'] },
      { tag: 'compilers', uses: 12, similar: [] },
    ]);

    expect(feedback).toContain('RustLang → nobody has used this');
    // The similar tags are the half that makes refining worth doing.
    expect(feedback).toContain('related tags that do exist: rust, rustlang');
    expect(feedback).toContain('compilers → 12 recent uses');
    expect(feedback).toContain('Do not repeat any dead tag');
    expect(feedback).toContain(`Fewer than ${TAG_TARGET_LIVE}`);
  });

  it('distinguishes an unchecked tag from a dead one', () => {
    expect(describeTagChecks([{ tag: 'a', uses: null, similar: [] }])).toContain(
      "couldn't be checked",
    );
  });

  it('singularises one use', () => {
    expect(describeTagChecks([{ tag: 'a', uses: 1, similar: [] }])).toContain('1 recent use');
  });

  it('is empty when there is nothing to report', () => {
    expect(describeTagChecks([])).toBe('');
  });
});

describe('recentUses', () => {
  function tag(history: TrendingTagHistory[]): { history: TrendingTagHistory[] } {
    return { history };
  }

  it('sums the history, which Mastodon returns as strings', () => {
    expect(
      recentUses(
        tag([
          { day: '1', uses: '3', accounts: '2' },
          { day: '2', uses: '4', accounts: '1' },
        ]),
      ),
    ).toBe(7);
  });

  it('treats a missing or unparseable history as no activity', () => {
    expect(recentUses(undefined)).toBe(0);
    expect(recentUses(tag([]))).toBe(0);
    expect(recentUses(tag([{ day: '1', uses: 'nonsense', accounts: '0' }]))).toBe(0);
  });
});
