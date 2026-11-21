import { describe, expect, it } from 'vitest';
import {
  BrowserHints,
  ConnectionSample,
  OFFLINE_QUIET_MS,
  WINDOW_MS,
  assess,
  isBad,
  median,
} from './connection-quality';

const NOW = 1_000_000_000;
const ONLINE: BrowserHints = { online: true };

function s(
  secondsAgo: number,
  outcome: ConnectionSample['outcome'],
  ms = 200,
  extra: Partial<ConnectionSample> = {},
): ConnectionSample {
  return { at: NOW - secondsAgo * 1000, ms, outcome, latency: true, home: true, ...extra };
}

describe('assess', () => {
  it('is unknown with too few samples', () => {
    const a = assess([s(5, 'ok'), s(4, 'ok')], ONLINE, NOW);
    expect(a.verdict).toBe('unknown');
    expect(a.reason).toBe('too-few-samples');
  });

  it('is good when recent reads are quick and answered', () => {
    const a = assess([s(9, 'ok'), s(6, 'ok'), s(3, 'ok'), s(1, 'ok')], ONLINE, NOW);
    expect(a.verdict).toBe('good');
    expect(a.medianMs).toBe(200);
    expect(a.blame).toBeNull();
  });

  it('trusts the browser when it says offline, even with good samples', () => {
    const a = assess([s(3, 'ok'), s(2, 'ok'), s(1, 'ok')], { online: false }, NOW);
    expect(a.verdict).toBe('offline');
    expect(a.reason).toBe('browser-offline');
  });

  it('is offline when the last requests never arrived and nothing answered lately', () => {
    const quiet = OFFLINE_QUIET_MS / 1000 + 5;
    const a = assess(
      [s(quiet, 'ok'), s(20, 'unreachable'), s(10, 'unreachable'), s(2, 'unreachable')],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('offline');
    expect(a.reason).toBe('nothing-gets-through');
  });

  it('is flaky, not offline, while answers still arrive between failures', () => {
    const a = assess(
      [s(12, 'ok'), s(10, 'unreachable'), s(8, 'ok'), s(5, 'unreachable'), s(2, 'ok')],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('flaky');
    expect(a.failureShare).toBeCloseTo(0.4);
    expect(a.blame).toBe('connection');
  });

  it('counts long abandoned waits as failures', () => {
    const a = assess(
      [s(20, 'ok'), s(15, 'abandoned', 9000), s(10, 'ok'), s(5, 'ok'), s(1, 'ok')],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('flaky');
  });

  it('treats a 5xx as evidence the network works', () => {
    const a = assess(
      [s(9, 'answered-error'), s(7, 'answered-error'), s(5, 'ok'), s(3, 'ok'), s(1, 'ok')],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('good');
  });

  it('is slow when ordinary reads have a high median', () => {
    const a = assess(
      [s(9, 'ok', 2000), s(7, 'ok', 2500), s(5, 'ok', 1800), s(3, 'ok', 300)],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('slow');
    expect(a.reason).toBe('slow-responses');
  });

  it('keeps slow-by-design endpoints out of the median', () => {
    const slowSearch = { latency: false };
    const a = assess(
      [
        s(9, 'ok', 4000, slowSearch),
        s(8, 'ok', 4000, slowSearch),
        s(7, 'ok', 4000, slowSearch),
        s(5, 'ok', 150),
        s(3, 'ok', 150),
        s(2, 'ok', 150),
        s(1, 'ok', 150),
      ],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('good');
    expect(a.medianMs).toBe(150);
  });

  it('is slow when the browser estimates 2G, even before samples arrive', () => {
    const a = assess([], { online: true, effectiveType: '2g' }, NOW);
    expect(a.verdict).toBe('slow');
    expect(a.reason).toBe('browser-reports-slow');
  });

  it('blames the server when it fails while other hosts answer', () => {
    const elsewhere = { home: false, latency: false };
    const a = assess(
      [
        s(20, 'unreachable'),
        s(15, 'ok', 100, elsewhere),
        s(10, 'unreachable'),
        s(5, 'ok', 100, elsewhere),
        s(2, 'unreachable'),
        s(1, 'ok', 100, elsewhere),
      ],
      ONLINE,
      NOW,
    );
    expect(a.blame).toBe('server');
    // The connection itself carried the other hosts' replies.
    expect(a.verdict).toBe('good');
  });

  it('ignores samples older than the window', () => {
    const old = WINDOW_MS / 1000 + 10;
    const a = assess(
      [s(old, 'unreachable'), s(old, 'unreachable'), s(old, 'unreachable'), s(old, 'unreachable')],
      ONLINE,
      NOW,
    );
    expect(a.verdict).toBe('unknown');
    expect(a.samples).toBe(0);
  });
});

describe('helpers', () => {
  it('computes medians for odd and even lengths', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('flags only the bad verdicts', () => {
    expect(['unknown', 'good', 'slow', 'flaky', 'offline'].map((v) => isBad(v as never))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});
