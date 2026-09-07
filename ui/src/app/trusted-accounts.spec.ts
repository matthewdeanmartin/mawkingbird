import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowTrust } from './follow-trust';
import { Account } from './models';
import { TrustedAccounts } from './trusted-accounts';

function account(acct: string, over: Partial<Account> = {}): Account {
  return { id: acct, acct, url: `https://example.social/@${acct}`, ...over } as Account;
}

/**
 * Trust levels beyond the list ask {@link FollowTrust} who you follow. These
 * tests are about the trust rules, not about how that answer is obtained, so it
 * is stubbed with a plain set of handles.
 */
function withFollows(...following: string[]): TrustedAccounts {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: FollowTrust,
        useValue: {
          revision: () => ({}),
          isFollowing: (a: Account | null) => !!a && following.includes(a.acct),
          // `vi.fn()` rather than `() => {}`: these are deliberately inert on a
          // test double, and an empty arrow trips no-empty-function, which would
          // fail the lint gate for a stub that is doing exactly what it should.
          prime: vi.fn(),
          reset: vi.fn(),
        },
      },
    ],
  });
  return TestBed.inject(TrustedAccounts);
}

describe('TrustedAccounts', () => {
  let trusted: TrustedAccounts;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    trusted = TestBed.inject(TrustedAccounts);
  });

  afterEach(() => localStorage.clear());

  it('starts with nobody trusted and both switches off', () => {
    expect(trusted.count()).toBe(0);
    expect(trusted.expandAllCw()).toBe(false);
    expect(trusted.showAllSensitive()).toBe(false);
    expect(trusted.isTrusted(account('alice'))).toBe(false);
  });

  it('trusts and untrusts an account', () => {
    const alice = account('alice');
    trusted.trust(alice);
    expect(trusted.isTrusted(alice)).toBe(true);
    expect(trusted.count()).toBe(1);
    trusted.untrust(alice);
    expect(trusted.isTrusted(alice)).toBe(false);
  });

  it('toggle reports the state it landed in', () => {
    const alice = account('alice');
    expect(trusted.toggle(alice)).toBe(true);
    expect(trusted.toggle(alice)).toBe(false);
  });

  /** Same person, different route: keyed on acct, so trust follows them. */
  it('keys on the handle rather than the route-specific id', () => {
    trusted.trust(account('alice', { id: 'local-1' }));
    expect(trusted.isTrusted(account('alice', { id: 'remote-99' }))).toBe(true);
  });

  it('expands a trusted author CW while leaving others collapsed', () => {
    trusted.trust(account('alice'));
    expect(trusted.cwExpanded(account('alice'))).toBe(true);
    expect(trusted.cwExpanded(account('bob'))).toBe(false);
  });

  it('shows a trusted author sensitive media while leaving others blurred', () => {
    trusted.trust(account('alice'));
    expect(trusted.sensitiveShown(account('alice'))).toBe(true);
    expect(trusted.sensitiveShown(account('bob'))).toBe(false);
  });

  it('the account-wide switches cover everyone', () => {
    trusted.setExpandAllCw(true);
    expect(trusted.cwExpanded(account('stranger'))).toBe(true);
    expect(trusted.sensitiveShown(account('stranger'))).toBe(false);

    trusted.setShowAllSensitive(true);
    expect(trusted.sensitiveShown(account('stranger'))).toBe(true);
  });

  it('treats a missing account as untrusted rather than throwing', () => {
    expect(trusted.cwExpanded(null)).toBe(false);
    expect(trusted.sensitiveShown(undefined)).toBe(false);
    // ...but a global switch still applies with no account in hand.
    trusted.setExpandAllCw(true);
    expect(trusted.cwExpanded(null)).toBe(true);
  });

  it('clearAll empties the list but leaves the switches alone', () => {
    trusted.trust(account('alice'));
    trusted.trust(account('bob'));
    trusted.setExpandAllCw(true);
    trusted.clearAll();
    expect(trusted.count()).toBe(0);
    expect(trusted.expandAllCw()).toBe(true);
  });

  it('lists the most recently trusted first', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-09T10:00:00Z'));
      trusted.trust(account('alice'));
      vi.setSystemTime(new Date('2026-08-09T11:00:00Z'));
      trusted.trust(account('bob'));
      expect(trusted.list().map((r) => r.acct)).toEqual(['bob', 'alice']);
    } finally {
      vi.useRealTimers();
    }
  });

  /** Two clicks inside one millisecond must not produce a reshuffling list. */
  it('breaks same-instant ties alphabetically', () => {
    vi.useFakeTimers();
    try {
      // Time frozen, so all three carry an identical `since`.
      vi.setSystemTime(new Date('2026-08-09T10:00:00Z'));
      trusted.trust(account('carol'));
      trusted.trust(account('alice'));
      trusted.trust(account('bob'));
      expect(trusted.list().map((r) => r.acct)).toEqual(['alice', 'bob', 'carol']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a reload', () => {
    trusted.trust(account('alice'));
    trusted.setShowAllSensitive(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(TrustedAccounts);

    expect(reloaded.isTrusted(account('alice'))).toBe(true);
    expect(reloaded.showAllSensitive()).toBe(true);
  });

  it('ignores corrupt stored state rather than failing to construct', () => {
    localStorage.setItem('mockingbird_trusted_accounts', '{ not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(TrustedAccounts);
    expect(fresh.count()).toBe(0);
  });

  it('untrusting someone who was never trusted is a no-op', () => {
    trusted.trust(account('alice'));
    trusted.untrust(account('bob'));
    expect(trusted.count()).toBe(1);
  });

  describe('trust levels', () => {
    it('defaults to trusting only named individuals', () => {
      expect(trusted.level()).toBe('individuals');
      expect(trusted.trustsFollows()).toBe(false);
      expect(trusted.trustsBoosts()).toBe(false);
    });

    it('"follows" covers people you follow as well as the named list', () => {
      const t = withFollows('friend');
      t.trust(account('alice'));
      t.setLevel('follows');

      expect(t.cwExpanded(account('friend'))).toBe(true);
      expect(t.cwExpanded(account('alice'))).toBe(true);
      expect(t.cwExpanded(account('stranger'))).toBe(false);
    });

    it('"follows" does not add anyone to the named list', () => {
      const t = withFollows('friend');
      t.setLevel('follows');
      expect(t.trusts(account('friend'))).toBe(true);
      // Trusted in effect, but never materialised — the list is still empty, so
      // dropping back to `individuals` does not silently inherit thousands.
      expect(t.count()).toBe(0);
      expect(t.isTrusted(account('friend'))).toBe(false);
    });

    it('keeps the named list intact across level changes', () => {
      const t = withFollows('friend');
      t.trust(account('alice'));
      t.setLevel('follows');
      t.setLevel('follows-boosts');
      t.setLevel('individuals');
      expect(t.isTrusted(account('alice'))).toBe(true);
      expect(t.count()).toBe(1);
    });

    it('"follows" still judges a boost by its original author', () => {
      const t = withFollows('friend');
      t.setLevel('follows');
      // A followed booster passing along a stranger's post: the stranger's
      // warning stays shut at this level.
      expect(t.cwExpanded(account('stranger'), account('friend'))).toBe(false);
    });

    it('"follows-boosts" lets a followed booster vouch for what they boost', () => {
      const t = withFollows('friend');
      t.setLevel('follows-boosts');
      expect(t.cwExpanded(account('stranger'), account('friend'))).toBe(true);
      expect(t.sensitiveShown(account('stranger'), account('friend'))).toBe(true);
      // A boost by someone you do not follow carries nothing.
      expect(t.cwExpanded(account('stranger'), account('nobody'))).toBe(false);
    });

    it('"none" beats the named list and both account-wide switches', () => {
      const t = withFollows('friend');
      t.trust(account('alice'));
      t.setExpandAllCw(true);
      t.setShowAllSensitive(true);
      t.setLevel('none');

      expect(t.expandAllCw()).toBe(false);
      expect(t.showAllSensitive()).toBe(false);
      expect(t.cwExpanded(account('alice'))).toBe(false);
      expect(t.cwExpanded(account('friend'))).toBe(false);
      expect(t.trusts(account('alice'))).toBe(false);
    });

    it('"none" suppresses rather than erases, so the list comes back', () => {
      trusted.trust(account('alice'));
      trusted.setExpandAllCw(true);
      trusted.setLevel('none');
      expect(trusted.count()).toBe(1);
      expect(trusted.expandAllCwSetting()).toBe(true);

      trusted.setLevel('individuals');
      expect(trusted.cwExpanded(account('alice'))).toBe(true);
      expect(trusted.expandAllCw()).toBe(true);
    });

    it('revokeAll drops to none and forgets everyone', () => {
      trusted.trust(account('alice'));
      trusted.setExpandAllCw(true);
      trusted.setShowAllSensitive(true);
      trusted.revokeAll();

      expect(trusted.level()).toBe('none');
      expect(trusted.count()).toBe(0);
      expect(trusted.expandAllCwSetting()).toBe(false);
      expect(trusted.showAllSensitiveSetting()).toBe(false);
    });

    it('persists the level across a reload', () => {
      trusted.setLevel('follows-boosts');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      expect(TestBed.inject(TrustedAccounts).level()).toBe('follows-boosts');
    });

    /** v1 blobs predate the level and behaved exactly as `individuals`. */
    it('migrates a v1 blob without losing the trust list', () => {
      localStorage.setItem(
        'mockingbird_trusted_accounts',
        JSON.stringify({
          version: 1,
          entries: { alice: { acct: 'alice', since: 1 } },
          expandAllCw: true,
          showAllSensitive: false,
        }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const migrated = TestBed.inject(TrustedAccounts);

      expect(migrated.level()).toBe('individuals');
      expect(migrated.isTrusted(account('alice'))).toBe(true);
      expect(migrated.expandAllCw()).toBe(true);
    });

    it('falls back to individuals when the stored level is nonsense', () => {
      localStorage.setItem(
        'mockingbird_trusted_accounts',
        JSON.stringify({ version: 2, entries: {}, level: 'trust-everything' }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      expect(TestBed.inject(TrustedAccounts).level()).toBe('individuals');
    });
  });
});
