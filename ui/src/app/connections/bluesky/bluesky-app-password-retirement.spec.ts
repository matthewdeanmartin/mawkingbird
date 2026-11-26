import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskySignInRequiredError } from './bluesky-auth-error';
import { BlueskySession } from './bluesky-session';
import { retireBlueskyAppPasswords } from './bluesky-app-password-retirement';
import { BSKY_IDENTITY_CREDENTIALS_KEY, blueskyIdentity } from './bluesky-identity-store';

const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

describe('retireBlueskyAppPasswords', () => {
  beforeEach(() => localStorage.clear());

  it('retires app-password identities, keeping OAuth ones and every profile', () => {
    localStorage.setItem(
      'mockingbird_bsky_identity_profile',
      JSON.stringify({
        'did:plc:a': { service: 'https://bsky.social', handle: 'a.test', did: 'did:plc:a' },
        'did:plc:b': { service: 'https://bsky.social', handle: 'b.test', did: 'did:plc:b' },
      }),
    );
    localStorage.setItem(
      BSKY_IDENTITY_CREDENTIALS_KEY,
      JSON.stringify({
        'did:plc:a': { accessJwt: 'x', refreshJwt: 'y', appPassword: 'p', connectedAt: 5 },
        'did:plc:b': { authMethod: 'oauth', connectedAt: 6 },
      }),
    );
    expect(retireBlueskyAppPasswords()).toBe(1);
    expect(read(BSKY_IDENTITY_CREDENTIALS_KEY)).toEqual({
      'did:plc:a': { authMethod: 'retired', connectedAt: 5 },
      'did:plc:b': { authMethod: 'oauth', connectedAt: 6 },
    });
    // Still listed, so it can sign in again rather than vanish.
    expect(blueskyIdentity('did:plc:a')?.credentials.authMethod).toBe('retired');
  });

  it('retires connector links under any account scope, and nothing twice', () => {
    localStorage.setItem(
      'mockingbird_bsky_credentials_mastodon_x',
      JSON.stringify({
        authMethod: 'app-password',
        accessJwt: 'x',
        refreshJwt: 'y',
        appPassword: 'p',
      }),
    );
    localStorage.setItem(
      'mockingbird_bsky_credentials_anon',
      JSON.stringify({ authMethod: 'oauth', connectedAt: 1 }),
    );
    expect(retireBlueskyAppPasswords()).toBe(1);
    expect(read('mockingbird_bsky_credentials_mastodon_x')).toEqual({ authMethod: 'retired' });
    expect(read('mockingbird_bsky_credentials_anon')).toEqual({
      authMethod: 'oauth',
      connectedAt: 1,
    });
    expect(retireBlueskyAppPasswords()).toBe(0);
  });

  it('retires an older single-identity blob', () => {
    localStorage.setItem(
      BSKY_IDENTITY_CREDENTIALS_KEY,
      JSON.stringify({ accessJwt: 'x', refreshJwt: 'y' }),
    );
    retireBlueskyAppPasswords();
    expect(read(BSKY_IDENTITY_CREDENTIALS_KEY)).toEqual({ authMethod: 'retired' });
  });
});

describe('a retired Bluesky link', () => {
  it('asks for sign-in instead of sending a request without a token', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        {
          provide: BlueskySession,
          useValue: {
            session: () => ({
              did: 'did:plc:a',
              handle: 'a.test',
              service: 'https://bsky.social',
              authMethod: 'retired',
            }),
            isOAuthSession: () => false,
          },
        },
      ],
    });
    await expect(
      firstValueFrom(TestBed.inject(BlueskyApi).getTimeline(null)),
    ).rejects.toBeInstanceOf(BlueskySignInRequiredError);
  });
});
