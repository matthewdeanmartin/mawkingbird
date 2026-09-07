import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { BskyRef } from '../providers/bluesky/bluesky-types';
import { ReportDialog } from './report-dialog';

describe('ReportDialog', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(BlueskySession).session.set({
      service: 'https://bsky.social',
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      accessJwt: 'access-jwt',
      refreshJwt: 'refresh-jwt',
    });
  });

  afterEach(() => http.verify());

  function setUp(statusRef: BskyRef | null = null): ComponentFixture<ReportDialog> {
    const fixture = TestBed.createComponent(ReportDialog);
    fixture.componentRef.setInput('username', 'them.bsky.social');
    fixture.componentRef.setInput('accountId', 'bsky:did:plc:them');
    fixture.componentRef.setInput('provider', 'bluesky');
    if (statusRef) {
      fixture.componentRef.setInput('statusId', `bsky:${statusRef.uri}`);
      fixture.componentRef.setInput('statusRef', statusRef);
    }
    fixture.detectChanges();
    return fixture;
  }

  it('submits an account report to Bluesky and emits completion', () => {
    const fixture = setUp();
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.submit();

    const request = http.expectOne('https://bsky.social/xrpc/com.atproto.moderation.createReport');
    expect(request.request.body).toMatchObject({
      reasonType: 'tools.ozone.report.defs#reasonMisleadingSpam',
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:them' },
    });
    request.flush({});
    expect(submitted).toHaveBeenCalledOnce();
  });

  it('submits a post report with its exact AT URI and CID', () => {
    const ref = {
      uri: 'at://did:plc:them/app.bsky.feed.post/1',
      cid: 'post-cid',
      likeUri: null,
      repostUri: null,
      replyRoot: { uri: 'at://did:plc:them/app.bsky.feed.post/1', cid: 'post-cid' },
      replyParentUri: null,
      externalUri: null,
    } satisfies BskyRef;
    const fixture = setUp(ref);
    fixture.componentInstance.submit();

    const request = http.expectOne('https://bsky.social/xrpc/com.atproto.moderation.createReport');
    expect(request.request.body).toMatchObject({
      subject: {
        $type: 'com.atproto.repo.strongRef',
        uri: ref.uri,
        cid: ref.cid,
      },
    });
    request.flush({});
    http.expectNone('/api/v1/reports');
  });
});
