import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockSettings } from '../../../models';
import { SettingsDeletion } from './settings-deletion';

/** Exposes SettingsDeletion's protected signals for white-box testing. */
interface SettingsDeletionInternals {
  enabled: WritableSignal<boolean>;
  minAgeDays: WritableSignal<number>;
  keepPinned: WritableSignal<boolean>;
  minFavourites: WritableSignal<number>;
  saved: WritableSignal<boolean>;
  save(): void;
}

function internals(fixture: ComponentFixture<SettingsDeletion>): SettingsDeletionInternals {
  return fixture.componentInstance as unknown as SettingsDeletionInternals;
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
      follow_request: true,
      reblog: true,
      favourite: true,
      mention: true,
      report: false,
      digest: false,
    },
    post_deletion: {
      enabled: true,
      min_age_days: 14,
      keep_pinned: true,
      keep_favourited: true,
      keep_media: false,
      keep_polls: false,
      min_favourites: 5,
      min_reblogs: 0,
    },
  };
}

describe('SettingsDeletion', () => {
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

  function setUp(): ComponentFixture<SettingsDeletion> {
    const fixture = TestBed.createComponent(SettingsDeletion);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the post_deletion section from mock settings', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    expect(internals(fixture).enabled()).toBe(true);
    expect(internals(fixture).minAgeDays()).toBe(14);
    expect(internals(fixture).minFavourites()).toBe(5);
  });

  it('save() PUTs only the post_deletion section', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/_mock/settings').flush(makeSettings());

    internals(fixture).minAgeDays.set(60);
    internals(fixture).keepPinned.set(false);
    internals(fixture).save();

    const req = httpMock.expectOne('/api/v1/_mock/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      post_deletion: {
        enabled: true,
        min_age_days: 60,
        keep_pinned: false,
        keep_favourited: true,
        keep_media: false,
        keep_polls: false,
        min_favourites: 5,
        min_reblogs: 0,
      },
    });
    req.flush(makeSettings());

    expect(internals(fixture).saved()).toBe(true);
  });
});
