import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs } from '../../../client-prefs';
import { AppearanceSettings, MockSettings } from '../../../models';
import { SettingsAppearance } from './settings-appearance';

/** Exposes SettingsAppearance's protected signals for white-box testing. */
interface SettingsAppearanceInternals {
  displayMedia: WritableSignal<AppearanceSettings['display_media']>;
  reduceMotion: WritableSignal<boolean>;
  expandSpoilers: WritableSignal<boolean>;
  saved: WritableSignal<boolean>;
  save(): void;
}

function internals(fixture: ComponentFixture<SettingsAppearance>): SettingsAppearanceInternals {
  return fixture.componentInstance as unknown as SettingsAppearanceInternals;
}

function makeSettings(): MockSettings {
  return {
    appearance: {
      theme: 'dark',
      reduce_motion: true,
      disable_swiping: false,
      expand_spoilers: false,
      display_media: 'show_all',
    },
    email_notifications: {
      follow: true,
      follow_request: true,
      reblog: true,
      favourite: true,
      mention: true,
      report: false,
      digest: false,
    },
    post_deletion: {
      enabled: false,
      min_age_days: 30,
      keep_pinned: true,
      keep_favourited: false,
      keep_media: false,
      keep_polls: false,
      min_favourites: 0,
      min_reblogs: 0,
    },
  };
}

describe('SettingsAppearance', () => {
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

  function setUp(): ComponentFixture<SettingsAppearance> {
    const fixture = TestBed.createComponent(SettingsAppearance);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the server-backed rows from mock settings (theme stays client-side)', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    expect(internals(fixture).displayMedia()).toBe('show_all');
    expect(internals(fixture).reduceMotion()).toBe(true);
    // The stored server theme no longer drives the UI; ClientPrefs does.
    expect(TestBed.inject(ClientPrefs).themeMode()).toBe('auto');
  });

  it('save() PUTs only the appearance section, sourcing theme from ClientPrefs', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    TestBed.inject(ClientPrefs).setThemeMode('light');
    internals(fixture).expandSpoilers.set(true);
    internals(fixture).save();

    const req = httpMock.expectOne('/api/v1/_mock/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      appearance: {
        theme: 'light',
        display_media: 'show_all',
        reduce_motion: true,
        disable_swiping: false,
        expand_spoilers: true,
      },
    });
    req.flush(makeSettings());

    expect(internals(fixture).saved()).toBe(true);
  });

  it('theme radio changes apply instantly through ClientPrefs', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    const prefs = TestBed.inject(ClientPrefs);
    prefs.setThemeMode('dark');
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
