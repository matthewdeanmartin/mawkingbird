import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { scopeSuffixForMastodonAccount } from '../../platform/session/account-scope';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { ONBOARDING_ACCOUNT_KEY } from '../onboarding/onboarding-store';
import { ACCOUNT_SETUP_KEY, noteSignupReturn, takeSignupReturn } from './setup-store';

const SERVER = 'https://mastodon.example';
const suffix = () => scopeSuffixForMastodonAccount('42', SERVER);
const stored = (base: string) => JSON.parse(localStorage.getItem(`${base}${suffix()}`) ?? 'null');
const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';

/** A minutes-old account gets setup instead of the floating onboarding card. */
describe('account setup triggers', () => {
  let auth: Auth;

  beforeEach(() => {
    localStorage.clear();
    takeSignupReturn();
    TestBed.configureTestingModule({ providers: [Auth, Server] });
    TestBed.inject(Server).setBaseUrl(SERVER);
    auth = TestBed.inject(Auth);
  });

  it('arms setup, not onboarding, for a sign-up that came back', () => {
    noteSignupReturn('twitter');
    auth.setToken('alice-token');
    auth.setAccount({ id: '42', username: 'alice', acct: 'alice' } as never);

    expect(stored(ACCOUNT_SETUP_KEY)).toMatchObject({
      state: 'armed',
      source: 'signup',
      hint: 'twitter',
    });
    expect(stored(ONBOARDING_ACCOUNT_KEY)).toBeNull();
  });

  it('arms setup for a young empty account signed in any other way', () => {
    auth.setToken('alice-token');
    auth.setAccount({
      id: '42',
      username: 'alice',
      acct: 'alice',
      created_at: today,
      statuses_count: 0,
      following_count: 0,
    } as never);

    expect(stored(ACCOUNT_SETUP_KEY)).toMatchObject({ state: 'armed', source: 'young' });
    expect(stored(ONBOARDING_ACCOUNT_KEY)).toBeNull();
  });

  it('keeps the onboarding card for an established account', () => {
    auth.setToken('alice-token');
    auth.setAccount({
      id: '42',
      username: 'alice',
      acct: 'alice',
      created_at: '2020-01-01T00:00:00.000Z',
      statuses_count: 900,
      following_count: 80,
    } as never);

    expect(stored(ACCOUNT_SETUP_KEY)).toBeNull();
    expect(stored(ONBOARDING_ACCOUNT_KEY)).toMatchObject({ pending: true });
  });
});
