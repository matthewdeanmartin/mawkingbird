import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ServerDegradation } from './server-degradation';

describe('ServerDegradation', () => {
  let degraded: ServerDegradation;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    degraded = TestBed.inject(ServerDegradation);
  });

  it('starts with nothing degraded', () => {
    expect(degraded.degraded()).toEqual([]);
  });

  it('tracks roles independently — a dead search index leaves tags alone', () => {
    degraded.markDown('search');
    expect(degraded.isDegraded('search')).toBe(true);
    expect(degraded.isDegraded('tag')).toBe(false);
  });

  it('clears a role when it answers again', () => {
    degraded.markDown('tag');
    degraded.markUp('tag');
    expect(degraded.isDegraded('tag')).toBe(false);
  });

  /**
   * An anonymous feed reads dozens of other people's instances per refresh. One
   * being blocked, rate-limited or simply gone is ordinary weather, and turning
   * that into a visible fault would mean a permanent warning for everyone.
   */
  it('never records a peer instance as a degraded capability', () => {
    degraded.markDown('peer');
    expect(degraded.degraded()).toEqual([]);
  });

  /** Home has its own service; recording it here would double-report an outage. */
  it('leaves the home role to ServerHealth', () => {
    degraded.markDown('home');
    expect(degraded.isDegraded('home')).toBe(false);
  });

  it('keeps the first failure rather than churning on every retry', () => {
    degraded.markDown('search');
    const first = degraded.degraded()[0].at;
    degraded.markDown('search');
    expect(degraded.degraded()[0].at).toBe(first);
  });

  it('forgets everything on reset, for an account or instance switch', () => {
    degraded.markDown('search');
    degraded.markDown('tag');
    degraded.reset();
    expect(degraded.degraded()).toEqual([]);
  });
});
