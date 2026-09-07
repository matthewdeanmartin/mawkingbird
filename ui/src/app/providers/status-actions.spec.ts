import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { Status } from '../models';
import { BlueskyApi } from './bluesky/bluesky-api';
import { BskyRef } from './bluesky/bluesky-types';
import { StatusActions } from './status-actions';

function makeStatus(overrides: Partial<Status> = {}): Status {
  return {
    id: '1',
    created_at: '2026-07-14T00:00:00.000Z',
    edited_at: null,
    content: '<p>x</p>',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'a' } as Status['account'],
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 2,
    favourites_count: 5,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...overrides,
  };
}

function bskyStatus(overrides: Partial<Status> = {}): Status {
  const ref: BskyRef = {
    uri: 'at://did:plc:x/app.bsky.feed.post/1',
    cid: 'cid-1',
    likeUri: null,
    repostUri: null,
    replyRoot: { uri: 'at://root', cid: 'cid-root' },
    replyParentUri: null,
    externalUri: null,
  };
  return makeStatus({ provider: 'bluesky', providerRef: ref, id: 'bsky:at://...', ...overrides });
}

describe('StatusActions', () => {
  let api: {
    favourite: ReturnType<typeof vi.fn>;
    unfavourite: ReturnType<typeof vi.fn>;
    reblog: ReturnType<typeof vi.fn>;
    unreblog: ReturnType<typeof vi.fn>;
  };
  let bsky: {
    like: ReturnType<typeof vi.fn>;
    repost: ReturnType<typeof vi.fn>;
    deleteRecord: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = { favourite: vi.fn(), unfavourite: vi.fn(), reblog: vi.fn(), unreblog: vi.fn() };
    bsky = { like: vi.fn(), repost: vi.fn(), deleteRecord: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: BlueskyApi, useValue: bsky },
      ],
    });
  });

  it('routes Mastodon statuses through the Mastodon API, exactly as before', async () => {
    const updated = makeStatus({ favourited: true });
    api.favourite.mockReturnValue(of(updated));

    const actions = TestBed.inject(StatusActions);
    expect(await firstValueFrom(actions.toggleFavourite(makeStatus()))).toBe(updated);
    expect(api.favourite).toHaveBeenCalledWith('1');
    expect(bsky.like).not.toHaveBeenCalled();
  });

  // The anonymous adapter namespaces ids as `anonymous-mastodon:<host>:<rawId>` so
  // several sources can share a feed. That prefix is ours, not the server's: sending
  // it back 404s. These two pin the unwrap for both actions, because a like that
  // silently 404s looks exactly like a like that was never sent.
  it('favourites a namespaced anonymous status against the raw server id', async () => {
    const status = makeStatus({
      id: 'anonymous-mastodon:localhost:8080:01JQZ',
      provider: 'anonymous-mastodon',
      providerRef: { server: 'http://localhost:8080', statusId: '01JQZ', accountId: 'a' },
    });
    api.favourite.mockReturnValue(of(status));

    const actions = TestBed.inject(StatusActions);
    await firstValueFrom(actions.toggleFavourite(status));
    expect(api.favourite).toHaveBeenCalledWith('01JQZ');
  });

  it('reblogs a namespaced anonymous status against the raw server id', async () => {
    const status = makeStatus({
      id: 'anonymous-mastodon:localhost:8080:01JQZ',
      provider: 'anonymous-mastodon',
      providerRef: { server: 'http://localhost:8080', statusId: '01JQZ', accountId: 'a' },
    });
    api.reblog.mockReturnValue(of(status));

    const actions = TestBed.inject(StatusActions);
    await firstValueFrom(actions.toggleReblog(status));
    expect(api.reblog).toHaveBeenCalledWith('01JQZ');
  });

  it('likes a Bluesky post via a like record and stores the record uri for undo', async () => {
    bsky.like.mockReturnValue(of({ uri: 'at://me/like/9', cid: 'c' }));
    const actions = TestBed.inject(StatusActions);

    const updated = await firstValueFrom(actions.toggleFavourite(bskyStatus()));
    expect(bsky.like).toHaveBeenCalledWith('at://did:plc:x/app.bsky.feed.post/1', 'cid-1');
    expect(updated.favourited).toBe(true);
    expect(updated.favourites_count).toBe(6);
    expect((updated.providerRef as BskyRef).likeUri).toBe('at://me/like/9');
  });

  it('unlikes by deleting the stored like record', async () => {
    bsky.deleteRecord.mockReturnValue(of({}));
    const liked = bskyStatus({ favourited: true });
    (liked.providerRef as BskyRef).likeUri = 'at://me/like/9';

    const actions = TestBed.inject(StatusActions);
    const updated = await firstValueFrom(actions.toggleFavourite(liked));
    expect(bsky.deleteRecord).toHaveBeenCalledWith('at://me/like/9');
    expect(updated.favourited).toBe(false);
    expect(updated.favourites_count).toBe(4);
    expect((updated.providerRef as BskyRef).likeUri).toBeNull();
  });

  it('reposts and un-reposts a Bluesky post the same way', async () => {
    bsky.repost.mockReturnValue(of({ uri: 'at://me/repost/7', cid: 'c' }));
    const actions = TestBed.inject(StatusActions);

    const reposted = await firstValueFrom(actions.toggleReblog(bskyStatus()));
    expect(reposted.reblogged).toBe(true);
    expect(reposted.reblogs_count).toBe(3);

    bsky.deleteRecord.mockReturnValue(of({}));
    const undone = await firstValueFrom(actions.toggleReblog(reposted));
    expect(bsky.deleteRecord).toHaveBeenCalledWith('at://me/repost/7');
    expect(undone.reblogged).toBe(false);
    expect(undone.reblogs_count).toBe(2);
  });
});
