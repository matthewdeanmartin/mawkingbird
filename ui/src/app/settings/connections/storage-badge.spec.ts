/**
 * Where a credential lives, as the connection pages report it.
 *
 * The distinction under test is `locked` versus `local`, and it is the one that
 * costs a user something when it is wrong: `locked` means the vault still holds
 * the credential, so telling them it is gone sends them to re-issue a token
 * they did not need to touch.
 */

import { describe, expect, it } from 'vitest';
import { credentialLocation } from './storage-badge';

describe('working out where a credential lives', () => {
  it('says local for a credential that does not sync', () => {
    expect(credentialLocation(false, false)).toBe('local');
  });

  it('says vaulted for a synced credential this browser holds', () => {
    expect(credentialLocation(true, false)).toBe('vaulted');
  });

  it('says locked for a synced credential this browser is missing', () => {
    // Not "local", and not a disconnection. The stored copy is still there.
    expect(credentialLocation(true, true)).toBe('locked');
  });

  it('never reports locked for a credential that does not sync', () => {
    // There is no vault copy to be locked out of, so `needsFetch` cannot mean
    // what it means for a vaulted key. Reporting "locked" here would promise a
    // credential that is genuinely gone.
    expect(credentialLocation(false, true)).toBe('local');
  });
});
