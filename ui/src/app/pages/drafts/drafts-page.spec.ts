import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { Drafts } from '../../drafts';
import { Account, ScheduledStatus, Status } from '../../models';
import { PasteHistory } from '../../providers/paste/paste-history';
import { DraftItem } from './draft-items';
import { DraftSources } from './draft-sources';
import { DraftsPage } from './drafts-page';

interface PendingPaste {
  item: DraftItem;
  providerId: string;
  language: string;
  expiry: string;
}

interface PageInternals {
  filter: WritableSignal<'all' | 'local' | 'scheduled' | 'self' | 'paste'>;
  visible: Signal<DraftItem[]>;
  sources: DraftSources;
  removeError: WritableSignal<string | null>;
  actionError: WritableSignal<string | null>;
  notice: WritableSignal<string | null>;
  pendingPaste: WritableSignal<PendingPaste | null>;
  pendingPark: WritableSignal<{ item: DraftItem; at: string } | null>;
  count(id: 'all' | 'local' | 'scheduled' | 'self' | 'paste'): number;
  askRemove(item: DraftItem): void;
  confirmRemove(): void;
  editForPost(item: DraftItem): void;
  convertToLocal(item: DraftItem): void;
  askConvertToPaste(item: DraftItem): void;
  askConvertToSchedule(item: DraftItem): void;
  askUnpark(item: DraftItem): void;
  confirmUnpark(): void;
  cancelUnpark(): void;
  pendingUnpark: WritableSignal<{ item: DraftItem } | null>;
  confirmConvertToPaste(): void;
  confirmConvertToSchedule(): void;
  writing: WritableSignal<boolean>;
  openWriter(): void;
}

function internals(fixture: ComponentFixture<DraftsPage>): PageInternals {
  return fixture.componentInstance as unknown as PageInternals;
}

const SCHEDULED_URL = '/api/v1/scheduled_statuses';
const ACCOUNT_ID = 'me-1';
const STATUSES_URL = `/api/v1/accounts/${ACCOUNT_ID}/statuses?limit=40`;

function selfStatus(id: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: new Date().toISOString(),
    content: `<p>note ${id}</p>`,
    spoiler_text: '',
    visibility: 'direct',
    account: { id: ACCOUNT_ID, username: 'me', acct: 'me' } as Account,
    reblog: null,
    mentions: [],
    media_attachments: [],
    poll: null,
    ...overrides,
  } as Status;
}

function parked(id: string): ScheduledStatus {
  return {
    id,
    scheduled_at: '2124-01-01T00:00:00Z',
    params: { text: `parked ${id}` },
    media_attachments: [],
  } as ScheduledStatus;
}

function upcoming(id: string): ScheduledStatus {
  return {
    id,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    params: { text: 'tomorrow' },
    media_attachments: [],
  } as ScheduledStatus;
}

