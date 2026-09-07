import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RemoteStorageUsage } from './remote-storage-usage';

const KEY = 'mockingbird_remote_storage_usage';

describe('RemoteStorageUsage', () => {
  let usage: RemoteStorageUsage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [RemoteStorageUsage] });
    usage = TestBed.inject(RemoteStorageUsage);
  });

  afterEach(() => localStorage.clear());

  it('starts empty, rather than claiming a figure it has never seen', () => {
    expect(usage.usage()).toBeNull();
    expect(usage.ratio()).toBeNull();
  });

  it('banks a quota reading with the tier it was taken under', () => {
    usage.record({ used: 25, limit: 100 }, 'paid');
    expect(usage.usage()?.used).toBe(25);
    expect(usage.usage()?.limit).toBe(100);
    expect(usage.usage()?.tier).toBe('paid');
    expect(usage.ratio()).toBe(0.25);
  });

  it('reports a ratio of zero for an empty account, not null', () => {
    // A real reading that happens to be empty; the page draws an empty bar
    // rather than hiding the bar entirely.
    usage.record({ used: 0, limit: 100 }, 'free');
    expect(usage.ratio()).toBe(0);
  });

  it('clamps a drifted counter that exceeds the allowance', () => {
    // The service's counter is eventually consistent and can overshoot; a bar
    // wider than its track would be a rendering bug, not a finding.
    usage.record({ used: 150, limit: 100 }, 'free');
    expect(usage.ratio()).toBe(1);
  });

  it('reports no ratio when the allowance is unknown', () => {
    usage.record({ used: 10, limit: 0 }, 'free');
    expect(usage.ratio()).toBeNull();
  });

  it('persists across a page load, so a signed-out visit is not blank', () => {
    usage.record({ used: 42, limit: 100 }, 'paid');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [RemoteStorageUsage] });
    const reloaded = TestBed.inject(RemoteStorageUsage);

    expect(reloaded.usage()?.used).toBe(42);
    expect(reloaded.usage()?.tier).toBe('paid');
    expect(reloaded.usage()?.at).toBeGreaterThan(0);
  });

  it('ignores a corrupt stored blob rather than throwing', () => {
    localStorage.setItem(KEY, '{ not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [RemoteStorageUsage] });
    expect(TestBed.inject(RemoteStorageUsage).usage()).toBeNull();
  });

  it('ignores a stored blob missing the numbers it exists to hold', () => {
    localStorage.setItem(KEY, JSON.stringify({ tier: 'paid' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [RemoteStorageUsage] });
    expect(TestBed.inject(RemoteStorageUsage).usage()).toBeNull();
  });

  it('reset forgets the figure and the stored copy', () => {
    usage.record({ used: 42, limit: 100 }, 'paid');
    usage.reset();
    expect(usage.usage()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
