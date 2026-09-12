import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from './models';
import { scopedKey } from './account-scope';
import { PrivateFollows } from './private-follows';
import { AnonymousFollows } from './providers/anonymous/anonymous-follows';
import { portableKeys } from './portable-config';
import { classifyStorageKey } from './storage-registry';
import {
  saveBlueskyIdentity,
  setActiveBlueskyIdentity,
} from './providers/bluesky/bluesky-identity-store';

function account(id = '42'): Account {
  return {
    id,
    username: `reader${id}`,
    acct: `reader${id}@social.example`,
    url: `https://social.example/@reader${id}`,
  } as Account;
}

describe('PrivateFollows', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.restoreAllMocks());

  it('persists per account without adopting or modifying Anonymous follows', () => {
    TestBed.inject(AnonymousFollows).follow(account('anonymous'), 'https://social.example');
    const anonymous = localStorage.getItem('mockingbird_anonymous_follows');
    const privateFollows = TestBed.inject(PrivateFollows);
    privateFollows.current()!.follow(account(), 'https://social.example');
    expect(localStorage.getItem('mockingbird_anonymous_follows')).toBe(anonymous);
    localStorage.setItem('mastodon_mock_token', 'bob');
    expect(privateFollows.current()!.count()).toBe(0);
    localStorage.setItem('mastodon_mock_token', 'alice');
    expect(privateFollows.current()!.count()).toBe(1);
    TestBed.resetTestingModule();
    expect(TestBed.inject(PrivateFollows).current()!.count()).toBe(1);
  });

  it('enforces a combined 50-account limit, permits duplicates, and frees removed slots', () => {
    const store = TestBed.inject(PrivateFollows).current()!;
    for (let i = 0; i < 50; i++)
      expect(store.follow(account(String(i)), 'https://social.example').ok).toBe(true);
    const bsky = {
      id: 'bsky:did:plc:reader',
      username: 'reader',
      acct: 'reader.bsky.social',
    } as Account;
    expect(store.follow(bsky, '').ok).toBe(false);
    expect(store.follow(account('0'), 'https://social.example').ok).toBe(true);
    store.unfollow(account('0'), 'https://social.example');
    expect(store.follow(bsky, '').ok).toBe(true);
    expect(store.count()).toBe(50);
  });

  it('stores Bluesky primary follows under their own identity and disables storage when signed out', () => {
    const follows = TestBed.inject(PrivateFollows);
    follows.current()!.follow(account(), 'https://social.example');
    saveBlueskyIdentity(
      { service: 'https://bsky.social', did: 'did:plc:me', handle: 'me.bsky.social' },
      { accessJwt: 'a', refreshJwt: 'r', connectedAt: Date.now() },
    );
    setActiveBlueskyIdentity('did:plc:me');
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    expect(follows.current()!.count()).toBe(0);
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    expect(follows.current()).toBeNull();
  });

  it('does not change its in-memory relationship if storage refuses the write', () => {
    const store = TestBed.inject(PrivateFollows).current()!;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full');
    });
    expect(() => store.follow(account(), 'https://social.example')).toThrow();
    expect(store.count()).toBe(0);
  });

  it('keeps private relationships out of settings sync and shareable exports', () => {
    expect(classifyStorageKey(scopedKey('mockingbird_private_follows'))?.sensitivity).toBe(
      'private',
    );
    expect(portableKeys('standard')).not.toContain('mockingbird_private_follows');
    expect(portableKeys('private')).not.toContain('mockingbird_private_follows');
  });
});
