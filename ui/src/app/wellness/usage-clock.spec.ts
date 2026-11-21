import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addActive, breakDue, grayLevel, normalizeUsage, wellnessDay } from './usage-clock-model';
import {
  ACTIVITY_SOURCE,
  ActivitySource,
  NativeActivity,
  USAGE_KEY,
  UsageClock,
} from './usage-clock';
import { BreakReminders } from './break-reminders';
import { Wellness } from './wellness';
import { WellnessTime } from './wellness-time';
import { Auth } from '../platform/session/auth';

describe('usage clock model', () => {
  it('the wellness day turns over at 4am', () => {
    expect(wellnessDay(new Date(2026, 10, 21, 3, 59).getTime())).toBe('2026-11-20');
    expect(wellnessDay(new Date(2026, 10, 21, 4, 0).getTime())).toBe('2026-11-21');
  });

  it('a stored record from another day counts as zero', () => {
    const now = new Date(2026, 10, 21, 12).getTime();
    expect(normalizeUsage({ day: '2026-11-20', ms: 999 }, now)).toEqual({
      day: '2026-11-21',
      ms: 0,
    });
    expect(normalizeUsage({ day: '2026-11-21', ms: 60_000 }, now).ms).toBe(60_000);
    expect(normalizeUsage('junk', now).ms).toBe(0);
  });

  it('caps a single interval so a sleeping laptop banks nothing', () => {
    const now = new Date(2026, 10, 21, 12).getTime();
    expect(addActive({ day: '2026-11-21', ms: 0 }, 8 * 3_600_000, now, 30_000).ms).toBe(30_000);
  });

  it('gray starts at 45 minutes and is complete at 60', () => {
    expect(grayLevel(44)).toBe(0);
    expect(grayLevel(45)).toBe(0);
    expect(grayLevel(52.5)).toBe(0.5);
    expect(grayLevel(60)).toBe(1);
    expect(grayLevel(300)).toBe(1);
  });

  it('breaks: a budget wins, a long sitting suggests, and a recent suggestion waits', () => {
    const base = {
      sittingMinutes: 0,
      budgetMinutes: null,
      todayMinutes: 0,
      budgetStartMinutes: 0,
      minutesSinceLastSuggestion: null,
    };
    expect(breakDue(base)).toBeNull();
    expect(breakDue({ ...base, sittingMinutes: 25 })).toBe('sitting');
    expect(breakDue({ ...base, budgetMinutes: 10, todayMinutes: 30, budgetStartMinutes: 20 })).toBe(
      'budget',
    );
    expect(breakDue({ ...base, sittingMinutes: 90, minutesSinceLastSuggestion: 5 })).toBeNull();
  });
});

class FakeActivity implements ActivitySource {
  readonly kind = 'browser' as const;
  on = true;
  active(): Promise<boolean> {
    return Promise.resolve(this.on);
  }
}

describe('UsageClock and breaks', () => {
  let activity: FakeActivity;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ now: new Date(2026, 10, 21, 12, 0), toFake: ['Date'] });
    activity = new FakeActivity();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ACTIVITY_SOURCE, useValue: activity }],
    });
  });
  afterEach(() => vi.useRealTimers());

  async function advance(clock: UsageClock, minutes: number): Promise<void> {
    for (let i = 0; i < minutes * 4; i++) {
      vi.setSystemTime(Date.now() + 15_000);
      await clock.tick();
    }
  }

  it('counts only active time and persists it per device', async () => {
    const clock = TestBed.inject(UsageClock);
    await advance(clock, 2);
    activity.on = false;
    await advance(clock, 5);
    expect(clock.todayMinutes()).toBe(2);
    expect(JSON.parse(localStorage.getItem(USAGE_KEY)!).ms).toBe(120_000);
  });

  it('auto-grayscale follows the clock only when its switch is on', async () => {
    const clock = TestBed.inject(UsageClock);
    await advance(clock, 50);
    expect(clock.gray()).toBe(0);
    TestBed.inject(Wellness).set('autoGrayscale', true);
    expect(clock.gray()).toBeCloseTo(0.33, 2);
  });

  it('a long sitting suggests a break at the next natural stop, not before', async () => {
    TestBed.inject(Wellness).set('breakReminders', true);
    const clock = TestBed.inject(UsageClock);
    const breaks = TestBed.inject(BreakReminders);
    await advance(clock, 26);
    expect(breaks.suggestion()).toBeNull();
    breaks.naturalStop();
    expect(breaks.suggestion()).toBe('sitting');
    breaks.dismiss();
    breaks.naturalStop();
    expect(breaks.suggestion()).toBeNull();
  });

  it('a check-in budget is honoured even with break reminders off', async () => {
    const clock = TestBed.inject(UsageClock);
    const breaks = TestBed.inject(BreakReminders);
    breaks.setBudget(10);
    await advance(clock, 11);
    breaks.naturalStop();
    expect(breaks.suggestion()).toBe('budget');
  });

  it('Native activity falls back to the browser when the command is missing', async () => {
    const native = new NativeActivity({
      core: { invoke: () => Promise.reject(new Error('unknown command')) },
    });
    expect(typeof (await native.active())).toBe('boolean');
    const idle = new NativeActivity({
      core: { invoke: <T>() => Promise.resolve({ focused: true, idle_seconds: 600 } as T) },
    });
    expect(await idle.active()).toBe(false);
    const unfocused = new NativeActivity({
      core: { invoke: <T>() => Promise.resolve({ focused: false, idle_seconds: null } as T) },
    });
    expect(await unfocused.active()).toBe(false);
    const focusedUnknownIdle = new NativeActivity({
      core: { invoke: <T>() => Promise.resolve({ focused: true, idle_seconds: null } as T) },
    });
    // Fresh page: input counts as recent, so a focused window is active.
    expect(await focusedUnknownIdle.active()).toBe(true);
  });
});

@Component({ template: '' })
class Blank {}

describe('WellnessTime check-in', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'home', component: Blank },
          { path: 'algo/catch-up', component: Blank },
          { path: 'notifications', component: Blank },
          { path: 'posts/:id', component: Blank },
        ]),
        { provide: ACTIVITY_SOURCE, useValue: new FakeActivity() },
      ],
    });
    TestBed.inject(Auth).setToken('reader');
  });

  async function open(url: string): Promise<HTMLElement> {
    TestBed.inject(Wellness).set('checkIn', true);
    const fixture = TestBed.createComponent(WellnessTime);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('asks on opening at the front door, and goes where you choose with a budget', async () => {
    const el = await open('/home');
    const router = TestBed.inject(Router);
    expect(el.querySelector('[data-intent="catchUp"]')).not.toBeNull();
    const select = el.querySelector<HTMLSelectElement>('select[name="check_in_budget"]')!;
    select.value = '20';
    select.dispatchEvent(new Event('change'));
    el.querySelector<HTMLButtonElement>('[data-intent="catchUp"]')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.url).toBe('/algo/catch-up');
    expect(TestBed.inject(BreakReminders).budgetMinutes()).toBe(20);
  });

  it('never interrupts a shared link', async () => {
    const el = await open('/posts/1');
    expect(el.querySelector('[data-intent]')).toBeNull();
  });
});
