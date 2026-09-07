import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../../models';
import { ProfilePhotoView } from './profile-photo-view';
import { ProfileMediaItem } from './profile-media-item';
import { Auth } from '../../../auth';
import { seedBskyIdentity } from '../../../testing/seed-storage';

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    id: 's1',
    created_at: '2026-08-10T12:00:00.000Z',
    content: '<p>a picture</p>',
    spoiler_text: '',
    account: {
      id: '7',
      username: 'kay',
      acct: 'kay',
      display_name: 'Kay',
      avatar: '',
      avatar_static: '',
    },
    media_attachments: [],
    reblog: null,
    sensitive: false,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    ...overrides,
  } as unknown as Status;
}

function makeItem(status: Status): ProfileMediaItem {
  return {
    key: `${status.id}.0`,
    status,
    url: 'https://cdn.example/a.jpg',
    previewUrl: 'https://cdn.example/a.jpg',
    description: null,
    type: 'image',
    indexInPost: 0,
    postIndex: 0,
  };
}

describe('ProfilePhotoView comments', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function setUp(status: Status): ComponentFixture<ProfilePhotoView> {
    const fixture = TestBed.createComponent(ProfilePhotoView);
    const item = makeItem(status);
    fixture.componentRef.setInput('items', [item]);
    fixture.componentRef.setInput('activeKey', item.key);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<ProfilePhotoView>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('says there are no comments when the server has no thread (404)', () => {
    // The regression this pins: a 404 from /context is the ordinary answer for a
    // post with no replies, and for feed items whose ids this server never
    // issued. Reporting it as a load failure told the reader something was
    // broken when nothing was.
    const fixture = setUp(makeStatus());
    httpMock
      .expectOne('/api/v1/statuses/s1/context')
      .flush({ error: 'Record not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(text(fixture)).toContain('No comments yet');
    expect(text(fixture)).not.toContain('Could not load');
  });

  it('still reports a genuine failure', () => {
    const fixture = setUp(makeStatus());
    httpMock
      .expectOne('/api/v1/statuses/s1/context')
      .flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text(fixture)).toContain('Could not load the comments');
  });

  it('shows the replies the context returns', () => {
    const fixture = setUp(makeStatus());
    httpMock.expectOne('/api/v1/statuses/s1/context').flush({
      ancestors: [],
      descendants: [
        makeStatus({ id: 'r1', content: '<p>lovely shot</p>' }),
        makeStatus({ id: 'r2', content: '<p>where is this?</p>' }),
      ],
    });
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelectorAll('.photo-comment')).toHaveLength(2);
    expect(text(fixture)).toContain('lovely shot');
  });

  it('does not call the context endpoint for a feed item that has no thread', () => {
    // RSS/blog items are folded onto profiles but their ids mean nothing to the
    // server; asking would 404 every time.
    setUp(makeStatus({ provider: 'rss' }));
    httpMock.expectNone('/api/v1/statuses/s1/context');
  });

  it('deletes an owned Bluesky photo post through its AT URI', () => {
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    expect(TestBed.inject(Auth).enterBluesky()).toBe(true);
    const status = makeStatus({
      id: 'bsky:at://did:plc:me/app.bsky.feed.post/photo',
      provider: 'bluesky',
      account: {
        ...makeStatus().account,
        id: 'bsky:did:plc:me',
        username: 'me.bsky.social',
        acct: 'me.bsky.social',
      },
      providerRef: {
        uri: 'at://did:plc:me/app.bsky.feed.post/photo',
        cid: 'photo-cid',
        likeUri: null,
        repostUri: null,
        replyRoot: { uri: 'at://did:plc:me/app.bsky.feed.post/photo', cid: 'photo-cid' },
        replyParentUri: null,
        externalUri: null,
      },
    });
    const fixture = setUp(status);
    const deleted = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.deleted.subscribe(deleted);
    fixture.componentInstance.closed.subscribe(closed);
    (fixture.componentInstance as unknown as { deletePost(): void }).deletePost();

    const request = httpMock.expectOne('https://bsky.social/xrpc/com.atproto.repo.deleteRecord');
    expect(request.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.post',
      rkey: 'photo',
    });
    request.flush({});
    expect(deleted).toHaveBeenCalledWith(status);
    expect(closed).toHaveBeenCalled();
    httpMock.expectNone('/api/v1/statuses/bsky:at://did:plc:me/app.bsky.feed.post/photo');
  });

  it('bookmarks a Bluesky photo post with the native cross-device API', () => {
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    expect(TestBed.inject(Auth).enterBluesky()).toBe(true);
    const status = makeStatus({
      id: 'bsky:at://did:plc:them/app.bsky.feed.post/photo',
      provider: 'bluesky',
      providerRef: {
        uri: 'at://did:plc:them/app.bsky.feed.post/photo',
        cid: 'photo-cid',
        likeUri: null,
        repostUri: null,
        replyRoot: { uri: 'at://did:plc:them/app.bsky.feed.post/photo', cid: 'photo-cid' },
        replyParentUri: null,
        externalUri: null,
      },
    });
    const fixture = setUp(status);
    (fixture.componentInstance as unknown as { toggleBookmark(): void }).toggleBookmark();

    const request = httpMock.expectOne('https://bsky.social/xrpc/app.bsky.bookmark.createBookmark');
    expect(request.request.body).toEqual({
      uri: 'at://did:plc:them/app.bsky.feed.post/photo',
      cid: 'photo-cid',
    });
    request.flush({});
    const post = (fixture.componentInstance as unknown as { post(): Status | null }).post();
    expect(post?.bookmarked).toBe(true);
    httpMock.expectNone(
      '/api/v1/statuses/bsky:at://did:plc:them/app.bsky.feed.post/photo/bookmark',
    );
  });
});
