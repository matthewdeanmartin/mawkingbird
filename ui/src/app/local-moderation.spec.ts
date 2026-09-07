import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { Account } from './models';
import { LocalModeration, accountKey } from './local-moderation';

const KEY = 'mockingbird_local_moderation';

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
});
