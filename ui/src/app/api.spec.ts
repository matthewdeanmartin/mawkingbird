import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Api, nextMaxIdFrom } from './api';
import { Relationship, Status } from './models';

/**
 * Unit tests for the {@link Api} service in isolation. These exercise the action methods
 * (post, repost, favourite, follow, …) against {@link HttpTestingController}, so no live
 * server and no mastodon_mock backend is involved — we only assert the verb, URL and body
 * each method emits, and that the typed response flows back to the subscriber.
 */
describe('Api service (HTTP isolated)', () => {
  let api: Api;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(Api);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Fails the test if any method issued an unexpected (or no) request.
    httpMock.verify();
  });

  /** Minimal Status stub — only the fields the assertions read. */
  function statusStub(overrides: Partial<Status> = {}): Status {
    return { id: '99', content: '<p>hi</p>', ...overrides } as Status;
  }

  function relStub(overrides: Partial<Relationship> = {}): Relationship {
    return { id: '7', following: false, blocking: false, ...overrides } as Relationship;
  }

  // ---------------------------------------------------------------- post

  it('post: POSTs the status text to /api/v1/statuses and returns the created Status', () => {
    let created: Status | undefined;
    api.postStatus('Hello world').subscribe((s) => (created = s));

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ status: 'Hello world' });

    req.flush(statusStub({ id: '101' }));
    expect(created!.id).toBe('101');
  });

  it('post: sends an explicit idempotency key as a header, never in the body', () => {
    api.postStatus('retry me', {}, 'operation-1:fedi:0').subscribe();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.headers.get('Idempotency-Key')).toBe('operation-1:fedi:0');
    expect(req.request.body).toEqual({ status: 'retry me' });
    req.flush(statusStub());
  });

  // ---------------------------------------------------------------- repost (reblog)

  it('repost: POSTs to /reblog with an empty body and returns the reblog wrapper', () => {
    let result: Status | undefined;
    api.reblog('55').subscribe((s) => (result = s));

    const req = httpMock.expectOne('/api/v1/statuses/55/reblog');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(statusStub({ id: 'reblog-1' }));
    expect(result!.id).toBe('reblog-1');
  });

  // ---------------------------------------------------------------- quote post

  it('quote post: includes quoted_status_id in the POST body to /api/v1/statuses', () => {
    api.postStatus('check this out', { quotedStatusId: '42' }).subscribe();

    const req = httpMock.expectOne('/api/v1/statuses');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ status: 'check this out', quoted_status_id: '42' });

    req.flush(statusStub());
  });

  // ---------------------------------------------------------------- edit

  it('edit: PUTs the new text to /api/v1/statuses/:id', () => {
    api.editStatus('77', 'edited text').subscribe();

    const req = httpMock.expectOne('/api/v1/statuses/77');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'edited text' });

    req.flush(statusStub({ id: '77' }));
  });

  it('edit: forwards spoiler_text when a content warning is supplied', () => {
    api.editStatus('77', 'edited text', 'CW: spoilers').subscribe();

    const req = httpMock.expectOne('/api/v1/statuses/77');
    expect(req.request.body).toEqual({ status: 'edited text', spoiler_text: 'CW: spoilers' });

    req.flush(statusStub({ id: '77' }));
  });

  // ---------------------------------------------------------------- favorite

  it('favorite: POSTs to /favourite with an empty body', () => {
    let result: Status | undefined;
    api.favourite('12').subscribe((s) => (result = s));

    const req = httpMock.expectOne('/api/v1/statuses/12/favourite');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(statusStub({ id: '12' }));
    expect(result!.id).toBe('12');
  });

  // ---------------------------------------------------------------- bookmark

  it('bookmark: POSTs to /bookmark with an empty body', () => {
    api.bookmark('13').subscribe();

    const req = httpMock.expectOne('/api/v1/statuses/13/bookmark');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(statusStub({ id: '13' }));
  });

  // ---------------------------------------------------------------- report

  it('report: POSTs account_id, category, comment and status_ids to /api/v1/reports', () => {
    api.report('900', 'spam', '  bot account  ', ['s1', 's2']).subscribe();

    const req = httpMock.expectOne('/api/v1/reports');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      account_id: '900',
      category: 'spam',
      comment: 'bot account', // trimmed
      status_ids: ['s1', 's2'],
    });

    req.flush({});
  });

  it('report: omits comment and status_ids when not provided', () => {
    api.report('900', 'other', '   ').subscribe();

    const req = httpMock.expectOne('/api/v1/reports');
    expect(req.request.body).toEqual({ account_id: '900', category: 'other' });

    req.flush({});
  });

  // ---------------------------------------------------------------- follow

  it('follow: POSTs to /follow and returns the updated Relationship', () => {
    let rel: Relationship | undefined;
    api.follow('900').subscribe((r) => (rel = r));

    const req = httpMock.expectOne('/api/v1/accounts/900/follow');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(relStub({ following: true }));
    expect(rel!.following).toBe(true);
  });

  // ---------------------------------------------------------------- unfollow

  it('unfollow: POSTs to /unfollow and returns the updated Relationship', () => {
    let rel: Relationship | undefined;
    api.unfollow('900').subscribe((r) => (rel = r));

    const req = httpMock.expectOne('/api/v1/accounts/900/unfollow');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(relStub({ following: false }));
    expect(rel!.following).toBe(false);
  });

  // ---------------------------------------------------------------- block

  it('block: POSTs to /block and returns the updated Relationship', () => {
    let rel: Relationship | undefined;
    api.block('900').subscribe((r) => (rel = r));

    const req = httpMock.expectOne('/api/v1/accounts/900/block');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(relStub({ blocking: true }));
    expect(rel!.blocking).toBe(true);
  });

  // ---------------------------------------------------------------- unblock

  it('unblock: POSTs to /unblock and returns the updated Relationship', () => {
    let rel: Relationship | undefined;
    api.unblockAccount('900').subscribe((r) => (rel = r));

    const req = httpMock.expectOne('/api/v1/accounts/900/unblock');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush(relStub({ blocking: false }));
    expect(rel!.blocking).toBe(false);
  });

  // ------------------------------------------------- mute/block list paging

  it('accountListPage: asks for a page and reports the next cursor from Link', () => {
    let page: { accounts: unknown[]; nextMaxId: string | null } | undefined;
    api.accountListPage('mutes', '55', 80).subscribe((p) => (page = p));

    const req = httpMock.expectOne((r) => r.url === '/api/v1/mutes');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('80');
    expect(req.request.params.get('max_id')).toBe('55');

    req.flush([], {
      headers: {
        Link: '<https://x.test/api/v1/mutes?max_id=42>; rel="next", <https://x.test/api/v1/mutes?since_id=99>; rel="prev"',
      },
    });
    expect(page!.nextMaxId).toBe('42');
  });

  it('accountListPage: reports no cursor when the server sends no Link', () => {
    let page: { nextMaxId: string | null } | undefined;
    api.accountListPage('blocks').subscribe((p) => (page = p));
    httpMock.expectOne((r) => r.url === '/api/v1/blocks').flush([]);
    expect(page!.nextMaxId).toBeNull();
  });

  it('accountFollowingPage uses the opaque cursor from Link instead of an account id', () => {
    let page: { accounts: unknown[]; nextMaxId: string | null; source: string } | undefined;
    api.accountFollowingPage('me', 'opaque-1', 80).subscribe((result) => (page = result));

    const req = httpMock.expectOne((request) => request.url === '/api/v1/accounts/me/following');
    expect(req.request.params.get('max_id')).toBe('opaque-1');
    expect(req.request.params.get('limit')).toBe('80');
    req.flush([{ id: 'account-id-is-not-the-cursor' }], {
      headers: {
        Link: '<https://x.test/api/v1/accounts/me/following?max_id=opaque-2>; rel="next"',
      },
    });

    expect(page?.nextMaxId).toBe('opaque-2');
    expect(page?.source).toBe('link-header');
  });

  /**
   * The CORS case. A browser hands back `null` for a header the response did not
   * name in `Access-Control-Expose-Headers`, and a proxy in front of Mastodon
   * routinely drops `Link`. Stopping there showed 80 followers to an account
   * with thousands, which is indistinguishable from a hidden social graph.
   */
  it('accountFollowersPage keeps walking on the account id when Link never arrives', () => {
    let page: { accounts: unknown[]; nextMaxId: string | null; source: string } | undefined;
    api.accountFollowersPage('me', undefined, 3).subscribe((result) => (page = result));

    const req = httpMock.expectOne((request) => request.url === '/api/v1/accounts/me/followers');
    // A full page by the limit that was asked for, and no Link header at all.
    req.flush([{ id: '10' }, { id: '11' }, { id: '12' }]);

    expect(page?.nextMaxId).toBe('12');
    expect(page?.source).toBe('account-id-fallback');
  });

  it('accountFollowersPage still stops on a short page with no Link header', () => {
    let page: { accounts: unknown[]; nextMaxId: string | null; source: string } | undefined;
    api.accountFollowersPage('me', undefined, 3).subscribe((result) => (page = result));

    const req = httpMock.expectOne((request) => request.url === '/api/v1/accounts/me/followers');
    req.flush([{ id: '10' }]);

    // Short page: the list ended on its own, and guessing a cursor here is what
    // would turn a clean end into an endless walk.
    expect(page?.nextMaxId).toBeNull();
    expect(page?.source).toBe('short-page');
  });
});

describe('nextMaxIdFrom', () => {
  it('takes the max_id of the next relation only', () => {
    expect(
      nextMaxIdFrom(
        '<https://x.test/api/v1/mutes?max_id=7>; rel="next", <https://x.test/api/v1/mutes?min_id=9>; rel="prev"',
      ),
    ).toBe('7');
  });

  it('is unfazed by unquoted rel, missing header, or a link with no cursor', () => {
    expect(nextMaxIdFrom('<https://x.test/api/v1/blocks?max_id=3>; rel=next')).toBe('3');
    expect(nextMaxIdFrom(null)).toBeNull();
    expect(nextMaxIdFrom('<https://x.test/api/v1/blocks>; rel="next"')).toBeNull();
    expect(nextMaxIdFrom('<https://x.test/api/v1/blocks?min_id=3>; rel="prev"')).toBeNull();
    expect(nextMaxIdFrom('garbage')).toBeNull();
  });
});
