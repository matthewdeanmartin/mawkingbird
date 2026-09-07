import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { healthInterceptor } from './health.interceptor';
import { externalFetch } from './providers/external-fetch';
import { ServerDegradation } from './server-degradation';
import { ServerHealth } from './server-health';
import { serverRole } from './server-role';

/** Fail the same home-server call twice — the whale needs corroboration now. */
function failTwice(http: HttpClient, httpMock: HttpTestingController, url: string): void {
  for (let i = 0; i < 2; i += 1) {
    http.get(url).subscribe({ error: () => undefined });
    httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
  }
}

describe('healthInterceptor', () => {
  let httpMock: HttpTestingController;
  let health: ServerHealth;
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ServerHealth,
        provideHttpClient(withInterceptors([healthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    health = TestBed.inject(ServerHealth);
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => httpMock.verify());

  it('marks the server down after repeated network errors (status 0)', () => {
    failTwice(http, httpMock, '/api/v1/timelines/home');
    expect(health.down()).toBe(true);
  });

  /**
   * The transient-whale bug. Status 0 is produced by a wifi handover, a laptop
   * waking, a rate limiter closing a connection — none of which is an outage. A
   * real outage keeps failing; a blip does not.
   */
  it('does NOT whale on a single network error', () => {
    http.get('/api/v1/timelines/home').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/v1/timelines/home').error(new ProgressEvent('error'), { status: 0 });
    expect(health.down()).toBe(false);
  });

  it('does NOT mark down on a 5xx — the server answered, so it is reachable', () => {
    // The whale claims "can't reach the server". A 503 disproves that: something
    // replied. Raising it here blanked the app for one failed call and then
    // dismissed itself on the next successful background request.
    http.get('/api/v1/timelines/home').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/timelines/home')
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    expect(health.down()).toBe(false);
  });

  it('a 5xx clears an existing down state like any other answer', () => {
    health.markDown();
    health.markDown();
    http.get('/api/v1/timelines/home').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/timelines/home')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(health.down()).toBe(false);
  });

  it('does NOT mark down on 401 (that means "log in", not "server down")', () => {
    http.get('/api/v1/accounts/verify_credentials').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(health.down()).toBe(false);
  });

  it('does NOT mark down on 403', () => {
    http.get('/api/v1/admin/accounts').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/admin/accounts')
      .flush('forbidden', { status: 403, statusText: 'Forbidden' });
    expect(health.down()).toBe(false);
  });

  it('does NOT mark down on 404', () => {
    http.get('/api/v1/statuses/nope').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/statuses/nope')
      .flush('not found', { status: 404, statusText: 'Not Found' });
    expect(health.down()).toBe(false);
  });

  it('does not whale on a 5xx for a user action, which reports itself inline', () => {
    // The reported bug: one failed list add blanked the app with a full-screen
    // "can't reach the server", then dismissed itself when an unrelated
    // background call succeeded — an alarm that vanished before it was read,
    // about a failure that was never actually reported.
    http.post('/api/v1/lists/1/accounts', {}).subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/lists/1/accounts')
      .flush('', { status: 503, statusText: 'Service Unavailable' });
    expect(health.down()).toBe(false);
    expect(health.failure()).toBeNull();
  });

  it('ignores external fetches entirely (a dead RSS feed is not a dead server)', () => {
    http
      .get('https://example.com/feed.xml', { responseType: 'text', context: externalFetch() })
      .subscribe({ error: () => undefined });
    httpMock
      .expectOne('https://example.com/feed.xml')
      .error(new ProgressEvent('error'), { status: 0 });
    expect(health.down()).toBe(false);

    // Nor does a foreign success clear a real down state.
    health.markDown();
    health.markDown();
    http
      .get('https://example.com/feed.xml', { responseType: 'text', context: externalFetch() })
      .subscribe();
    httpMock.expectOne('https://example.com/feed.xml').flush('<rss/>');
    expect(health.down()).toBe(true);
  });

  it('clears a down state when a later request succeeds', () => {
    // First, go down.
    failTwice(http, httpMock, '/api/v1/timelines/home');
    expect(health.down()).toBe(true);

    // A successful response clears it.
    http.get('/api/v2/instance').subscribe();
    httpMock.expectOne('/api/v2/instance').flush({ domain: 'x' });
    expect(health.down()).toBe(false);
  });

  it('clears a down state even when the server answers with a 4xx (it is reachable)', () => {
    health.markDown();
    health.markDown();
    expect(health.down()).toBe(true);

    http.get('/api/v1/statuses/nope').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/v1/statuses/nope')
      .flush('nf', { status: 404, statusText: 'Not Found' });
    expect(health.down()).toBe(false);
  });

  /**
   * Severity tiering. The whale claims "can't reach the server", which is simply
   * false when the timeline is fine and only the emoji list failed — and a
   * full-screen alarm for a decoration is what made the whale read as noise.
   */
  describe('roles', () => {
    let degraded: ServerDegradation;

    beforeEach(() => {
      degraded = TestBed.inject(ServerDegradation);
    });

    it('never whales for a background call, however often it fails', () => {
      for (let i = 0; i < 5; i += 1) {
        http
          .get('/api/v2/instance', { context: serverRole('background') })
          .subscribe({ error: () => undefined });
        httpMock.expectOne('/api/v2/instance').error(new ProgressEvent('error'), { status: 0 });
      }
      expect(health.down()).toBe(false);
    });

    it('degrades search in place rather than blanking the app', () => {
      http
        .get('/api/v2/search', { context: serverRole('search') })
        .subscribe({ error: () => undefined });
      httpMock.expectOne('/api/v2/search').error(new ProgressEvent('error'), { status: 0 });

      expect(health.down()).toBe(false);
      expect(degraded.isDegraded('search')).toBe(true);
    });

    it('recovers a degraded role when it answers again', () => {
      http
        .get('/api/v2/search', { context: serverRole('search') })
        .subscribe({ error: () => undefined });
      httpMock.expectOne('/api/v2/search').error(new ProgressEvent('error'), { status: 0 });
      expect(degraded.isDegraded('search')).toBe(true);

      http.get('/api/v2/search', { context: serverRole('search') }).subscribe();
      httpMock.expectOne('/api/v2/search').flush({ accounts: [] });
      expect(degraded.isDegraded('search')).toBe(false);
    });

    /** Dozens per feed refresh; one being blocked or gone is ordinary weather. */
    it('stays silent about a dead peer instance', () => {
      http
        .get('/api/v1/accounts/1/statuses', { context: serverRole('peer') })
        .subscribe({ error: () => undefined });
      httpMock
        .expectOne('/api/v1/accounts/1/statuses')
        .error(new ProgressEvent('error'), { status: 0 });

      expect(health.down()).toBe(false);
      expect(degraded.degraded()).toEqual([]);
    });

    it('does not let a background success clear a real home outage', () => {
      failTwice(http, httpMock, '/api/v1/timelines/home');
      expect(health.down()).toBe(true);

      http.get('/api/v2/instance', { context: serverRole('background') }).subscribe();
      httpMock.expectOne('/api/v2/instance').flush({ domain: 'x' });

      // The emoji list coming back says nothing about the timeline.
      expect(health.down()).toBe(true);
    });
  });
});
