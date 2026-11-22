import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILD_RUNTIME_POLICY, RUNTIME_POLICY } from '../build/runtime-policy';
import { UpdateRecovery } from '../build/update-recovery';
import { ConnectionMeter } from '../network/connection-meter';
import { OFFLINE_APP_KEY, OfflineApp } from './offline-app';

describe('OfflineApp', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is never supported on a build without a service worker (Native)', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RUNTIME_POLICY, useValue: { ...BUILD_RUNTIME_POLICY, serviceWorker: false } },
      ],
    });
    const app = TestBed.inject(OfflineApp);
    expect(app.supported).toBe(false);
    app.start();
    expect(app.stats()).toBeNull();
  });

  it('remembers that the reader removed the offline copy', async () => {
    TestBed.configureTestingModule({});
    const app = TestBed.inject(OfflineApp);
    expect(app.enabled()).toBe(true);
    await app.remove();
    expect(localStorage.getItem(OFFLINE_APP_KEY)).toBe('off');
    expect(app.enabled()).toBe(false);
    await app.allow();
    expect(localStorage.getItem(OFFLINE_APP_KEY)).toBeNull();
    expect(app.enabled()).toBe(true);
  });
});

describe('UpdateRecovery while offline', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('explains an unsaved screen instead of reloading for a deploy', () => {
    TestBed.configureTestingModule({});
    const meter = TestBed.inject(ConnectionMeter);
    meter.hints.set({ online: false });
    const recovery = TestBed.inject(UpdateRecovery);
    const handled = recovery.recover(new Error('Failed to fetch dynamically imported module'));
    expect(handled).toBe(true);
    expect(recovery.unavailableOffline()).toBe(true);
    // `updating` is what schedules the reload; it must stay off.
    expect(recovery.updating()).toBe(false);
  });
});
