import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryWindow, DISCOVERY_WINDOW_KEY } from './discovery-window';
import {
  isDiscoveryPath,
  minutesLeft,
  nextDayReset,
  normalizeUntil,
  windowEnd,
} from './discovery-window-model';
import { discoveryWindowGuard, safeNext } from './discovery-guard';
import { DiscoveryClosed } from './discovery-closed/discovery-closed';
import { Wellness } from './wellness';
import { RailWidgets } from '../shell/rail-widgets';

describe('discovery window model', () => {
  it('knows which paths are discovery', () => {
    for (const path of [
      '/explore',
      '/explore/tags?x=1',
      '/algo',
      '/algo/',
      '/for-you',
      '/public?local=true',
      '/feeds/servers/example.social/local',
    ]) {
      expect(isDiscoveryPath(path)).toBe(true);
    }
    for (const path of [
      '/home',
      '/algo/catch-up',
      '/algo/people',
      '/feeds',
      '/feeds/servers',
      '/feeds/servers/x',
    ]) {
      expect(isDiscoveryPath(path)).toBe(false);
    }
  });

  it('a minute window ends that many minutes later; "no limit" ends at the next 4am', () => {
    const now = new Date(2026, 10, 20, 22, 30).getTime();
    expect(windowEnd(20, now)).toBe(now + 20 * 60_000);
    expect(new Date(windowEnd('day', now))).toEqual(new Date(2026, 10, 21, 4, 0));
    const early = new Date(2026, 10, 20, 2, 0).getTime();
    expect(new Date(nextDayReset(early))).toEqual(new Date(2026, 10, 20, 4, 0));
  });

  it('rounds minutes left up and never below zero', () => {
    expect(minutesLeft(61_000, 0)).toBe(2);
    expect(minutesLeft(0, 5_000)).toBe(0);
    expect(normalizeUntil('soon')).toBe(0);
  });

  it('only follows same-app paths after opening', () => {
    expect(safeNext('/explore')).toBe('/explore');
    expect(safeNext('//evil.example')).toBe('/home');
    expect(safeNext('https://evil.example')).toBe('/home');
    expect(safeNext(null)).toBe('/home');
  });
});

describe('DiscoveryWindow', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => vi.useRealTimers());

  function guard(url: string): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => discoveryWindowGuard({} as never, { url } as never) as boolean | UrlTree,
    );
  }

  it('is open when Wellness does not use windows', () => {
    expect(TestBed.inject(DiscoveryWindow).open()).toBe(true);
    expect(guard('/explore')).toBe(true);
  });

  it('with windows on, a closed route lands on the closed page carrying next', () => {
    TestBed.inject(Wellness).set('discoveryWindows', true);
    const result = guard('/public?local=true');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/discovery-closed?next=%2Fpublic%3Flocal%3Dtrue',
    );
  });

  it('opening a window lets discovery through until it ends, and persists per device', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 20, 12, 0) });
    TestBed.inject(Wellness).set('discoveryWindows', true);
    const window = TestBed.inject(DiscoveryWindow);
    window.openFor(10);
    expect(guard('/explore')).toBe(true);
    expect(JSON.parse(localStorage.getItem(DISCOVERY_WINDOW_KEY)!)).toBe(Date.now() + 600_000);
    vi.setSystemTime(new Date(2026, 10, 20, 12, 11));
    expect(guard('/explore')).toBeInstanceOf(UrlTree);
  });

  it('closing early closes', () => {
    TestBed.inject(Wellness).set('discoveryWindows', true);
    const window = TestBed.inject(DiscoveryWindow);
    window.openFor(45);
    window.close();
    expect(window.open()).toBe(false);
  });

  it('hides trend widgets in the rails while closed, and only those', () => {
    TestBed.inject(Wellness).set('discoveryWindows', true);
    const rails = TestBed.inject(RailWidgets);
    expect(rails.shows('trends')).toBe(false);
    expect(rails.shows('houseAds')).toBe(true);
    TestBed.inject(DiscoveryWindow).openFor(10);
    expect(rails.shows('trends')).toBe(true);
  });

  it('the closed page opens with one tap and continues to next', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(Wellness).set('discoveryWindows', true);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(DiscoveryClosed);
    fixture.detectChanges();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    expect([...buttons].map((b) => b.dataset['length'])).toEqual(['10', '20', '45', 'day']);
    buttons[1].click();
    expect(TestBed.inject(DiscoveryWindow).running()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/home');
  });
});
