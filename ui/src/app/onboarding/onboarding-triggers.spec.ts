import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANONYMOUS_SCOPE_SUFFIX,
  scopeSuffixForDid,
  scopeSuffixForMastodonAccount,
} from '../account-scope';
import { Auth } from '../auth';
import { saveBlueskyIdentity } from '../providers/bluesky/bluesky-identity-store';
import { Server } from '../server';
import { ONBOARDING_ACCOUNT_KEY } from './onboarding-store';

const pending = (suffix: string) =>
  JSON.parse(localStorage.getItem(`${ONBOARDING_ACCOUNT_KEY}${suffix}`) ?? 'null')?.pending ===
  true;

/** Onboarding is armed only when an account is new to this browser. */
describe('onboarding first-use triggers', () => {
  let auth: Auth;
  let server: Server;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [Auth, Server] });
    server = TestBed.inject(Server);
    auth = TestBed.inject(Auth);
  });

  it('arms a Mastodon account on its first verified sign-in', () => {
    server.setBaseUrl('https://mastodon.example');
    auth.setToken('alice-token');
    auth.setAccount({ id: '42', username: 'alice', acct: 'alice' } as never);

    expect(pending(scopeSuffixForMastodonAccount('42', 'https://mastodon.example'))).toBe(true);
  });

  it('does not arm a session that was already saved before this page load', () => {
    server.setBaseUrl('https://mastodon.example');
    auth.setToken('alice-token');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [Auth, Server] });
    auth = TestBed.inject(Auth);

    // A boot-time re-verify of a known session.
    auth.setAccount({ id: '42', username: 'alice', acct: 'alice' } as never);

    expect(pending(scopeSuffixForMastodonAccount('42', 'https://mastodon.example'))).toBe(false);
  });

  it('arms the Anonymous account only on its very first activation', () => {
    auth.enterAnonymous('https://mastodon.social');
    expect(pending(ANONYMOUS_SCOPE_SUFFIX)).toBe(true);

    localStorage.removeItem(`${ONBOARDING_ACCOUNT_KEY}${ANONYMOUS_SCOPE_SUFFIX}`);
    auth.enterAnonymous('https://mastodon.social');
    expect(pending(ANONYMOUS_SCOPE_SUFFIX)).toBe(false);
  });

  it('reports whether a Bluesky identity is new to this browser', () => {
    const profile = { did: 'did:plc:alice', handle: 'alice.bsky.social' } as never;
    const credentials = { authMethod: 'oauth', connectedAt: 1 } as never;

    expect(saveBlueskyIdentity(profile, credentials)).toBe(true);
    expect(saveBlueskyIdentity(profile, credentials)).toBe(false);
    // BlueskySession arms the scope with this suffix on a `true`.
    expect(scopeSuffixForDid('did:plc:alice')).not.toBe('');
  });
});
