import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { saveBlueskyIdentity } from '../bluesky/bluesky-identity-store';
import { MastodonConnector } from './mastodon-connector';
import { MastodonMe } from './mastodon-me';

describe('MastodonMe', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  it('is the identity itself under a Mastodon account', () => {
    const auth = TestBed.inject(Auth);
    auth.setToken('token');
    auth.setAccount({ id: '7', username: 'me', acct: 'me' } as Account);
    expect(TestBed.inject(MastodonMe).account()?.id).toBe('7');
  });

  it('is the account of the connector, never the Bluesky profile, under a Bluesky account', () => {
    saveBlueskyIdentity(
      { service: 'https://pds.example', did: 'did:plc:me', handle: 'me.example' },
      { authMethod: 'oauth' },
      true,
    );
    TestBed.inject(Auth).enterBluesky();
    const me = TestBed.inject(MastodonMe);
    expect(me.account()).toBeNull();

    TestBed.inject(MastodonConnector).signIn('token', 'https://mastodon.example', {
      id: '42',
    } as Account);
    expect(me.account()?.id).toBe('42');
  });
});
