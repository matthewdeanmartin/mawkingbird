import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMeter } from './connection-meter';
import { DATA_SAVER_KEY, DataSaver } from './data-saver';
import { ConnectionSample } from './connection-quality';

describe('DataSaver', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function record(
    outcome: ConnectionSample['outcome'],
    ms: number,
    count: number,
    at = Date.now(),
  ) {
    const meter = TestBed.inject(ConnectionMeter);
    for (let i = count; i > 0; i--) {
      meter.record({ at: at - i, ms, outcome, latency: true, home: true });
    }
  }

  it('is off on a good connection in automatic mode', () => {
    record('ok', 100, 4);
    expect(TestBed.inject(DataSaver).active()).toBe(false);
  });

  it('never turns itself on, however bad the connection gets', () => {
    record('ok', 30_000, 10);
    expect(TestBed.inject(ConnectionMeter).verdict()).toBe('slow');
    expect(TestBed.inject(DataSaver).active()).toBe(false);
    record('unreachable', 10, 10);
    expect(TestBed.inject(DataSaver).active()).toBe(false);
  });

  it('follows the browser data-saver hint', () => {
    TestBed.inject(ConnectionMeter).hints.set({ online: true, saveData: true });
    expect(TestBed.inject(DataSaver).active()).toBe(true);
  });

  it('honours always and never, and remembers the choice', () => {
    const saver = TestBed.inject(DataSaver);
    saver.setMode('always');
    expect(saver.active()).toBe(true);
    expect(localStorage.getItem(DATA_SAVER_KEY)).toBe('always');
    record('ok', 5_000, 4);
    saver.setMode('never');
    expect(saver.active()).toBe(false);
    saver.setMode('auto');
    expect(localStorage.getItem(DATA_SAVER_KEY)).toBeNull();
  });

  it('skips background polls offline and halves them while saving data', () => {
    const saver = TestBed.inject(DataSaver);
    expect([1, 2, 3, 4].map(() => saver.allowBackground('x'))).toEqual([true, true, true, true]);
    saver.setMode('always');
    expect([1, 2, 3, 4].map(() => saver.allowBackground('y'))).toEqual([false, true, false, true]);
    record('unreachable', 10, 3);
    expect(saver.allowBackground('y')).toBe(false);
  });
});
