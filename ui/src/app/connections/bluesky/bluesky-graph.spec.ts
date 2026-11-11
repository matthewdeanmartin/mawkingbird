import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskyGraph } from './bluesky-graph';
import { seedBskySession } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';
const DID = 'did:plc:them';
const FOLLOW_URI = 'at://did:plc:me/app.bsky.graph.follow/abc123';

describe('BlueskyGraph', () => {
  let httpMock: HttpTestingController;
  let graph: BlueskyGraph;

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
    graph = TestBed.inject(BlueskyGraph);
  });

  afterEach(() => httpMock.verify());

  it('follow creates a graph.follow record naming the subject DID', () => {
    let result: { following: boolean } | null = null;
    graph.follow(DID).subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`);
    const body = req.request.body as {
      collection: string;
      record: { subject: string; $type: string };
    };
    expect(body.collection).toBe('app.bsky.graph.follow');
    expect(body.record.subject).toBe(DID);
    req.flush({ uri: FOLLOW_URI, cid: 'cid-1' });

    expect(result!.following).toBe(true);
  });

  it('unfollow deletes the record remembered from the follow, with no extra lookup', () => {
    graph.follow(DID).subscribe();
    httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`).flush({
      uri: FOLLOW_URI,
      cid: 'cid-1',
    });

    let result: { following: boolean } | null = null;
    graph.unfollow(DID).subscribe((r) => (result = r));

    // No getProfile call: the uri was cached by the follow above.
    const del = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`);
    expect(del.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.graph.follow',
      rkey: 'abc123',
    });
    del.flush({});

    expect(result!.following).toBe(false);
  });

  it('unfollow on a cold cache resolves the record uri from the profile first', () => {
    graph.unfollow(DID).subscribe();

    const profile = httpMock.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'));
    expect(profile.request.params.get('actor')).toBe(DID);
    profile.flush({ did: DID, handle: 'them.bsky.social', viewer: { following: FOLLOW_URI } });

    const del = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`);
    expect((del.request.body as { rkey: string }).rkey).toBe('abc123');
    del.flush({});
  });

  it('unfollow when no follow record exists reports not-following without deleting', () => {
    let result: { following: boolean } | null = null;
    graph.unfollow(DID).subscribe((r) => (result = r));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'))
      .flush({ did: DID, handle: 'them.bsky.social', viewer: {} });

    // Nothing to delete; the end state is what the caller asked for.
    httpMock.expectNone(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`);
    expect(result!.following).toBe(false);
  });

  it('relationship maps viewer state onto Mastodon shape', () => {
    let rel: { following: boolean; followed_by: boolean; muting: boolean } | null = null;
    graph.relationship(DID).subscribe((r) => (rel = r));

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'))
      .flush({
        did: DID,
        handle: 'them.bsky.social',
        viewer: { following: FOLLOW_URI, followedBy: 'at://x/y/z', muted: true },
      });

    expect(rel!).toMatchObject({ following: true, followed_by: true, muting: true });
  });

  it('relationship caches the follow uri so a later unfollow needs no second read', () => {
    graph.relationship(DID).subscribe();
    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'))
      .flush({ did: DID, handle: 'them.bsky.social', viewer: { following: FOLLOW_URI } });

    graph.unfollow(DID).subscribe();
    httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`).flush({});
  });

  it('block writes a graph.block record naming the subject', () => {
    let rel: { blocking: boolean } | null = null;
    graph.block(DID).subscribe((r) => (rel = r));

    const req = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`);
    expect(req.request.body).toMatchObject({
      collection: 'app.bsky.graph.block',
      record: { subject: DID },
    });
    req.flush({ uri: 'at://did:plc:me/app.bsky.graph.block/b1', cid: 'c' });

    expect(rel!.blocking).toBe(true);
  });

  it('unblock deletes the remembered block record with no extra lookup', () => {
    graph.block(DID).subscribe();
    httpMock
      .expectOne(`${SERVICE}/xrpc/com.atproto.repo.createRecord`)
      .flush({ uri: 'at://did:plc:me/app.bsky.graph.block/b1', cid: 'c' });

    let rel: { blocking: boolean } | null = null;
    graph.unblock(DID).subscribe((r) => (rel = r));

    const del = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`);
    expect(del.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.graph.block',
      rkey: 'b1',
    });
    del.flush({});
    expect(rel!.blocking).toBe(false);
  });

  it('unblock on a cold cache resolves the record uri from the profile', () => {
    graph.unblock(DID).subscribe();

    httpMock
      .expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'))
      .flush({
        did: DID,
        handle: 'them.bsky.social',
        viewer: { blocking: 'at://did:plc:me/app.bsky.graph.block/b9' },
      });

    const del = httpMock.expectOne(`${SERVICE}/xrpc/com.atproto.repo.deleteRecord`);
    expect((del.request.body as { rkey: string }).rkey).toBe('b9');
    del.flush({});
  });

  it('mute is a procedure, so unmuting needs only the DID', () => {
    // Unlike follow and block there is no record and no uri to keep.
    let rel: { muting: boolean } | null = null;
    graph.mute(DID).subscribe((r) => (rel = r));
    const mute = httpMock.expectOne(`${SERVICE}/xrpc/app.bsky.graph.muteActor`);
    expect(mute.request.body).toEqual({ actor: DID });
    mute.flush({});
    expect(rel!.muting).toBe(true);

    graph.unmute(DID).subscribe((r) => (rel = r));
    const unmute = httpMock.expectOne(`${SERVICE}/xrpc/app.bsky.graph.unmuteActor`);
    expect(unmute.request.body).toEqual({ actor: DID });
    unmute.flush({});
    expect(rel!.muting).toBe(false);
  });
});
