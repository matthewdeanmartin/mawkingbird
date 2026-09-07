import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { BookmarkPresence } from './bookmark-presence';

const KEY = 'mockingbird_has_bookmarks_v1';

describe('BookmarkPresence', () => {
  let httpMock: HttpTestingController;
  let presence: BookmarkPresence;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    presence = TestBed.inject(BookmarkPresence);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('asks once, for one bookmark, because the question is whether any exist', () => {
    presence.check();

    const request = httpMock.expectOne((candidate) => candidate.url === '/api/v1/bookmarks');
    expect(request.request.params.get('limit')).toBe('1');
    request.flush([{ id: '1' }]);

    expect(presence.has()).toBe(true);
  });

  it('never asks again once the answer is yes', () => {
    // "Then if it is >0, they have bookmarks FOREVER." A reader who deletes
    // every bookmark gets an empty review — cheaper than a daily request.
    presence.check();
    httpMock.expectOne((c) => c.url === '/api/v1/bookmarks').flush([{ id: '1' }]);

    const second = TestBed.inject(BookmarkPresence);
    second.check();
    httpMock.expectNone((c) => c.url === '/api/v1/bookmarks');
  });

  it('re-asks a stored "no" only after a day', () => {
    localStorage.setItem(KEY, JSON.stringify({ has: false, at: Date.now() }));
    presence.check();
    // Fresh enough to trust: no request, and the button stays hidden.
    httpMock.expectNone((c) => c.url === '/api/v1/bookmarks');
    expect(presence.has()).toBe(false);
  });

  it('re-asks once a stored "no" has gone stale', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem(KEY, JSON.stringify({ has: false, at: twoDaysAgo }));
    presence.check();

    httpMock.expectOne((c) => c.url === '/api/v1/bookmarks').flush([{ id: '9' }]);
    expect(presence.has()).toBe(true);
  });

  it('does not cache a failure as a "no"', () => {
    // A network error is not evidence of an empty bookmark list, and caching it
    // as one would hide the feature for a day over a blip.
    presence.check();
    httpMock
      .expectOne((c) => c.url === '/api/v1/bookmarks')
      .error(new ProgressEvent('network error'));

    expect(presence.has()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('answers anonymously from local rows without any request', () => {
    TestBed.inject(Auth).enterAnonymous('https://home.example');
    presence.check();

    httpMock.expectNone((c) => c.url === '/api/v1/bookmarks');
    expect(presence.has()).toBe(false);
  });
});
