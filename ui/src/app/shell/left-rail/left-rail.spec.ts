import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../platform/api/models';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { LeftRail } from './left-rail';
import { ProfileContentState } from '../../accounts/profile/profile-content-filters';

describe('LeftRail', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [LeftRail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // The drafts card is deferred, which needs its component compiled first.
    await TestBed.compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('routes a Bluesky suggestion follow through the native graph', async () => {
    TestBed.inject(BlueskySession).session.set({
      service: 'https://bsky.social',
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      accessJwt: 'access-jwt',
      refreshJwt: 'refresh-jwt',
    });
    const rail = TestBed.runInInjectionContext(() => new LeftRail());
    const account = {
      id: 'bsky:did:plc:them',
      username: 'them.bsky.social',
      acct: 'them.bsky.social',
      display_name: 'Them',
    } as Account;

    rail.follow(account);
    const follow = http.expectOne('https://bsky.social/xrpc/com.atproto.repo.createRecord');
    expect(follow.request.body).toMatchObject({
      repo: 'did:plc:me',
      collection: 'app.bsky.graph.follow',
      record: { subject: 'did:plc:them' },
    });
    follow.flush({
      uri: 'at://did:plc:me/app.bsky.graph.follow/f1',
      cid: 'follow-cid',
    });
    await vi.waitFor(() => {
      const followed = (rail as unknown as { followed(): ReadonlySet<string> }).followed();
      expect(followed.has(account.id)).toBe(true);
    });
    http.expectNone('/api/v1/accounts/bsky:did:plc:them/follow');
  });

  it('shows the profile filters under the profile card, only on a profile', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: '**', children: [] }]);
    const state = TestBed.inject(ProfileContentState);
    const fixture = TestBed.createComponent(LeftRail);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
    };

    await router.navigateByUrl('/accounts/123');
    state.claim({});
    await settle();
    expect(el.querySelector('app-profile-content-filters')).not.toBeNull();

    // A profile kept alive in the background still holds its claim, but not on Home.
    await router.navigateByUrl('/home');
    await settle();
    expect(el.querySelector('app-profile-content-filters')).toBeNull();
    // The rail's own reads (trends, followed tags) are not what this test is about.
    http.match(() => true).forEach((request) => request.flush([]));
  });
});
