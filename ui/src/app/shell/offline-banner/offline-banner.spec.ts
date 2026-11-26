import { provideHttpClient, withXhr } from '@angular/common/http';
import { Auth } from '../../platform/session/auth';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { ReadCache } from '../../platform/offline/read-cache';
import { OfflineBanner } from './offline-banner';

describe('OfflineBanner', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    TestBed.configureTestingModule({
      imports: [OfflineBanner],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    await TestBed.compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is absent while the connection works', () => {
    const fixture = TestBed.createComponent(OfflineBanner);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.banner')).toBeNull();
  });

  it('appears when offline, offers a retry and links to details', async () => {
    const meter = TestBed.inject(ConnectionMeter);
    const now = Date.now();
    for (let i = 3; i > 0; i--) {
      meter.record({ at: now - i, ms: 10, outcome: 'unreachable', latency: true, home: true });
    }
    const fixture = TestBed.createComponent(OfflineBanner);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.banner')!.textContent).toContain("You're offline");
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/connection');
    (el.querySelector('button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(meter.lastProbe()?.outcome).toBe('unreachable'));
  });

  it('says when a saved copy stands in for a server that did not answer', () => {
    const cache = TestBed.inject(ReadCache);
    const fixture = TestBed.createComponent(OfflineBanner);
    cache.noteStale('/api/v1/accounts/9/statuses', Date.now() - 2 * 60 * 60_000);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain("Your server didn't answer");
    expect(el.textContent).toContain('2 hours ago');
    expect(el.textContent).toContain('Try again');
    cache.noteStale('/api/v1/accounts/9/statuses', null);
    fixture.detectChanges();
    expect(el.textContent).toContain('saved on this device');
    cache.noteLive('/api/v1/accounts/9/statuses');
    fixture.detectChanges();
    expect(el.querySelector('.banner')).toBeNull();
  });

  it('offers Lite after a couple of slow minutes, and "Not now" hides it', () => {
    TestBed.inject(Auth).setToken('lite-offer');
    const meter = TestBed.inject(ConnectionMeter);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const start = Math.floor(Date.now() / 60_000) * 60_000 + 5_000;
      for (const minute of [0, 1, 2]) {
        vi.setSystemTime(start + minute * 60_000);
        for (let i = 4; i > 0; i--) {
          meter.record({ at: Date.now() - i, ms: 3_000, outcome: 'ok', latency: true, home: true });
        }
      }
      const fixture = TestBed.createComponent(OfflineBanner);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Switch to Lite');
      (
        [...el.querySelectorAll('button')].find((b) =>
          b.textContent!.includes('Not now'),
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Switch to Lite');
    } finally {
      vi.useRealTimers();
    }
  });
});
