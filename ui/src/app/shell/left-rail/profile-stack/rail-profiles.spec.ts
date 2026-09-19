import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../../api';
import { AnonymousTags } from '../../../providers/anonymous/anonymous-tags';
import { Auth } from '../../../auth';
import { Account } from '../../../models';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { BskySession } from '../../../providers/bluesky/bluesky-session';
import { RailProfiles } from './rail-profiles';
import { seedBskySession } from '../../../testing/seed-storage';

const ME = {
  id: '7',
  username: 'matt',
  acct: 'matt',
  display_name: 'Matt',
  note: '<p>bio</p>',
  statuses_count: 120,
  following_count: 42,
  followers_count: 300,
  avatar: 'a.png',
  avatar_static: 'a.png',
  header: 'h.png',
  header_static: 'h.png',
} as Account;

const BSKY: BskySession = {
  service: 'https://bsky.social',
  handle: 'matt.bsky.social',
  did: 'did:plc:matt',
  accessJwt: 'access',
  refreshJwt: 'refresh',
  displayName: 'Matt on Bsky',
};

describe('RailProfiles', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  function flushFollowedTags(count = 3): void {
    httpMock
      .expectOne((req) => req.url.includes('followed_tags'))
      .flush(Array.from({ length: count }, (_, i) => ({ name: `tag${i}` })));
  }

  it('refreshes after successful actions, coalesces bursts, and rejects late account responses', () => {
    vi.useFakeTimers();
    const auth = TestBed.inject(Auth);
    auth.setToken('first');
    auth.account.set(ME);
    const api = TestBed.inject(Api);
    const rail = TestBed.inject(RailProfiles);
    rail.load();
    flushFollowedTags();
    api.follow('friend').subscribe();
    api.postStatus('hello').subscribe();
    httpMock.expectOne('/api/v1/accounts/friend/follow').flush({ id: 'friend', following: true });
    httpMock.expectOne('/api/v1/statuses').flush({ id: 'new' });
    vi.advanceTimersByTime(100);
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ ...ME, following_count: 43, statuses_count: 121 });
    expect(rail.profiles()[0].stats.map((stat) => stat.value)).toEqual([121, 43, 300, 3]);
    api.deleteStatus('new').subscribe();
    httpMock.expectOne('/api/v1/statuses/new').flush({ id: 'new' });
    vi.advanceTimersByTime(100);
    const stale = httpMock.expectOne('/api/v1/accounts/verify_credentials');
    auth.setToken('second');
    auth.account.set({ ...ME, id: 'other' });
    stale.flush({ ...ME, statuses_count: 120 });
    expect(auth.account()?.id).toBe('other');
  });

  it('refreshes hashtag totals on follow/unfollow but leaves them intact on failed writes', () => {
    vi.useFakeTimers();
    TestBed.inject(Auth).account.set(ME);
    const api = TestBed.inject(Api);
    const rail = TestBed.inject(RailProfiles);
    rail.load();
    flushFollowedTags(1);
    api.followTag('cat').subscribe();
    httpMock.expectOne('/api/v1/tags/cat/follow').flush({ name: 'cat', following: true });
    vi.advanceTimersByTime(100);
    flushFollowedTags(2);
    expect(rail.profiles()[0].stats[3].value).toBe(2);
    api.unfollowTag('cat').subscribe();
    httpMock.expectOne('/api/v1/tags/cat/unfollow').flush({ name: 'cat', following: false });
    vi.advanceTimersByTime(100);
    flushFollowedTags(1);
    expect(rail.profiles()[0].stats[3].value).toBe(1);
    api.followTag('bad').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/v1/tags/bad/follow').flush({}, { status: 500, statusText: 'Failed' });
    vi.advanceTimersByTime(100);
    httpMock.expectNone((req) => req.url.includes('followed_tags'));
    expect(rail.profiles()[0].stats[3].value).toBe(1);
  });

  it('cards the active account first, with its stats', () => {
    TestBed.inject(Auth).account.set(ME);
    const rail = TestBed.inject(RailProfiles);

    rail.load();
    flushFollowedTags(3);

    const [card] = rail.profiles();
    expect(rail.profiles()).toHaveLength(1);
    expect(card.key).toBe('mastodon:7');
    expect(card.network).toBe('Mastodon');
    expect(card.active).toBe(true);
    expect(card.link).toEqual(['/accounts', '7']);
    expect(card.stats.map((stat) => stat.value)).toEqual([120, 42, 300, 3]);
  });

  it('adds a Bluesky card once its profile answers', () => {
    seedBskySession(BSKY);
    TestBed.inject(Auth).account.set(ME);
    const rail = TestBed.inject(RailProfiles);

    rail.load();
    flushFollowedTags();
    httpMock
      .expectOne((req) => req.url.includes('app.bsky.actor.getProfile'))
      .flush({
        did: BSKY.did,
        handle: BSKY.handle,
        displayName: 'Matt 🦋',
        description: 'skeets only',
        followersCount: 9,
        followsCount: 8,
        postsCount: 7,
      });

    const bsky = rail.profiles()[1];
    expect(bsky.key).toBe('bluesky:did:plc:matt');
    expect(bsky.badge).toBe('🦋');
    expect(bsky.displayName).toBe('Matt 🦋');
    expect(bsky.bioText).toBe('skeets only');
    expect(bsky.href).toBe('https://bsky.app/profile/matt.bsky.social');
    expect(bsky.stats.map((stat) => stat.value)).toEqual([7, 8, 9]);
  });

  it('keeps the Bluesky card, without counts, when its profile fetch fails', () => {
    seedBskySession(BSKY);
    TestBed.inject(Auth).account.set(ME);
    const rail = TestBed.inject(RailProfiles);

    rail.load();
    flushFollowedTags();
    httpMock
      .expectOne((req) => req.url.includes('app.bsky.actor.getProfile'))
      .flush(null, { status: 500, statusText: 'Server Error' });

    const bsky = rail.profiles()[1];
    expect(bsky.displayName).toBe('Matt on Bsky');
    expect(bsky.stats).toEqual([]);
  });

  it('offers the browser-local identity as its own card when it is not active', () => {
    TestBed.inject(AnonymousAccount).activate('https://mastodon.social');
    TestBed.inject(Auth).account.set(ME);
    const rail = TestBed.inject(RailProfiles);

    rail.load();
    flushFollowedTags();

    const local = rail.profiles()[1];
    expect(local.key).toBe('anonymous');
    expect(local.badge).toBe('🎭');
    expect(local.active).toBe(false);
    expect(local.switchTo).toBe('anonymous');
  });

  it('does not advertise a local identity that has never been used', () => {
    TestBed.inject(Auth).account.set(ME);
    const rail = TestBed.inject(RailProfiles);

    rail.load();
    flushFollowedTags();

    expect(rail.profiles().some((card) => card.key === 'anonymous')).toBe(false);
  });

  it('counts local follows and hashtags instead of asking the server in local mode', () => {
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    TestBed.inject(AnonymousAccount).activate('https://mastodon.social');
    const rail = TestBed.inject(RailProfiles);

    rail.load();
    httpMock.expectNone((req) => req.url.includes('followed_tags'));

    const [card] = rail.profiles();
    expect(rail.profiles()).toHaveLength(1);
    expect(card.key).toBe('anonymous');
    expect(card.active).toBe(true);
    expect(card.badge).toBe('🎭');
    TestBed.inject(AnonymousTags).follow('caturday');
    expect(rail.profiles()[0].stats[3].value).toBe(1);
  });
});
