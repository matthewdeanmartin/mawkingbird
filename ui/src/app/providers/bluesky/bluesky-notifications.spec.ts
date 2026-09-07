import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskyNotifications, BlueskyNotificationPage } from './bluesky-notifications';
import { seedBskySession } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';
const LIST = `${SERVICE}/xrpc/app.bsky.notification.listNotifications`;
const GET_POSTS = `${SERVICE}/xrpc/app.bsky.feed.getPosts`;
const AUTHOR = { did: 'did:plc:bob', handle: 'bob.bsky.social' };
const MY_POST = 'at://did:plc:me/app.bsky.feed.post/aaa';

function like(uri: string, subject = MY_POST) {
  return {
    uri,
    cid: 'c',
    author: AUTHOR,
    reason: 'like',
    reasonSubject: subject,
    record: { $type: 'app.bsky.feed.like', createdAt: '2026-08-01T10:00:00.000Z' },
    isRead: false,
    indexedAt: '2026-08-01T10:00:05.000Z',
  };
}

function reply(uri: string) {
  return {
    uri,
    cid: 'c',
    author: AUTHOR,
    reason: 'reply',
    reasonSubject: MY_POST,
    record: {
      $type: 'app.bsky.feed.post',
      text: 'a reply',
      createdAt: '2026-08-01T10:00:00.000Z',
    },
    isRead: false,
    indexedAt: '2026-08-01T10:00:05.000Z',
  };
}

function post(uri = MY_POST) {
  return {
    uri,
    cid: 'cid-p',
    author: { did: 'did:plc:me', handle: 'me.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: 'original', createdAt: '2026-08-01T09:00:00Z' },
    indexedAt: '2026-08-01T09:00:01.000Z',
  };
}

describe('BlueskyNotifications', () => {
  let httpMock: HttpTestingController;
  let service: BlueskyNotifications;

  beforeEach(() => {
    localStorage.clear();
    seedBskySession({
      service: SERVICE,
      handle: 'me.bsky.social',
      did: 'did:plc:me',
      accessJwt: 'access-1',
      refreshJwt: 'refresh-1',
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(BlueskyNotifications);
  });

  afterEach(() => httpMock.verify());

  it('hydrates like subjects in one batched call', () => {
    let page: BlueskyNotificationPage | null = null;
    service.page(null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === LIST)
      .flush({
        notifications: [like('at://x/like/1'), like('at://x/like/2')],
        cursor: 'cur-1',
      });

    const posts = httpMock.expectOne((r) => r.url === GET_POSTS);
    // Deduped: two likes on the same post is one uri.
    expect(posts.request.params.getAll('uris')).toEqual([MY_POST]);
    posts.flush({ posts: [post()] });

    expect(page!.notifications).toHaveLength(2);
    expect(page!.notifications[0].status?.content).toBe('<p>original</p>');
    expect(page!.cursor).toBe('cur-1');
  });

  it('makes no getPosts call when a page needs no hydration', () => {
    let page: BlueskyNotificationPage | null = null;
    service.page(null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === LIST)
      .flush({ notifications: [reply('at://x/post/1')], cursor: 'c' });

    httpMock.expectNone((r) => r.url === GET_POSTS);
    expect(page!.notifications[0].status?.content).toBe('<p>a reply</p>');
  });

  it('renders rows whose subject getPosts did not return', () => {
    // Measured live: nine uris in, eight posts out, no error.
    let page: BlueskyNotificationPage | null = null;
    service.page(null).subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === LIST)
      .flush({ notifications: [like('at://x/like/1')], cursor: 'c' });
    httpMock.expectOne((r) => r.url === GET_POSTS).flush({ posts: [] });

    expect(page!.notifications).toHaveLength(1);
    expect(page!.notifications[0].status).toBeUndefined();
  });

  it('treats an absent cursor as the end of the history', () => {
    let page: BlueskyNotificationPage | null = null;
    service.page(null).subscribe((p) => (page = p));

    httpMock.expectOne((r) => r.url === LIST).flush({ notifications: [reply('at://x/post/1')] });
    expect(page!.cursor).toBeNull();
  });

  it('treats a repeated cursor as the end, rather than paging forever', () => {
    let page: BlueskyNotificationPage | null = null;
    service.page('cur-9').subscribe((p) => (page = p));

    httpMock
      .expectOne((r) => r.url === LIST)
      .flush({ notifications: [reply('at://x/post/1')], cursor: 'cur-9' });
    expect(page!.cursor).toBeNull();
  });

  it('passes the cursor when paging', () => {
    service.page('cur-1').subscribe();
    const req = httpMock.expectOne((r) => r.url === LIST);
    expect(req.request.params.get('cursor')).toBe('cur-1');
    req.flush({ notifications: [] });
  });

  it('marks seen without a body beyond the timestamp', () => {
    service.markSeen().subscribe();
    const req = httpMock.expectOne(`${SERVICE}/xrpc/app.bsky.notification.updateSeen`);
    expect(Object.keys(req.request.body as object)).toEqual(['seenAt']);
    req.flush({});
  });

  it('reads the unread count', () => {
    let count = -1;
    service.unreadCount().subscribe((c) => (count = c));
    httpMock
      .expectOne((r) => r.url === `${SERVICE}/xrpc/app.bsky.notification.getUnreadCount`)
      .flush({ count: 7 });
    expect(count).toBe(7);
  });
});
