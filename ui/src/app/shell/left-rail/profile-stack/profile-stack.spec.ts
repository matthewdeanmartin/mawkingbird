import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../auth';
import { Account } from '../../../models';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { stubLocation } from '../../../testing/stub-location';
import { ProfileStack } from './profile-stack';

const ME = {
  id: '7',
  username: 'matt',
  acct: 'matt',
  display_name: 'Matt',
  note: '',
  statuses_count: 1,
  following_count: 2,
  followers_count: 3,
  avatar: 'a.png',
  avatar_static: 'a.png',
  header: '',
  header_static: '',
} as Account;

describe('ProfileStack', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** The active account plus the browser-local identity: a two-card deck. */
  function setUp(): ComponentFixture<ProfileStack> {
    TestBed.inject(AnonymousAccount).activate('https://mastodon.social');
    TestBed.inject(Auth).account.set(ME);
    const fixture = TestBed.createComponent(ProfileStack);
    fixture.detectChanges();
    httpMock.match(() => true).forEach((req) => req.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<ProfileStack>, selector: string): string {
    return fixture.nativeElement.querySelector(selector)?.textContent?.trim() ?? '';
  }

  it('opens the active identity and leaves the others peeking', () => {
    const fixture = setUp();

    const peeks = fixture.nativeElement.querySelectorAll('.peek');
    expect(peeks).toHaveLength(1);
    expect(peeks[0].textContent).toContain('Anonymous');
    expect(text(fixture, '.profile-name')).toContain('Matt');
  });

  it('deals a peeking card to the front when its tab is clicked', () => {
    const fixture = setUp();

    fixture.nativeElement.querySelector('.peek').click();
    fixture.detectChanges();

    expect(text(fixture, '.profile-name')).toContain('Anonymous');
    expect(fixture.nativeElement.querySelector('.peek').textContent).toContain('Matt');
    expect(localStorage.getItem('mockingbird_rail_profile')).toBe('anonymous');
  });

  it('reopens the card chosen last time', () => {
    localStorage.setItem('mockingbird_rail_profile', 'anonymous');

    const fixture = setUp();

    expect(text(fixture, '.profile-name')).toContain('Anonymous');
  });

  it('falls back to the first card when the remembered one is gone', () => {
    localStorage.setItem('mockingbird_rail_profile', 'bluesky:did:plc:vanished');

    const fixture = setUp();

    expect(text(fixture, '.profile-name')).toContain('Matt');
  });

  it('switches to the local identity and re-bootstraps the app', () => {
    const reload = vi.fn();
    stubLocation({ onReload: reload });
    const fixture = setUp();
    fixture.nativeElement.querySelector('.peek').click();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.switch-btn').click();

    expect(TestBed.inject(Auth).isAnonymous).toBe(true);
    expect(reload).toHaveBeenCalled();
  });

  it('renders nothing when there is no identity at all', () => {
    const fixture = TestBed.createComponent(ProfileStack);
    fixture.detectChanges();
    httpMock.match(() => true).forEach((req) => req.flush([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.stack')).toBeNull();
  });
});
