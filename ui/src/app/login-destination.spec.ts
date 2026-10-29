import { beforeEach, describe, expect, it } from 'vitest';
import { loginDestination, stashLoginNext, takeLoginNext } from './login-destination';
import { FOCUSED_APPS } from './shell/mode-nav';

describe('loginDestination', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns to any mini-app root, and nowhere else', () => {
    for (const app of FOCUSED_APPS) expect(loginDestination(app.root)).toBe(app.root);
    for (const next of [null, '/settings', '/crosspost/invite', 'https://evil.example/']) {
      expect(loginDestination(next)).toBe('/home');
    }
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
