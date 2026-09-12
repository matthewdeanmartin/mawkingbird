import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { AnonymousCapabilities } from './anonymous-capabilities';
import { seedBskyIdentity } from '../../testing/seed-storage';

describe('AnonymousCapabilities', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('allows normal Mastodon capabilities outside Anonymous', () => {
    TestBed.inject(Auth).setToken('token');
    const capabilities = TestBed.inject(AnonymousCapabilities);

    expect(capabilities.canCompose).toBe(true);
    expect(capabilities.canManageRelationships).toBe(true);
    expect(capabilities.statusCaps('mastodon')).toEqual({
      reply: true,
      favourite: true,
      reblog: true,
    });
  });

  it('disables identity-dependent and server-mutating actions in Anonymous', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.art');
    const capabilities = TestBed.inject(AnonymousCapabilities);

    expect(capabilities.active).toBe(true);
    expect(capabilities.canCompose).toBe(false);
    expect(capabilities.canManageRelationships).toBe(false);
    expect(capabilities.canFollow).toBe(true);
    expect(capabilities.canUseServerActions).toBe(false);
    expect(capabilities.canBookmark).toBe(true);
    // Bluesky brings its own credential, so it is not identity-dependent on
    // Mastodon at all — Anonymous gets its own link like any other account.
    expect(capabilities.canUseBluesky).toBe(true);
    expect(capabilities.statusCaps('mastodon')).toEqual({
      reply: false,
      favourite: false,
      reblog: false,
    });
  });

  it('separates Bluesky interactions from Mastodon credentials and follows connector changes', () => {
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    const auth = TestBed.inject(Auth);
    auth.enterBluesky();
    const capabilities = TestBed.inject(AnonymousCapabilities);
    expect(capabilities.canCompose).toBe(true);
    expect(capabilities.canUseServerActions).toBe(false);
    expect(capabilities.statusCaps('mastodon').favourite).toBe(false);
    expect(capabilities.statusCaps('anonymous-mastodon').reply).toBe(false);
    expect(capabilities.statusCaps('bluesky').favourite).toBe(true);
    auth.connectMastodon('connector-token');
    expect(auth.lacksMastodonToken).toBe(false);
    expect(capabilities.canUseServerActions).toBe(true);
    expect(capabilities.statusCaps('mastodon').favourite).toBe(true);
    auth.disconnectMastodon();
    expect(capabilities.canUseServerActions).toBe(false);
    expect(capabilities.statusCaps('bluesky').reply).toBe(true);
  });
});
