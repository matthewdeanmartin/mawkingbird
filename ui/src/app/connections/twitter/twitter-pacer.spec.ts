import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TwitterApiError } from './twitter-errors';
import { FAST_DELAY_MS, MAX_DELAY_MS, SPEEDUP_AFTER, TwitterPacer } from './twitter-pacer';

const rateLimit = (retryAfterMs?: number) =>
  new TwitterApiError('RATE_LIMITED', 'slow down', 'twitterapi-io', 429, retryAfterMs);

describe('TwitterPacer', () => {
  let pacer: TwitterPacer;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    pacer = TestBed.inject(TwitterPacer);
  });

  it('starts fast rather than assuming the slowest plan', () => {
    // The pace was hardcoded to the free tier's one-request-per-five-seconds.
    // Measured 2026-08-01 on a paid balance: twenty back-to-back requests all
    // returned 200, so that constant would have made a 200-account import take
    // seventeen minutes of work that finishes in seconds.
    expect(pacer.delayMs()).toBe(FAST_DELAY_MS);
    expect(pacer.throttled()).toBe(false);
  });

  it('backs off when the service refuses, and says so', () => {
    expect(pacer.noteFailure(rateLimit())).toBe(true);
    expect(pacer.delayMs()).toBeGreaterThan(FAST_DELAY_MS);
    expect(pacer.throttled()).toBe(true);
  });

  it('obeys Retry-After over its own guess', () => {
    // The service telling us how long to wait beats anything we would invent.
    pacer.noteFailure(rateLimit(3_000));
    expect(pacer.delayMs()).toBe(3_000);
  });

  it('never waits longer than the ceiling, however many refusals', () => {
    for (let i = 0; i < 20; i++) {
      pacer.noteFailure(rateLimit());
    }
    expect(pacer.delayMs()).toBe(MAX_DELAY_MS);
  });

  it('caps an absurd Retry-After rather than stalling for an hour', () => {
    pacer.noteFailure(rateLimit(3_600_000));
    expect(pacer.delayMs()).toBe(MAX_DELAY_MS);
  });

  it('ignores failures that are not rate limits', () => {
    // A 404 says nothing about pace; slowing down for one would punish an
    // import for containing a deleted account.
    const notFound = new TwitterApiError('USER_NOT_FOUND', 'gone', 'twitterapi-io', 404);
    expect(pacer.noteFailure(notFound)).toBe(false);
    expect(pacer.delayMs()).toBe(FAST_DELAY_MS);
    expect(pacer.throttled()).toBe(false);
  });

  it('eases back up after a clean streak', () => {
    pacer.noteFailure(rateLimit());
    const slowed = pacer.delayMs();
    for (let i = 0; i < SPEEDUP_AFTER; i++) {
      pacer.noteSuccess();
    }
    expect(pacer.delayMs()).toBeLessThan(slowed);
  });

  it('does not snap straight back to full speed', () => {
    // Returning to the opening pace immediately after being throttled just
    // earns another refusal.
    for (let i = 0; i < 6; i++) {
      pacer.noteFailure(rateLimit());
    }
    for (let i = 0; i < SPEEDUP_AFTER; i++) {
      pacer.noteSuccess();
    }
    expect(pacer.delayMs()).toBeGreaterThan(FAST_DELAY_MS);
  });

  it('uses a remaining-quota header when one ever appears', () => {
    // This service sends no rate-limit headers today. Written to use them the
    // moment it does, rather than depending on them.
    pacer.noteSuccess({ remaining: 0, resetSeconds: 4 });
    expect(pacer.delayMs()).toBe(4_000);
  });

  it('reset forgets everything learned, for a fresh batch', () => {
    pacer.noteFailure(rateLimit(9_000));
    pacer.reset();
    expect(pacer.delayMs()).toBe(FAST_DELAY_MS);
    expect(pacer.throttled()).toBe(false);
  });
});
