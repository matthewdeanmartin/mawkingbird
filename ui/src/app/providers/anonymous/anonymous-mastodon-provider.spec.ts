import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Account, Status } from '../../models';
import { AnonymousFollows } from './anonymous-follows';
import { AnonymousMastodonProvider } from './anonymous-mastodon-provider';
import { AnonymousTags } from './anonymous-tags';
import { AnonymousPreferences } from './anonymous-preferences';

function account(username: string, server: string, id = '1'): Account {
  return {
    id,
    username,
    acct: username,
    display_name: username,
    note: '',
    url: `${server}/@${username}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 1,
    bot: false,
    locked: false,
    fields: [],
  };
}

function status(author: Account, id = '10'): Status {
  return {
    id,
    created_at: '2026-07-19T12:00:00Z',
    edited_at: null,
    content: '<p>Hello</p>',
    spoiler_text: '',
    visibility: 'public',
    url: `${author.url}/${id}`,
    account: author,
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

describe('AnonymousMastodonProvider', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous();
  });

  afterEach(() => httpMock.verify());

  it('uses the instance-local account reference that already discovered the follow', () => {
    const target = {
      ...account('alice', 'https://social.example', 'remote-copy'),
      acct: 'alice@social.example',
    };
    TestBed.inject(AnonymousFollows).follow(target, 'https://mastodon.social');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));

    const posts = httpMock.expectOne(
      'https://mastodon.social/api/v1/accounts/remote-copy/statuses?limit=20&exclude_replies=true',
    );
    posts.flush([status(target)]);
    httpMock.expectNone('https://social.example/api/v1/accounts/lookup?acct=alice');

    expect(received).toHaveLength(1);
    expect(received[0].provider).toBe('anonymous-mastodon');
    expect(received[0].id).toBe('anonymous-mastodon:mastodon.social:10');
    expect(received[0].account.acct).toBe('alice@social.example');
  });

  it('resolves Starter-style canonical ids through the selected anonymous server', () => {
    const target = {
      ...account('alice', 'https://blocked-home.example', 'canonical-id'),
      acct: 'alice@blocked-home.example',
    };
    const follows = TestBed.inject(AnonymousFollows);
    // A compiled Starter snapshot naturally knows the canonical server and id.
    follows.follow(target, 'https://blocked-home.example');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));

    const lookup = httpMock.expectOne(
      (request) => request.url === 'https://mastodon.social/api/v2/search',
    );
    expect(lookup.request.params.get('q')).toBe('alice@blocked-home.example');
    expect(lookup.request.params.get('type')).toBe('accounts');
    lookup.flush({
      accounts: [
        {
          ...target,
          id: 'selected-server-id',
        },
      ],
      statuses: [],
      hashtags: [],
    });
    httpMock
      .expectOne(
        'https://mastodon.social/api/v1/accounts/selected-server-id/statuses?limit=20&exclude_replies=true',
      )
      .flush([status(target)]);

    httpMock.expectNone((request) => request.url.includes('blocked-home.example'));
    expect(received).toHaveLength(1);
    expect(follows.follows()[0].readRef).toEqual({
      server: 'https://mastodon.social',
      accountId: 'selected-server-id',
    });
  });

  it('streams a growing snapshot as each source lands, not one batch at the end', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice', 'https://one.example', 'a-copy'), 'https://mastodon.social');
    follows.follow(account('bob', 'https://two.example', 'b-copy'), 'https://mastodon.social');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    const snapshots: number[] = [];

    provider.fetchPageStreaming().subscribe((items) => snapshots.push(items.length));

    // First source resolves — a snapshot appears before the second is in.
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/a-copy/statuses'))
      .flush([status(account('alice', 'https://one.example', 'a-copy'), '10')]);
    expect(snapshots).toEqual([1]);

    // Second source resolves — the snapshot grows to include both.
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/b-copy/statuses'))
      .flush([status(account('bob', 'https://two.example', 'b-copy'), '20')]);
    expect(snapshots).toEqual([1, 2]);
  });

  it('does not re-emit posts already seen across streamed sources', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice', 'https://one.example', 'a-copy'), 'https://mastodon.social');
    follows.follow(account('bob', 'https://two.example', 'b-copy'), 'https://mastodon.social');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let last: Status[] = [];

    provider.fetchPageStreaming().subscribe((items) => (last = items));

    const shared = status(account('alice', 'https://one.example', 'a-copy'), '10');
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/a-copy/statuses'))
      .flush([shared]);
    // Bob's instance happens to surface the very same post (boost/crosspost).
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/b-copy/statuses'))
      .flush([shared]);

    expect(last).toHaveLength(1);
  });

  it('keeps successful sources when another followed instance fails', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice', 'https://one.example', 'a-copy'), 'https://mastodon.social');
    follows.follow(account('bob', 'https://two.example', 'b-copy'), 'https://mastodon.social');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/a-copy/statuses'))
      .flush([status(account('alice', 'https://one.example', 'a-copy'))]);
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/b-copy/statuses'))
      .flush(null, { status: 429, statusText: 'Limited' });
    httpMock
      .expectOne('https://two.example/api/v1/accounts/lookup?acct=bob')
      .flush(null, { status: 429, statusText: 'Limited' });
    httpMock
      .expectOne('https://two.example/@bob.rss')
      .flush(null, { status: 404, statusText: 'Missing' });
    expect(received).toHaveLength(1);
    expect(provider.errors()).toEqual(['Could not load @bob@two.example.']);
  });

  it('keeps API posts when another follow fails both API and RSS CORS', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice', 'https://one.example', 'a-copy'), 'https://mastodon.social');
    follows.follow(account('bob', 'https://two.example', 'b-copy'), 'https://mastodon.social');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/a-copy/statuses'))
      .flush([status(account('alice', 'https://one.example', 'a-copy'))]);
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/b-copy/statuses'))
      .error(new ProgressEvent('error'));
    httpMock
      .expectOne('https://two.example/api/v1/accounts/lookup?acct=bob')
      .error(new ProgressEvent('error'));
    httpMock.expectOne('https://two.example/@bob.rss').error(new ProgressEvent('error'));

    expect(received.map((item) => item.account.username)).toEqual(['alice']);
    expect(provider.errors()).toEqual(['Could not load @bob@two.example.']);

    // A manual refresh during the short backoff still loads healthy follows,
    // but does not immediately repeat Bob's doomed API + cross-origin RSS calls.
    provider.reset();
    received = [];
    provider.fetchPage().subscribe((items) => (received = items));
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/a-copy/statuses'))
      .flush([status(account('alice', 'https://one.example', 'a-copy'), '11')]);
    expect(received.map((item) => item.account.username)).toEqual(['alice']);
  });

  it('falls back to the public profile RSS feed after an anonymous API failure', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(
      account('alice', 'https://one.example', 'remote-copy'),
      'https://mastodon.social',
    );
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));
    httpMock
      .expectOne((request) => request.url.includes('/api/v1/accounts/remote-copy/statuses'))
      .flush(null, { status: 429, statusText: 'Limited' });
    httpMock
      .expectOne('https://one.example/api/v1/accounts/lookup?acct=alice')
      .flush(account('alice', 'https://one.example', 'native-id'));
    httpMock
      .expectOne(
        'https://one.example/api/v1/accounts/native-id/statuses?limit=20&exclude_replies=true',
      )
      .flush(null, { status: 503, statusText: 'Unavailable' });
    httpMock.expectOne('https://one.example/@alice.rss').flush(`
      <rss version="2.0"><channel><title>Alice</title><link>https://one.example/@alice</link>
      <item><guid>post-1</guid><title>Hello</title><link>https://one.example/@alice/1</link>
      <pubDate>Sun, 19 Jul 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Hello</p>]]></description></item>
      </channel></rss>
    `);

    expect(received).toHaveLength(1);
    expect(received[0].provider).toBe('anonymous-mastodon');
    expect(received[0].account.acct).toBe('alice@one.example');
    expect(provider.errors()).toEqual(['Using RSS fallback for @alice@one.example.']);
  });

  it('fetches followed hashtag searches from the selected instance on demand', () => {
    TestBed.inject(AnonymousTags).follow('cats');
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));
    const request = httpMock.expectOne(
      (candidate) => candidate.url === 'https://mastodon.social/api/v1/timelines/tag/cats',
    );
    expect(request.request.params.get('limit')).toBe('20');
    request.flush([status(account('alice', 'https://mastodon.social'))]);

    expect(received).toHaveLength(1);
    expect(received[0].provider).toBe('anonymous-mastodon');
  });

  it('age-filters followed-account posts without filtering followed hashtags', () => {
    const target = account('alice', 'https://mastodon.social', 'alice-id');
    TestBed.inject(AnonymousFollows).follow(target, 'https://mastodon.social');
    TestBed.inject(AnonymousTags).follow('history');
    TestBed.inject(AnonymousPreferences).setFollowedPostMaxAgeDays(30);
    const provider = TestBed.inject(AnonymousMastodonProvider);
    provider.reset();
    let received: Status[] = [];

    provider.fetchPage().subscribe((items) => (received = items));

    const recent = { ...status(target, 'recent'), created_at: new Date().toISOString() };
    const oldFollow = { ...status(target, 'old-follow'), created_at: '2000-01-01T00:00:00Z' };
    httpMock
      .expectOne(
        'https://mastodon.social/api/v1/accounts/alice-id/statuses?limit=20&exclude_replies=true',
      )
      .flush([recent, oldFollow]);
    const oldTag = {
      ...status(account('historian', 'https://mastodon.social'), 'old-tag'),
      created_at: '2000-01-01T00:00:00Z',
    };
    httpMock
      .expectOne('https://mastodon.social/api/v1/timelines/tag/history?limit=20')
      .flush([oldTag]);

    expect(received.map((item) => item.id)).toEqual([
      'anonymous-mastodon:mastodon.social:recent',
      'anonymous-mastodon:mastodon.social:old-tag',
    ]);
  });

  it('keeps per-follow cursors in an independent list session and pages only on demand', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice', 'https://one.example', 'a-copy'), 'https://mastodon.social');
    const session = TestBed.inject(AnonymousMastodonProvider).createFollowFeed(follows.follows());
    const pages: Status[][] = [];

    session.fetchPage().subscribe((page) => pages.push(page.statuses));
    httpMock
      .expectOne(
        'https://mastodon.social/api/v1/accounts/a-copy/statuses?limit=20&exclude_replies=true',
      )
      .flush(
        Array.from({ length: 20 }, (_, index) =>
          status(account('alice', 'https://one.example', 'a-copy'), String(index)),
        ),
      );

    expect(pages[0]).toHaveLength(20);
    httpMock.expectNone((request) => request.params.get('max_id') === '19');

    session.fetchPage().subscribe((page) => pages.push(page.statuses));
    httpMock
      .expectOne(
        'https://mastodon.social/api/v1/accounts/a-copy/statuses?limit=20&exclude_replies=true&max_id=19',
      )
      .flush([status(account('alice', 'https://one.example', 'a-copy'), 'older')]);

    expect(pages[1].map((item) => item.providerRef)).toContainEqual({
      server: 'https://mastodon.social',
      statusId: 'older',
      accountId: 'a-copy',
    });
  });

  /**
   * Why a feed ended used to be computed and thrown away: the branches below have
   * always distinguished "returned nothing" from "threw" from "was filtered to
   * nothing", then collapsed all three into an identical empty feed. `/feed-doctor`
   * is the first thing to read them.
   */
  it('marks a source that returned nothing as empty rather than merely absent', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('quiet', 'https://one.example', 'q1'), 'https://mastodon.social');

    const session = TestBed.inject(AnonymousMastodonProvider).createFollowFeed(follows.follows());
    const pages: { handle: string; ending: string; fetched: number }[][] = [];
    session.fetchPage().subscribe((p) => pages.push(p.outcomes));

    // Match on the account id rather than a full URL: which host answers is the
    // follow's own server, resolved from the stored read-ref.
    httpMock.match((r) => r.url.includes('/accounts/q1/statuses'))[0].flush([]);

    expect(pages[0][0].ending).toBe('empty');
    expect(pages[0][0].fetched).toBe(0);
  });

  /** The surprising one: the reader's own filter is what ended the feed. */
  it('marks a source whose posts were filtered away', () => {
    const follows = TestBed.inject(AnonymousFollows);
    follows.follow(account('alice', 'https://one.example', 'a1'), 'https://mastodon.social');

    const session = TestBed.inject(AnonymousMastodonProvider).createFollowFeed(
      follows.follows(),
      () => false,
    );
    const pages: { ending: string }[][] = [];
    session.fetchPage().subscribe((p) => pages.push(p.outcomes));

    httpMock
      .match((r) => r.url.includes('/accounts/a1/statuses'))[0]
      .flush([status(account('alice', 'https://one.example', 'a1'), 'hidden')]);

    expect(pages[0][0].ending).toBe('filtered');
  });
});
