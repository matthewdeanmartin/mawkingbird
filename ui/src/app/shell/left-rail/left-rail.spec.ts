import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../models';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { LeftRail } from './left-rail';

describe('LeftRail', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
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
});
