import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnonymousLists } from './anonymous-lists';

describe('AnonymousLists', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('creates local lists and manages stable follow keys', () => {
    const lists = TestBed.inject(AnonymousLists);
    const list = lists.create('Friends');
    lists.setMember(list.id, 'alice@one.example', true);
    lists.setMember(list.id, 'alice@one.example', true);
    expect(lists.get(list.id)?.memberKeys).toEqual(['alice@one.example']);
    lists.setMember(list.id, 'alice@one.example', false);
    expect(lists.get(list.id)?.memberKeys).toEqual([]);
  });

  it('replaces incompatible older list storage', () => {
    localStorage.setItem(
      'mockingbird_anonymous_lists',
      JSON.stringify({ version: 1, lists: [{ id: 'old', title: 'Old', memberKeys: [] }] }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(AnonymousLists).lists()).toEqual([]);
  });
});
