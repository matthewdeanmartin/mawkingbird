import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNT_MODE_KEY,
  clearAllMisskeyIdentities,
  clearMisskeyIdentity,
  MK_ACTIVE_IDENTITY_KEY,
  MK_IDENTITY_CREDENTIALS_KEY,
  MK_IDENTITY_PROFILE_KEY,
  misskeyIdentities,
  misskeyIdentity,
  misskeyIdentityKey,
  misskeyIdentityKeyActive,
  misskeyOrigin,
  saveMisskeyIdentity,
  setActiveMisskeyIdentity,
  updateMisskeyProfile,
} from './misskey-identity-store';

const profile = {
  server: 'https://misskey.io',
  userId: 'u1',
  username: 'alice',
  name: 'Alice',
  avatarUrl: null,
};

describe('misskey identity store', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('normalises server addresses to an origin', () => {
    expect(misskeyOrigin('misskey.io')).toBe('https://misskey.io');
    expect(misskeyOrigin('https://Misskey.IO/')).toBe('https://misskey.io');
    expect(misskeyOrigin('https://misskey.io/notes/abc')).toBe('https://misskey.io');
    expect(misskeyOrigin('')).toBeNull();
    expect(misskeyOrigin('nodots')).toBeNull();
    expect(misskeyOrigin('javascript:alert(1)')).toBeNull();
  });

  it('keys identities by origin and user id', () => {
    expect(misskeyIdentityKey('misskey.io', 'u1')).toBe('https://misskey.io#u1');
  });

  it('keeps the token out of the profile collection', () => {
    saveMisskeyIdentity(profile, { token: 'secret-token' });
    expect(localStorage.getItem(MK_IDENTITY_PROFILE_KEY)).not.toContain('secret-token');
    expect(localStorage.getItem(MK_IDENTITY_CREDENTIALS_KEY)).toContain('secret-token');
  });

  it('round-trips an identity and activates it on request', () => {
    const key = saveMisskeyIdentity(profile, { token: 't' }, true);
    expect(key).toBe('https://misskey.io#u1');
    expect(misskeyIdentityKeyActive()).toBe(key);
    expect(misskeyIdentity()?.credentials.token).toBe('t');
  });

  it('drops an identity whose token is missing', () => {
    saveMisskeyIdentity(profile, { token: 't' });
    localStorage.removeItem(MK_IDENTITY_CREDENTIALS_KEY);
    expect(misskeyIdentities()).toEqual([]);
  });

  it('ignores a stale active pointer unless Misskey is the active kind', () => {
    const key = saveMisskeyIdentity(profile, { token: 't' });
    localStorage.setItem(MK_ACTIVE_IDENTITY_KEY, 'https://gone.example#x');
    expect(misskeyIdentityKeyActive()).toBeNull();
    localStorage.setItem(ACCOUNT_MODE_KEY, 'misskey');
    expect(misskeyIdentityKeyActive()).toBe(key);
  });

  it('refuses to activate an unknown identity', () => {
    expect(setActiveMisskeyIdentity('https://misskey.io#nobody')).toBe(false);
  });

  it('updates the profile without touching the token or the key fields', () => {
    const key = saveMisskeyIdentity(profile, { token: 't' });
    updateMisskeyProfile(key, { name: 'Alice 2', userId: 'hijack' });
    const identity = misskeyIdentity(key);
    expect(identity?.profile.name).toBe('Alice 2');
    expect(identity?.profile.userId).toBe('u1');
    expect(identity?.credentials.token).toBe('t');
  });

  it('clears one identity and its active pointer, keeping alts', () => {
    const a = saveMisskeyIdentity(profile, { token: 'a' }, true);
    const b = saveMisskeyIdentity({ ...profile, userId: 'u2', username: 'bob' }, { token: 'b' });
    clearMisskeyIdentity(a);
    expect(misskeyIdentities().map((i) => i.key)).toEqual([b]);
    expect(localStorage.getItem(MK_ACTIVE_IDENTITY_KEY)).toBeNull();
  });

  it('clears everything', () => {
    saveMisskeyIdentity(profile, { token: 'a' }, true);
    clearAllMisskeyIdentities();
    expect(localStorage.getItem(MK_IDENTITY_PROFILE_KEY)).toBeNull();
    expect(localStorage.getItem(MK_IDENTITY_CREDENTIALS_KEY)).toBeNull();
    expect(localStorage.getItem(MK_ACTIVE_IDENTITY_KEY)).toBeNull();
  });
});
