import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MastodonNotification } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { Streaming } from '../../platform/api/streaming';
import { FakeStreaming } from '../../testing/fake-streaming';
import {
  moderationWarningNotification,
  severedRelationshipsNotification,
} from '../../testing/safety-notice-fixtures';
import { Notifications, accountsNewToMe } from './notifications';
import { isSafetyNotice, SafetyNotice } from './safety-notice';

describe('SafetyNotice (parity item 2)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(Server).baseUrl.set('https://home.example');
  });

  function render(notification: MastodonNotification): HTMLElement {
    const fixture = TestBed.createComponent(SafetyNotice);
    fixture.componentRef.setInput('notification', notification);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says what the moderator did, quotes them, links the posts and the appeal page', () => {
    const el = render(moderationWarningNotification());
    expect(el.textContent).toContain('deleted some of your posts');
    expect(el.querySelector('.safety-quote')!.textContent).toContain(
      'Please keep spoilers behind a content warning.',
    );
    const posts = Array.from(el.querySelectorAll<HTMLAnchorElement>('.safety-posts a'));
    expect(posts.map((a) => a.getAttribute('href'))).toEqual(['/statuses/111', '/statuses/112']);
    const appeal = el.querySelector<HTMLAnchorElement>('.safety-link')!;
    expect(appeal.href).toBe('https://home.example/disputes/strikes/42');
    expect(appeal.target).toBe('_blank');
    expect(appeal.textContent).toContain('Appeal on home.example');
  });

  it('names an existing appeal instead of inviting a second one', () => {
    const el = render(moderationWarningNotification({ appeal: { text: 'x', state: 'pending' } }));
    expect(el.querySelector('.safety-link')!.textContent).toContain('You already appealed');
  });

  it('falls back to a generic sentence for an action this client does not know', () => {
    const el = render(moderationWarningNotification({ action: 'new_future_action', text: '' }));
    expect(el.textContent).toContain('took action on your account');
    expect(el.querySelector('.safety-quote')).toBeNull();
  });

  it.each([
    ['domain_block', 'Your server’s admins blocked bad.example'],
    ['user_domain_block', 'You blocked bad.example'],
    ['account_suspension', 'Your server’s admins suspended bad.example'],
  ])('explains a %s severance with both counts and the download link', (type, sentence) => {
    const el = render(severedRelationshipsNotification({ type }));
    expect(el.textContent).toContain(sentence);
    expect(el.textContent).toContain('You lost 3 followers and 2 people you followed');
    const link = el.querySelector<HTMLAnchorElement>('.safety-link')!;
    expect(link.href).toBe('https://home.example/severed_relationships');
    expect(link.textContent).toContain('Download the list on home.example');
  });

  it('recognises only the two safety types', () => {
    expect(isSafetyNotice(moderationWarningNotification())).toBe(true);
    expect(isSafetyNotice(severedRelationshipsNotification())).toBe(true);
    expect(isSafetyNotice({ ...moderationWarningNotification(), type: 'mention' })).toBe(false);
  });
});

describe('Notifications with safety notices', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: new FakeStreaming() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).setToken('notifications-test-token');
  });

  afterEach(() => {
    // The audience filter asks for relationships; the answer does not matter here.
    for (const request of httpMock.match((r) => r.url === '/api/v1/accounts/relationships')) {
      request.flush([]);
    }
    // Opening the inbox reads the notifications marker ("+N since you last looked").
    httpMock.match((r) => r.url === '/api/v1/markers').forEach((r) => r.flush({}));
    httpMock.verify();
  });

  function setUp(): ComponentFixture<Notifications> {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/notifications')
      .flush([moderationWarningNotification(), severedRelationshipsNotification()]);
    fixture.detectChanges();
    return fixture;
  }

  it('renders both notices instead of dropping them', () => {
    const el = setUp().nativeElement as HTMLElement;
    expect(
      Array.from(el.querySelectorAll('[data-safety]')).map((n) => n.getAttribute('data-safety')),
    ).toEqual(['moderation_warning', 'severed_relationships']);
  });

  it('keeps them visible when type and audience filters hide everything else', () => {
    const fixture = setUp();
    const c = fixture.componentInstance as unknown as {
      typeFilter: WritableSignal<string>;
      audience: WritableSignal<string>;
      visible: Signal<MastodonNotification[]>;
    };
    c.typeFilter.set('favourite');
    c.audience.set('mutuals');
    fixture.detectChanges();
    expect(c.visible().map((n) => n.type)).toEqual(['moderation_warning', 'severed_relationships']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-safety]')).toHaveLength(
      2,
    );
  });

  it('never lists the notices as accounts new to me', () => {
    const rel = {
      id: 'me',
      following: false,
      followed_by: false,
      requested: false,
      blocking: false,
      muting: false,
    } as never;
    expect(
      accountsNewToMe(
        [moderationWarningNotification(), severedRelationshipsNotification()],
        new Map([['me', rel]]),
      ),
    ).toEqual([]);
  });
});
