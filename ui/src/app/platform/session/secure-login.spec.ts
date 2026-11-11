import { describe, expect, it, vi } from 'vitest';
import { redirectToSecureLogin } from './secure-login';

describe('secure login origin', () => {
  it.each([
    'http://localhost:4200/login',
    'http://127.0.0.1:4200/login',
    'http://[::1]:4200/login',
    'https://mawkingbird.com/login',
  ])('keeps the secure or loopback origin %s', (href) => {
    const location = { href };
    vi.stubGlobal('location', location);
    expect(redirectToSecureLogin()).toBe(false);
    expect(location.href).toBe(href);
  });

  it('upgrades HTTP while preserving the route, parameters and fragment', () => {
    const location = { href: 'http://mawkingbird.com/login/bluesky?add=1#account' };
    vi.stubGlobal('location', location);
    expect(redirectToSecureLogin()).toBe(true);
    expect(location.href).toBe('https://mawkingbird.com/login/bluesky?add=1#account');
  });
});
