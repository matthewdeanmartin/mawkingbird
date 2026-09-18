import { describe, expect, it } from 'vitest';
import { Poll } from '../models';
import { pollStatistics, wilsonInterval } from './poll-statistics';

export function examplePoll(counts = [1, 2, 3, 4]): Poll {
  return {
    id: 'poll',
    expires_at: null,
    expired: true,
    multiple: false,
    votes_count: counts.reduce((a, b) => a + b, 0),
    voters_count: counts.reduce((a, b) => a + b, 0),
    options: counts.map((votes_count, i) => ({ title: `Option ${i + 1}`, votes_count })),
    voted: false,
    own_votes: [],
  };
}

describe('poll statistics', () => {
  it('keeps a ten-voter poll inconclusive despite its observed ordering', () => {
    const stats = pollStatistics(examplePoll())!;
    expect(stats.n).toBe(10);
    expect(stats.options[3].share).toBe(0.4);
    expect(stats.options[3].interval[0]).toBeCloseTo(0.16818, 4);
    expect(stats.options[3].interval[1]).toBeCloseTo(0.68733, 4);
    expect(stats.lead).toBeCloseTo(10);
    expect(stats.clearLeader).toBe(false);
    expect(stats.ranked).toBe(false);
  });
  it('distinguishes a leader from a complete ranking', () => {
    const stats = pollStatistics(examplePoll([8000, 1000, 1000]))!;
    expect(stats.clearLeader).toBe(true);
    expect(stats.ranked).toBe(false);
    expect(pollStatistics(examplePoll([1000, 2000, 3000, 4000]))!.ranked).toBe(true);
  });
  it('uses voters for multiple-choice proportions and selections per voter', () => {
    const poll = { ...examplePoll([8, 6]), multiple: true, voters_count: 10 };
    const stats = pollStatistics(poll)!;
    expect(stats.options[0].share).toBe(0.8);
    expect(stats.average).toBe(1.4);
    expect(stats.n).toBe(10);
  });
  it('retains uncertainty at zero and unanimous shares', () => {
    expect(wilsonInterval(0, 10)[1]).toBeCloseTo(0.27753, 4);
    expect(wilsonInterval(10, 10)[0]).toBeCloseTo(0.72247, 4);
  });
  it('rejects empty, hidden, inconsistent and missing counts', () => {
    expect(pollStatistics(examplePoll([0, 0]))).toBeNull();
    expect(pollStatistics({ ...examplePoll(), votes_count: 11 })).toBeNull();
    expect(
      pollStatistics({ ...examplePoll(), multiple: true, voters_count: null as unknown as number }),
    ).toBeNull();
    expect(pollStatistics(examplePoll([NaN, 1]))).toBeNull();
    expect(pollStatistics(examplePoll([null as unknown as number, 10]))).toBeNull();
  });
});
