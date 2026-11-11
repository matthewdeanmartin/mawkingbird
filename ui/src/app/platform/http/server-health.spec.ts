import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServerHealth } from './server-health';

describe('ServerHealth', () => {
  let httpMock: HttpTestingController;
  let health: ServerHealth;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ServerHealth, provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    health = TestBed.inject(ServerHealth);
  });

  afterEach(() => httpMock.verify());

  it('starts up (not down)', () => {
    expect(health.down()).toBe(false);
    expect(health.checking()).toBe(false);
  });

  it('markDown/markUp toggle the down signal once the threshold is met', () => {
    health.markDown();
    health.markDown();
    expect(health.down()).toBe(true);
    health.markUp();
    expect(health.down()).toBe(false);
  });

  /**
   * Hysteresis. Status 0 is noisy — a wifi handover, a waking laptop, a rate
   * limiter closing a connection — and a single one is not evidence of an
   * outage. Whaling on the first was why the whale showed up constantly.
   */
  it('does not go down on a single failure', () => {
    health.markDown();
    expect(health.down()).toBe(false);
  });

  it('forgets failures that are too old to corroborate each other', () => {
    const start = Date.now();
    health.markDown(undefined, start);
    // Well past FAILURE_WINDOW_MS: unrelated blips minutes apart are not an outage.
    health.markDown(undefined, start + 60_000);
    expect(health.down()).toBe(false);
  });

  it('lets a success reset the count, so old blips cannot combine with new ones', () => {
    health.markDown();
    health.markUp();
    health.markDown();
    expect(health.down()).toBe(false);
  });

  it('still records the failure for the diagnostics box before it goes down', () => {
    // The evidence is worth keeping even when the whale is being withheld: if the
    // second failure arrives, the box should describe the *first*.
    health.markDown(
      new HttpErrorResponse({ status: 0, url: 'https://mastodon.social/api/v1/timelines/home' }),
    );
    expect(health.down()).toBe(false);
    expect(health.failure()?.url).toContain('/api/v1/timelines/home');
  });

  it('recheck() pings /api/v2/instance and clears down on success', () => {
    health.markDown();

    health.recheck();
    expect(health.checking()).toBe(true);

    httpMock.expectOne('/api/v2/instance').flush({ domain: 'x' });

    expect(health.down()).toBe(false);
    expect(health.checking()).toBe(false);
  });

  it('recheck() leaves the server down when the ping fails', () => {
    health.markDown();

    health.recheck();
    httpMock.expectOne('/api/v2/instance').error(new ProgressEvent('error'), { status: 0 });

    expect(health.down()).toBe(true);
    expect(health.checking()).toBe(false);
  });

  it('recheck() ignores a second call while one is in flight', () => {
    health.markDown();
    health.recheck();
    health.recheck(); // should be a no-op; only one request outstanding

    const req = httpMock.expectOne('/api/v2/instance');
    req.flush({ domain: 'x' });
    expect(health.down()).toBe(false);
  });
});
