import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNT_MODE_KEY,
  BSKY_ACTIVE_IDENTITY_DID_KEY,
  BSKY_IDENTITY_CREDENTIALS_KEY,
  BSKY_IDENTITY_PROFILE_KEY,
  blueskyIdentities,
  blueskyIdentityDid,
  clearBlueskyIdentity,
  saveBlueskyIdentity,
  setActiveBlueskyIdentity,
} from './bluesky-identity-store';

const credentials = {
  accessJwt: 'access',
  refreshJwt: 'refresh',
  connectedAt: 1,
  appPassword: 'app-password',
};

function save(did: string, handle: string, activate = false): void {
  saveBlueskyIdentity(
    { service: 'https://bsky.social', did, handle, displayName: handle },
    { ...credentials, accessJwt: `access:${did}` },
    activate,
  );
}

describe('Bluesky identity store', () => {
  beforeEach(() => localStorage.clear());

  it('keeps multiple identities and selects them independently', () => {
    save('did:plc:one', 'one.bsky.social', true);
    save('did:plc:two', 'two.bsky.social');

    expect(blueskyIdentities().map((identity) => identity.profile.did)).toEqual([
      'did:plc:one',
      'did:plc:two',
    ]);
    expect(blueskyIdentityDid()).toBe('did:plc:one');
    expect(setActiveBlueskyIdentity('did:plc:two')).toBe(true);
    expect(blueskyIdentityDid()).toBe('did:plc:two');
  });

  it('removes one alt without removing the others', () => {
    save('did:plc:one', 'one.bsky.social', true);
    save('did:plc:two', 'two.bsky.social');

    clearBlueskyIdentity('did:plc:one');

    expect(blueskyIdentities().map((identity) => identity.profile.did)).toEqual(['did:plc:two']);
    expect(localStorage.getItem(BSKY_ACTIVE_IDENTITY_DID_KEY)).toBeNull();
  });

  it('migrates the former singleton objects in place', () => {
    localStorage.setItem(ACCOUNT_MODE_KEY, 'bluesky');
    localStorage.setItem(
      BSKY_IDENTITY_PROFILE_KEY,
      JSON.stringify({
        service: 'https://bsky.social',
        did: 'did:plc:legacy',
        handle: 'legacy.bsky.social',
      }),
    );
    localStorage.setItem(BSKY_IDENTITY_CREDENTIALS_KEY, JSON.stringify(credentials));

    expect(blueskyIdentityDid()).toBe('did:plc:legacy');
    expect(blueskyIdentities()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(BSKY_IDENTITY_PROFILE_KEY)!)).toHaveProperty(
      'did:plc:legacy',
    );
    expect(JSON.parse(localStorage.getItem(BSKY_IDENTITY_CREDENTIALS_KEY)!)).toHaveProperty(
      'did:plc:legacy',
    );
  });

  it('does not offer a half-written identity as a saved account', () => {
    localStorage.setItem(
      BSKY_IDENTITY_PROFILE_KEY,
      JSON.stringify({
        'did:plc:orphan': {
          service: 'https://bsky.social',
          did: 'did:plc:orphan',
          handle: 'orphan.bsky.social',
        },
      }),
    );

    expect(blueskyIdentities()).toEqual([]);
    expect(setActiveBlueskyIdentity('did:plc:orphan')).toBe(false);
  });

  it('treats an SDK-owned OAuth marker as a usable saved alt', () => {
    saveBlueskyIdentity(
      { service: 'https://pds.example', did: 'did:plc:oauth', handle: 'oauth.example' },
      { authMethod: 'oauth', connectedAt: 2 },
      true,
    );

    expect(blueskyIdentities()[0]).toMatchObject({
      profile: { did: 'did:plc:oauth' },
      credentials: { authMethod: 'oauth' },
    });
    expect(blueskyIdentityDid()).toBe('did:plc:oauth');
  });
});
