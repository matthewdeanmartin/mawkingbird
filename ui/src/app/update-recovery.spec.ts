import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubLocation } from './testing/stub-location';
import { UpdateRecovery } from './update-recovery';

/**
 * These tests exercise the chunk-error detection and the reload-loop guard.
 * `window.location.reload` is stubbed so `recover()` never actually navigates.
 */
describe('UpdateRecovery', () => {
  let recovery: UpdateRecovery;
  let reloadSpy: ReturnType<typeof vi.fn<() => void>>;
  const storageKey = 'mockingbird.update-recovery';

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    reloadSpy = vi.fn();
    // jsdom's location.reload isn't configurable directly; swap the object out.
    stubLocation({ onReload: reloadSpy });
    TestBed.configureTestingModule({ providers: [UpdateRecovery] });
    recovery = TestBed.inject(UpdateRecovery);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isChunkLoadError', () => {
    it('matches Firefox dynamic-import failures', () => {
      expect(
        recovery.isChunkLoadError(new TypeError('error loading dynamically imported module')),
      ).toBe(true);
    });

    it('matches Chromium and Angular chunk messages', () => {
      expect(
        recovery.isChunkLoadError(new Error('Failed to fetch dynamically imported module: x.js')),
      ).toBe(true);
      expect(
        recovery.isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 5 failed' }),
      ).toBe(true);
    });

    it('matches module scripts blocked by a wrong MIME type', () => {
      expect(
        recovery.isChunkLoadError(
          new TypeError(
            'Loading module from “https://example.test/chunk.js” was blocked because of a disallowed MIME type (“text/html”).',
          ),
        ),
      ).toBe(true);
    });

    it('unwraps the reason of a rejected promise', () => {
      expect(
        recovery.isChunkLoadError({ reason: new Error('importing a module script failed') }),
      ).toBe(true);
    });

    it('ignores ordinary application errors', () => {
      expect(recovery.isChunkLoadError(new Error('undefined is not a function'))).toBe(false);
      expect(recovery.isChunkLoadError('some string')).toBe(false);
      expect(recovery.isChunkLoadError(null)).toBe(false);
    });
  });

  describe('recover', () => {
    it('returns false and does nothing for non-chunk errors', () => {
      expect(recovery.recover(new Error('boom'))).toBe(false);
      expect(recovery.updating()).toBe(false);
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('records an attempt and reloads once on a first chunk error', () => {
      expect(recovery.recover(new Error('error loading dynamically imported module'))).toBe(true);
      expect(recovery.updating()).toBe(true);
      expect(sessionStorage.getItem(storageKey)).not.toBeNull();

      vi.advanceTimersByTime(500);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('collapses duplicate reports into a single reload', () => {
      recovery.recover(new Error('error loading dynamically imported module'));
      recovery.recover({ reason: new Error('error loading dynamically imported module') });
      vi.advanceTimersByTime(500);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('does not loop: a repeat failure within the window shows the failed panel', () => {
      // Simulate that we already reloaded moments ago.
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptedAt: Date.now() }));

      expect(recovery.recover(new Error('error loading dynamically imported module'))).toBe(true);
      expect(recovery.failed()).toBe(true);
      expect(recovery.updating()).toBe(false);
      vi.advanceTimersByTime(500);
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('reloads again if the previous attempt is outside the recovery window', () => {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptedAt: Date.now() - 120_000 }));

      expect(recovery.recover(new Error('error loading dynamically imported module'))).toBe(true);
      expect(recovery.failed()).toBe(false);
      expect(recovery.updating()).toBe(true);
    });
  });

  describe('markApplicationStableAfterDelay', () => {
    it('clears the guard after the stabilization period', () => {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptedAt: Date.now() }));
      recovery.markApplicationStableAfterDelay();

      vi.advanceTimersByTime(29_000);
      expect(sessionStorage.getItem(storageKey)).not.toBeNull();

      vi.advanceTimersByTime(2_000);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    });
  });

  describe('retry', () => {
    it('clears the guard, drops the failed state, and reloads', () => {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptedAt: Date.now() }));
      recovery.recover(new Error('error loading dynamically imported module'));
      expect(recovery.failed()).toBe(true);

      recovery.retry();
      expect(recovery.failed()).toBe(false);
      expect(recovery.updating()).toBe(true);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});
