import { describe, expect, it } from 'vitest';
import {
  HISTORY_BUCKET_MS,
  HISTORY_SPAN_MS,
  MAX_TRANSITIONS,
  addSample,
  deserialize,
  emptyHistory,
  latencyBin,
  medianBin,
  noteTransition,
  noteVerdict,
  offlineTime,
  prune,
  serialize,
  summarize,
} from './connection-history';
import { ConnectionSample } from './connection-quality';

const T0 = 1_700_000_000_000 - (1_700_000_000_000 % HISTORY_BUCKET_MS);

function sample(at: number, outcome: ConnectionSample['outcome'], ms = 300): ConnectionSample {
  return { at, ms, outcome, latency: true, home: true };
}

describe('connection history', () => {
  it('folds samples into one bucket per minute', () => {
    const h = emptyHistory();
    addSample(h, sample(T0 + 1_000, 'ok', 100));
    addSample(h, sample(T0 + 30_000, 'unreachable'));
    addSample(h, sample(T0 + HISTORY_BUCKET_MS + 5, 'ok', 3_000));
    expect(h.buckets.length).toBe(2);
    expect(h.buckets[0].n).toBe(2);
    expect(h.buckets[0].fail).toBe(1);
    // The unreachable request has no latency to report.
    expect(h.buckets[0].lat.reduce((a, b) => a + b, 0)).toBe(1);
    expect(h.buckets[1].lat[latencyBin(3_000)]).toBe(1);
  });

  it('keeps the worst verdict per minute and never lowers it', () => {
    const h = emptyHistory();
    noteVerdict(h, T0, 'flaky');
    noteVerdict(h, T0 + 10, 'good');
    noteVerdict(h, T0 + 20, 'unknown');
    expect(h.buckets[0].worst).toBe('flaky');
  });

  it('records only real online/offline changes, bounded', () => {
    const h = emptyHistory();
    noteTransition(h, T0, true);
    noteTransition(h, T0 + 1, true);
    expect(h.transitions.length).toBe(1);
    for (let i = 0; i < MAX_TRANSITIONS + 50; i++) noteTransition(h, T0 + i, i % 2 === 0);
    expect(h.transitions.length).toBe(MAX_TRANSITIONS);
  });

  it('measures time offline inside a range', () => {
    const transitions = [
      { at: T0, online: false },
      { at: T0 + 60_000, online: true },
      { at: T0 + 120_000, online: false },
    ];
    expect(offlineTime(transitions, T0 + 30_000, T0 + 150_000)).toBe(30_000 + 30_000);
  });

  it('drops data older than a day but keeps the state the window opened in', () => {
    const h = emptyHistory();
    addSample(h, sample(T0, 'ok'));
    noteTransition(h, T0, false);
    noteTransition(h, T0 + 1_000, true);
    const now = T0 + HISTORY_SPAN_MS + 10 * HISTORY_BUCKET_MS;
    addSample(h, sample(now, 'ok'));
    prune(h, now);
    expect(h.buckets.length).toBe(1);
    expect(h.transitions).toEqual([{ at: T0 + 1_000, online: true }]);
  });

  it('summarizes a window', () => {
    const h = emptyHistory();
    addSample(h, sample(T0, 'ok', 100));
    addSample(h, sample(T0 + HISTORY_BUCKET_MS, 'unreachable'));
    noteVerdict(h, T0 + HISTORY_BUCKET_MS, 'offline');
    const sum = summarize(h, T0, T0 + 2 * HISTORY_BUCKET_MS);
    expect(sum.requests).toBe(2);
    expect(sum.failures).toBe(1);
    expect(sum.worst).toBe('offline');
    expect(medianBin(sum.lat)).toBe(0);
  });

  it('survives a round trip through storage', () => {
    const h = emptyHistory();
    addSample(h, { ...sample(T0, 'ok', 700), bytes: 20_000 });
    noteVerdict(h, T0, 'slow');
    noteTransition(h, T0, false);
    const back = deserialize(serialize(h));
    expect(back).toEqual(h);
  });

  it('reads malformed storage as empty instead of throwing', () => {
    expect(deserialize('not json')).toEqual(emptyHistory());
    expect(deserialize('{"v":9,"b":[],"o":[]}')).toEqual(emptyHistory());
    expect(deserialize('{"v":1,"b":[[1,2]],"o":[]}').buckets).toEqual([]);
    expect(deserialize(null)).toEqual(emptyHistory());
  });

  it('places latencies in bins by their upper edge', () => {
    expect(latencyBin(0)).toBe(0);
    expect(latencyBin(250)).toBe(1);
    expect(latencyBin(99_999)).toBe(5);
    expect(medianBin([0, 0, 0, 0, 0, 0])).toBeNull();
    expect(medianBin([1, 0, 0, 3, 0, 0])).toBe(3);
  });
});
