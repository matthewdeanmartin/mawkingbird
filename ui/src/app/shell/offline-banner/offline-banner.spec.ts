import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { OfflineBanner } from './offline-banner';

describe('OfflineBanner', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    TestBed.configureTestingModule({
      imports: [OfflineBanner],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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
});
