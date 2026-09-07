import { describe, expect, it } from 'vitest';
import { Account, Collection } from '../../models';
import {
  COPY_COLLECTION_LIMIT,
  describeCollectionPlan,
  planCollectionCopy,
  selectCollections,
  uniqueListTitle,
} from './copy-collections';

const NOW = Date.parse('2026-08-04T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}@mastodon.social`,
    statuses_count: 500,
    last_status_at: new Date(NOW - 2 * DAY).toISOString(),
    ...overrides,
  } as Account;
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    account_id: '1',
    name: 'Reading list',
    item_count: 3,
    ...overrides,
  } as Collection;
}

describe('selectCollections', () => {
  it('takes the biggest first, so the read budget buys the most members', () => {
    const picked = selectCollections([
      collection({ id: 'small', item_count: 2 }),
      collection({ id: 'big', item_count: 40 }),
      collection({ id: 'mid', item_count: 12 }),
    ]);
    expect(picked.map((c) => c.id)).toEqual(['big', 'mid', 'small']);
  });

  it('drops empty collections rather than spending a request to confirm they are empty', () => {
    const picked = selectCollections([
      collection({ id: 'empty', item_count: 0 }),
      collection({ id: 'real', item_count: 5 }),
    ]);
    expect(picked.map((c) => c.id)).toEqual(['real']);
  });

  it('never reads more than the budget', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      collection({ id: `c${i}`, item_count: i + 1 }),
    );
    expect(selectCollections(many)).toHaveLength(COPY_COLLECTION_LIMIT);
  });
});

describe('uniqueListTitle', () => {
  it('keeps the original name when it is free', () => {
    expect(uniqueListTitle('Rust people', ['Other list'])).toBe('Rust people');
  });

  it('suffixes rather than merging into a list that already exists', () => {
    expect(uniqueListTitle('Rust people', ['Rust people'])).toBe('Rust people (copy)');
    expect(uniqueListTitle('Rust people', ['Rust people', 'Rust people (copy)'])).toBe(
      'Rust people (copy 2)',
    );
  });

  it('matches case-insensitively — "rust people" is the same list to a human', () => {
    expect(uniqueListTitle('Rust People', ['rust people'])).toBe('Rust People (copy)');
  });

  it('falls back for an unnamed collection', () => {
    expect(uniqueListTitle('   ', [])).toBe('Untitled collection');
  });
});

describe('planCollectionCopy', () => {
  const base = {
    collection: collection(),
    isFollowing: () => false,
    takenTitles: [] as string[],
    now: NOW,
  };

  it('keeps live members and reports dormant ones with a reason', () => {
    const plan = planCollectionCopy({
      ...base,
      members: [
        account('1'),
        account('2', { last_status_at: new Date(NOW - 300 * DAY).toISOString() }),
      ],
    });

    expect(plan.adopt.map((a) => a.id)).toEqual(['1']);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toContain("hasn't posted");
  });

  it('applies the same gate as follows — a list member costs a call per open too', () => {
    const plan = planCollectionCopy({
      ...base,
      members: [account('1', { statuses_count: 3 })],
    });
    expect(plan.adopt).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain('only 3 posts');
  });

  it('keeps someone already followed without gating them again', () => {
    const dormant = account('1', { last_status_at: new Date(NOW - 300 * DAY).toISOString() });
    const plan = planCollectionCopy({
      ...base,
      members: [dormant],
      isFollowing: () => true,
    });

    expect(plan.adopt.map((a) => a.id)).toEqual(['1']);
    expect(plan.alreadyFollowing).toBe(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it('never adds the viewer to their own copy of a list they appear in', () => {
    const plan = planCollectionCopy({
      ...base,
      members: [account('1'), account('me')],
      viewerId: 'me',
    });
    expect(plan.adopt.map((a) => a.id)).toEqual(['1']);
  });

  it('dedupes members repeated within a collection', () => {
    const plan = planCollectionCopy({ ...base, members: [account('1'), account('1')] });
    expect(plan.adopt).toHaveLength(1);
  });

  it('resolves its title against titles already taken', () => {
    const plan = planCollectionCopy({
      ...base,
      members: [account('1')],
      takenTitles: ['Reading list'],
    });
    expect(plan.title).toBe('Reading list (copy)');
  });
});

describe('describeCollectionPlan', () => {
  it('accounts for every member so a thin copy is never unexplained', () => {
    const plan = planCollectionCopy({
      collection: collection(),
      isFollowing: () => false,
      takenTitles: [],
      now: NOW,
      members: [
        account('1'),
        account('2', { statuses_count: 1 }),
        account('3', { statuses_count: 1 }),
      ],
    });
    expect(describeCollectionPlan(plan)).toBe('1 of 3 · 2 too quiet');
  });

  it('says nothing survived rather than leaving an empty list unexplained', () => {
    const plan = planCollectionCopy({
      collection: collection(),
      isFollowing: () => false,
      takenTitles: [],
      now: NOW,
      members: [account('1', { statuses_count: 1 })],
    });
    expect(describeCollectionPlan(plan)).toBe('0 of 1 · 1 too quiet');
  });

  it('stays quiet when there is nothing to explain', () => {
    const plan = planCollectionCopy({
      collection: collection(),
      isFollowing: () => false,
      takenTitles: [],
      now: NOW,
      members: [account('1'), account('2')],
    });
    expect(describeCollectionPlan(plan)).toBe('2 of 2');
  });
});
