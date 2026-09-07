import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { Announcement } from '../models';
import { AnnouncementStore } from './announcement-store';

function announcement(id: string, read = true): Announcement {
  return {
    id,
    content: `<p>${id}</p>`,
    starts_at: null,
    ends_at: null,
    all_day: false,
    published_at: `2026-08-0${id}T00:00:00Z`,
    updated_at: null,
    read,
    reactions: [],
  };
}

describe('AnnouncementStore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
  });

  function loaded(list: Announcement[]): AnnouncementStore {
    const store = TestBed.inject(AnnouncementStore);
    store.load();
    httpMock.expectOne('/api/v1/announcements').flush(list);
    return store;
  }

  it('load() fetches once however many surfaces ask', () => {
    const store = TestBed.inject(AnnouncementStore);
    store.load();
    store.load();

    // The banner and the rail's server card both call this on init; a second
    // request would be pure waste.
    httpMock.expectOne('/api/v1/announcements').flush([announcement('1')]);
    store.load();
    httpMock.expectNone('/api/v1/announcements');
    expect(store.total()).toBe(1);
  });

  it('separates active from dismissed, and counts only the active', () => {
    const store = loaded([announcement('1'), announcement('2')]);

    store.dismiss('1');
    httpMock.expectOne('/api/v1/announcements/1/dismiss').flush({});

    expect(store.activeCount()).toBe(1);
    // The page that lists everything still sees both.
    expect(store.total()).toBe(2);
    expect(store.isDismissed('1')).toBe(true);
  });

  it('flags unread only for something the server marks unread', () => {
    // Every live announcement is "published", so that cannot be the signal —
    // the badge would call out forever.
    expect(loaded([announcement('1', true)]).hasUnread()).toBe(false);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    expect(loaded([announcement('1', false)]).hasUnread()).toBe(true);
  });

  it('dismissAll() clears every active one and tells the server about each', () => {
    const store = loaded([announcement('1'), announcement('2')]);

    store.dismissAll();

    httpMock.expectOne('/api/v1/announcements/1/dismiss').flush({});
    httpMock.expectOne('/api/v1/announcements/2/dismiss').flush({});
    expect(store.activeCount()).toBe(0);
    expect(store.hasUnread()).toBe(false);
  });

  it('restoreAll() brings them back, because dismissing is otherwise permanent', () => {
    const store = loaded([announcement('1'), announcement('2')]);
    store.dismissAll();
    httpMock.expectOne('/api/v1/announcements/1/dismiss').flush({});
    httpMock.expectOne('/api/v1/announcements/2/dismiss').flush({});

    store.restoreAll();

    expect(store.activeCount()).toBe(2);
  });

  it('remembers dismissals across sessions', () => {
    loaded([announcement('1')]).dismiss('1');
    httpMock.expectOne('/api/v1/announcements/1/dismiss').flush({});

    // A fresh store in a new session reads the same localStorage list.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);

    expect(loaded([announcement('1')]).activeCount()).toBe(0);
  });

  it('treats a server with announcements switched off as empty, not broken', () => {
    const store = TestBed.inject(AnnouncementStore);
    store.load();
    httpMock
      .expectOne('/api/v1/announcements')
      .flush('nope', { status: 404, statusText: 'Not Found' });

    expect(store.loaded()).toBe(true);
    expect(store.total()).toBe(0);
  });
  /**
   * Regression: a Bluesky-primary account requested Mastodon announcements.
   *
   * Announcements are an instance concept with no Bluesky counterpart. Such an
   * account has no Mastodon server, so `serverInterceptor` has no base URL to
   * prefix the relative `/api/v1/announcements` with, and it resolves against
   * the page's own origin — on mawkingbird.com a static GitHub Pages site,
   * which answers the SPA 404 shim instead of JSON and surfaces to the user as
   * `request:failed … 422`.
   *
   * `home.html` renders the banner for anyone who is not anonymous, which was
   * the same question as "has a Mastodon server" only while every signed-in
   * account was Mastodon-primary. The guard lives in `load()` because all three
   * surfaces funnel through it.
   *
   * The spy goes in before the first `TestBed.inject`, since the store reads
   * `networkSources()` when it is constructed.
   */
  it('asks for nothing when the account has no Mastodon server', () => {
    vi.spyOn(TestBed.inject(Auth), 'isBlueskyPrimary', 'get').mockReturnValue(true);

    const store = TestBed.inject(AnnouncementStore);
    store.load();

    httpMock.expectNone('/api/v1/announcements');
    expect(store.all()).toEqual([]);
    // Settled, not pending: the surfaces must render their empty state rather
    // than a spinner waiting on a call that is never made.
    expect(store.loaded()).toBe(true);
  });
});
