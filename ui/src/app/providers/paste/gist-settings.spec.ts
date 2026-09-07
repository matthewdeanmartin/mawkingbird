import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { scopedKey } from '../../account-scope';
import { GistSettings } from './gist-settings';

/** A fresh instance, so the constructor re-reads localStorage. */
function settings(): GistSettings {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(GistSettings);
}

describe('GistSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts disconnected', () => {
    const store = settings();
    expect(store.connected()).toBe(false);
    expect(store.token()).toBeNull();
  });

  it('stores a token and survives a reload', () => {
    settings().connect('ghp_secret', { login: 'mistersql' });

    const reloaded = settings();
    expect(reloaded.connected()).toBe(true);
    expect(reloaded.token()).toBe('ghp_secret');
    expect(reloaded.profile()?.login).toBe('mistersql');
  });

  it('refuses a blank token', () => {
    expect(() => settings().connect('   ', { login: 'x' })).toThrow();
  });

  it('trims the token, so a pasted newline does not break every request', () => {
    settings().connect('  ghp_secret\n', { login: 'x' });
    expect(settings().token()).toBe('ghp_secret');
  });

  it('keeps the credential and the profile in separate keys', () => {
    // So a settings export can carry "gists are on" without the token.
    settings().connect('ghp_secret', { login: 'mistersql' });

    const profile = localStorage.getItem(scopedKey('mockingbird_gist_profile'));
    expect(profile).toContain('mistersql');
    expect(profile).not.toContain('ghp_secret');
  });

  it('does not share storage with the read-only GitHub connector or with Hugo', () => {
    // The whole reason this has its own token: one leaked string must not reach
    // more of the account than the feature it belongs to.
    settings().connect('ghp_gist_only', { login: 'mistersql' });

    expect(localStorage.getItem(scopedKey('mockingbird_github_credentials'))).toBeNull();
    expect(localStorage.getItem(scopedKey('mockingbird_hugo_credentials'))).toBeNull();
  });

  it('disconnecting removes both halves', () => {
    const store = settings();
    store.connect('ghp_secret', { login: 'mistersql' });
    store.disconnect();

    expect(store.connected()).toBe(false);
    expect(store.token()).toBeNull();
    expect(store.profile()).toBeNull();
    expect(settings().connected()).toBe(false);
  });

  it('survives a corrupt stored credential rather than throwing', () => {
    localStorage.setItem(scopedKey('mockingbird_gist_credentials'), 'not json');
    expect(settings().connected()).toBe(false);
  });

  it('reports an expiry once connected', () => {
    const store = settings();
    expect(store.expiresAt()).toBeNull();

    store.connect('ghp_secret', { login: 'x' });
    // Under the default retention policy a stamped credential has a deadline.
    expect(store.expiresAt()).not.toBeUndefined();
  });
});
