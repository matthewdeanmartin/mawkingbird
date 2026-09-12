import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { Server } from '../server';
import { Account, Status } from '../models';
import { PrivateFollows } from '../private-follows';
import { ClientPrefs } from '../client-prefs';
import { authInterceptor } from '../auth.interceptor';
import { serverInterceptor } from '../server.interceptor';
import { FeedAggregator } from './feed-aggregator';
import { ProviderRegistry } from './provider-registry';
import { BlueskySession } from './bluesky/bluesky-session';
import { PrivateFollowFeeds, withoutPrivateFollowDuplicates } from './private-follow-feeds';

function account(id: string): Account {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}@social.example`,
    url: `https://social.example/@user${id}`,
  } as Account;
}
function status(id: string, accountId = '1'): Status {
  return {
    id,
    account: account(accountId),
    url: `https://social.example/@user${accountId}/${id}`,
    created_at: new Date().toISOString(),
    reblog: null,
    in_reply_to_id: null,
    content: id,
  } as Status;
}

describe('PrivateFollowFeeds', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: ProviderRegistry, useValue: { linked: () => [] } },
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://social.example');
    TestBed.inject(Auth).setToken('private-reader-token');
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function follow(id: string) {
    TestBed.inject(PrivateFollows).current()!.follow(account(id), 'https://social.example');
  }
  function source() {
    const feed = TestBed.inject(PrivateFollowFeeds).sources()[0];
    feed.reset();
    return feed;
  }

  it('merges public author reads without credentials into authenticated Home and prefers its duplicate', async () => {
    follow('1');
    const aggregator = TestBed.inject(FeedAggregator);
    aggregator.reset();
    const pending = firstValueFrom(aggregator.nextPage());
    const home = http.expectOne((r) => r.url.endsWith('/timelines/home'));
    expect(home.request.headers.get('Authorization')).toBe('Bearer private-reader-token');
    const author = http.expectOne((r) => r.url.endsWith('/accounts/1/statuses'));
    expect(author.request.headers.has('Authorization')).toBe(false);
    expect(author.request.withCredentials).toBe(false);
    home.flush([status('same')]);
    author.flush([status('same'), status('private-only')]);
    const posts = await pending;
    expect(posts).toHaveLength(2);
    expect(posts.find((p) => p.url?.endsWith('/same'))?.privateFollow).not.toBe(true);
    expect(posts.find((p) => p.url?.endsWith('/private-only'))?.privateFollow).toBe(true);
    expect(aggregator.hasMore()).toBe(false);
  });

  it('keeps the normal Home feed when a private author refuses public reads', async () => {
    follow('1');
    const aggregator = TestBed.inject(FeedAggregator);
    aggregator.reset();
    const pending = firstValueFrom(aggregator.nextPage());
    http.expectOne((r) => r.url.endsWith('/timelines/home')).flush([status('home')]);
    http
      .expectOne((r) => r.url.endsWith('/accounts/1/statuses'))
      .flush({}, { status: 403, statusText: 'Private' });
    expect((await pending).map((p) => p.id)).toEqual(['home']);
  });

  it('bounds fan-out and rotates to the fifth author before paging a prolific first author', async () => {
    for (let i = 1; i <= 5; i++) follow(String(i));
    const feed = source();
    const first = firstValueFrom(feed.fetchPage());
    const initial = http.match((r) => r.url.includes('/statuses'));
    expect(initial).toHaveLength(4);
    initial.forEach((r, i) =>
      r.flush(i === 0 ? Array.from({ length: 20 }, (_, n) => status(String(100 - n))) : []),
    );
    expect(await first).toHaveLength(20);
    const second = firstValueFrom(feed.fetchPage());
    const requests = http.match((r) => r.url.includes('/statuses'));
    expect(requests.map((r) => r.request.url)).toEqual([
      'https://social.example/api/v1/accounts/5/statuses',
      'https://social.example/api/v1/accounts/1/statuses',
    ]);
    expect(requests[1].request.params.get('max_id')).toBe('81');
    requests[0].flush([status('fifth', '5')]);
    requests[1].flush([]);
    expect((await second).map((p) => p.url)).toContain('https://social.example/@user5/fifth');
  });

  it('does not treat four empty authors as the end of the private follow feed', async () => {
    for (let i = 1; i <= 5; i++) follow(String(i));
    const pending = firstValueFrom(source().fetchPage());
    http.match((r) => r.url.includes('/statuses')).forEach((r) => r.flush([]));
    http.expectOne((r) => r.url.endsWith('/accounts/5/statuses')).flush([status('fifth', '5')]);
    expect(await pending).toHaveLength(1);
  });

  it('uses the public Bluesky author feed even with a Mastodon identity', async () => {
    TestBed.inject(PrivateFollows)
      .current()!
      .follow(
        { id: 'bsky:did:plc:other', username: 'other', acct: 'other.bsky.social' } as Account,
        '',
      );
    const pending = firstValueFrom(source().fetchPage());
    const request = http.expectOne((r) => r.url.includes('app.bsky.feed.getAuthorFeed'));
    expect(request.request.params.get('actor')).toBe('did:plc:other');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ feed: [] });
    expect(await pending).toEqual([]);
  });

  it('discards in-flight results after switching identity', async () => {
    follow('1');
    const pending = firstValueFrom(source().fetchPage());
    const request = http.expectOne((r) => r.url.endsWith('/accounts/1/statuses'));
    TestBed.inject(Auth).setToken('different-account');
    request.flush([status('secret-interest')]);
    expect(await pending).toEqual([]);
  });

  it('omits Bluesky credentials even when that network has a linked account', async () => {
    TestBed.inject(BlueskySession).session.set({
      service: 'https://bsky.social',
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      accessJwt: 'private-token',
      refreshJwt: 'refresh',
      connectedAt: Date.now(),
    });
    TestBed.inject(PrivateFollows)
      .current()!
      .follow(
        { id: 'bsky:did:plc:other', username: 'other', acct: 'other.bsky.social' } as Account,
        '',
      );
    const pending = firstValueFrom(source().fetchPage());
    const request = http.expectOne(
      (r) => r.url === 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed',
    );
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({ feed: [] });
    expect(await pending).toEqual([]);
  });

  it('does not lose partially read pages when a round is cancelled', async () => {
    follow('1');
    follow('2');
    const feed = source();
    const subscription = feed.fetchPage().subscribe();
    const initial = http.match((r) => r.url.includes('/statuses'));
    initial[0].flush(Array.from({ length: 20 }, (_, n) => status(String(100 - n))));
    subscription.unsubscribe();
    expect(initial[1].cancelled).toBe(true);
    const next = firstValueFrom(feed.fetchPage());
    const retry = http.match((r) => r.url.includes('/statuses'));
    expect(retry).toHaveLength(2);
    expect(retry[0].request.params.has('max_id')).toBe(false);
    retry.forEach((r) => r.flush([]));
    expect(await next).toEqual([]);
  });

  it('continues to newer authors after an earlier batch crosses the Home time window', async () => {
    TestBed.inject(ClientPrefs).homeWindow.set('week');
    for (let i = 1; i <= 5; i++) follow(String(i));
    const aggregator = TestBed.inject(FeedAggregator);
    aggregator.reset();
    const pending = firstValueFrom(aggregator.nextPage());
    http.expectOne((r) => r.url.endsWith('/timelines/home')).flush([]);
    const first = http.match((r) => r.url.includes('/accounts/') && r.url.endsWith('/statuses'));
    first.forEach((r, i) =>
      r.flush([{ ...status(`old${i}`), created_at: '2000-01-01T00:00:00Z' }]),
    );
    http.expectOne((r) => r.url.endsWith('/accounts/5/statuses')).flush([status('recent', '5')]);
    expect((await pending).some((p) => p.url?.endsWith('/recent'))).toBe(true);
  });

  it('deduplicates private copies across Home pages without collapsing ordinary posts', () => {
    const publicPost = status('1');
    const privatePost = { ...publicPost, id: 'foreign:1', privateFollow: true };
    expect(withoutPrivateFollowDuplicates([privatePost, privatePost, publicPost])).toEqual([
      publicPost,
    ]);
    expect(withoutPrivateFollowDuplicates([status('1'), status('2')])).toHaveLength(2);
  });
});
