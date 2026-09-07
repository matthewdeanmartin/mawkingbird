import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';

const LEGACY_KEY = 'mockingbird_paste_feeds';
const TOKEN_KEY = 'mastodon_mock_token';
const ACCOUNT_MODE_KEY = 'mastodon_mock_account_mode';

/** Build the service fresh, so it re-reads storage under the current account. */
function build(): PasteFeedSubscriptions {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(PasteFeedSubscriptions);
}

function keysHolding(value: string): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith(value));
}

describe('PasteFeedSubscriptions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty and records a follow', () => {
    const subs = build();
    expect(subs.feeds()).toEqual([]);

    subs.follow('opensuse', 'https://paste.opensuse.org/pastes.json', 'openSUSE public pastes');

    expect(subs.has('opensuse')).toBe(true);
    expect(subs.enabledFeeds()).toHaveLength(1);
  });

  it('unfollowing disables the row rather than forgetting the proxy choice', () => {
    const subs = build();
    subs.follow('opensuse', 'https://example.test/f.json', 'openSUSE');
    subs.setUseProxy('opensuse', true);

    subs.unfollow('opensuse');

    expect(subs.has('opensuse')).toBe(false);
    expect(subs.enabledFeeds()).toHaveLength(0);
    // Re-following must not silently lose that the user opted this feed in.
    expect(subs.usesProxy('opensuse')).toBe(true);
  });

  it('defaults a new subscription to no proxy', () => {
    // The whole point of the opt-in: never route someone's traffic through a
    // third party they did not choose, even though these feeds need it.
    const subs = build();
    subs.follow('opensuse', 'https://example.test/f.json', 'openSUSE');

    expect(subs.usesProxy('opensuse')).toBe(false);
  });

  it('toggles the proxy for one feed without touching another', () => {
    const subs = build();
    subs.follow('opensuse', 'https://example.test/a.json', 'openSUSE');
    subs.follow('centos', 'https://example.test/b.json', 'CentOS');

    subs.setUseProxy('centos', true);

    expect(subs.usesProxy('centos')).toBe(true);
    expect(subs.usesProxy('opensuse')).toBe(false);
  });

  describe('per-account scoping', () => {
    it("keeps one account's subscriptions out of another's", () => {
      localStorage.setItem(TOKEN_KEY, 'token-alice');
      const alice = build();
      alice.follow('opensuse', 'https://example.test/f.json', 'openSUSE');
      expect(alice.has('opensuse')).toBe(true);

      // A different signed-in account is a different namespace entirely.
      localStorage.setItem(TOKEN_KEY, 'token-bob');
      const bob = build();

      expect(bob.has('opensuse')).toBe(false);
      expect(bob.feeds()).toEqual([]);
    });

    it('gives Anonymous its own list', () => {
      localStorage.setItem(TOKEN_KEY, 'token-alice');
      build().follow('opensuse', 'https://example.test/f.json', 'openSUSE');

      localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(ACCOUNT_MODE_KEY, 'anonymous');
      const anonymous = build();

      expect(anonymous.has('opensuse')).toBe(false);
    });

    it('adopts a pre-scoping list instead of dropping it', () => {
      // Before scoping, every account shared one unscoped key. Discarding it on
      // upgrade would silently unsubscribe whoever had feeds set up.
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify([
          {
            providerId: 'pastepile',
            url: 'https://example.test/f.json',
            label: 'x',
            enabled: true,
          },
        ]),
      );
      localStorage.setItem(TOKEN_KEY, 'token-alice');

      const alice = build();

      expect(alice.has('pastepile')).toBe(true);
      // Adopted, not copied: the legacy key is gone, so the next account does
      // not inherit the same list a second time.
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('does not hand the adopted list to a second account', () => {
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify([
          {
            providerId: 'pastepile',
            url: 'https://example.test/f.json',
            label: 'x',
            enabled: true,
          },
        ]),
      );
      localStorage.setItem(TOKEN_KEY, 'token-alice');
      build();

      localStorage.setItem(TOKEN_KEY, 'token-bob');
      const bob = build();

      expect(bob.feeds()).toEqual([]);
    });

    it('leaves an account that already has its own list alone', () => {
      localStorage.setItem(TOKEN_KEY, 'token-alice');
      const alice = build();
      alice.follow('opensuse', 'https://example.test/a.json', 'openSUSE');

      // A legacy list appearing later must not overwrite a real subscription.
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify([
          { providerId: 'centos', url: 'https://example.test/b.json', label: 'y', enabled: true },
        ]),
      );
      const reloaded = build();

      expect(reloaded.has('opensuse')).toBe(true);
      expect(reloaded.has('centos')).toBe(false);
      expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    });

    it('writes under a suffixed key, never the bare one', () => {
      localStorage.setItem(TOKEN_KEY, 'token-alice');
      const alice = build();
      alice.follow('opensuse', 'https://example.test/f.json', 'openSUSE');

      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
      const written = keysHolding(LEGACY_KEY);
      expect(written).toHaveLength(1);
      expect(written[0]).not.toBe(LEGACY_KEY);
    });
  });

  it('survives corrupt stored JSON', () => {
    localStorage.setItem(TOKEN_KEY, 'token-alice');
    const subs = build();
    subs.follow('opensuse', 'https://example.test/f.json', 'openSUSE');
    const key = keysHolding(LEGACY_KEY)[0];
    localStorage.setItem(key, '{not json');

    expect(build().feeds()).toEqual([]);
  });
});
