import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { Drafts } from '../drafts';
import { Account, Status } from '../models';
import { PKM_MAX_AGE_DAYS, PkmSource, isSelfNote, withinPkmAge } from './pkm-source';

const ACCOUNT_ID = 'me-1';
const NOW = new Date('2026-08-08T12:00:00Z');

function url(maxId?: string): string {
  const base = `/api/v1/accounts/${ACCOUNT_ID}/statuses?limit=40`;
  return maxId ? `/api/v1/accounts/${ACCOUNT_ID}/statuses?max_id=${maxId}&limit=40` : base;
}

function status(id: string, content: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: NOW.toISOString(),
    content: `<p>${content}</p>`,
    spoiler_text: '',
    visibility: 'direct',
    account: { id: ACCOUNT_ID, username: 'me', acct: 'me' } as Account,
    reblog: null,
    mentions: [],
    media_attachments: [],
    poll: null,
    ...overrides,
  } as unknown as Status;
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('PkmSource', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function signIn(): void {
    const auth = TestBed.inject(Auth);
    auth.mode.set('mastodon');
    auth.account.set({ id: ACCOUNT_ID, username: 'me', acct: 'me' } as Account);
  }

  function saveDraft(text: string): string {
    return TestBed.inject(Drafts).save({
      segments: [text],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    }).id;
  }

  // ---------------------------------------------------------------- predicates

  it('treats a direct post with no mentions as a note to self', () => {
    expect(isSelfNote(status('1', 'x'), ACCOUNT_ID)).toBe(true);
  });

  it('never treats a real DM as a note, even one carrying a tag', () => {
    // A real DM always mentions the person it is for. Surfacing someone's actual
    // private message here would be far worse than omitting a note-to-self.
    const dm = status('1', 'about that #todo', { mentions: [{ id: 'x' }] as never });
    expect(isSelfNote(dm, ACCOUNT_ID)).toBe(false);
  });

  it('treats a missing mentions array as not-a-note', () => {
    expect(isSelfNote(status('1', 'x', { mentions: undefined as never }), ACCOUNT_ID)).toBe(false);
  });

  it('ignores public posts and other accounts posts', () => {
    expect(isSelfNote(status('1', 'x', { visibility: 'public' }), ACCOUNT_ID)).toBe(false);
    expect(
      isSelfNote(status('1', 'x', { account: { id: 'someone-else' } as Account }), ACCOUNT_ID),
    ).toBe(false);
  });

  it('keeps notes far older than the drafts list would', () => {
    // A to-do written six weeks ago is still owed a reply, even though a draft
    // abandoned six weeks ago has stopped being a draft.
    expect(withinPkmAge(status('1', 'x', { created_at: daysAgo(42) }))).toBe(true);
    expect(withinPkmAge(status('1', 'x', { created_at: daysAgo(PKM_MAX_AGE_DAYS + 1) }))).toBe(
      false,
    );
  });

  // ------------------------------------------------------------------- loading

  it('issues no requests at all for an anonymous visitor', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveDraft('remember this #note');
    const pkm = TestBed.inject(PkmSource);

    pkm.load();

    httpMock.verify();
    expect(pkm.items().map((i) => i.preview)).toEqual(['remember this #note']);
    expect(pkm.loaded()).toBe(true);
  });

  it('finds tagged local drafts and ignores untagged ones', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveDraft('a plain draft');
    saveDraft('reply to this #todo');
    const pkm = TestBed.inject(PkmSource);

    expect(pkm.items()).toHaveLength(1);
    expect(pkm.items()[0].kinds).toEqual(['todo']);
  });

  it('picks up a newly tagged draft without a reload', () => {
    // Local items are a computed over the drafts signal, so writing #todo into
    // a draft makes it appear immediately.
    TestBed.inject(Auth).mode.set('anonymous');
    const pkm = TestBed.inject(PkmSource);
    expect(pkm.items()).toHaveLength(0);

    saveDraft('now tagged #note');
    expect(pkm.items()).toHaveLength(1);
  });

  it('reacts to a vocabulary change without a reload', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveDraft('etwas #aufgabe');
    const pkm = TestBed.inject(PkmSource);
    expect(pkm.items()).toHaveLength(0);

    TestBed.inject(ClientPrefs).setPkmVocabulary({ note: [], todo: ['aufgabe'], cal: [] });
    expect(pkm.items()[0].kinds).toEqual(['todo']);
  });

  it('scans own posts and keeps only the tagged self-notes', () => {
    signIn();
    const pkm = TestBed.inject(PkmSource);
    pkm.load();

    httpMock
      .expectOne(url())
      .flush([
        status('s1', 'tagged #note'),
        status('s2', 'an untagged note to self'),
        status('s3', 'public and tagged #note', { visibility: 'public' }),
      ]);

    expect(pkm.items().map((i) => i.id)).toEqual(['s1']);
  });

  it('merges local and self items newest-first', () => {
    signIn();
    saveDraft('local #todo');
    const pkm = TestBed.inject(PkmSource);
    pkm.load();

    httpMock.expectOne(url()).flush([status('s1', 'older self #note', { created_at: daysAgo(2) })]);

    expect(pkm.items().map((i) => i.source.kind)).toEqual(['local', 'self']);
  });

  it('records a per-source error without losing local items', () => {
    signIn();
    saveDraft('local #note');
    const pkm = TestBed.inject(PkmSource);
    pkm.load();

    httpMock.expectOne(url()).flush('nope', { status: 500, statusText: 'Server Error' });

    expect(pkm.sourceErrors().map((e) => e.kind)).toEqual(['self']);
    expect(pkm.items().map((i) => i.source.kind)).toEqual(['local']);
    expect(pkm.loaded()).toBe(true);
  });

  // ---------------------------------------------------------------- pagination

  it('pages until the age bound is crossed', () => {
    signIn();
    const pkm = TestBed.inject(PkmSource);
    pkm.load();

    // A full page, all in range: it asks for another.
    const full = Array.from({ length: 40 }, (_, i) => status(`a${i}`, 'tagged #note'));
    httpMock.expectOne(url()).flush(full);

    // The second page runs off the end of the window, so the scan stops.
    httpMock
      .expectOne(url('a39'))
      .flush([status('old', 'ancient #note', { created_at: daysAgo(PKM_MAX_AGE_DAYS + 5) })]);

    httpMock.verify();
    expect(pkm.items()).toHaveLength(40);
  });

  it('stops at the page cap rather than firing a request per page of history', () => {
    signIn();
    const pkm = TestBed.inject(PkmSource);
    pkm.load();

    const page = (prefix: string) =>
      Array.from({ length: 40 }, (_, i) => status(`${prefix}${i}`, 'tagged #note'));

    httpMock.expectOne(url()).flush(page('a'));
    httpMock.expectOne(url('a39')).flush(page('b'));
    httpMock.expectOne(url('b39')).flush(page('c'));

    // Three pages is the cap: no fourth request, even though page three was full.
    httpMock.verify();
    expect(pkm.items()).toHaveLength(120);
    expect(pkm.loaded()).toBe(true);
  });

  it('stops early when a page is not full', () => {
    signIn();
    const pkm = TestBed.inject(PkmSource);
    pkm.load();

    httpMock.expectOne(url()).flush([status('s1', 'tagged #note')]);

    httpMock.verify();
  });

  // -------------------------------------------------------------------- kinds

  it('counts an item under every kind it carries', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    saveDraft('both #note and #todo');
    const pkm = TestBed.inject(PkmSource);

    expect(pkm.counts()).toEqual({ note: 1, todo: 1, cal: 0 });
    expect(pkm.byKind('note')).toHaveLength(1);
    expect(pkm.byKind('todo')).toHaveLength(1);
    expect(pkm.byKind(null)).toHaveLength(1);
  });

  it('forgets a self note after it is deleted server-side', () => {
    signIn();
    const pkm = TestBed.inject(PkmSource);
    pkm.load();
    httpMock.expectOne(url()).flush([status('s1', 'tagged #note')]);

    pkm.forgetSelf('s1');
    expect(pkm.items()).toHaveLength(0);
  });
});
