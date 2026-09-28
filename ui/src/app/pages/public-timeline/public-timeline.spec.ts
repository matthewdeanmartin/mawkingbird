import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from '../../client-prefs';
import { Status } from '../../models';
import { Streaming } from '../../streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import { PublicTimeline } from './public-timeline';

interface PublicTimelineInternals {
  statuses: Signal<Status[]>;
  local: WritableSignal<boolean>;
  live: WritableSignal<boolean>;
  setLocal(local: boolean): void;
}

function internals(fixture: ComponentFixture<PublicTimeline>): PublicTimelineInternals {
  return fixture.componentInstance as unknown as PublicTimelineInternals;
}

function makeStatus(id: string): Status {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: `<p>status ${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: '1', username: 'alan', acct: 'alan', display_name: 'Alan' } as Status['account'],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
  };
}

describe('PublicTimeline', () => {
  let httpMock: HttpTestingController;
  let fakeStreaming: FakeStreaming;

  beforeEach(() => {
    fakeStreaming = new FakeStreaming();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Streaming, useValue: fakeStreaming },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<PublicTimeline> {
    const fixture = TestBed.createComponent(PublicTimeline);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/public?limit=20').flush([]);
    return fixture;
  }

  /**
   * Turn streaming on and flush the fresh-snapshot refetch it triggers.
   *
   * Driven by the Blue preference now that "Go live" has left the toolbar — the
   * page follows `autoRefreshTimeline` through an effect, so the switch is
   * flipped there and the effect flushed with `detectChanges`.
   */
  function goLive(fixture: ComponentFixture<PublicTimeline>): void {
    TestBed.inject(ClientPrefs).setAutoRefreshTimeline(true);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/timelines/public?limit=20').flush([]);
  }

  /** The inverse of {@link goLive}: no refetch happens on the way down. */
  function stopLive(fixture: ComponentFixture<PublicTimeline>): void {
    TestBed.inject(ClientPrefs).setAutoRefreshTimeline(false);
    fixture.detectChanges();
  }

  it('keeps rendered posts during a failed refresh and recovers through Retry', () => {
    const fixture = setUp();
    fixture.componentInstance.load();
    httpMock.expectOne('/api/v1/timelines/public?limit=20').flush([makeStatus('kept')]);
    fixture.detectChanges();
    const firstCard = fixture.nativeElement.querySelector('app-status-card');
    expect(firstCard).not.toBeNull();
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-status-card')).toBe(firstCard);
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      'Loading',
    );
    httpMock
      .expectOne('/api/v1/timelines/public?limit=20')
      .flush('', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-status-card')).toBe(firstCard);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load posts',
    );
    (
      fixture.nativeElement.querySelector(
        'mb-content-state[kind="error"] button',
      ) as HTMLButtonElement
    ).click();
    httpMock
      .expectOne('/api/v1/timelines/public?limit=20')
      .flush([makeStatus('kept'), makeStatus('new')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-status-card')).toBe(firstCard);
    expect(fixture.nativeElement.querySelectorAll('app-status-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not show posts from All after switching to a failed Local feed', () => {
    const fixture = setUp();
    fixture.componentInstance.load();
    httpMock.expectOne('/api/v1/timelines/public?limit=20').flush([makeStatus('all-post')]);
    fixture.componentInstance.setLocal(true);
    expect(internals(fixture).statuses()).toEqual([]);
    httpMock
      .expectOne('/api/v1/timelines/public?limit=20&local=true')
      .flush('', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-status-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No public statuses yet.');
  });

  it('opens a non-local public stream by default when the Blue pref goes on', () => {
    const fixture = setUp();
    goLive(fixture);

    expect(internals(fixture).live()).toBe(true);
    expect(fakeStreaming.lastKind).toEqual({ stream: 'public', local: false });
  });

  it('switching to Local while live re-opens the stream as local', () => {
    const fixture = setUp();
    goLive(fixture);
    expect(fakeStreaming.openCount).toBe(1);

    internals(fixture).setLocal(true);
    httpMock.expectOne('/api/v1/timelines/public?limit=20&local=true').flush([]);

    expect(fakeStreaming.openCount).toBe(2);
    expect(fakeStreaming.lastKind).toEqual({ stream: 'public', local: true });
    expect(fakeStreaming.closed).toBe(false);
  });

  it('switching tabs while not live does not open a stream', () => {
    const fixture = setUp();
    internals(fixture).setLocal(true);
    httpMock.expectOne('/api/v1/timelines/public?limit=20&local=true').flush([]);

    expect(fakeStreaming.openCount).toBe(0);
  });

  it('prepends an incoming update and removes on delete', () => {
    const fixture = setUp();
    goLive(fixture);

    fakeStreaming.emit({ event: 'update', payload: makeStatus('1') });
    fakeStreaming.emit({ event: 'update', payload: makeStatus('2') });
    expect(
      internals(fixture)
        .statuses()
        .map((s) => s.id),
    ).toEqual(['2', '1']);

    fakeStreaming.emit({ event: 'delete', payload: '1' });
    expect(
      internals(fixture)
        .statuses()
        .map((s) => s.id),
    ).toEqual(['2']);
  });

  it('turning the pref off closes the stream', () => {
    const fixture = setUp();
    goLive(fixture);
    stopLive(fixture);

    expect(internals(fixture).live()).toBe(false);
    expect(fakeStreaming.closed).toBe(true);
  });
});
