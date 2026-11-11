import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsAccount } from './settings-account';

/** Exposes SettingsAccount's protected signals for white-box testing. */
interface SettingsAccountInternals {
  acct: WritableSignal<string>;
  newPassword: WritableSignal<string>;
  confirmPassword: WritableSignal<string>;
  passwordError: WritableSignal<string>;
  saved: WritableSignal<boolean>;
  changePassword(): void;
}

function internals(fixture: ComponentFixture<SettingsAccount>): SettingsAccountInternals {
  return fixture.componentInstance as unknown as SettingsAccountInternals;
}

describe('SettingsAccount', () => {
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

  function setUp(): ComponentFixture<SettingsAccount> {
    const fixture = TestBed.createComponent(SettingsAccount);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({ acct: 'alice' });
    return fixture;
  }

  it('loads the account handle from verify_credentials', () => {
    const fixture = setUp();
    expect(internals(fixture).acct()).toBe('alice');
  });

  it('rejects a mismatched password confirmation without any request', () => {
    const fixture = setUp();
    internals(fixture).newPassword.set('secret1');
    internals(fixture).confirmPassword.set('secret2');

    internals(fixture).changePassword();

    expect(internals(fixture).passwordError()).toContain('do not match');
    expect(internals(fixture).saved()).toBe(false);
  });

  it('simulates a successful password change client-side only', () => {
    const fixture = setUp();
    internals(fixture).newPassword.set('secret1');
    internals(fixture).confirmPassword.set('secret1');

    internals(fixture).changePassword();

    expect(internals(fixture).passwordError()).toBe('');
    expect(internals(fixture).saved()).toBe(true);
    expect(internals(fixture).newPassword()).toBe('');
  });
});
