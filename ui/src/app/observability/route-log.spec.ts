import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteLog, formatDuration } from './route-log';

const STORAGE_KEY = 'mockingbird_route_log';

/** A Router stand-in whose event stream the spec drives by hand. */
class FakeRouter {
  readonly events = new Subject<NavigationEnd>();

  navigate(url: string): void {
    this.events.next(new NavigationEnd(1, url, url));
  }
}

describe('formatDuration', () => {
  it('scales from seconds to hours', () => {
    expect(formatDuration(4_000)).toBe('4s');
    expect(formatDuration(130_000)).toBe('2m 10s');
    expect(formatDuration(3_840_000)).toBe('1h 04m');
  });
});

describe('RouteLog', () => {
  let log: RouteLog;
  let router: FakeRouter;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    router = new FakeRouter();
    TestBed.configureTestingModule({
      providers: [RouteLog, { provide: Router, useValue: router }],
    });
    log = TestBed.inject(RouteLog);
    log.start();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  function stat(path: string) {
    return log.stats().find((s) => s.path === path);
  }

  it('counts a visit per navigation', () => {
    router.navigate('/home');
    router.navigate('/notifications');
    router.navigate('/home');

    expect(stat('/home')?.visits).toBe(2);
    expect(stat('/notifications')?.visits).toBe(1);
    expect(log.totals().visits).toBe(3);
  });

  it('records route shapes, not identities', () => {
    router.navigate('/accounts/110447291640403778');
    router.navigate('/accounts/999');
    router.navigate('/home?open=pub:someone@example.test');

    expect(stat('/accounts/:id')?.visits).toBe(2);
    expect(stat('/home')?.visits).toBe(1);
    // The raw id must not survive anywhere in the log.
    expect(JSON.stringify(log.stats())).not.toContain('110447291640403778');
  });

  it('credits time spent to the route being left, not the one arrived at', () => {
    router.navigate('/home');
    vi.advanceTimersByTime(5_000);
    router.navigate('/notifications');

    expect(stat('/home')?.totalMs).toBe(5_000);
    expect(stat('/notifications')?.totalMs).toBe(0);
  });

  it('accumulates time across repeat visits', () => {
    router.navigate('/home');
    vi.advanceTimersByTime(3_000);
    router.navigate('/public');
    vi.advanceTimersByTime(1_000);
    router.navigate('/home');
    vi.advanceTimersByTime(2_000);
    log.refresh();

    expect(stat('/home')?.totalMs).toBe(5_000);
    expect(stat('/home')?.visits).toBe(2);
  });

  it('caps one uninterrupted stretch, so a slept machine cannot report a day on one page', () => {
    router.navigate('/home');
    vi.advanceTimersByTime(8 * 60 * 60_000);
    log.refresh();

    expect(stat('/home')?.totalMs).toBe(30 * 60_000);
  });

  it('does not double-count when settled repeatedly', () => {
    router.navigate('/home');
    vi.advanceTimersByTime(2_000);
    log.refresh();
    log.refresh();
    log.refresh();

    expect(stat('/home')?.totalMs).toBe(2_000);
  });

  it('persists and reloads visits and time', () => {
    router.navigate('/home');
    vi.advanceTimersByTime(4_000);
    router.navigate('/public');
    // The debounced flush runs on the timer.
    vi.advanceTimersByTime(2_000);

    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [RouteLog, { provide: Router, useValue: new FakeRouter() }],
    });
    const reloaded = TestBed.inject(RouteLog);

    const home = reloaded.stats().find((s) => s.path === '/home');
    expect(home?.visits).toBe(1);
    expect(home?.totalMs).toBe(4_000);
  });

  it('reset empties the log and the stored blob', () => {
    router.navigate('/home');
    log.reset();

    expect(log.stats()).toEqual([]);
    expect(log.totals().visits).toBe(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').r).toEqual([]);
  });

  it('ignores a corrupt stored blob rather than throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [RouteLog, { provide: Router, useValue: new FakeRouter() }],
    });
    expect(TestBed.inject(RouteLog).stats()).toEqual([]);
  });
});
