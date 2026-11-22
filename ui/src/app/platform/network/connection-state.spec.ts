import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerHealth } from '../http/server-health';
import { ConnectionMeter } from './connection-meter';
import { ConnectionState, failureSurface } from './connection-state';
import {
  NETWORK_PROFILES,
  NETWORK_PROFILE_KEY,
  NetworkSimulator,
  networkSimulatorInterceptor,
  simulatedDrop,
} from './network-simulator';

describe('failureSurface', () => {
  const base = {
    serverDown: false,
    online: true,
    verdict: 'good',
    blame: null,
    canProbe: true,
  } as const;

  it('shows nothing while things work, slow or not', () => {
    expect(failureSurface(base)).toBe('none');
    expect(failureSurface({ ...base, verdict: 'slow' })).toBe('none');
  });

  it('prefers the offline banner over the whale when the connection is down', () => {
    expect(failureSurface({ ...base, online: false, serverDown: true })).toBe('offline');
    expect(failureSurface({ ...base, verdict: 'offline', serverDown: true })).toBe('offline');
  });

  it('checks before blaming the server, then whales once the server is at fault', () => {
    expect(failureSurface({ ...base, serverDown: true, blame: 'connection' })).toBe('checking');
    expect(failureSurface({ ...base, serverDown: true, blame: 'server' })).toBe('whale');
  });

  it('keeps the whale where there is nothing else to probe', () => {
    expect(failureSurface({ ...base, serverDown: true, canProbe: false })).toBe('whale');
  });
});

describe('ConnectionState', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).match(() => true);
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function serverDown(): void {
    const health = TestBed.inject(ServerHealth);
    health.markDown(undefined, Date.now());
    health.markDown(undefined, Date.now());
  }

  it('probes this site when the server stops answering, and whales if the site answers', async () => {
    fetchSpy.mockResolvedValue(new Response('ok'));
    const state = TestBed.inject(ConnectionState);
    const meter = TestBed.inject(ConnectionMeter);
    meter.record({ at: Date.now(), ms: 10, outcome: 'unreachable', latency: true, home: true });
    serverDown();
    TestBed.tick();
    expect(state.surface()).toBe('checking');
    await vi.waitFor(() => expect(state.surface()).toBe('whale'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the offline banner when the site does not answer either', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    const state = TestBed.inject(ConnectionState);
    const meter = TestBed.inject(ConnectionMeter);
    for (let i = 2; i > 0; i--) {
      meter.record({
        at: Date.now() - i,
        ms: 10,
        outcome: 'unreachable',
        latency: true,
        home: true,
      });
    }
    serverDown();
    TestBed.tick();
    await vi.waitFor(() => expect(state.surface()).toBe('offline'));
  });

  it('rechecks the server once when the connection comes back', async () => {
    fetchSpy.mockResolvedValue(new Response('ok'));
    const state = TestBed.inject(ConnectionState);
    const health = TestBed.inject(ServerHealth);
    const recheck = vi.spyOn(health, 'recheck').mockImplementation(() => undefined);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    serverDown();
    TestBed.tick();
    expect(state.surface()).toBe('offline');
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
  });
});

describe('network simulator', () => {
  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('blacks out the first seconds of each minute', () => {
    const blackouts = NETWORK_PROFILES.find((p) => p.id === 'blackouts')!;
    expect(simulatedDrop(blackouts, 60_000 * 7 + 5_000, 0.99)).toBe(true);
    expect(simulatedDrop(blackouts, 60_000 * 7 + 30_000, 0.99)).toBe(false);
  });

  it('drops at the profile rate', () => {
    const flaky = NETWORK_PROFILES.find((p) => p.id === 'flaky')!;
    expect(simulatedDrop(flaky, 30_000, 0.1)).toBe(true);
    expect(simulatedDrop(flaky, 30_000, 0.9)).toBe(false);
  });

  it('remembers the profile for this tab only', () => {
    TestBed.inject(NetworkSimulator).set('slow3g');
    expect(sessionStorage.getItem(NETWORK_PROFILE_KEY)).toBe('slow3g');
    TestBed.inject(NetworkSimulator).set('off');
    expect(sessionStorage.getItem(NETWORK_PROFILE_KEY)).toBeNull();
  });

  it('fails requests as unanswered under the offline profile', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([networkSimulatorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(NetworkSimulator).set('offline');
    vi.useFakeTimers();
    let status: number | null = null;
    TestBed.inject(HttpClient)
      .get('/api/v1/timelines/home')
      .subscribe({ error: (e) => (status = e.status) });
    vi.advanceTimersByTime(1_000);
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/timelines/home');
    expect(status).toBe(0);
  });
});