describe('DraftsPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // HumanTimePipe is intentionally impure and reads the wall clock during
    // change detection. Pin time so Angular's development-mode second pass
    // cannot cross a one-second display boundary mid-assertion.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // "Edit for post" navigates to /home; a stub route keeps the router from
        // rejecting the navigation and drowning the run in unhandled rejections.
        provideRouter([{ path: 'home', children: [] }]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Sign in so the page takes its authenticated path. */
  function signIn(): void {
    const auth = TestBed.inject(Auth);
    auth.mode.set('mastodon');
    auth.account.set({ id: ACCOUNT_ID, username: 'me', acct: 'me' } as Account);
  }

  function setUp(): ComponentFixture<DraftsPage> {
    const fixture = TestBed.createComponent(DraftsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('merges all four kinds into one newest-first list', () => {
    signIn();
    TestBed.inject(Drafts).save({
      segments: ['a local draft'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    TestBed.inject(PasteHistory).add(
      'rentry',
      'Rentry',
      {
        title: 'pasted',
        content: 'body',
        language: 'plaintext',
        expiry: '1w',
        visibility: 'unlisted',
      },
      { slug: 'abc', url: 'u', rawUrl: 'r', editKey: 'k' },
    );

    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1'), upcoming('u1')]);
    httpMock.expectOne(STATUSES_URL).flush([selfStatus('s1')]);
    f.detectChanges();

    expect(
      internals(f)
        .visible()
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['local', 'paste', 'scheduled', 'self']);
    // The near-future one is a real pending post, not a draft.
    expect(
      internals(f)
        .sources.upcomingScheduled()
        .map((s) => s.id),
    ).toEqual(['u1']);
  });

  it('filters by kind without refetching', () => {
    signIn();
    TestBed.inject(Drafts).save({
      segments: ['local one'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1')]);
    httpMock.expectOne(STATUSES_URL).flush([selfStatus('s1')]);
    f.detectChanges();

    internals(f).filter.set('self');
    expect(
      internals(f)
        .visible()
        .map((i) => i.id),
    ).toEqual(['s1']);
    internals(f).filter.set('local');
    expect(internals(f).visible()).toHaveLength(1);
    expect(internals(f).visible()[0].kind).toBe('local');

    // No second round of requests was issued by filtering.
    httpMock.verify();
  });

  it('counts each kind for its chip', () => {
    signIn();
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1'), parked('p2')]);
    httpMock.expectOne(STATUSES_URL).flush([selfStatus('s1')]);
    f.detectChanges();

    expect(internals(f).count('scheduled')).toBe(2);
    expect(internals(f).count('self')).toBe(1);
    expect(internals(f).count('local')).toBe(0);
    expect(internals(f).count('all')).toBe(3);
  });

  // The whole point of loading the sources independently.
  it('keeps the other kinds when scheduled statuses fail', () => {
    signIn();
    TestBed.inject(Drafts).save({
      segments: ['survives'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).error(new ProgressEvent('500'));
    httpMock.expectOne(STATUSES_URL).flush([selfStatus('s1')]);
    f.detectChanges();

    expect(
      internals(f)
        .sources.sourceErrors()
        .map((e) => e.kind),
    ).toEqual(['scheduled']);
    expect(
      internals(f)
        .visible()
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['local', 'self']);
  });

  it('reports a failing self-post scan without losing the rest', () => {
    signIn();
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1')]);
    httpMock.expectOne(STATUSES_URL).error(new ProgressEvent('500'));
    f.detectChanges();

    expect(
      internals(f)
        .sources.sourceErrors()
        .map((e) => e.kind),
    ).toEqual(['self']);
    expect(
      internals(f)
        .visible()
        .map((i) => i.kind),
    ).toEqual(['scheduled']);
  });

  it('issues no authenticated request when anonymous', () => {
    TestBed.inject(Auth).mode.set('anonymous');
    TestBed.inject(Drafts).save({
      segments: ['anonymous draft'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });

    const f = setUp();
    httpMock.expectNone(SCHEDULED_URL);
    expect(
      internals(f)
        .visible()
        .map((i) => i.kind),
    ).toEqual(['local']);
  });

  // Removal destroys something different for each kind; the wiring has to match
  // the confirm copy or someone loses a post they meant to keep.
  it('removing a local draft only touches localStorage', () => {
    signIn();
    const drafts = TestBed.inject(Drafts);
    drafts.save({
      segments: ['bye'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    internals(f).askRemove(internals(f).visible()[0]);
    internals(f).confirmRemove();

    expect(drafts.drafts()).toHaveLength(0);
    httpMock.verify();
  });

  it('removing a parked schedule cancels it on the server', () => {
    signIn();
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1')]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    internals(f).askRemove(internals(f).visible()[0]);
    internals(f).confirmRemove();
    httpMock.expectOne({ url: '/api/v1/scheduled_statuses/p1', method: 'DELETE' }).flush(null);
    f.detectChanges();

    expect(internals(f).visible()).toHaveLength(0);
  });

  it('removing a self draft deletes the status', () => {
    signIn();
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([selfStatus('s1')]);
    f.detectChanges();

    internals(f).askRemove(internals(f).visible()[0]);
    internals(f).confirmRemove();
    httpMock.expectOne({ url: '/api/v1/statuses/s1', method: 'DELETE' }).flush({});
    f.detectChanges();

    expect(internals(f).visible()).toHaveLength(0);
  });

  // Forgetting a paste must not reach for the provider — /pastes owns deletion,
  // because it owns the edit key and the immutability rules.
  it('removing a paste only forgets the local record', () => {
    signIn();
    const history = TestBed.inject(PasteHistory);
    history.add(
      'rentry',
      'Rentry',
      { title: 't', content: 'c', language: 'plaintext', expiry: '1w', visibility: 'unlisted' },
      { slug: 'abc', url: 'u', rawUrl: 'r', editKey: 'k' },
    );
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    internals(f).askRemove(internals(f).visible()[0]);
    internals(f).confirmRemove();

    expect(history.records()).toHaveLength(0);
    httpMock.verify();
  });

  it('keeps the row and reports when a server-side removal fails', () => {
    signIn();
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1')]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    internals(f).askRemove(internals(f).visible()[0]);
    internals(f).confirmRemove();
    httpMock
      .expectOne({ url: '/api/v1/scheduled_statuses/p1', method: 'DELETE' })
      .error(new ProgressEvent('500'));
    f.detectChanges();

    expect(internals(f).removeError()).toBeTruthy();
    expect(internals(f).visible()).toHaveLength(1);
  });

  // ------------------------------------------------------------- conversions
  //
  // The governing rule of the whole matrix is that a conversion never destroys
  // its source, so every one of these asserts the source is still there
  // afterwards — explicitly, not by implication.

  /** Load one item of each server-backed kind and return the page. */
  function withAllKinds(): ComponentFixture<DraftsPage> {
    signIn();
    TestBed.inject(PasteHistory).add(
      'rentry',
      'Rentry',
      {
        title: 'pasted',
        content: 'paste body',
        language: 'plaintext',
        expiry: '1w',
        visibility: 'unlisted',
      },
      { slug: 'abc', url: 'u', rawUrl: 'r', editKey: 'k' },
    );
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([parked('p1')]);
    httpMock.expectOne(STATUSES_URL).flush([selfStatus('s1')]);
    f.detectChanges();
    return f;
  }

  function itemOfKind(f: ComponentFixture<DraftsPage>, kind: string): DraftItem {
    const item = internals(f)
      .visible()
      .find((i) => i.kind === kind);
    if (!item) {
      throw new Error(`no ${kind} item loaded`);
    }
    return item;
  }

  it('copies a parked schedule to a local draft without cancelling it', () => {
    const f = withAllKinds();
    const drafts = TestBed.inject(Drafts);

    internals(f).convertToLocal(itemOfKind(f, 'scheduled'));
    f.detectChanges();

    expect(drafts.drafts()).toHaveLength(1);
    expect(drafts.drafts()[0].segments[0]).toBe('parked p1');
    // Source survives: no DELETE, and the row is still listed.
    httpMock.verify();
    expect(itemOfKind(f, 'scheduled')).toBeTruthy();
  });

  // --------------------------------------------------------------- unparking

  it('asks before unparking, since it is the one conversion that removes its source', () => {
    const f = withAllKinds();

    internals(f).askUnpark(itemOfKind(f, 'scheduled'));
    f.detectChanges();

    expect(internals(f).pendingUnpark()).not.toBeNull();
    // Nothing has happened yet — no DELETE, no draft.
    httpMock.verify();
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
  });

  it('brings a parked post back as a local draft and cancels the server copy', () => {
    const f = withAllKinds();
    const drafts = TestBed.inject(Drafts);

    internals(f).askUnpark(itemOfKind(f, 'scheduled'));
    internals(f).confirmUnpark();
    httpMock.expectOne({ url: `${SCHEDULED_URL}/p1`, method: 'DELETE' }).flush(null);
    f.detectChanges();

    expect(drafts.drafts()).toHaveLength(1);
    expect(drafts.drafts()[0].segments[0]).toBe('parked p1');
    // The source is gone from the list: unparking moves, it does not copy.
    expect(
      internals(f)
        .visible()
        .some((item) => item.kind === 'scheduled'),
    ).toBe(false);
    expect(internals(f).notice()).toContain('Unparked');
  });

  it('keeps the server copy and permits retry when an unpark save exceeds storage quota', () => {
    const f = withAllKinds();
    const item = itemOfKind(f, 'scheduled');
    internals(f).askUnpark(item);
    const original = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.startsWith('mockingbird_drafts'))
        throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    try {
      internals(f).confirmUnpark();
      httpMock.expectNone({ url: `${SCHEDULED_URL}/p1`, method: 'DELETE' });
      expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
      expect(itemOfKind(f, 'scheduled').id).toBe(item.id);
      expect(internals(f).pendingUnpark()).not.toBeNull();
      expect(internals(f).actionError()).toContain('Could not save');
      expect(internals(f).notice()).toBeNull();
    } finally {
      write.mockRestore();
    }
    internals(f).confirmUnpark();
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(1);
    httpMock.expectOne({ url: `${SCHEDULED_URL}/p1`, method: 'DELETE' }).flush(null);
    expect(internals(f).notice()).toContain('Unparked');
  });

  it('does not announce a local copy when saving it fails', () => {
    const f = withAllKinds();
    const store = TestBed.inject(Drafts).forCurrentAccount();
    const save = vi
      .spyOn(store, 'save')
      .mockReturnValue({ durable: false, error: new Error('full'), id: 'unsaved', updatedAt: '' });
    try {
      internals(f).convertToLocal(itemOfKind(f, 'scheduled'));
      expect(internals(f).notice()).toBeNull();
      expect(internals(f).actionError()).toContain('Could not save');
      expect(itemOfKind(f, 'scheduled')).toBeTruthy();
    } finally {
      save.mockRestore();
    }
  });

  /**
   * The ordering guarantee. Saving first means a failed cancellation still
   * leaves the user holding their writing; cancelling first would risk losing
   * the post entirely if the save then failed.
   */
  it('keeps the draft and says so when the server refuses to cancel', () => {
    const f = withAllKinds();
    const drafts = TestBed.inject(Drafts);

    internals(f).askUnpark(itemOfKind(f, 'scheduled'));
    internals(f).confirmUnpark();
    httpMock
      .expectOne({ url: `${SCHEDULED_URL}/p1`, method: 'DELETE' })
      .flush(null, { status: 500, statusText: 'Server Error' });
    f.detectChanges();

    expect(drafts.drafts()).toHaveLength(1);
    expect(internals(f).actionError()).toContain('still scheduled');
    // Still listed, because the server still holds it.
    expect(itemOfKind(f, 'scheduled')).toBeTruthy();
  });

  it('does nothing at all when the dialog is dismissed', () => {
    const f = withAllKinds();

    internals(f).askUnpark(itemOfKind(f, 'scheduled'));
    internals(f).cancelUnpark();
    f.detectChanges();

    expect(internals(f).pendingUnpark()).toBeNull();
    expect(TestBed.inject(Drafts).drafts()).toHaveLength(0);
    httpMock.verify();
  });

  it('copies a self draft to local on a real visibility, leaving the note in place', () => {
    const f = withAllKinds();
    TestBed.inject(ClientPrefs).setDefaultVisibility('private');
    const drafts = TestBed.inject(Drafts);

    internals(f).convertToLocal(itemOfKind(f, 'self'));
    f.detectChanges();

    expect(drafts.drafts()[0].visibility).toBe('private');
    expect(drafts.drafts()[0].visibility).not.toBe('direct');
    httpMock.verify();
    expect(itemOfKind(f, 'self')).toBeTruthy();
  });

  it('copies a paste to local without touching the provider', () => {
    const f = withAllKinds();
    const history = TestBed.inject(PasteHistory);

    internals(f).convertToLocal(itemOfKind(f, 'paste'));
    f.detectChanges();

    expect(TestBed.inject(Drafts).drafts()[0].segments[0]).toBe('paste body');
    expect(history.records()).toHaveLength(1);
    httpMock.verify();
  });

  it('creates a paste from a self draft and keeps the private note', () => {
    const f = withAllKinds();
    const history = TestBed.inject(PasteHistory);

    internals(f).askConvertToPaste(itemOfKind(f, 'self'));
    internals(f).confirmConvertToPaste();
    httpMock.expectOne('https://rentry.co/api/new').flush({
      status: '200',
      url: 'https://rentry.co/xyz',
      edit_code: 'code',
    });
    f.detectChanges();

    expect(history.records()).toHaveLength(2);
    expect(internals(f).pendingPaste()).toBeNull();
    expect(internals(f).notice()).toContain('still here');
    // The self post was never deleted.
    httpMock.verify();
    expect(itemOfKind(f, 'self')).toBeTruthy();
  });

  it('leaves the source alone when the paste service fails', () => {
    const f = withAllKinds();

    internals(f).askConvertToPaste(itemOfKind(f, 'self'));
    internals(f).confirmConvertToPaste();
    httpMock.expectOne('https://rentry.co/api/new').error(new ProgressEvent('offline'));
    f.detectChanges();

    expect(internals(f).actionError()).toContain('untouched');
    expect(TestBed.inject(PasteHistory).records()).toHaveLength(1);
    expect(itemOfKind(f, 'self')).toBeTruthy();
  });

  it('parks a local draft as a far-future schedule and keeps the draft', () => {
    signIn();
    const drafts = TestBed.inject(Drafts);
    drafts.save({
      segments: ['park me'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    internals(f).askConvertToSchedule(itemOfKind(f, 'local'));
    internals(f).confirmConvertToSchedule();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.body.status).toBe('park me');
    // Far enough out that it lists as a draft rather than a pending post.
    expect(new Date(req.request.body.scheduled_at).getFullYear()).toBeGreaterThan(
      new Date().getFullYear() + 10,
    );
    req.flush({ id: 'sch2', params: {} });
    // The page reloads its server sources after a successful park.
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    expect(drafts.drafts()).toHaveLength(1);
    expect(internals(f).notice()).toContain('still here');
  });

  // The boss's call: a server refusing a distant date is ordinary error
  // handling. No probing, no clamping — just say so and keep everything.
  it('reports a refused park date and keeps both the dialog and the draft', () => {
    signIn();
    const drafts = TestBed.inject(Drafts);
    drafts.save({
      segments: ['too far'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    internals(f).askConvertToSchedule(itemOfKind(f, 'local'));
    internals(f).confirmConvertToSchedule();
    httpMock
      .expectOne('/api/v1/statuses')
      .flush({ error: 'Scheduled at is too far in the future' }, { status: 422, statusText: '' });
    f.detectChanges();

    expect(internals(f).actionError()).toContain('too far in the future');
    expect(internals(f).actionError()).toContain('nearer date');
    // Dialog stays open with the date still filled in, and nothing was lost.
    expect(internals(f).pendingPark()).not.toBeNull();
    expect(drafts.drafts()).toHaveLength(1);
  });

  it('hands a self draft to the composer with its origin, for post-publish cleanup', () => {
    const f = withAllKinds();
    const drafts = TestBed.inject(Drafts);

    internals(f).editForPost(itemOfKind(f, 'self'));

    const handoff = drafts.takeHandoff();
    expect(handoff?.selfStatusId).toBe('s1');
    expect(handoff?.snapshot.visibility).not.toBe('direct');
    // Handing off does not delete the source.
    httpMock.verify();
  });

  // --------------------------------------------------------- thoughtful posting

  it('shows no writing surface until asked, and opens it on ?write=1', () => {
    signIn();
    TestBed.inject(ClientPrefs).setThoughtfulPosting(true);
    const f = setUp();
    httpMock.expectOne(SCHEDULED_URL).flush([]);
    httpMock.expectOne(STATUSES_URL).flush([]);
    f.detectChanges();

    // Landing on /drafts directly: the button is there, the box is not.
    expect(internals(f).writing()).toBe(false);
    expect(f.nativeElement.querySelector('app-compose')).toBeNull();

    internals(f).openWriter();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-compose')).not.toBeNull();
  });

  it('hands a paste to the composer with no self-cleanup origin', () => {
    const f = withAllKinds();

    internals(f).editForPost(itemOfKind(f, 'paste'));

    const handoff = TestBed.inject(Drafts).takeHandoff();
    expect(handoff?.snapshot.segments[0]).toBe('paste body');
    expect(handoff?.selfStatusId).toBeUndefined();
  });
});
