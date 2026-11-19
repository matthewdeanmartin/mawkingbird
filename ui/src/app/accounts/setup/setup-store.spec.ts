import { beforeEach, describe, expect, it } from 'vitest';
import { scopeSuffixForToken } from '../../platform/session/account-scope';
import { classifyStorageKey } from '../../platform/storage/storage-registry';
import { sanitizePath } from '../../platform/diagnostics/analytics-tracker';
import {
  ACCOUNT_SETUP_KEY,
  armSetup,
  isYoungEmptyAccount,
  noteSignupReturn,
  readSetup,
  setupRedirectFor,
  takeSignupReturn,
  writeSetup,
} from './setup-store';

const NOW = Date.parse('2026-11-18T15:00:00Z');

describe('account setup store', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice-token');
    takeSignupReturn();
  });

  it('arms a new account once and never re-arms one that has a record', () => {
    armSetup(scopeSuffixForToken('alice-token'), 'signup', 'twitter');
    expect(readSetup()).toMatchObject({ state: 'armed', source: 'signup', hint: 'twitter' });

    writeSetup({ version: 1, state: 'running', source: 'signup', answered: ['welcome'] });
    armSetup(scopeSuffixForToken('alice-token'), 'young');
    expect(readSetup()).toMatchObject({ state: 'running', answered: ['welcome'] });
  });

  it('ignores an empty scope and drops unknown purpose or movers values', () => {
    armSetup('', 'signup');
    expect(localStorage.getItem(ACCOUNT_SETUP_KEY)).toBeNull();

    localStorage.setItem(
      `${ACCOUNT_SETUP_KEY}${scopeSuffixForToken('alice-token')}`,
      JSON.stringify({ state: 'running', answered: ['x', 3], purpose: 'spy', movers: 'bluesky' }),
    );
    const record = readSetup()!;
    expect(record.answered).toEqual(['x']);
    expect(record.purpose).toBeUndefined();
    expect(record.movers).toBe('bluesky');
  });

  it('is registered as private and per account', () => {
    const key = `${ACCOUNT_SETUP_KEY}${scopeSuffixForToken('alice-token')}`;
    expect(classifyStorageKey(key)).toMatchObject({ sensitivity: 'private', suffix: 'account' });
  });

  it('treats only a minutes-old account with no posts or follows as young', () => {
    const young = { created_at: '2026-11-18T00:00:00.000Z', statuses_count: 0, following_count: 0 };
    expect(isYoungEmptyAccount(young, NOW)).toBe(true);
    // Date precision: yesterday's midnight is still within the window.
    expect(isYoungEmptyAccount({ ...young, created_at: '2026-11-17T00:00:00.000Z' }, NOW)).toBe(
      true,
    );
    expect(isYoungEmptyAccount({ ...young, created_at: '2026-11-15T00:00:00.000Z' }, NOW)).toBe(
      false,
    );
    expect(isYoungEmptyAccount({ ...young, statuses_count: 1 }, NOW)).toBe(false);
    expect(isYoungEmptyAccount({ ...young, following_count: 3 }, NOW)).toBe(false);
    expect(isYoungEmptyAccount({ ...young, created_at: undefined }, NOW)).toBe(false);
  });

  it('hands a sign-up return to exactly one taker', () => {
    expect(takeSignupReturn()).toBeNull();
    noteSignupReturn('twitter');
    expect(takeSignupReturn()).toEqual({ hint: 'twitter' });
    expect(takeSignupReturn()).toBeNull();
  });

  it('sends only an armed account, and only from Home, to setup', () => {
    expect(setupRedirectFor('/home')).toBeNull();
    armSetup(scopeSuffixForToken('alice-token'), 'young');
    expect(setupRedirectFor('/home')).toBe('/setup');
    expect(setupRedirectFor('/home?x=1')).toBe('/setup');
    expect(setupRedirectFor('/unbird')).toBeNull();
    writeSetup({ ...readSetup()!, state: 'running' });
    expect(setupRedirectFor('/home')).toBeNull();
  });

  it('keeps step paths readable for page-view counts', () => {
    expect(sanitizePath('/setup/profile')).toBe('/setup/profile');
    expect(sanitizePath('/setup/follow?x=1')).toBe('/setup/follow');
  });
});
