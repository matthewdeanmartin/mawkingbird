import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { BskyRef } from '../providers/bluesky/bluesky-types';
import { ReportDialog } from './report-dialog';

describe('ReportDialog', () => {
  let http: HttpTestingController;
  const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
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

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modalDescriptor],
      ['close', closeDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
    http.verify();
  });

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
  it('retains shared-field values on Mastodon failure and retries the same payload once', async () => {
    const f = setUp();
    f.componentRef.setInput('provider', 'mastodon');
    f.componentRef.setInput('accountId', '7');
    f.componentRef.setInput('statusId', '42');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const select = el.querySelector('select')!;
    select.value = 'violation';
    select.dispatchEvent(new Event('change'));
    // Choosing "violation" asks the server for its rules; this one has none.
    http.expectOne('/api/v1/instance/rules').flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne('/api/v1/instance/terms_of_service')
      .flush(null, { status: 404, statusText: 'Not Found' });
    const comment = el.querySelector('textarea')!;
    comment.value = ' Keep this comment ';
    comment.dispatchEvent(new Event('input'));
    await f.whenStable();
    f.detectChanges();
    const labels = Array.from(el.querySelectorAll('label')).map((l) => l.htmlFor);
    expect(labels).toEqual([select.id, comment.id]);
    f.componentInstance.submit();
    f.componentInstance.submit();
    f.detectChanges();
    const request = http.expectOne('/api/v1/reports');
    const expected = {
      account_id: '7',
      category: 'violation',
      comment: 'Keep this comment',
      status_ids: ['42'],
    };
    expect(request.request.body).toEqual(expected);
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    expect(el.querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Could not send this report to Mastodon',
    );
    expect(comment.value).toBe(' Keep this comment ');
    expect(select.value).toBe('violation');
    const submitted = vi.fn();
    f.componentInstance.submitted.subscribe(submitted);
    f.componentInstance.submit();
    const retry = http.expectOne('/api/v1/reports');
    expect(retry.request.body).toEqual(expected);
    retry.flush({});
    expect(submitted).toHaveBeenCalledOnce();
  });

  function setUpMastodon(acct: string): ComponentFixture<ReportDialog> {
    const f = TestBed.createComponent(ReportDialog);
    f.componentRef.setInput('username', acct.split('@')[0]);
    f.componentRef.setInput('accountId', '7');
    f.componentRef.setInput('provider', 'mastodon');
    f.componentRef.setInput('account', { id: '7', acct, username: acct.split('@')[0] } as never);
    f.detectChanges();
    return f;
  }

  function chooseViolation(f: ComponentFixture<ReportDialog>): void {
    const select = (f.nativeElement as HTMLElement).querySelector('select')!;
    select.value = 'violation';
    select.dispatchEvent(new Event('change'));
    http.expectOne('/api/v1/instance/rules').flush([
      { id: 'r1', text: 'No spam', hint: '' },
      { id: 'r2', text: 'No harassment', hint: 'Be kind' },
    ]);
    http
      .expectOne('/api/v1/instance/terms_of_service')
      .flush(null, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
  }

  it('sends the chosen server rule ids with a violation report', () => {
    const f = setUpMastodon('local');
    chooseViolation(f);
    const boxes = (f.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      '.report-rules input[type="checkbox"]',
    );
    expect(boxes.length).toBe(2);
    boxes[1].click();
    f.detectChanges();
    f.componentInstance.submit();
    const request = http.expectOne('/api/v1/reports');
    expect(request.request.body).toEqual({
      account_id: '7',
      category: 'violation',
      rule_ids: ['r2'],
    });
    request.flush({});
  });

  it('requires a rule before sending a violation report when the server has rules', () => {
    const f = setUpMastodon('local');
    chooseViolation(f);
    f.componentInstance.submit();
    f.detectChanges();
    expect(
      (f.nativeElement as HTMLElement).querySelector('mb-notice [role="alert"]')?.textContent,
    ).toContain('Choose at least one rule');
    http.expectNone('/api/v1/reports');
  });

  it('offers forwarding only for remote accounts and sends it only when chosen', () => {
    const local = setUpMastodon('local');
    expect((local.nativeElement as HTMLElement).textContent).not.toContain('anonymous copy');

    const f = setUpMastodon('them@remote.example');
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Also send an anonymous copy to remote.example');
    f.componentInstance.submit();
    const first = http.expectOne('/api/v1/reports');
    expect(first.request.body).toEqual({ account_id: '7', category: 'spam' });
    first.flush({});

    const forwardBox = el.querySelector<HTMLInputElement>('mb-checkbox input[type="checkbox"]')!;
    forwardBox.click();
    f.detectChanges();
    f.componentInstance.submit();
    const second = http.expectOne('/api/v1/reports');
    expect(second.request.body).toEqual({ account_id: '7', category: 'spam', forward: true });
    second.flush({});
  });

  it('attaches the collection being reported', () => {
    const f = setUpMastodon('curator@remote.example');
    f.componentRef.setInput('collectionId', 'col-7');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain(
      'Reporting a specific collection.',
    );
    f.componentInstance.submit();
    const request = http.expectOne('/api/v1/reports');
    expect(request.request.body).toEqual({
      account_id: '7',
      category: 'spam',
      collection_ids: ['col-7'],
    });
    request.flush({});
  });

  it('refuses a Bluesky post report without its exact reference', () => {
    const f = setUp();
    f.componentRef.setInput('statusId', 'missing-ref');
    f.detectChanges();
    f.componentInstance.submit();
    f.detectChanges();
    expect(
      (f.nativeElement as HTMLElement).querySelector('mb-notice [role="alert"]')?.textContent,
    ).toContain('exact Bluesky post');
    http.expectNone('https://bsky.social/xrpc/com.atproto.moderation.createReport');
    http.expectNone('/api/v1/reports');
  });
});
