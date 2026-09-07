import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionTeardown } from './session-teardown';
import { STORAGE_KEYS } from './storage-registry';

describe('SessionTeardown', () => {
  let teardown: SessionTeardown;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    teardown = TestBed.inject(SessionTeardown);
  });

  describe('clearAnonymousData', () => {
    it('backs up and removes anonymous scoped drafts while retaining other owners and legacy data', () => {
      const anonymous = 'mockingbird_drafts_https%3A%2F%2Fone.example_anonymous';
      const signedIn = 'mockingbird_drafts_https%3A%2F%2Fone.example_abc';
      localStorage.setItem(anonymous, '["anonymous writing"]');
      localStorage.setItem(signedIn, '["signed in writing"]');
      localStorage.setItem('mockingbird_drafts', '["unknown owner"]');
      expect(teardown.backup('anonymous').values[anonymous]).toBe('["anonymous writing"]');
      expect(teardown.backup('anonymous').values[signedIn]).toBeUndefined();
      teardown.clearAnonymousData();
      expect(localStorage.getItem(anonymous)).toBeNull();
      expect(localStorage.getItem(signedIn)).not.toBeNull();
      expect(localStorage.getItem('mockingbird_drafts')).not.toBeNull();
    });
    it('removes the anonymous session and nothing else', () => {
      localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[]}');
      localStorage.setItem('mockingbird_anonymous_lists', '{"lists":[]}');
      localStorage.setItem('mockingbird_anonymous_tags', '["health"]');
      localStorage.setItem('mockingbird_client_prefs', '{"theme":"dark"}');

      teardown.clearAnonymousData();

      expect(localStorage.getItem('mockingbird_anonymous_follows')).toBeNull();
      expect(localStorage.getItem('mockingbird_anonymous_lists')).toBeNull();
      expect(localStorage.getItem('mockingbird_anonymous_tags')).toBeNull();
      expect(localStorage.getItem('mockingbird_client_prefs')).not.toBeNull();
    });

    /**
     * The promise the middle option makes. Breaking this means someone who chose
     * "delete my anonymous data" loses the account they deliberately kept — which
     * is worse than offering no middle option at all.
     */
    it('leaves a saved signed-in session completely intact', () => {
      localStorage.setItem('mastodon_mock_token', 'a-token');
      localStorage.setItem('mastodon_mock_session_tokens', '{"s1":"tok"}');
      localStorage.setItem('mockingbird_bsky_credentials_abc', '{"jwt":"x"}');
      localStorage.setItem('mockingbird_client_lists_abc', '["list"]');
      localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[]}');

      teardown.clearAnonymousData();

      expect(localStorage.getItem('mastodon_mock_token')).toBe('a-token');
      expect(localStorage.getItem('mastodon_mock_session_tokens')).not.toBeNull();
      expect(localStorage.getItem('mockingbird_bsky_credentials_abc')).not.toBeNull();
      expect(localStorage.getItem('mockingbird_client_lists_abc')).not.toBeNull();
      expect(localStorage.getItem('mockingbird_anonymous_follows')).toBeNull();
    });

    it('covers every key the registry marks as anonymous', () => {
      const anonymous = STORAGE_KEYS.filter((spec) => spec.group === 'anonymous');
      // A guard against the group being quietly dropped from the registry.
      expect(anonymous.length).toBeGreaterThan(0);
      for (const spec of anonymous) {
        localStorage.setItem(spec.base, 'x');
      }

      teardown.clearAnonymousData();

      for (const spec of anonymous) {
        expect(localStorage.getItem(spec.base), spec.base).toBeNull();
      }
    });

    it('never marks an account-scoped key as anonymous-only', () => {
      // Account-suffixed keys are shared with signed-in sessions; marking one would
      // make the narrow teardown quietly wide.
      const wrong = STORAGE_KEYS.filter(
        (spec) => spec.group === 'anonymous' && spec.suffix === 'account',
      );
      expect(wrong.map((spec) => spec.base)).toEqual([]);
    });

    it('leaves unregistered keys belonging to other apps alone', () => {
      localStorage.setItem('some_other_app_state', 'keep me');
      teardown.clearAnonymousData();
      expect(localStorage.getItem('some_other_app_state')).toBe('keep me');
    });
  });

  /**
   * The backup has to contain what the wipe destroys.
   *
   * This exists because the first version of the leave dialog offered
   * `exportPortableConfig`, which builds a *shareable setup* and includes none of the
   * anonymous keys — a rescue file with the user's theme in it, offered beside a
   * button that deletes their follow list and says so.
   */
  describe('backup', () => {
    it('contains the anonymous data that the anonymous wipe removes', () => {
      localStorage.setItem('mockingbird_anonymous_follows', '{"follows":[1]}');
      localStorage.setItem('mockingbird_anonymous_lists', '{"lists":[2]}');
      localStorage.setItem('mockingbird_anonymous_tags', '["health"]');

      const saved = teardown.backup('anonymous').values;

      expect(saved['mockingbird_anonymous_follows']).toBe('{"follows":[1]}');
      expect(saved['mockingbird_anonymous_lists']).toBe('{"lists":[2]}');
      expect(saved['mockingbird_anonymous_tags']).toBe('["health"]');
    });

    it('covers everything the full wipe removes, except credentials', () => {
      localStorage.setItem('mockingbird_anonymous_follows', 'a');
      localStorage.setItem('mockingbird_client_prefs', 'b');
      localStorage.setItem('mastodon_mock_token', 'a-token');

      const saved = teardown.backup('all').values;

      expect(saved['mockingbird_anonymous_follows']).toBe('a');
      expect(saved['mockingbird_client_prefs']).toBe('b');
      // A token in a Downloads folder outlives the data it came from, and is the
      // one thing you can simply get again by signing in.
      expect(saved['mastodon_mock_token']).toBeUndefined();
    });

    it('never writes a credential into the file, whatever its sensitivity', () => {
      localStorage.setItem('mastodon_mock_session_tokens', '{"s1":"tok"}');
      localStorage.setItem('mockingbird_bsky_credentials_abc', '{"jwt":"x"}');

      const saved = JSON.stringify(teardown.backup('all'));

      expect(saved).not.toContain('tok');
      expect(saved).not.toContain('jwt');
    });

    it('restricts the anonymous scope to anonymous data', () => {
      localStorage.setItem('mockingbird_anonymous_follows', 'a');
      localStorage.setItem('mockingbird_client_prefs', 'b');

      const saved = teardown.backup('anonymous').values;

      expect(saved['mockingbird_anonymous_follows']).toBe('a');
      expect(saved['mockingbird_client_prefs']).toBeUndefined();
    });

    it('skips unregistered keys this app does not own', () => {
      localStorage.setItem('some_other_app_state', 'not mine');
      expect(teardown.backup('all').values['some_other_app_state']).toBeUndefined();
    });
  });

  describe('clearAllData', () => {
    it('removes every registered key, credentials included', () => {
      localStorage.setItem('mastodon_mock_token', 'a-token');
      localStorage.setItem('mockingbird_anonymous_follows', '{}');
      localStorage.setItem('mockingbird_client_prefs', '{}');
      localStorage.setItem('mockingbird_bsky_credentials_abc', '{}');

      teardown.clearAllData();

      expect(localStorage.getItem('mastodon_mock_token')).toBeNull();
      expect(localStorage.getItem('mockingbird_anonymous_follows')).toBeNull();
      expect(localStorage.getItem('mockingbird_client_prefs')).toBeNull();
      expect(localStorage.getItem('mockingbird_bsky_credentials_abc')).toBeNull();
    });

    it('is a superset of the anonymous teardown', () => {
      const anonymousKeys = STORAGE_KEYS.filter((spec) => spec.group === 'anonymous');
      for (const spec of anonymousKeys) {
        localStorage.setItem(spec.base, 'x');
      }

      teardown.clearAllData();

      for (const spec of anonymousKeys) {
        expect(localStorage.getItem(spec.base), spec.base).toBeNull();
      }
    });

    it('leaves unregistered keys alone — this app may not own the whole origin', () => {
      localStorage.setItem('some_other_app_state', 'keep me');
      teardown.clearAllData();
      expect(localStorage.getItem('some_other_app_state')).toBe('keep me');
    });

    it('reports how much it removed', () => {
      localStorage.setItem('mastodon_mock_token', 'a');
      localStorage.setItem('mockingbird_anonymous_follows', 'b');
      expect(teardown.clearAllData()).toBe(2);
    });
  });
});
