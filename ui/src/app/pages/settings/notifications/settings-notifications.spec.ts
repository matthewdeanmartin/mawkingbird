import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockSettings } from '../../../models';
import { SettingsNotifications } from './settings-notifications';

/** Exposes SettingsNotifications' protected signals for white-box testing. */
interface SettingsNotificationsInternals {
  follow: WritableSignal<boolean>;
  followRequest: WritableSignal<boolean>;
  digest: WritableSignal<boolean>;
  saved: WritableSignal<boolean>;
  save(): void;
}

function internals(
  fixture: ComponentFixture<SettingsNotifications>,
): SettingsNotificationsInternals {
  return fixture.componentInstance as unknown as SettingsNotificationsInternals;
}

function makeSettings(): MockSettings {
  return {
    appearance: {
      theme: 'auto',
      reduce_motion: false,
      disable_swiping: false,
      expand_spoilers: false,
      display_media: 'default',
    },
    email_notifications: {
      follow: true,
      follow_request: false,
      reblog: true,
      favourite: false,
      mention: true,
      report: false,
      digest: true,
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

describe('SettingsNotifications', () => {
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

  function setUp(): ComponentFixture<SettingsNotifications> {
    const fixture = TestBed.createComponent(SettingsNotifications);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the email_notifications section from mock settings', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    expect(internals(fixture).follow()).toBe(true);
    expect(internals(fixture).followRequest()).toBe(false);
    expect(internals(fixture).digest()).toBe(true);
  });

  it('save() PUTs only the email_notifications section', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    internals(fixture).followRequest.set(true);
    internals(fixture).save();

    const req = httpMock.expectOne('/api/v1/_mock/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      email_notifications: {
        follow: true,
        follow_request: true,
        reblog: true,
        favourite: false,
        mention: true,
        report: false,
        digest: true,
      },
    });
    req.flush(makeSettings());

    expect(internals(fixture).saved()).toBe(true);
  });
});
