import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { FeedCapability, TTL_MS } from './feed-capability';

const LOCAL = '/api/v1/timelines/public?local=true';
const TRENDS = '/api/v1/trends/links';

describe('FeedCapability', () => {
  let caps: FeedCapability;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    caps = TestBed.inject(FeedCapability);
    http = TestBed.inject(HttpTestingController);
    // Anonymous is the case that produced the bug: mastodon.social 422s the
    // public timelines without a token.
    TestBed.inject(Auth);
  });

  afterEach(() => {
    localStorage.clear();
    // The TTL test swaps the TestBed mid-run; reset so the next spec file gets
    // a clean one rather than inheriting it.
    TestBed.resetTestingModule();
  });

  /** Answer the one outstanding request for `url`. */
  function answer(url: string, body: string | unknown[], status?: number): void {
    const req = http.expectOne((r) => r.url.includes(url.split('?')[0]));
    if (status) {
      req.flush(body, { status, statusText: 'Refused' });
      return;
    }
    req.flush(body);
  }

  it('hides a feed the server explicitly refuses', async () => {
    const probe = caps.ensure('public-local');
    answer(LOCAL, 'nope', 422);
    expect(await probe).toBe('refused');
    expect(caps.shows('public-local')).toBe(false);
  });

  it('keeps a feed that answers with nothing', async () => {
    // The whole point of separating "empty" from "refused": a server having a
    // quiet morning still has a local timeline, and hiding it would be the same
    // bug pointed the other way.
    const probe = caps.ensure('public-local');
    answer(LOCAL, []);
    expect(await probe).toBe('works');
    expect(caps.shows('public-local')).toBe(true);
  });

  it('keeps a feed that was merely unreachable', async () => {
    const probe = caps.ensure('trending-links');
    answer(TRENDS, 'boom', 500);
    expect(await probe).toBe('unreachable');
    // A server that was down once is not a server without the feature.
    expect(caps.shows('trending-links')).toBe(true);
  });

  it('shows an unasked feed rather than flickering it in', () => {
    expect(caps.peek('trending-tags')).toBe('unknown');
    expect(caps.shows('trending-tags')).toBe(true);
  });

  it('serves a second caller from cache without a second request', async () => {
    const first = caps.ensure('public-local');
    answer(LOCAL, [], 200);
    await first;

    expect(await caps.ensure('public-local')).toBe('works');
    http.verify(); // no outstanding request: the answer came from cache
  });

  it('re-probes once the cached answer is older than the TTL', async () => {
    const first = caps.ensure('public-local');
    answer(LOCAL, 'nope', 422);
    await first;

    // Age the stored entry past its TTL, as a returning visitor would. The
    // service reads localStorage at construction, so a new TestBed is how a
    // later session is simulated — the same instance still holds the fresh
    // timestamp it just wrote.
    const raw = JSON.parse(localStorage.getItem('mockingbird_feed_capability_v1') ?? '{}');
    for (const key of Object.keys(raw)) {
      raw[key].checkedAt = Date.now() - TTL_MS - 1;
    }
    localStorage.setItem('mockingbird_feed_capability_v1', JSON.stringify(raw));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const later = TestBed.inject(FeedCapability);
    http = TestBed.inject(HttpTestingController);

    // Stale-while-revalidate: the old answer comes back immediately...
    expect(await later.ensure('public-local')).toBe('refused');
    // ...and the refresh really was issued.
    answer(LOCAL, []);
  });

  it('forgets everything on reset', async () => {
    const probe = caps.ensure('public-local');
    answer(LOCAL, 'nope', 422);
    await probe;
    expect(caps.shows('public-local')).toBe(false);

    caps.reset();
    expect(caps.peek('public-local')).toBe('unknown');
    expect(localStorage.getItem('mockingbird_feed_capability_v1')).toBeNull();
  });
});
