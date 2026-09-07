import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileCollections } from './profile-collections';
import type { CollectionResult } from './profile-collections';
import { ProfileLists } from './profile-lists';
import type { ProfileList } from './profile-lists';

/**
 * The provider store.
 *
 * Two properties carry most of the weight here, and both are about what a
 * *failed* write leaves behind:
 *
 * 1. A refused mutation must not leave invented state in the signal. The
 *    optimism is deliberate — awaiting a round trip before the list moves feels
 *    broken — but it is only safe if a failure rolls back.
 * 2. `loaded()` must stay false until the fetch lands, because a caller that
 *    renders "no lists" for a collection still in flight is telling the user
 *    their data is gone.
 */

function list(id: string, over: Partial<ProfileList> = {}): ProfileList {
  return {
    id,
    title: id,
    memberHandles: [],
    createdAt: '2026-08-18T00:00:00.000Z',
    ...over,
  };
}

class FakeCollections {
  items: ProfileList[] = [];
  nextResult: CollectionResult<never> | null = null;
  batchCalls = 0;

  index = vi.fn(() => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    return Promise.resolve({
      kind: 'ok' as const,
      value: {
        index: {
          kind: 'mawkingbird-profile-index' as const,
          collection: 'lists',
          revision: 1,
          updatedAt: '2026-08-18T00:00:00.000Z',
          items: this.items.map((item) => ({
            id: item.id,
            updatedAt: item.createdAt,
            size: 100,
            inline: item,
          })),
        },
        etag: '"e1"',
      },
    });
  });

  put = vi.fn((_collection: string, id: string, value: ProfileList) => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    this.items = [...this.items.filter((item) => item.id !== id), value];
    return Promise.resolve({ kind: 'ok' as const, value: { revision: 1 } });
  });

  remove = vi.fn((_collection: string, id: string) => {
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    this.items = this.items.filter((item) => item.id !== id);
    return Promise.resolve({ kind: 'ok' as const, value: { revision: 1 } });
  });

  batch = vi.fn((_collection: string, operations: { id: string; value?: ProfileList }[]) => {
    this.batchCalls++;
    if (this.nextResult) {
      return Promise.resolve(this.nextResult);
    }
    for (const operation of operations) {
      if (operation.value) {
        this.items = [...this.items, operation.value];
      }
    }
    return Promise.resolve({
      kind: 'ok' as const,
      value: { written: operations.length, deleted: 0, revision: 1 },
    });
  });
}

describe('ProfileLists', () => {
  let lists: ProfileLists;
  let collections: FakeCollections;

  beforeEach(() => {
    localStorage.clear();
    collections = new FakeCollections();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ProfileCollections, useValue: collections }],
    });
    lists = TestBed.inject(ProfileLists);
  });

  it('is not loaded before the first fetch', () => {
    // The distinction that keeps the UI from claiming an empty collection.
    expect(lists.loaded()).toBe(false);
    expect(lists.count()).toBe(0);
  });

  it('loads lists from the index without a second request', async () => {
    collections.items = [list('a'), list('b')];
    await lists.load();

    // Small lists live inline in the index, so rendering costs one request.
    expect(lists.count()).toBe(2);
    expect(lists.loaded()).toBe(true);
  });

  it('ignores malformed entries rather than rendering them', async () => {
    collections.items = [list('a'), { id: 'bad' } as ProfileList];
    await lists.load();
    expect(lists.lists().map((entry) => entry.id)).toEqual(['a']);
  });

  it('creates a list', async () => {
    const created = await lists.create('Friends');
    expect(created?.title).toBe('Friends');
    expect(lists.count()).toBe(1);
  });

  it('rolls back a create the service refused', async () => {
    collections.nextResult = { kind: 'failed', message: 'offline' };
    const created = await lists.create('Friends');

    expect(created).toBeNull();
    // The rollback: no invented list is left behind for the user to wonder about.
    expect(lists.count()).toBe(0);
    expect(lists.error()).toBe('offline');
  });

  it('rolls back a delete the service refused', async () => {
    collections.items = [list('a')];
    await lists.load();

    collections.nextResult = { kind: 'failed', message: 'offline' };
    const removed = await lists.remove('a');

    expect(removed).toBe(false);
    expect(lists.count()).toBe(1);
  });

  it('rolls back a rename the service refused', async () => {
    collections.items = [list('a', { title: 'Original' })];
    await lists.load();

    collections.nextResult = { kind: 'failed', message: 'offline' };
    await lists.rename('a', 'Changed');

    expect(lists.get('a')?.title).toBe('Original');
  });

  it('adds and removes members', async () => {
    collections.items = [list('a')];
    await lists.load();

    await lists.setMember('a', 'Alice@Example.social', true);
    expect(lists.hasMember('a', 'alice@example.social')).toBe(true);

    await lists.setMember('a', 'alice@example.social', false);
    expect(lists.hasMember('a', 'alice@example.social')).toBe(false);
  });

  it('goes read-only on a lapsed subscription rather than retrying', async () => {
    collections.nextResult = { kind: 'payment-required', message: 'Plus required' };
    await lists.create('Friends');

    // A state, not an error to retry: the UI hides its write affordances.
    expect(lists.canWrite()).toBe(false);
  });

  it('goes read-only when signed out', async () => {
    collections.nextResult = { kind: 'forbidden', message: 'Sign in' };
    await lists.load();
    expect(lists.canWrite()).toBe(false);
  });

  it('reports a missing account without inventing a bucket', async () => {
    collections.nextResult = { kind: 'no-account', message: 'Sign in to an account' };
    await lists.load();
    expect(lists.error()).toBe('Sign in to an account');
    expect(lists.count()).toBe(0);
  });

  describe('copyIn', () => {
    it('writes every list in one batch', async () => {
      const result = await lists.copyIn([list('local-1'), list('local-2'), list('local-3')]);

      expect(result.kind).toBe('ok');
      // One index write, not three racing each other.
      expect(collections.batchCalls).toBe(1);
      expect(lists.count()).toBe(3);
    });

    it('gives copies new ids so a second run duplicates rather than overwrites', async () => {
      await lists.copyIn([list('local-1')]);
      const firstId = lists.lists()[0]?.id;

      expect(firstId).not.toBe('local-1');
      // Noisy and recoverable beats quiet and lossy: a repeated copy must not
      // silently replace a list the user has since edited on the server.
      expect(firstId).toMatch(/^mwk-list-/);
    });

    it('does nothing for an empty source', async () => {
      const result = await lists.copyIn([]);
      expect(result).toEqual({ kind: 'ok', value: { written: 0 } });
      expect(collections.batchCalls).toBe(0);
    });

    it('reports a refused copy without claiming success', async () => {
      collections.nextResult = { kind: 'payment-required', message: 'Plus required' };
      const result = await lists.copyIn([list('local-1')]);

      expect(result.kind).toBe('payment-required');
      expect(lists.count()).toBe(0);
    });
  });
});
