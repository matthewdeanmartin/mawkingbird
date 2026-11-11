import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { Account } from '../platform/api/models';
import { LocalModeration, accountKey, moderationKey } from './local-moderation';

const KEY = 'mockingbird_anonymous_moderation';
const LEGACY_KEY = 'mockingbird_local_moderation';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'id1',
    username: 'alice',
    acct: 'alice@social.example',
    display_name: 'Alice',
    note: '',
    url: 'https://social.example/@alice',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...overrides,
  };
}

describe('LocalModeration', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.useRealTimers());

  it('block() suppresses an account and persists it', () => {
    const svc = TestBed.inject(LocalModeration);
    const a = account();
    expect(svc.isSuppressed(a)).toBe(false);

    svc.block(a);
    expect(svc.isBlocked(a)).toBe(true);
    expect(svc.isSuppressed(a)).toBe(true);

    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.entries[accountKey(a)].kind).toBe('block');
  });

  it('mute() with a duration expires; clear() lifts it', () => {
    vi.useFakeTimers();
    const svc = TestBed.inject(LocalModeration);
    const a = account();

    svc.mute(a, 3600); // 1 hour
    expect(svc.isMuted(a)).toBe(true);
    expect(svc.isBlocked(a)).toBe(false);

    vi.advanceTimersByTime(3600 * 1000 + 1);
    expect(svc.isMuted(a)).toBe(false);
    expect(svc.isSuppressed(a)).toBe(false);
  });

  it('mute(null) never expires until cleared', () => {
    const svc = TestBed.inject(LocalModeration);
    const a = account();
    svc.mute(a, null);
    expect(svc.isMuted(a)).toBe(true);
    svc.clear(a);
    expect(svc.isSuppressed(a)).toBe(false);
  });

  it('matches the same person across ids by acct (provider-stable key)', () => {
    const svc = TestBed.inject(LocalModeration);
    // Blocked when first seen via the API route (id "remote-copy").
    svc.block(account({ id: 'remote-copy' }));
    // Later seen via a different route with a different id but same acct.
    expect(svc.isBlocked(account({ id: 'anonymous-mastodon:social.example:9' }))).toBe(true);
  });

  it('purges expired entries on load', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        entries: {
          gone: { kind: 'mute', expiresAt: Date.now() - 1000, acct: 'gone@x' },
          kept: { kind: 'block', expiresAt: Date.now() + 100_000, acct: 'kept@x' },
        },
      }),
    );
    const svc = TestBed.inject(LocalModeration);
    expect(svc.list().map((e) => e.key)).toEqual(['kept']);
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.entries['gone']).toBeUndefined();
    expect(stored.entries['kept']).toBeDefined();
  });

  describe('across accounts and servers', () => {
    const mistersql = (overrides: Partial<Account> = {}) =>
      account({
        id: '301226',
        username: 'mistersql',
        acct: 'mistersql',
        url: 'https://mastodon.social/@mistersql',
        ...overrides,
      });

    it('qualifies a bare local acct with its server, so namesakes elsewhere stay visible', () => {
      const svc = TestBed.inject(LocalModeration);
      svc.mute(mistersql(), null);
      expect(moderationKey(mistersql())).toBe('mistersql@mastodon.social');
      // Trusted accounts share accountKey; its shape is unchanged.
      expect(accountKey(mistersql())).toBe('mistersql');
      expect(svc.isMuted(mistersql({ id: 'x', acct: 'mistersql@mastodon.social' }))).toBe(true);
      expect(svc.isMuted(mistersql({ id: '5', url: 'https://other.example/@mistersql' }))).toBe(
        false,
      );
    });

    it('drops the retired list every account on the device shared', () => {
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify({
          version: 1,
          entries: {
            mistersql: { kind: 'mute', expiresAt: Number.MAX_SAFE_INTEGER, acct: 'mistersql' },
          },
        }),
      );
      const svc = TestBed.inject(LocalModeration);
      expect(svc.isSuppressed(mistersql())).toBe(false);
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('applies only to the Anonymous reader, never to a signed-in account', () => {
      const svc = TestBed.inject(LocalModeration);
      svc.mute(mistersql(), null);
      expect(svc.isSuppressed(mistersql())).toBe(true);
      svc.useViewer(() => ({ key: 'mastodon:t:1', anonymous: false, self: null }));
      expect(svc.isSuppressed(mistersql())).toBe(false);
      expect(svc.isMuted(mistersql())).toBe(false);
    });

    it('never hides the reader their own account', () => {
      const svc = TestBed.inject(LocalModeration);
      svc.mute(mistersql(), null);
      svc.useViewer(() => ({
        key: 'anonymous',
        anonymous: true,
        self: { id: '301226', acct: 'mistersql' },
      }));
      expect(svc.isSuppressed(mistersql())).toBe(false);
    });

    it('hides a server-muted author for this visit and this account only, storing nothing', () => {
      const svc = TestBed.inject(LocalModeration);
      svc.useViewer(() => ({
        key: 'mawkingbird',
        anonymous: false,
        self: { id: '1', acct: 'mawkingbird' },
      }));
      svc.hideAfterServerAction(mistersql());
      expect(svc.isSuppressed(mistersql())).toBe(true);
      expect(svc.isMuted(mistersql())).toBe(false);
      expect(localStorage.getItem(KEY) ?? '{"entries":{}}').not.toContain('mistersql');

      svc.useViewer(() => ({
        key: 'mistersql',
        anonymous: false,
        self: { id: '301226', acct: 'mistersql' },
      }));
      expect(svc.isSuppressed(mistersql())).toBe(false);
      svc.useViewer(() => ({
        key: 'someone-else',
        anonymous: false,
        self: { id: '7', acct: 'other' },
      }));
      expect(svc.isSuppressed(mistersql())).toBe(false);
    });
  });
});
