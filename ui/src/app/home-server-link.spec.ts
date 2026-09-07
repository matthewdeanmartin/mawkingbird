import { describe, expect, it } from 'vitest';
import { Account } from './models';
import { homeServerLink } from './home-server-link';

const account = (url: unknown): Account =>
  ({ id: '1', acct: 'someone@example.social', url }) as unknown as Account;

describe('homeServerLink', () => {
  it('uses the account URL the origin server published', () => {
    const link = homeServerLink(account('https://mastodon.social/@Gargron'));

    expect(link?.url).toBe('https://mastodon.social/@Gargron');
    expect(link?.host).toBe('mastodon.social');
  });

  it('reports the web host, which need not match the handle domain', () => {
    // The whole reason this reads `url` instead of splitting `acct`: a server
    // whose handles say example.social can serve profiles from another host,
    // and a handle-built guess would 404.
    const link = homeServerLink(account('https://web.example.social/@someone'));

    expect(link?.host).toBe('web.example.social');
  });

  it('has nowhere to send local accounts with no URL', () => {
    expect(homeServerLink(account(undefined))).toBeNull();
    expect(homeServerLink(account(''))).toBeNull();
    expect(homeServerLink(null)).toBeNull();
  });

  it('refuses a URL that is not somewhere a new tab can go', () => {
    expect(homeServerLink(account('/@someone'))).toBeNull();
    expect(homeServerLink(account('not a url'))).toBeNull();
    // A profile "URL" that executes script is a link we must never render.
    expect(homeServerLink(account('javascript:alert(1)'))).toBeNull();
  });
});
