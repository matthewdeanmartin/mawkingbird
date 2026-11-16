import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { Streaming } from '../../platform/api/streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import { MenuIndicators } from '../../shell/menu-indicators';
import { compareMastodonIds, MARKER_IDLE_MS, ReadMarkers } from './read-markers';

describe('compareMastodonIds', () => {
  it('orders snowflakes numerically, not as strings', () => {
    expect(compareMastodonIds('10', '9')).toBeGreaterThan(0);
    expect(compareMastodonIds('113000000000000001', '113000000000000002')).toBeLessThan(0);
    expect(compareMastodonIds('42', '42')).toBe(0);
  });

  it('falls back to string order for non-numeric ids', () => {
    expect(compareMastodonIds('b', 'a')).toBeGreaterThan(0);
  });
});

describe('ReadMarkers (parity item 7)', () => {
  let httpMock: HttpTestingController;
  let markers: ReadMarkers;
  let auth: Auth;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(Auth);
    auth.setToken('account-a');
    markers = TestBed.inject(ReadMarkers);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  /** Let the HttpClient promise chain run. */
  async function tick(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it('reads both timelines in one request', async () => {
    const read = markers.refresh();
    const request = httpMock.expectOne((r) => r.url === '/api/v1/markers');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.getAll('timeline[]')).toEqual(['home', 'notifications']);
    request.flush({ home: { last_read_id: '50', version: 1, updated_at: '2026-11-16T00:00:00Z' } });
    expect((await read)?.home?.last_read_id).toBe('50');
    expect(markers.homeMarker()?.last_read_id).toBe('50');
  });

  it('debounces seen posts into one write of the newest, after 5 s of idle', async () => {
    markers.noteHomeSeen('101');
    markers.noteHomeSeen('103');
    markers.noteHomeSeen('102');
    vi.advanceTimersByTime(MARKER_IDLE_MS - 1);
    httpMock.expectNone('/api/v1/markers');
    vi.advanceTimersByTime(1);
    await tick();
    const write = httpMock.expectOne('/api/v1/markers');
    expect(write.request.method).toBe('POST');
    expect(write.request.body).toEqual({ home: { last_read_id: '103' } });
    write.flush({ home: { last_read_id: '103', version: 2, updated_at: '2026-11-16T00:00:00Z' } });
    await tick();
    expect(markers.localHome()).toBe('103');
  });

  it('flushes immediately when the page is hidden', async () => {
    markers.noteHomeSeen('200');
    window.dispatchEvent(new Event('pagehide'));
    await tick();
    httpMock.expectOne('/api/v1/markers').flush({});
  });

  it('never moves the marker backwards', async () => {
    const read = markers.refresh();
    httpMock
      .expectOne((r) => r.url === '/api/v1/markers')
      .flush({ home: { last_read_id: '500', version: 4, updated_at: '2026-11-16T00:00:00Z' } });
    await read;
    markers.noteHomeSeen('499');
    markers.noteHomeSeen('500');
    vi.advanceTimersByTime(MARKER_IDLE_MS);
    await tick();
    httpMock.expectNone('/api/v1/markers');
  });

  it('on 409 re-reads and does not overwrite a newer position from another device', async () => {
    markers.noteHomeSeen('300');
    vi.advanceTimersByTime(MARKER_IDLE_MS);
    await tick();
    httpMock
      .expectOne((r) => r.url === '/api/v1/markers' && r.method === 'POST')
      .flush({}, { status: 409, statusText: 'Conflict' });
    await tick();
    httpMock
      .expectOne((r) => r.url === '/api/v1/markers' && r.method === 'GET')
      .flush({ home: { last_read_id: '350', version: 9, updated_at: '2026-11-16T00:00:00Z' } });
    await tick();
    httpMock.expectNone('/api/v1/markers');
    expect(markers.homeMarker()?.last_read_id).toBe('350');
  });

  it('on 409 writes again once when this device is still ahead', async () => {
    markers.noteHomeSeen('300');
    vi.advanceTimersByTime(MARKER_IDLE_MS);
    await tick();
    httpMock
      .expectOne((r) => r.url === '/api/v1/markers' && r.method === 'POST')
      .flush({}, { status: 409, statusText: 'Conflict' });
    await tick();
    httpMock
      .expectOne((r) => r.url === '/api/v1/markers' && r.method === 'GET')
      .flush({ home: { last_read_id: '250', version: 9, updated_at: '2026-11-16T00:00:00Z' } });
    await tick();
    const retry = httpMock.expectOne((r) => r.url === '/api/v1/markers' && r.method === 'POST');
    expect(retry.request.body).toEqual({ home: { last_read_id: '300' } });
    retry.flush({ home: { last_read_id: '300', version: 10, updated_at: '2026-11-16T00:00:00Z' } });
  });

  it('drops a queued write when the reader switches accounts, and keeps markers apart', async () => {
    const read = markers.refresh();
    httpMock
      .expectOne((r) => r.url === '/api/v1/markers')
      .flush({ home: { last_read_id: '900', version: 1, updated_at: '2026-11-16T00:00:00Z' } });
    await read;
    markers.noteHomeSeen('901');
    auth.setToken('account-b');
    vi.advanceTimersByTime(MARKER_IDLE_MS);
    await tick();
    httpMock.expectNone('/api/v1/markers');
    // Account B sees neither A's server marker nor A's local position.
    expect(markers.homeMarker()).toBeNull();
    expect(markers.localHome()).toBeNull();
  });

  it('writes the notifications marker and passes unread_count to the header indicator', async () => {
    const indicators = TestBed.inject(MenuIndicators);
    const unread = vi.spyOn(indicators, 'noteServerUnread');
    markers.noteNotificationsRead('77');
    vi.advanceTimersByTime(MARKER_IDLE_MS);
    await tick();
    const write = httpMock.expectOne('/api/v1/markers');
    expect(write.request.body).toEqual({ notifications: { last_read_id: '77' } });
    write.flush({
      notifications: {
        last_read_id: '77',
        version: 1,
        updated_at: '2026-11-16T00:00:00Z',
        unread_count: 0,
      },
    });
    await tick();
    expect(unread).toHaveBeenCalledWith('77', 0);
  });

  it('does nothing for the anonymous reader', async () => {
    auth.enterAnonymous();
    expect(await markers.refresh()).toBeNull();
    markers.noteHomeSeen('1');
    vi.advanceTimersByTime(MARKER_IDLE_MS);
    httpMock.expectNone('/api/v1/markers');
  });
});
