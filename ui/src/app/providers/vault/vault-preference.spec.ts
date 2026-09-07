import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlusFeatures } from '../account/plus-features';
import { VAULT_TEST_ROLLOUT, VaultPreference } from './vault-preference';

describe('VaultPreference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('cannot be activated outside the test rollout even when the stored choice is on', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: VAULT_TEST_ROLLOUT, useValue: false }],
    });

    expect(TestBed.inject(PlusFeatures).isOn('apiKeys')).toBe(true);
    expect(TestBed.inject(VaultPreference).enabled()).toBe(false);
  });

  it('is on by default for the test rollout and can be switched off', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: VAULT_TEST_ROLLOUT, useValue: true }],
    });
    const preference = TestBed.inject(VaultPreference);

    expect(preference.enabled()).toBe(true);
    preference.set(false);
    expect(preference.enabled()).toBe(false);
  });
});
