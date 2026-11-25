import { beforeEach, describe, expect, it } from 'vitest';
import {
  destinationNeedsMastodon,
  loginDestination,
  stashConnectorReturn,
  stashLoginNext,
  takeConnectorReturn,
  takeLoginNext,
} from './login-destination';
import { FOCUSED_APPS } from '../../shell/mode-nav';

describe('loginDestination', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns to any mini-app root, and nowhere else', () => {
    for (const app of FOCUSED_APPS) expect(loginDestination(app.root)).toBe(app.root);
    for (const next of [null, '/settings', '/crosspost/invite', 'https://evil.example/']) {
      expect(loginDestination(next)).toBe('/home');
    }
  });

  it('returns to Unbird after a sign-up started there', () => {
    expect(loginDestination('/unbird/people')).toBe('/unbird/people');
    expect(loginDestination('/unbird')).toBe('/unbird');
    expect(loginDestination('/unbird/archive')).toBe('/unbird/archive');
    expect(loginDestination('/unbird/elsewhere')).toBe('/home');
    expect(loginDestination('/watch?post=1&youtube=abc')).toBe('/watch?post=1&youtube=abc');
    expect(loginDestination('/watch/elsewhere')).toBe('/home');
  });

  it('returns to a page that turned Anonymous away, but not to settings at large', () => {
    expect(loginDestination('/settings/moderation')).toBe('/settings/moderation');
    expect(loginDestination('/analytics')).toBe('/analytics');
    expect(loginDestination('/settings/storage')).toBe('/home');
  });

  it('knows which destinations only Mastodon opens', () => {
    expect(destinationNeedsMastodon('/mastodon-analytics?acct=a')).toBe(true);
    expect(destinationNeedsMastodon('/twitter-to-mastodon')).toBe(true);
    expect(destinationNeedsMastodon('/crosspost')).toBe(false);
    expect(destinationNeedsMastodon('/home')).toBe(false);
    expect(destinationNeedsMastodon(null)).toBe(false);
  });

  it('knows a public page by its address-bar form, with a trailing slash', () => {
    expect(loginDestination('/crosspost/')).toBe('/crosspost');
    expect(loginDestination('/crosspost/?x=1')).toBe('/crosspost?x=1');
    expect(loginDestination('//evil.example/')).toBe('/home');
    stashConnectorReturn('/crosspost/');
    expect(takeConnectorReturn()).toBe('/crosspost');
  });

  it('carries a destination across a redirect exactly once', () => {
    stashLoginNext('/crosspost');
    expect(takeLoginNext()).toBe('/crosspost');
    expect(takeLoginNext()).toBe('/home');
  });

  it('re-checks a stashed value, so tampered storage still lands on Home', () => {
    sessionStorage.setItem('mockingbird_login_next', '//evil.example');
    expect(takeLoginNext()).toBe('/home');
  });
});
