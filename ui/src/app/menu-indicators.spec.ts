import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuIndicators } from './menu-indicators';
import { Api } from './api';
import { Auth } from './auth';
import { BlueskySession } from './providers/bluesky/bluesky-session';
import { BlueskyApi } from './providers/bluesky/bluesky-api';
import { BlueskyChatApi } from './providers/bluesky/bluesky-chat-api';

describe('top menu indicators', () => {
  let menu: MenuIndicators;
  let rows: { uri: string; reason: string; indexedAt: string; isRead: boolean }[];
  let route: { url: string; events: Subject<unknown> };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 8));
    localStorage.clear();
    rows = [];
    route = { url: '/home', events: new Subject() };
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: route },
        { provide: Auth, useValue: { isAnonymous: false, lacksMastodonToken: true } },
        { provide: Api, useValue: {} },
        { provide: BlueskySession, useValue: { session: signal({ did: 'did:test' }) } },
        { provide: BlueskyApi, useValue: { listNotifications: () => of({ notifications: rows }) } },
        { provide: BlueskyChatApi, useValue: { listConvos: () => of({ convos: [] }) } },
      ],
    });
    menu = TestBed.inject(MenuIndicators);
    menu.start();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function arrive(reason: string): void {
    rows.push({
      uri: `at://${rows.length}`,
      reason,
      indexedAt: new Date().toISOString(),
      isRead: false,
    });
    vi.advanceTimersByTime(60_000);
  }
  it('batches the first reply for five minutes and never lights the ordinary icon for it', () => {
    arrive('reply');
    expect(menu.chat()).toBe(false);
    vi.advanceTimersByTime(299_000);
    expect(menu.chat()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(menu.chat()).toBe(true);
    expect(menu.ordinary()).toBe(false);
  });
  it('waits until 9 am for likes and quotes and acknowledges them on the notification page', () => {
    arrive('like');
    arrive('quote');
    expect(menu.ordinary()).toBe(false);
    expect(menu.chat()).toBe(false);
    vi.setSystemTime(new Date(2026, 8, 7, 9));
    menu.tick();
    expect(menu.ordinary()).toBe(true);
    route.url = '/notifications';
    menu.tick();
    expect(menu.ordinary()).toBe(false);
    route.url = '/home';
    vi.advanceTimersByTime(60_000);
    expect(menu.ordinary()).toBe(false);
  });
  it('suppresses all chat signals while focused in chat without calling any mark-read API', () => {
    route.url = '/conversations';
    arrive('reply');
    vi.advanceTimersByTime(360_000);
    expect(menu.chat()).toBe(false);
    route.url = '/home';
    vi.advanceTimersByTime(360_000);
    expect(menu.chat()).toBe(false);
  });
  it('holds replies overnight and restores their signal at 7 am', () => {
    vi.setSystemTime(new Date(2026, 8, 7, 23));
    arrive('reply');
    vi.advanceTimersByTime(360_000);
    expect(menu.chat()).toBe(false);
    vi.setSystemTime(new Date(2026, 8, 8, 7));
    menu.tick();
    expect(menu.chat()).toBe(true);
  });
  it('retains acknowledgement through service recreation', () => {
    arrive('reply');
    vi.advanceTimersByTime(360_000);
    expect(menu.chat()).toBe(true);
    route.url = '/conversations';
    menu.tick();
    route.url = '/home';
    const next = TestBed.runInInjectionContext(() => new MenuIndicators());
    next.start();
    vi.advanceTimersByTime(360_000);
    expect(next.chat()).toBe(false);
  });
});
