import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../../auth';
import { ClientPrefs } from '../../../client-prefs';
import { SettingsI18n } from './settings-i18n';

interface Internals {
  postingLang: WritableSignal<string>;
  postingLanguageSaved: WritableSignal<boolean>;
  savePostingLanguage(): void;
}

function internals(fixture: ComponentFixture<SettingsI18n>): Internals {
  return fixture.componentInstance as unknown as Internals;
}

describe('SettingsI18n', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Auth).mode.set('mastodon');
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function setUp(): ComponentFixture<SettingsI18n> {
    const fixture = TestBed.createComponent(SettingsI18n);
    fixture.detectChanges();
    http.expectOne('/api/v1/accounts/verify_credentials').flush({ source: { language: 'fr' } });
    fixture.detectChanges();
    return fixture;
  }

  it('offers Esperanto among known and posting languages', () => {
    const fixture = setUp();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Esperanto');
    expect(internals(fixture).postingLang()).toBe('fr');
  });

  it('updates the same server-side posting language preference', () => {
    const fixture = setUp();
    internals(fixture).postingLang.set('eo');
    internals(fixture).savePostingLanguage();

    const request = http.expectOne('/api/v1/accounts/update_credentials');
    expect(request.request.method).toBe('PATCH');
    expect((request.request.body as FormData).get('source[language]')).toBe('eo');
    request.flush({ source: { language: 'eo' } });

    expect(internals(fixture).postingLanguageSaved()).toBe(true);
    expect(TestBed.inject(ClientPrefs).knownLanguages()).toContain('eo');
  });
});
