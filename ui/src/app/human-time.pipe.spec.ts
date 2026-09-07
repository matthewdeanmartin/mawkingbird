import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HumanTimePipe } from './human-time.pipe';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SupportedLocale, UiLocale } from './i18n/locale';

/**
 * The pipe's tiers, pinned against a fixed "now" so old posts can never leak
 * through as a bare clock time (the "post from 2006 shows as 9:00 AM" bug).
 */
describe('HumanTimePipe', () => {
  let pipe: HumanTimePipe;
  const active = signal<SupportedLocale>('en');
  // Local time, mid-afternoon, so "earlier today" fits both <12h and >12h paths.
  const now = new Date(2026, 6, 15, 15, 0, 0); // Jul 15 2026, 3:00 PM

  beforeEach(() => {
    active.set('en');
    TestBed.configureTestingModule({ providers: [{ provide: UiLocale, useValue: { active } }] });
    pipe = TestBed.runInInjectionContext(() => new HumanTimePipe());
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function at(date: Date): string {
    return pipe.transform(date.toISOString());
  }

  it('shows seconds ago under a minute', () => {
    expect(at(new Date(now.getTime() - 30_000))).toBe('30 seconds ago');
  });

  it('shows minutes ago under an hour', () => {
    expect(at(new Date(now.getTime() - 5 * 60_000))).toBe('5 minutes ago');
  });

  it('shows hours ago under twelve hours', () => {
    expect(at(new Date(now.getTime() - 3 * 3600_000))).toBe('3 hours ago');
  });

  it('shows a clock time for earlier today (beyond twelve hours)', () => {
    const earlyToday = new Date(2026, 6, 15, 1, 30);
    expect(at(earlyToday)).toMatch(/1:30/);
  });

  it('shows "yesterday" for yesterday', () => {
    expect(at(new Date(2026, 6, 14, 9, 0))).toBe('yesterday');
  });

  it('shows month + day (no year) for older posts this year', () => {
    const result = at(new Date(2026, 2, 3, 9, 0));
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/3/);
    expect(result).not.toMatch(/2026/);
  });

  it('shows month + day + year for previous years (not a clock time)', () => {
    const result = at(new Date(2006, 2, 3, 9, 0));
    expect(result).toMatch(/2006/);
    expect(result).not.toMatch(/9:00/);
  });

  it('returns empty string for garbage input', () => {
    expect(pipe.transform('not-a-date')).toBe('');
  });

  it('follows live UI locale changes for relative and calendar times', () => {
    const recent = new Date(now.getTime() - 5 * 60_000);
    expect(at(recent)).toBe('5 minutes ago');
    active.set('zh-Hant');
    expect(at(recent)).toBe(new Intl.RelativeTimeFormat('zh-Hant').format(-5, 'minute'));
    expect(at(new Date(2026, 6, 14, 9, 0))).toBe('昨天');
    const old = new Date(2006, 2, 3, 9, 0);
    expect(at(old)).toBe(
      old.toLocaleDateString('zh-Hant', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );
    active.set('en');
    expect(at(recent)).toBe('5 minutes ago');
  });
});
