import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsPrivacy } from './settings-privacy';

/** Exposes SettingsPrivacy's protected signals for white-box testing. */
interface SettingsPrivacyInternals {
  locked: WritableSignal<boolean>;
  discoverable: WritableSignal<boolean>;
  bot: WritableSignal<boolean>;
  privacy: WritableSignal<string>;
  sensitive: WritableSignal<boolean>;
  language: WritableSignal<string>;
  saved: WritableSignal<string | null>;
  commit(field: string, value: boolean | string): void;
  errorFor(field: string): string | null;
}

function internals(fixture: ComponentFixture<SettingsPrivacy>): SettingsPrivacyInternals {
  return fixture.componentInstance as unknown as SettingsPrivacyInternals;
}

describe('SettingsPrivacy', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<SettingsPrivacy> {
    const fixture = TestBed.createComponent(SettingsPrivacy);
    fixture.detectChanges();
    return fixture;
  }

  it('loads flags from verify_credentials', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ locked: true, discoverable: false, bot: true });

    expect(internals(fixture).locked()).toBe(true);
    expect(internals(fixture).discoverable()).toBe(false);
    expect(internals(fixture).bot()).toBe(true);
    expect(internals(fixture).privacy()).toBe('public');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Esperanto');
  });

  it('PATCHes immediately, sending only the field that changed', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ locked: false, discoverable: true, bot: false });

    internals(fixture).commit('locked', true);

    const req = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('locked')).toBe('true');
    // A FormData update writes every key it names, so the other rows must not
    // ride along — one of them could be a stale value this page never reloaded.
    expect(body.has('discoverable')).toBe(false);
    expect(body.has('bot')).toBe(false);
    expect(body.has('source[privacy]')).toBe(false);

    req.flush({ locked: true, discoverable: true, bot: false });
    expect(internals(fixture).saved()).toBe('locked');
  });

  it('maps posting defaults onto their source[...] keys', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});

    internals(fixture).commit('privacy', 'private');
    const privacyReq = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect((privacyReq.request.body as FormData).get('source[privacy]')).toBe('private');
    privacyReq.flush({});

    internals(fixture).commit('language', 'fr');
    const langReq = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect((langReq.request.body as FormData).get('source[language]')).toBe('fr');
    langReq.flush({});
  });

  // Showing "locked" for an account the server left public is the one way this
  // page must not be wrong.
  it('reverts the control and says why when the write fails', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ locked: false, discoverable: true, bot: false });

    internals(fixture).commit('locked', true);
    expect(internals(fixture).locked()).toBe(true);

    httpMock
      .expectOne('/api/v1/accounts/update_credentials')
      .flush('nope', { status: 403, statusText: 'Forbidden' });

    expect(internals(fixture).locked()).toBe(false);
    expect(internals(fixture).errorFor('locked')).toContain("won't let you");
    expect(internals(fixture).saved()).toBeNull();
  });

  it('blames the connection, not the reader, when the server is unreachable', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});

    internals(fixture).commit('bot', true);
    httpMock
      .expectOne('/api/v1/accounts/update_credentials')
      .error(new ProgressEvent('network error'));

    expect(internals(fixture).bot()).toBe(false);
    expect(internals(fixture).errorFor('bot')).toContain('reach the server');
  });

  it('keeps an error on the row that caused it', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});

    internals(fixture).commit('locked', true);
    httpMock
      .expectOne('/api/v1/accounts/update_credentials')
      .flush('nope', { status: 500, statusText: 'Server Error' });

    expect(internals(fixture).errorFor('locked')).not.toBeNull();
    expect(internals(fixture).errorFor('bot')).toBeNull();
  });
});
