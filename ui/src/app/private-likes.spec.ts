import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateLikes, PRIVATE_LIKE_LIMIT } from './private-likes';
import { Status } from './models';
import { scopedKey } from './account-scope';
import { portableKeys } from './portable-config';
import { classifyStorageKey } from './storage-registry';

const status = (id = '1') =>
  ({
    id,
    url: `https://example.org/posts/${id}`,
    content: '<p>Pizza <b>forever</b></p>',
    account: { acct: 'pizza@example.org' },
    favourited: false,
    favourites_count: 7,
  }) as Status;

describe('PrivateLikes', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice');
    TestBed.configureTestingModule({});
  });
  afterEach(() => vi.restoreAllMocks());

  it('saves a short text reference, without changing network state or storing media', () => {
    const post = status();
    const store = TestBed.inject(PrivateLikes).current()!;
    store.toggle(post);
    expect(store.likes()).toEqual([
      { url: post.url, author: 'pizza@example.org', text: 'Pizza forever' },
    ]);
    expect(post.favourited).toBe(false);
    expect(post.favourites_count).toBe(7);
    store.toggle({ ...status('boost'), reblog: post });
    expect(store.likes()).toEqual([]);
  });

  it('isolates accounts and reloads saved likes without adopting anonymous bookmarks', () => {
    const likes = TestBed.inject(PrivateLikes);
    likes.current()!.toggle(status());
    localStorage.setItem('mastodon_mock_token', 'bob');
    expect(likes.current()!.likes()).toEqual([]);
    localStorage.setItem('mastodon_mock_token', 'alice');
    expect(likes.current()!.has(status())).toBe(true);
    TestBed.resetTestingModule();
    expect(TestBed.inject(PrivateLikes).current()!.has(status())).toBe(true);
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    expect(likes.current()).toBeNull();
    expect(localStorage.getItem('mockingbird_anonymous_bookmarks')).toBeNull();
  });

  it('enforces the limit, permits removal at capacity and preserves state on quota failure', () => {
    const store = TestBed.inject(PrivateLikes).current()!;
    for (let i = 0; i < PRIVATE_LIKE_LIMIT; i++) store.toggle(status(String(i)));
    expect(() => store.toggle(status('extra'))).toThrow();
    store.toggle(status('0'));
    store.toggle(status('extra'));
    const saved = store.likes();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full');
    });
    expect(() => store.remove(status('extra').url!)).toThrow();
    expect(store.likes()).toBe(saved);
  });

  it('excludes private likes from both settings exports', () => {
    TestBed.inject(PrivateLikes).current()!.toggle(status());
    expect(classifyStorageKey(scopedKey('mockingbird_private_likes'))?.sensitivity).toBe('private');
    expect(portableKeys('standard')).not.toContain('mockingbird_private_likes');
    expect(portableKeys('private')).not.toContain('mockingbird_private_likes');
  });

  it('rejects non-web links and safely loads malformed storage', () => {
    localStorage.setItem(
      scopedKey('mockingbird_private_likes'),
      '[{"url":"javascript:alert(1)","text":"bad","author":"bad"}]',
    );
    const store = TestBed.inject(PrivateLikes).current()!;
    expect(store.likes()).toEqual([]);
    expect(() => store.toggle({ ...status(), url: 'javascript:alert(1)' })).toThrow();
  });
});
