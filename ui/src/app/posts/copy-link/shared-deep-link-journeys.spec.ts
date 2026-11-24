import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { anonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { blueskyRouteFor } from '../../accounts/bluesky-links';
import { starterPackPath } from '../../connections/bluesky/bluesky-starter-packs';
import { LiteMode } from '../../lite/lite-mode';
import { SearchServer } from '../../platform/http/search-server';
import { Server } from '../../platform/http/server';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { authGuard } from '../../platform/session/auth.guard';
import { ThreadLoader } from '../../reading/read/thread-loader';
import { attachmentSource, watchParams } from '../../reading/video-player/media-source';
import { seedBskySession } from '../../testing/seed-storage';
import { accountDeepLink, postDeepLink } from './deep-links';

const BSKY_ID = 'bsky:at://did:plc:alice/app.bsky.feed.post/3kxyz';
const BSKY_URI = BSKY_ID.slice('bsky:'.length);
const MASTODON_ORIGINAL = 'https://far.example/@alice@far.example/42';

function post(provider: Status['provider'], id: string): Status {
  return {
    id,
    provider,
    account: {
      id:
        provider === 'bluesky'
          ? 'bsky:did:plc:alice'
          : provider === 'twitter'
            ? 'twitter:@alice'
            : '42',
      username: 'alice',
      acct:
        provider === 'bluesky'
          ? 'alice.bsky.social'
          : provider === 'twitter'
            ? 'alice'
            : 'alice@far.example',
    },
  } as Status;
}

describe('shared deep links opened in a fresh browser', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [Auth, Server, provideRouter([])] });
  });

  function enter(url: string): boolean | UrlTree {
    const target = new URL(url, 'https://mawkingbird.com');
    const path = target.pathname + target.search;
    return TestBed.runInInjectionContext(() => authGuard({} as never, { url: path } as never)) as
      boolean | UrlTree;
  }

  it.each([
    ['Mastodon post', () => postDeepLink(post('mastodon', '42'), 'https://far.example')],
    [
      'Mastodon account',
      () => accountDeepLink(post('mastodon', '42').account, 'mastodon', 'far.example'),
    ],
    ['Bluesky post', () => postDeepLink(post('bluesky', BSKY_ID), '')],
    ['Bluesky profile', () => accountDeepLink(post('bluesky', BSKY_ID).account, 'bluesky', null)],
    ['Twitter post', () => postDeepLink(post('twitter', 'twitter:99'), '')],
    [
      'Twitter profile',
      () => accountDeepLink(post('twitter', 'twitter:99').account, 'twitter', null),
    ],
  ] as const)('keeps a copied %s link on its destination instead of Home', (_name, makeLink) => {
    const link = makeLink();
    expect(link).toMatch(/^https:\/\/mawkingbird\.com\//);
    expect(enter(link!)).toBe(true);
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
  });

  it('admits a Bluesky Watch link from a video post without a signed-in account', () => {
    const status = post('bluesky', BSKY_ID);
    const source = attachmentSource({
      type: 'video',
      url: 'https://video.bsky.app/a.mp4',
    } as never)!;
    const params = watchParams(status, source, 'https://mastodon.social', 'v1');
    expect(params['post']).toBe(BSKY_ID);
    expect(enter(`/watch?${new URLSearchParams(params)}`)).toBe(true);
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
  });

  it.each(['/watch', '/listen'])(
    'admits a %s link to a Mastodon post without an account',
    (page) => {
      const params = new URLSearchParams({
        post: '42',
        server: 'https://far.example',
        acct: 'alice@far.example',
      });
      expect(enter(`${page}?${params}`)).toBe(true);
      expect(TestBed.inject(Auth).isAnonymous).toBe(true);
    },
  );

  it('opens a shared Lite post in the full app for a visitor with no account', () => {
    expect(enter('/m/bookmarks').toString()).toBe('/');
    const result = enter('/m/far.example/@alice@far.example/42');
    expect(result.toString()).toBe('/far.example/@alice@far.example/42');
    expect(enter(result.toString())).toBe(true);
  });

  it('does not bounce between Lite and the full app for a reader Lite cannot serve', () => {
    sessionStorage.setItem('mockingbird_lite', 'on');
    expect(TestBed.inject(LiteMode).on()).toBe(true);
    enter('/m/statuses/42');
    expect(TestBed.inject(LiteMode).on()).toBe(false);
    sessionStorage.clear();
  });

  it('opens a shared Bluesky starter pack anonymously', () => {
    const path = TestBed.inject(Router)
      .createUrlTree(starterPackPath('at://did:plc:alice/app.bsky.graph.starterpack/3pack'))
      .toString();
    expect(path).toBe('/bluesky/starter-packs/did:plc:alice/3pack');
    expect(enter(path)).toBe(true);
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
  });

  it('opens a shared Bluesky feed anonymously', () => {
    const route = blueskyRouteFor('https://bsky.app/profile/did:plc:alice/feed/birds');
    expect(route).not.toBeNull();
    const path = TestBed.inject(Router).createUrlTree(route!).toString();
    expect(path).toContain('/feeds/bluesky/');
    expect(enter(path)).toBe(true);
    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
  });

  it.each([
    '/settings/profile',
    '/bookmarks',
    '/watch',
    '/listen',
    '/bsky/profile',
    '/twitter/invalid!/status/1',
  ])('keeps a private or malformed link behind the front door: %s', (url) => {
    expect(enter(url)).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Auth).isAnonymous).toBe(false);
  });
});

