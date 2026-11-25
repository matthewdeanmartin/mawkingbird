import { beforeEach, describe, expect, it } from 'vitest';
import { includesOwner, isOwnerBrowser } from './analytics-owner';

describe('analytics owner', () => {
  beforeEach(() => localStorage.clear());

  it('knows the owner by handle and server, however the session spells it', () => {
    const session = (acct: string, server: string) => ({ server, account: { acct } });
    expect(includesOwner([session('mistersql', 'https://mastodon.social')])).toBe(true);
    expect(includesOwner([session('MisterSQL', 'https://mastodon.social/')])).toBe(true);
    expect(includesOwner([session('vegdevops@mastodon.online', 'https://elsewhere.example')])).toBe(
      true,
    );
    expect(includesOwner([session('mistersql', 'https://mastodon.online')])).toBe(false);
    expect(includesOwner([{ server: 'https://mastodon.social', account: null }])).toBe(false);
  });

  it('marks a browser from a link, for devices the owner never signs in on', () => {
    expect(isOwnerBrowser({ sessions: false, query: '' })).toBe(false);
    expect(isOwnerBrowser({ sessions: false, query: '?count=me-not' })).toBe(true);
    expect(isOwnerBrowser({ sessions: false, query: '' })).toBe(true);
  });
});
