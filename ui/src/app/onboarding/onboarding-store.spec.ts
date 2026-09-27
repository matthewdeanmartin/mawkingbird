import { beforeEach, describe, expect, it } from 'vitest';
import { scopedKey, scopeSuffixForToken } from '../account-scope';
import { classifyStorageKey } from '../storage-registry';
import {
  markOnboardingPending,
  ONBOARDING_ACCOUNT_KEY,
  ONBOARDING_APP_KEY,
  readOnboardingAccount,
  readOnboardingApp,
  writeOnboardingAccount,
  writeOnboardingApp,
} from './onboarding-store';

describe('onboarding store', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice-token');
  });

  it('marks a new account pending, and never re-arms one that has a record', () => {
    markOnboardingPending(scopeSuffixForToken('alice-token'));
    expect(readOnboardingAccount()).toMatchObject({ pending: true, answered: [] });

    writeOnboardingAccount({ version: 1, pending: false, answered: ['theme'], finished: false });
    markOnboardingPending(scopeSuffixForToken('alice-token'));
    expect(readOnboardingAccount()).toMatchObject({ pending: false, answered: ['theme'] });
  });

  it('ignores an empty scope rather than writing an unscoped key', () => {
    markOnboardingPending('');
    expect(localStorage.getItem(ONBOARDING_ACCOUNT_KEY)).toBeNull();
  });

  it('keeps app-wide progress apart from each account', () => {
    writeOnboardingApp({ version: 1, answered: ['theme'], completed: true });
    writeOnboardingAccount({
      version: 1,
      pending: false,
      answered: ['pseudonymous'],
      finished: true,
    });
    localStorage.setItem('mastodon_mock_token', 'bob-token');

    expect(readOnboardingApp()).toMatchObject({ answered: ['theme'], completed: true });
    expect(readOnboardingAccount()).toBeNull();
  });

  it('reads damaged records as fresh ones', () => {
    localStorage.setItem(ONBOARDING_APP_KEY, '{not json');
    localStorage.setItem(scopedKey(ONBOARDING_ACCOUNT_KEY), '"text"');
    expect(readOnboardingApp()).toMatchObject({ answered: [], completed: false });
    expect(readOnboardingAccount()).toBeNull();
  });

  it('classifies both keys as settings', () => {
    expect(classifyStorageKey(ONBOARDING_APP_KEY)?.sensitivity).toBe('setting');
    expect(classifyStorageKey(scopedKey(ONBOARDING_ACCOUNT_KEY))?.sensitivity).toBe('setting');
  });
});