describe('shared post retrieval without a recipient session', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        ThreadLoader,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: { lacksMastodonToken: true } },
        { provide: SearchServer, useValue: { active: () => false } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads a public Bluesky post through the unauthenticated AppView', () => {
    const loader = TestBed.inject(ThreadLoader);
    loader.load(BSKY_ID);
    const request = http.expectOne(
      (req) => req.url === 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread',
    );
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.params.get('uri')).toBe(BSKY_URI);
    request.flush({
      thread: {
        post: {
          uri: BSKY_URI,
          cid: 'cid-1',
          author: { did: 'did:plc:alice', handle: 'alice.bsky.social' },
          record: {
            $type: 'app.bsky.feed.post',
            text: 'Public video',
            createdAt: '2026-11-16T10:00:00.000Z',
          },
          indexedAt: '2026-11-16T10:00:01.000Z',
        },
      },
    });
    expect(loader.loading()).toBe(false);
    expect(loader.status()?.id).toBe(BSKY_ID);
    http.verify();
  });

  it('keeps the authenticated Bluesky route for a reader with a linked account', () => {
    seedBskySession({
      service: 'https://bsky.social',
      handle: 'reader.bsky.social',
      did: 'did:plc:reader',
      accessJwt: 'reader-token',
      refreshJwt: 'refresh-token',
    });
    const loader = TestBed.inject(ThreadLoader);
    loader.load(BSKY_ID);
    const request = http.expectOne(
      (req) => req.url === 'https://bsky.social/xrpc/app.bsky.feed.getPostThread',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer reader-token');
    request.flush({ thread: { post: null } });
    expect(loader.loading()).toBe(false);
    http.verify();
  });

  it('does not invent access when Bluesky refuses or cannot find the post', () => {
    const loader = TestBed.inject(ThreadLoader);
    loader.load(BSKY_ID);
    http
      .expectOne(
        (req) =>
          req.url === 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread' &&
          req.params.get('uri') === BSKY_URI,
      )
      .flush({ error: 'NotFound' }, { status: 404, statusText: 'Not Found' });
    expect(loader.loading()).toBe(false);
    expect(loader.status()).toBeNull();
    http.verify();
  });

  it('leaves a private Mastodon post unavailable and retains its original link', () => {
    const loader = TestBed.inject(ThreadLoader);
    loader.load(
      anonymousStatusRouteRef({
        server: 'https://far.example',
        id: '42',
        originalUrl: MASTODON_ORIGINAL,
      }),
    );
    http
      .expectOne('https://far.example/api/v1/statuses/42')
      .flush('private', { status: 403, statusText: 'Forbidden' });
    http
      .expectOne('https://far.example/api/v1/statuses/42/context')
      .flush('private', { status: 403, statusText: 'Forbidden' });
    expect(loader.loading()).toBe(false);
    expect(loader.status()).toBeNull();
    expect(loader.publicOriginalUrl()).toBe(MASTODON_ORIGINAL);
    http.verify();
  });
});
