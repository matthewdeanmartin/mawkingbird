import { beforeEach, describe, expect, it } from 'vitest';
import { forgetAccountLocalState } from './account-local-state';
import { PLUS_FEATURES_KEY } from './plus-features';
import { PROFILE_SYNC_KEY } from './profile-sync-state';

describe('forgetAccountLocalState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('forgets this browser’s relationship with the account that signed out', () => {
    // Every field of the sync record describes one account: whether sync is on
    // for it, the ETag and revision of *its* settings document. Inheriting a
    // `paused` or `off` state is what silently denied the next account its
    // sync offer, since neither state prompts.
    localStorage.setItem(PROFILE_SYNC_KEY, JSON.stringify({ state: 'paused', revision: 3 }));
    localStorage.setItem('mockingbird_remote_storage_usage', '{"bytes":100}');
    // Inheriting `decided: true` would deny the next account the one-time
    // dialog entirely — the same silent denial as inheriting a paused sync.
    localStorage.setItem(PLUS_FEATURES_KEY, JSON.stringify({ decided: true, enabled: {} }));

    forgetAccountLocalState(localStorage);

    expect(localStorage.getItem(PROFILE_SYNC_KEY)).toBeNull();
    expect(localStorage.getItem('mockingbird_remote_storage_usage')).toBeNull();
    expect(localStorage.getItem(PLUS_FEATURES_KEY)).toBeNull();
  });

  it('leaves the user’s own client data alone', () => {
    // The line this module exists to draw. Almost everything here is the
    // user's, predates accounts existing, and works signed out — a prefix sweep
    // over `mockingbird_*` would take all of it.
    const mine: Record<string, string> = {
      mockingbird_drafts: '["a draft"]',
      mockingbird_saved_searches: '["#cats"]',
      mockingbird_client_prefs: '{"theme":"dark"}',
      mockingbird_github_credentials: '{"token":"t"}',
      mockingbird_pastes: '["a paste"]',
      // Identifies this browser, not the person, so it stays valid across
      // accounts. Rotating it would make one browser look like two.
      mockingbird_profile_writer: 'writer-1',
      // Already keyed by account, so it cannot leak between them; clearing it
      // would re-ask a question the user already answered.
      mockingbird_profile_list_copy: '{"asked":["acct-1"]}',
      // Counters with no account identity in them.
      mockingbird_mawkingbird_metrics: '{"calls":5}',
    };
    for (const [key, value] of Object.entries(mine)) {
      localStorage.setItem(key, value);
    }

    forgetAccountLocalState(localStorage);

    for (const [key, value] of Object.entries(mine)) {
      expect(localStorage.getItem(key), key).toBe(value);
    }
  });

  it('completes even when storage refuses', () => {
    // Failing to tidy is not a reason to leave someone signed in.
    const hostile = {
      removeItem() {
        throw new Error('blocked');
      },
    } as unknown as Storage;

    expect(() => forgetAccountLocalState(hostile)).not.toThrow();
  });
});
