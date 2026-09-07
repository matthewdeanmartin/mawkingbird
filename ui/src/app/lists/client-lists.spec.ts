import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientLists, handleFor } from './client-lists';
import { Account } from '../models';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice',
    display_name: 'Alice',
    ...overrides,
  } as Account;
}

describe('handleFor', () => {
  it('keeps a remote acct as-is, since it already carries the host', () => {
    expect(handleFor(account({ acct: 'bob@example.social' }))).toBe('bob@example.social');
  });

  it('supplies the current host for a local account', () => {
    expect(handleFor(account({ acct: 'alice' }), 'mastodon.social')).toBe('alice@mastodon.social');
  });

  it('strips a scheme and path from the fallback host', () => {
    expect(handleFor(account({ acct: 'alice' }), 'https://mastodon.social/api')).toBe(
      'alice@mastodon.social',
    );
  });

  it('lowercases, so a handle matches however it was typed', () => {
    expect(handleFor(account({ acct: 'Bob@Example.Social' }))).toBe('bob@example.social');
  });
});

describe('ClientLists', () => {
  let lists: ClientLists;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    lists = TestBed.inject(ClientLists);
  });

  it('starts empty', () => {
    expect(lists.lists()).toEqual([]);
    expect(lists.count()).toBe(0);
  });

  it('creates a list and persists it', () => {
    const created = lists.create('Reading');
    expect(created.title).toBe('Reading');
    expect(created.memberHandles).toEqual([]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ClientLists).lists()[0].title).toBe('Reading');
  });

  it('adds a member without anyone being followed', () => {
    // The entire point: the server's list API refuses accounts you don't follow, and
    // this store has no such opinion.
    const list = lists.create('Watching');
    lists.setMember(list.id, 'bob@example.social', true);
    expect(lists.hasMember(list.id, 'bob@example.social')).toBe(true);
  });

  it('matches members case-insensitively', () => {
    const list = lists.create('Watching');
    lists.setMember(list.id, 'Bob@Example.Social', true);
    expect(lists.hasMember(list.id, 'bob@example.social')).toBe(true);
  });

  it('does not add the same handle twice', () => {
    const list = lists.create('Watching');
    lists.setMember(list.id, 'bob@example.social', true);
    lists.setMember(list.id, 'bob@example.social', true);
    expect(lists.get(list.id)!.memberHandles).toEqual(['bob@example.social']);
  });

  it('removes a member', () => {
    const list = lists.create('Watching');
    lists.setMember(list.id, 'bob@example.social', true);
    lists.setMember(list.id, 'bob@example.social', false);
    expect(lists.hasMember(list.id, 'bob@example.social')).toBe(false);
  });

  it('finds every list an account is in', () => {
    const a = lists.create('One');
    const b = lists.create('Two');
    lists.create('Three');
    lists.setMember(a.id, 'bob@example.social', true);
    lists.setMember(b.id, 'bob@example.social', true);
    expect(lists.listsWith('bob@example.social').map((l) => l.title)).toEqual(['One', 'Two']);
  });

  it('renames without disturbing members', () => {
    const list = lists.create('Old');
    lists.setMember(list.id, 'bob@example.social', true);
    lists.rename(list.id, 'New');
    expect(lists.get(list.id)!.title).toBe('New');
    expect(lists.get(list.id)!.memberHandles).toEqual(['bob@example.social']);
  });

  it('deletes a list', () => {
    const list = lists.create('Temporary');
    lists.remove(list.id);
    expect(lists.get(list.id)).toBeNull();
  });

  describe('stored state is cache, not records', () => {
    it('discards a version it does not recognise rather than migrating it', () => {
      // Deliberate: the alternative is carrying migration code forever for data the
      // user can recreate in seconds. The next page load rebuilds from the API.
      const key = Object.keys(localStorage).find((k) => k.startsWith('mockingbird_client_lists'))!;
      localStorage.setItem(
        key ?? 'mockingbird_client_lists',
        JSON.stringify({ version: 99, lists: [{ id: 'x', title: 'Old', memberHandles: [] }] }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      expect(TestBed.inject(ClientLists).lists()).toEqual([]);
    });

    it('survives a corrupt blob', () => {
      localStorage.setItem('mockingbird_client_lists', 'not json at all');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      expect(TestBed.inject(ClientLists).lists()).toEqual([]);
    });

    it('drops entries missing the fields a list needs', () => {
      lists.create('Good');
      const key = Object.keys(localStorage).find((k) => k.startsWith('mockingbird_client_lists'))!;
      const blob = JSON.parse(localStorage.getItem(key)!);
      blob.lists.push({ id: 'broken' });
      localStorage.setItem(key, JSON.stringify(blob));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reloaded = TestBed.inject(ClientLists);
      expect(reloaded.lists()).toHaveLength(1);
      expect(reloaded.lists()[0].title).toBe('Good');
    });
  });
});
