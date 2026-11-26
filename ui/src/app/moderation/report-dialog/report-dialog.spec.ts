import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BskyRef } from '../../connections/bluesky/bluesky-types';
import { of } from 'rxjs';
import { AuthorModeration } from '../author-moderation';
import { MutedPosts } from '../muted-posts';
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
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
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
  interface Rule {
    id: string;
    text: string;
    hint: string;
  }
  const RULES: Rule[] = [
    { id: 'r1', text: 'No spam', hint: '' },
    { id: 'r2', text: 'No harassment', hint: 'Be kind' },
  ];

  /** Answer the rules + terms requests the gate makes on open. */
  function flushAbout(rules: Rule[] | null = RULES, effectiveDate: string | null = null): void {
    const rulesReq = http.expectOne('/api/v1/instance/rules');
    if (rules) rulesReq.flush(rules);
    else rulesReq.flush(null, { status: 404, statusText: 'Not Found' });
    const terms = http.expectOne('/api/v1/instance/terms_of_service');
    if (effectiveDate)
      terms.flush({
        effective_date: effectiveDate,
        effective: true,
        content: 'Terms',
        succeeded_by: null,
      });
    else terms.flush(null, { status: 404, statusText: 'Not Found' });
  }

  function el(f: ComponentFixture<ReportDialog>): HTMLElement {
    return f.nativeElement as HTMLElement;
  }

  function click(f: ComponentFixture<ReportDialog>, selector: string): void {
    const target = el(f).querySelector<HTMLElement>(selector);
    expect(target, selector).not.toBeNull();
    target!.click();
    f.detectChanges();
  }

  function triage(f: ComponentFixture<ReportDialog>, choice: string): void {
    click(f, `[data-triage="${choice}"]`);
  }

  /** A Mastodon dialog; `about` false when rules/terms are already cached. */
  function openMastodon(acct: string, statusId?: string): ComponentFixture<ReportDialog> {
    const f = TestBed.createComponent(ReportDialog);
    f.componentRef.setInput('username', acct.split('@')[0]);
    f.componentRef.setInput('accountId', '7');
    f.componentRef.setInput('provider', 'mastodon');
    f.componentRef.setInput('account', { id: '7', acct, username: acct.split('@')[0] } as never);
    if (statusId) f.componentRef.setInput('statusId', statusId);
    f.detectChanges();
    return f;
  }

  function setUpMastodon(
    acct: string,
    opts: { rules?: Rule[] | null; passGate?: boolean; statusId?: string } = {},
  ): ComponentFixture<ReportDialog> {
    const f = openMastodon(acct, opts.statusId);
    flushAbout(opts.rules === undefined ? RULES : opts.rules);
    f.detectChanges();
    if (opts.passGate !== false) click(f, '[data-gate-continue]');
    return f;
  }

  function freshModule(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  }

  describe('the gate before a Mastodon report', () => {
    it('names the reader’s server and its rules before anything else', () => {
      const f = setUpMastodon('them@remote.example', { passGate: false });
      const text = el(f).textContent ?? '';
      expect(text).toContain('Before you report');
      expect(text).toContain('Reports from your account go to the moderators of');
      expect(text).toContain('We have not recorded where');
      expect(text).toContain('has published 2 rules');
      expect(el(f).querySelector('[data-triage]')).toBeNull();
      expect(el(f).querySelector('textarea')).toBeNull();
    });

    it('cannot be passed until the rules and terms have loaded', () => {
      const f = openMastodon('local');
      const button = el(f).querySelector<HTMLButtonElement>('[data-gate-continue]')!;
      expect(button.disabled).toBe(true);
      flushAbout();
      f.detectChanges();
      expect(button.disabled).toBe(false);
    });

    it('is shown once per server, and again when its terms change', () => {
      setUpMastodon('local');
      freshModule();
      // Same server, nothing changed: rules and terms come from the cache.
      const again = openMastodon('local');
      expect(el(again).querySelector('[data-gate-continue]')).toBeNull();
      expect(el(again).querySelector('[data-triage="spam"]')).not.toBeNull();

      // New terms take effect.
      localStorage.removeItem('mockingbird_server_about_v1');
      freshModule();
      const changed = openMastodon('local');
      flushAbout(RULES, '2026-12-01');
      changed.detectChanges();
      expect(el(changed).querySelector('[data-gate-continue]')).not.toBeNull();
    });
  });

  describe('what’s going on', () => {
    it('offers mute, block, hide and filter without sending a report', () => {
      const moderation = TestBed.inject(AuthorModeration);
      const mute = vi.spyOn(moderation, 'mute').mockReturnValue(of(undefined));
      const block = vi.spyOn(moderation, 'block').mockReturnValue(of(undefined));
      vi.spyOn(moderation, 'route').mockReturnValue('mastodon');
      const f = setUpMastodon('them@remote.example', { statusId: '42' });
      triage(f, 'dontWant');
      expect(el(f).textContent).toContain('Stop seeing this');
      expect(el(f).querySelector('textarea')).toBeNull();

      click(f, '[data-alt="mute"]');
      expect(mute).toHaveBeenCalledWith(expect.objectContaining({ provider: 'mastodon' }), null);
      expect(el(f).textContent).toContain('Done.');
      click(f, '[data-alt="block"]');
      expect(block).toHaveBeenCalledOnce();
      click(f, '[data-alt="hide"]');
      expect(TestBed.inject(MutedPosts).isMuted('42')).toBe(true);
      http.expectNone('/api/v1/reports');
    });

    it('can still go on to a report from the alternatives', () => {
      const f = setUpMastodon('local');
      triage(f, 'dontWant');
      click(f, '.link-button');
      triage(f, 'spam');
      expect(el(f).querySelector('textarea')).not.toBeNull();
      expect(el(f).querySelector('[data-who-reads]')?.textContent).toContain(
        'Read by the moderators of',
      );
    });

    it('sends a legal report with its category and a note on jurisdiction', () => {
      const f = setUpMastodon('local');
      triage(f, 'legal');
      expect(el(f).textContent).toContain('under the law of the place they operate from');
      f.componentInstance.submit();
      const request = http.expectOne('/api/v1/reports');
      expect(request.request.body).toEqual({ account_id: '7', category: 'legal' });
      request.flush({});
    });
  });

  it('retains shared-field values on Mastodon failure and retries the same payload once', async () => {
    const f = setUpMastodon('local', { rules: null, statusId: '42' });
    triage(f, 'violation');
    // Let ngModel's first (async) write land before typing, as a person would.
    await f.whenStable();
    const comment = el(f).querySelector('textarea')!;
    comment.value = ' Keep this comment ';
    comment.dispatchEvent(new Event('input'));
    await f.whenStable();
    f.detectChanges();
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
    expect(el(f).querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Could not send this report to Mastodon',
    );
    expect(comment.value).toBe(' Keep this comment ');
    const submitted = vi.fn();
    f.componentInstance.submitted.subscribe(submitted);
    f.componentInstance.submit();
    const retry = http.expectOne('/api/v1/reports');
    expect(retry.request.body).toEqual(expected);
    retry.flush({});
    expect(submitted).toHaveBeenCalledOnce();
  });

  it('sends the chosen server rule ids with a violation report', () => {
    const f = setUpMastodon('local');
    triage(f, 'violation');
    const boxes = el(f).querySelectorAll<HTMLInputElement>('.report-rules input[type="checkbox"]');
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
    triage(f, 'violation');
    f.componentInstance.submit();
    f.detectChanges();
    expect(el(f).querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Choose at least one rule',
    );
    http.expectNone('/api/v1/reports');
  });

  it('offers forwarding only for remote accounts and sends it only when chosen', () => {
    const local = setUpMastodon('local');
    triage(local, 'spam');
    expect(el(local).textContent).not.toContain('anonymous copy');

    // The gate was acknowledged above, so this dialog opens on triage.
    const f = openMastodon('them@remote.example');
    triage(f, 'spam');
    expect(el(f).textContent).toContain('Also send an anonymous copy to remote.example');
    expect(el(f).textContent).toContain('remote.example’s own rules');
    f.componentInstance.submit();
    const first = http.expectOne('/api/v1/reports');
    expect(first.request.body).toEqual({ account_id: '7', category: 'spam' });
    first.flush({});

    const forwardBox = el(f).querySelector<HTMLInputElement>('mb-checkbox input[type="checkbox"]')!;
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
    expect(el(f).textContent).toContain('Reporting a specific collection.');
    f.componentInstance.submit();
    const request = http.expectOne('/api/v1/reports');
    expect(request.request.body).toEqual({
      account_id: '7',
      category: 'spam',
      collection_ids: ['col-7'],
    });
    request.flush({});
  });

  it('skips the server gate for Bluesky and offers only ignore-or-report', () => {
    const f = setUp();
    expect(el(f).querySelector('[data-gate-continue]')).toBeNull();
    const choices = [...el(f).querySelectorAll('[data-triage]')].map((b) =>
      b.getAttribute('data-triage'),
    );
    expect(choices).toEqual(['dontWant', 'report']);
    triage(f, 'report');
    expect(el(f).textContent).toContain("Bluesky's moderation service");
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
