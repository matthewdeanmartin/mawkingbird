import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthorizedApp } from '../../../models';
import { SettingsDevelopment } from './settings-development';

/** Exposes SettingsDevelopment's protected signals for white-box testing. */
interface SettingsDevelopmentInternals {
  apps: WritableSignal<AuthorizedApp[]>;
  loading: WritableSignal<boolean>;
}

function internals(fixture: ComponentFixture<SettingsDevelopment>): SettingsDevelopmentInternals {
  return fixture.componentInstance as unknown as SettingsDevelopmentInternals;
}

function makeApp(id: string): AuthorizedApp {
  return {
    id,
    name: `App ${id}`,
    website: null,
    scopes: ['read', 'write'],
    last_used_at: null,
  };
}

describe('SettingsDevelopment', () => {
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

  function setUp(): ComponentFixture<SettingsDevelopment> {
    const fixture = TestBed.createComponent(SettingsDevelopment);
    fixture.detectChanges();
    return fixture;
  }

  it('loads authorized apps on init', () => {
    const fixture = setUp();
    const a1 = makeApp('1');
    const a2 = makeApp('2');

    httpMock.expectOne('/api/v1/_mock/apps').flush([a1, a2]);

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).apps()).toEqual([a1, a2]);
  });

  it('clears loading and keeps an empty list on HTTP error', () => {
    const fixture = setUp();

    httpMock.expectOne('/api/v1/_mock/apps').error(new ProgressEvent('error'));

    expect(internals(fixture).loading()).toBe(false);
    expect(internals(fixture).apps()).toEqual([]);
  });
});
