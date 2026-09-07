import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { Favourites } from './favourites';
import { Auth } from '../../auth';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { of } from 'rxjs';
import { vi } from 'vitest';

/** Exposes Favourites' protected signals for white-box testing. */
interface FavouritesInternals {
  statuses: WritableSignal<Status[]>;
  loading: WritableSignal<boolean>;
  onChanged(index: number, updated: Status): void;
  onDeleted(removed: Status): void;
}

function internals(fixture: ComponentFixture<Favourites>): FavouritesInternals {
  return fixture.componentInstance as unknown as FavouritesInternals;
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
    favourited: true,
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

describe('Favourites', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<Favourites> {
    const fixture = TestBed.createComponent(Favourites);
    fixture.detectChanges();
    return fixture;
  }

  it('starts with loading=true and an empty statuses list', () => {
    const fixture = setUp();
    expect(internals(fixture).loading()).toBe(true);
    expect(internals(fixture).statuses()).toEqual([]);
    httpMock.expectOne('/api/v1/favourites').flush([]);
  });

  it('populates statuses and clears loading on successful fetch', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');

    httpMock.expectOne('/api/v1/favourites').flush([s1, s2]);

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).statuses()).toEqual([s1, s2]);
  });

  it('clears loading on HTTP error', () => {
    const fixture = setUp();

    httpMock.expectOne('/api/v1/favourites').error(new ProgressEvent('error'));

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).statuses()).toEqual([]);
  });

  it('loads Bluesky-primary likes from Bluesky and never calls Mastodon', () => {
    vi.spyOn(TestBed.inject(Auth), 'isBlueskyPrimary', 'get').mockReturnValue(true);
    TestBed.inject(BlueskySession).session.set({ did: 'did:plc:me' } as never);
    const getActorLikes = vi
      .spyOn(TestBed.inject(BlueskyApi), 'getActorLikes')
      .mockReturnValue(of({ feed: [], cursor: 'likes-2' }));

    const fixture = setUp();

    expect(getActorLikes).toHaveBeenCalledWith('did:plc:me', null);
    expect(internals(fixture).loading()).toBe(false);
    httpMock.expectNone('/api/v1/favourites');
  });

  it('onChanged replaces the status at the given index', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    httpMock.expectOne('/api/v1/favourites').flush([s1, s2]);

    const updated = { ...s2, content: '<p>updated</p>' };
    internals(fixture).onChanged(1, updated);

    expect(internals(fixture).statuses()).toEqual([s1, updated]);
  });

  it('removes a post from the library when it is unliked', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    httpMock.expectOne('/api/v1/favourites').flush([s1, s2]);

    internals(fixture).onChanged(0, { ...s1, favourited: false });

    expect(internals(fixture).statuses()).toEqual([s2]);
  });

  it('onDeleted removes the matching status by id', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    httpMock.expectOne('/api/v1/favourites').flush([s1, s2]);

    internals(fixture).onDeleted(s1);

    expect(internals(fixture).statuses()).toEqual([s2]);
  });

  it('onChanged does not affect other statuses', () => {
    const fixture = setUp();
    const s1 = makeStatus('1');
    const s2 = makeStatus('2');
    const s3 = makeStatus('3');
    httpMock.expectOne('/api/v1/favourites').flush([s1, s2, s3]);

    const updated = { ...s2, content: '<p>changed</p>' };
    internals(fixture).onChanged(1, updated);

    expect(internals(fixture).statuses()[0]).toBe(s1);
    expect(internals(fixture).statuses()[1]).toBe(updated);
    expect(internals(fixture).statuses()[2]).toBe(s3);
  });
});
