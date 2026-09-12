import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuIndicators } from './menu-indicators';
import { Api } from './api';
import { Auth } from './auth';
import { BlueskySession } from './providers/bluesky/bluesky-session';
import { BlueskyApi } from './providers/bluesky/bluesky-api';
import { BlueskyChatApi } from './providers/bluesky/bluesky-chat-api';
import { IndicatorEvents } from './indicator-events';
import { Streaming, StreamEvent } from './streaming';
import { scopedKey } from './account-scope';

describe('top menu indicators', () => {
  let menu: MenuIndicators;
  let rows: { uri: string; reason: string; indexedAt: string; isRead: boolean }[];
  let route: { url: string; events: Subject<unknown> };
  let events: IndicatorEvents;
  let streams: Map<string, Subject<StreamEvent>>;
  let auth: {
    isAnonymous: boolean;
    lacksMastodonToken: boolean;
    token: () => string;
    account: () => { id: string };
  };
  const fetchNotifications = vi.fn();
  const fetchConversations = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 8));
    localStorage.clear();
    rows = [];
    streams = new Map();
    auth = {
      isAnonymous: false,
      lacksMastodonToken: true,
      token: () => 'test',
      account: () => ({ id: 'self' }),
    };
    fetchNotifications.mockClear();
    fetchConversations.mockClear();
    route = { url: '/home', events: new Subject() };
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: route },
        { provide: Auth, useValue: auth },
        {
          provide: Api,
          useValue: { notifications: fetchNotifications, conversations: fetchConversations },
        },
        {
          provide: Streaming,
          useValue: {
            open: (kind: { stream: string }) => {
              const stream = new Subject<StreamEvent>();
              streams.set(kind.stream, stream);
              return stream;
            },
          },
        },
        { provide: BlueskySession, useValue: { session: signal({ did: 'did:test' }) } },
        { provide: BlueskyApi, useValue: { listNotifications: fetchNotifications } },
        { provide: BlueskyChatApi, useValue: { listConvos: fetchConversations } },
      ],
    });
    menu = TestBed.inject(MenuIndicators);
    events = TestBed.inject(IndicatorEvents);
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
    const row = rows.at(-1)!;
    events.received.next({
      did: 'did:test',
      id: row.uri,
      lane: reason === 'reply' ? 'chat' : 'ordinary',
      at: row.indexedAt,
      unread: !row.isRead,
    });
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

  it('uses push for Mastodon and makes no badge API requests while idle or hidden', () => {
    auth.lacksMastodonToken = false;
    menu.tick();
    menu.start();
    expect([...streams.keys()]).toEqual(['user:notification', 'direct']);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.advanceTimersByTime(3 * 60 * 60_000);
    expect(fetchNotifications).not.toHaveBeenCalled();
    expect(fetchConversations).not.toHaveBeenCalled();
    expect(menu.ordinary()).toBe(false);
    expect(menu.chat()).toBe(false);
  });

  it('delivers a pushed mention once, then suppresses reconnect replays after acknowledgement', () => {
    auth.lacksMastodonToken = false;
    menu.tick();
    const event = {
      event: 'notification',
      payload: {
        id: 'mention',
        type: 'mention',
        created_at: new Date().toISOString(),
        status: { in_reply_to_id: 'parent', visibility: 'public' },
      },
    };
    streams.get('user:notification')!.next(event);
    vi.advanceTimersByTime(5 * 60_000);
    expect(menu.chat()).toBe(true);
    route.url = '/conversations';
    menu.tick();
    route.url = '/home';
    streams.get('user:notification')!.next(event);
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(false);
    expect(fetchNotifications).not.toHaveBeenCalled();
  });

  it('does not light for recent Bluesky notifications that are already read', () => {
    events.received.next({
      did: 'did:test',
      id: 'read',
      lane: 'chat',
      at: new Date().toISOString(),
      unread: false,
    });
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(false);
  });

  it('clears a pending signal when its message is reported read', () => {
    arrive('reply');
    events.received.next({
      did: 'did:test',
      id: rows[0].uri,
      lane: 'chat',
      at: rows[0].indexedAt,
      unread: false,
    });
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(false);
  });

  it('keeps another unread message pending when one message is read', () => {
    arrive('reply');
    arrive('reply');
    events.received.next({
      did: 'did:test',
      id: rows[0].uri,
      lane: 'chat',
      at: rows[0].indexedAt,
      unread: false,
    });
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(true);
  });

  it('clears all pending messages in a conversation when it is read elsewhere', () => {
    const at = new Date().toISOString();
    for (const id of ['first', 'last']) {
      events.received.next({
        did: 'did:test',
        id,
        group: 'conversation',
        lane: 'chat',
        at,
        unread: true,
      });
    }
    vi.advanceTimersByTime(5 * 60_000);
    expect(menu.chat()).toBe(true);
    events.received.next({
      did: 'did:test',
      id: 'last',
      group: 'conversation',
      lane: 'chat',
      at,
      unread: false,
    });
    expect(menu.chat()).toBe(false);
  });

  it('accepts acknowledgement from another tab without relighting the same event', () => {
    arrive('reply');
    vi.advanceTimersByTime(5 * 60_000);
    expect(menu.chat()).toBe(true);
    const key = scopedKey('mockingbird_menu_indicator_state');
    const acknowledged = JSON.parse(localStorage.getItem(key)!);
    acknowledged.pending = {};
    acknowledged.groups = {};
    acknowledged.lit.chat = false;
    acknowledged.since.chat = null;
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: JSON.stringify(acknowledged) }),
    );
    expect(menu.chat()).toBe(false);
    events.received.next({
      did: 'did:test',
      id: rows[0].uri,
      lane: 'chat',
      at: rows[0].indexedAt,
      unread: true,
    });
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(false);
  });

  it('ignores old, foreign-account, and anonymous observations', () => {
    events.received.next({
      did: 'did:test',
      id: 'old',
      lane: 'chat',
      at: new Date(2020, 0, 1).toISOString(),
      unread: true,
    });
    events.received.next({
      did: 'did:other',
      id: 'foreign',
      lane: 'chat',
      at: new Date().toISOString(),
      unread: true,
    });
    auth.isAnonymous = true;
    arrive('reply');
    auth.isAnonymous = false;
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(false);
  });

  it('closes streams when the user logs out and on destruction', () => {
    auth.lacksMastodonToken = false;
    menu.tick();
    const old = streams.get('direct')!;
    expect(old.observed).toBe(true);
    auth.lacksMastodonToken = true;
    menu.tick();
    expect(old.observed).toBe(false);
    auth.lacksMastodonToken = false;
    menu.tick();
    const next = streams.get('direct')!;
    expect(next.observed).toBe(true);
    TestBed.resetTestingModule();
    expect(next.observed).toBe(false);
  });

  it('ignores outgoing and read direct messages and clears a dot on a read update', () => {
    auth.lacksMastodonToken = false;
    menu.tick();
    const dm = streams.get('direct')!;
    const at = new Date().toISOString();
    dm.next({
      event: 'conversation',
      payload: {
        unread: true,
        last_status: { id: 'self', account: { id: 'self' }, created_at: at },
      },
    });
    dm.next({
      event: 'conversation',
      payload: {
        unread: false,
        last_status: { id: 'read', account: { id: 'friend' }, created_at: at },
      },
    });
    vi.advanceTimersByTime(6 * 60_000);
    expect(menu.chat()).toBe(false);
    const incoming = {
      id: 'incoming',
      account: { id: 'friend' },
      created_at: new Date().toISOString(),
    };
    dm.next({ event: 'conversation', payload: { unread: true, last_status: incoming } });
    vi.advanceTimersByTime(5 * 60_000);
    expect(menu.chat()).toBe(true);
    dm.next({ event: 'conversation', payload: { unread: false, last_status: incoming } });
    expect(menu.chat()).toBe(false);
  });
});
