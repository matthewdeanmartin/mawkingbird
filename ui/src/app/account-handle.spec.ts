import { describe, expect, it } from 'vitest';
import { Account } from './models';
import { qualifiedHandle } from './account-handle';

function account(over: Partial<Account>): Account {
  return { id: '1', username: 'alice', acct: 'alice', url: '', ...over } as Account;
}

describe('qualifiedHandle', () => {
  it('passes through an already-qualified handle', () => {
    expect(qualifiedHandle(account({ acct: 'alice@other.social' }))).toBe('alice@other.social');
  });

  it('qualifies a bare local handle from the profile URL', () => {
    // A bare acct only means something next to the server that issued it, so
    // the host has to be attached before the handle can travel.
    expect(qualifiedHandle(account({ acct: 'alice', url: 'https://mastodon.social/@alice' }))).toBe(
      'alice@mastodon.social',
    );
  });

  it('strips a leading @', () => {
    expect(qualifiedHandle(account({ acct: '@bob@x.example' }))).toBe('bob@x.example');
  });

  it('returns null when there is no host to borrow, rather than guessing', () => {
    // A wrong handle would send a lookup to the wrong person — worse than none.
    expect(qualifiedHandle(account({ acct: 'alice', url: '' }))).toBeNull();
    expect(qualifiedHandle(account({ acct: 'alice', url: 'not a url' }))).toBeNull();
  });

  it('returns null for an empty acct', () => {
    expect(qualifiedHandle(account({ acct: '', url: 'https://x.example/@a' }))).toBeNull();
  });
});
