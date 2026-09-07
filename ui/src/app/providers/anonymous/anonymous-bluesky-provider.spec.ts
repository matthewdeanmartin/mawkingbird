import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { Account } from '../../models';
import { Auth } from '../../auth';
import { AnonymousFollows } from './anonymous-follows';
import { AnonymousBlueskyProvider } from './anonymous-bluesky-provider';

function bskyAccount(handle: string, did: string): Account {
  return {
    id: `bsky:${did}`,
    username: handle,
    acct: handle,
    display_name: handle,
    note: '',
    url: `https://bsky.app/profile/${handle}`,
    avatar: '',
    avatar_static: '',
    header: '',
    header_static: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  };
}

/** One `getAuthorFeed` item, trimmed to what the adapter reads. */
function feedItem(uri: string, did: string, handle: string, createdAt: string) {
  return {
    post: {
      uri,
      cid: `cid-${uri}`,
      author: { did, handle, displayName: handle },
      record: { text: `post ${uri}`, createdAt },
      indexedAt: createdAt,
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
    },
  };
}

/**
 * Bluesky in the **anonymous** experience: no account on any network.
 *
 * The point of this provider is that someone too impatient to sign up for either
 * service can still follow a handful of people and get a real feed. Everything
 * it needs answers unauthenticated on the public AppView (measured 2026-08-13).
 */
describe('AnonymousBlueskyProvider', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  function goAnonymous(): void {
    TestBed.inject(Auth).enterAnonymous();
  }

  function followAlice(): void {
    TestBed.inject(AnonymousFollows).follow(bskyAccount('alice.bsky.social', 'did:plc:alice'), '');
  }

  describe('linked', () => {
    it('is false with no Bluesky follows', () => {
      goAnonymous();
      expect(TestBed.inject(AnonymousBlueskyProvider).linked()).toBe(false);
    });

    it('is true once an anonymous visitor follows a Bluesky account', () => {
      goAnonymous();
      followAlice();
      expect(TestBed.inject(AnonymousBlueskyProvider).linked()).toBe(true);
    });

    it('ignores Mastodon follows', () => {
      goAnonymous();
      TestBed.inject(AnonymousFollows).follow(
        {
          ...bskyAccount('bob', 'x'),
          id: 'example.social:bob',
          url: 'https://example.social/@bob',
        },
        'https://example.social',
      );
      expect(TestBed.inject(AnonymousBlueskyProvider).linked()).toBe(false);
    });

    it('is false for a non-anonymous account', () => {
      TestBed.inject(Auth).setToken('tok');
      followAlice();
      expect(TestBed.inject(AnonymousBlueskyProvider).linked()).toBe(false);
    });
  });

  describe('fetchPage', () => {
    it('pages the author feed of each followed account, newest first', async () => {
      goAnonymous();
      followAlice();
      TestBed.inject(AnonymousFollows).follow(bskyAccount('bob.bsky.social', 'did:plc:bob'), '');

      const provider = TestBed.inject(AnonymousBlueskyProvider);
      provider.reset();
      const page = firstValueFrom(provider.fetchPage());

      // Anonymous: the public AppView, with no Authorization header.
      const reqs = httpMock.match((r) => r.url.includes('app.bsky.feed.getAuthorFeed'));
      expect(reqs).toHaveLength(2);
      expect(reqs[0].request.url).toContain('public.api.bsky.app');
      expect(reqs[0].request.headers.has('Authorization')).toBe(false);

      reqs[0].flush({
        feed: [
          feedItem(
            'at://did:plc:alice/app.bsky.feed.post/1',
            'did:plc:alice',
            'alice.bsky.social',
            '2026-08-12T10:00:00.000Z',
          ),
        ],
        cursor: null,
      });
      reqs[1].flush({
        feed: [
          feedItem(
            'at://did:plc:bob/app.bsky.feed.post/1',
            'did:plc:bob',
            'bob.bsky.social',
            '2026-08-12T11:00:00.000Z',
          ),
        ],
        cursor: null,
      });

      const statuses = await page;
      expect(statuses).toHaveLength(2);
      // Merged across authors and sorted newest-first, like the Mastodon side.
      expect(statuses[0].created_at > statuses[1].created_at).toBe(true);
    });

    it('tags posts as `bluesky`, not a provider id of its own', async () => {
      goAnonymous();
      followAlice();
      const provider = TestBed.inject(AnonymousBlueskyProvider);

      // The aggregator stamps `status.provider = provider.id`, and that id
      // drives PROVIDER_CAPS and serverKnowsStatus. These are real Bluesky
      // posts — a separate id would have declared them unknown territory.
      expect(provider.id).toBe('bluesky');

      provider.reset();
      const page = firstValueFrom(provider.fetchPage());
      httpMock.expectOne((r) => r.url.includes('getAuthorFeed')).flush({ feed: [], cursor: null });
      await page;
    });

    it('keeps the round alive when one account fails', async () => {
      goAnonymous();
      followAlice();
      TestBed.inject(AnonymousFollows).follow(bskyAccount('bob.bsky.social', 'did:plc:bob'), '');

      const provider = TestBed.inject(AnonymousBlueskyProvider);
      provider.reset();
      const page = firstValueFrom(provider.fetchPage());

      const reqs = httpMock.match((r) => r.url.includes('getAuthorFeed'));
      reqs[0].flush({}, { status: 500, statusText: 'Server Error' });
      reqs[1].flush({
        feed: [
          feedItem(
            'at://did:plc:bob/app.bsky.feed.post/1',
            'did:plc:bob',
            'bob.bsky.social',
            '2026-08-12T11:00:00.000Z',
          ),
        ],
        cursor: null,
      });

      // One unreadable account must not discard the posts that loaded fine —
      // the same rule the Mastodon side follows.
      const statuses = await page;
      expect(statuses).toHaveLength(1);
      expect(provider.errors()).toHaveLength(1);
    });
  });
});
