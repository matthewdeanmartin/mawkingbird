import { describe, expect, it } from 'vitest';
import {
  HISTORY_BUCKET_MS,
  addSample,
  emptyHistory,
  noteTransition,
  noteVerdict,
} from '../../platform/network/connection-history';
import { ConnectionSample } from '../../platform/network/connection-quality';
import { binLabel, plainReport, summaries, throughputKbps, timeline } from './connection-view';

const NOW = 1_700_000_000_000 - (1_700_000_000_000 % HISTORY_BUCKET_MS) + 30_000;

function sample(minutesAgo: number, outcome: ConnectionSample['outcome'], ms = 300) {
  return {
    at: NOW - minutesAgo * HISTORY_BUCKET_MS,
    ms,
    outcome,
    latency: true,
    home: true,
  } satisfies ConnectionSample;
}

describe('connection view', () => {
  it('lays out an hour as sixty minute columns ending now', () => {
    const h = emptyHistory();
    addSample(h, sample(2, 'unreachable'));
    noteVerdict(h, NOW - 2 * HISTORY_BUCKET_MS, 'flaky');
    addSample(h, sample(0, 'ok'));
    const cols = timeline(h, 'hour', NOW);
    expect(cols.length).toBe(60);
    expect(cols.at(-1)!.requests).toBe(1);
    expect(cols.at(-3)!.failures).toBe(1);
    expect(cols.at(-3)!.worst).toBe('flaky');
  });

  it('groups a day into fifteen-minute columns', () => {
    const h = emptyHistory();
    for (let m = 14; m >= 0; m--) addSample(h, sample(m, 'ok'));
    const cols = timeline(h, 'day', NOW);
    expect(cols.length).toBe(96);
    expect(cols.reduce((n, c) => n + c.requests, 0)).toBe(15);
  });

  it('marks columns the browser spent mostly offline', () => {
    const h = emptyHistory();
    noteTransition(h, NOW - 3 * HISTORY_BUCKET_MS, false);
    noteTransition(h, NOW - HISTORY_BUCKET_MS, true);
    const offline = timeline(h, 'hour', NOW).filter((c) => c.worst === 'offline');
    expect(offline.length).toBeGreaterThanOrEqual(1);
    expect(offline.every((c) => c.offlineShare > 0.5)).toBe(true);
  });

  it('labels latency bins honestly', () => {
    expect(binLabel(null)).toBe('—');
    expect(binLabel(0)).toBe('< 250 ms');
    expect(binLabel(3)).toBe('1 s–2.5 s');
    expect(binLabel(5)).toBe('> 5 s');
  });

  it('reports throughput only with enough bytes', () => {
    const h = emptyHistory();
    addSample(h, { ...sample(0, 'ok', 1000), bytes: 4_000 });
    expect(throughputKbps(summaries(h, NOW)[0].summary)).toBeNull();
    addSample(h, { ...sample(0, 'ok', 1000), bytes: 96_000 });
    expect(throughputKbps(summaries(h, NOW)[0].summary)).toBe(400);
  });

  it('writes a pasteable report without request details', () => {
    const h = emptyHistory();
    addSample(h, sample(1, 'unreachable'));
    const text = plainReport(
      {
        verdict: 'flaky',
        reason: 'many-failures',
        blame: 'connection',
        samples: 5,
        medianMs: 900,
        failureShare: 0.4,
      },
      { online: true, effectiveType: '3g', rttMs: 300 },
      h,
      NOW,
    );
    expect(text).toContain('Verdict:   flaky (many-failures)');
    expect(text).toContain('type=3g');
    expect(text).toContain('Last hour, per minute');
    expect(text).not.toMatch(/api\/v1/);
  });
});
