import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import { authInterceptor } from '../../platform/http/auth.interceptor';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { mergeOriginReplies, OriginReads, statusOrigin } from './origin-reads';

function account(acct: string): Account {
  const [user, host = 'home.example'] = acct.split('@');
  return {
    id: acct,
    username: user,
    acct,
    display_name: user,
    url: `https://${host}/@${user}`,
    avatar: '',
  } as Account;
}

function post(
  id: string,
  uri: string,
  inReplyTo: string | null,
  by = 'alice@origin.example',
): Status {
  return {
    id,
    uri,
    url: null,
    created_at: '2026-11-16T00:00:00Z',
    edited_at: null,
    content: `<p>${id}</p>`,
    spoiler_text: '',
    visibility: 'public',
    account: account(by),
    reblog: null,
    quote: null,
    in_reply_to_id: inReplyTo,
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
  } as Status;
}

const ROOT_URI = 'https://origin.example/users/alice/statuses/1000';
const uri = (n: number) => `https://origin.example/users/bob/statuses/${n}`;

describe('statusOrigin', () => {
  it('reads the origin server and id from a Mastodon uri or url', () => {
    expect(statusOrigin({ uri: ROOT_URI, url: null })).toEqual({
      server: 'https://origin.example',
      id: '1000',
    });
    expect(statusOrigin({ uri: undefined, url: 'https://origin.example/@alice/1000' })).toEqual({
      server: 'https://origin.example',
      id: '1000',
    });
  });

  it('declines URLs that are not Mastodon-shaped', () => {
    expect(statusOrigin({ uri: 'https://misskey.example/notes/abc', url: null })).toBeNull();
    expect(statusOrigin({ uri: 'javascript:alert(1)', url: null })).toBeNull();
  });
});

describe('mergeOriginReplies', () => {
  const ns = (id: string) => `anonymous-mastodon:origin.example:${id}`;

  it('adds only replies the home server lacks, deduped by uri, under their parent', () => {
    const home = [post('h1', uri(1), null), post('h3', uri(3), null)];
    const origin = [
      post(ns('1'), uri(1), ns('1000')),
      post(ns('2'), uri(2), ns('1')), // reply to h1, missing at home
      post(ns('3'), uri(3), ns('1000')),
      post(ns('4'), uri(4), ns('1000')), // reply to root, missing at home
    ];
    const merged = mergeOriginReplies(home, origin, ROOT_URI, '1000', 'https://origin.example');
    expect(merged.map((s) => s.uri)).toEqual([uri(1), uri(2), uri(3), uri(4)]);
    expect(merged.filter((s) => s.originServer).map((s) => s.uri)).toEqual([uri(2), uri(4)]);
    expect(merged[1].originServer).toBe('origin.example');
    // Home copies are kept as the home server returned them.
    expect(merged[0].id).toBe('h1');
  });

  it('keeps hidden authors out of the merged result', () => {
    const origin = [post(ns('5'), uri(5), ns('1000'), 'troll@blocked.example')];
    const merged = mergeOriginReplies(
      [],
      origin,
      ROOT_URI,
      '1000',
      'https://origin.example',
      (status) => status.account.acct.endsWith('@blocked.example'),
    );
    expect(merged).toEqual([]);
  });
});

describe('OriginReads (parity item 8)', () => {
  let httpMock: HttpTestingController;
  let reads: OriginReads;
  const remote = post('77', ROOT_URI, null);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Server).setBaseUrl('https://home.example');
    TestBed.inject(Auth).setToken('secret-token');
    reads = TestBed.inject(OriginReads);
  });

  afterEach(() => httpMock.verify());

  it('is off by default and then makes no origin requests at all', async () => {
    expect(TestBed.inject(ClientPrefs).fetchFromOrigin()).toBe(false);
    expect(await firstValueFrom(reads.context(remote))).toBeNull();
    expect(await firstValueFrom(reads.statusAccounts(remote, 'favourited_by'))).toBeNull();
    expect(
      await firstValueFrom(
        reads.peoplePage(account('alice@origin.example'), 'followers', null, null),
      ),
    ).toBeNull();
    httpMock.expectNone(() => true);
  });

  it('reads the origin context without the Authorization header', async () => {
    TestBed.inject(ClientPrefs).setFetchFromOrigin(true);
    const result = firstValueFrom(reads.context(remote));
    const request = httpMock.expectOne('https://origin.example/api/v1/statuses/1000/context');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ ancestors: [], descendants: [post('2', uri(2), '1000')] });
    expect((await result)?.descendants.map((s) => s.uri)).toEqual([uri(2)]);
  });

  it('falls back quietly when the origin refuses (signed fetch)', async () => {
    TestBed.inject(ClientPrefs).setFetchFromOrigin(true);
    const result = firstValueFrom(reads.statusAccounts(remote, 'reblogged_by'));
    httpMock
      .expectOne((r) => r.url === 'https://origin.example/api/v1/statuses/1000/reblogged_by')
      .flush({ error: 'signature required' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBeNull();
  });

  it('never reads a post that lives on the home server', async () => {
    TestBed.inject(ClientPrefs).setFetchFromOrigin(true);
    const local = post('9', 'https://home.example/users/me/statuses/9', null);
    expect(await firstValueFrom(reads.context(local))).toBeNull();
    httpMock.expectNone(() => true);
  });

  it('reads a remote profile list from its own server, labelled with the host', async () => {
    TestBed.inject(ClientPrefs).setFetchFromOrigin(true);
    const result = firstValueFrom(
      reads.peoplePage(account('alice@origin.example'), 'followers', null, null),
    );
    const lookup = httpMock.expectOne(
      (r) => r.url === 'https://origin.example/api/v1/accounts/lookup',
    );
    expect(lookup.request.headers.has('Authorization')).toBe(false);
    lookup.flush(account('alice'));
    const page = httpMock.expectOne((r) =>
      r.url.startsWith('https://origin.example/api/v1/accounts/alice/followers'),
    );
    expect(page.request.headers.has('Authorization')).toBe(false);
    page.flush([account('carol')]);
    const found = await result;
    expect(found?.server).toBe('origin.example');
    expect(found?.accounts.map((a) => a.username)).toEqual(['carol']);
  });
});
