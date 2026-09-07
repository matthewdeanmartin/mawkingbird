import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../models';
import { AccountWithMatches } from './account-refine';
import { sortAccounts, sortStatuses } from './search-sort';

function status(partial: Partial<Status> & { id: string }): Status {
  return {
    created_at: '2020-01-01T00:00:00.000Z',
    edited_at: null,
    content: '',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account: { id: 'x', acct: 'x', display_name: '' } as Account,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...partial,
  } as Status;
}

function account(id: string, partial: Partial<Account> = {}): AccountWithMatches {
  return {
    account: {
      id,
      acct: id,
      display_name: id,
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      ...partial,
    } as Account,
    matchingPosts: [],
  };
}

describe('sortStatuses', () => {
  it('relevance returns the input order untouched', () => {
    const posts = [status({ id: 'a' }), status({ id: 'b' }), status({ id: 'c' })];
    expect(sortStatuses(posts, 'relevance')).toEqual(posts);
  });

  it('sorts newest / oldest by created_at', () => {
    const posts = [
      status({ id: 'old', created_at: '2020-01-01T00:00:00.000Z' }),
      status({ id: 'new', created_at: '2022-01-01T00:00:00.000Z' }),
      status({ id: 'mid', created_at: '2021-01-01T00:00:00.000Z' }),
    ];
    expect(sortStatuses(posts, 'newest').map((s) => s.id)).toEqual(['new', 'mid', 'old']);
    expect(sortStatuses(posts, 'oldest').map((s) => s.id)).toEqual(['old', 'mid', 'new']);
  });

  it('sorts by favourites / reblogs / replies descending', () => {
    const posts = [
      status({ id: 'a', favourites_count: 1, reblogs_count: 9, replies_count: 3 }),
      status({ id: 'b', favourites_count: 5, reblogs_count: 2, replies_count: 8 }),
    ];
    expect(sortStatuses(posts, 'favourites').map((s) => s.id)).toEqual(['b', 'a']);
    expect(sortStatuses(posts, 'reblogs').map((s) => s.id)).toEqual(['a', 'b']);
    expect(sortStatuses(posts, 'replies').map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('follows through a reblog for its metrics and date', () => {
    const inner = status({
      id: 'inner',
      created_at: '2022-01-01T00:00:00.000Z',
      favourites_count: 100,
    });
    const boost = status({ id: 'boost', created_at: '2000-01-01T00:00:00.000Z', reblog: inner });
    const plain = status({
      id: 'plain',
      created_at: '2021-01-01T00:00:00.000Z',
      favourites_count: 5,
    });
    // The boost sorts by the inner post's newer date and higher fav count.
    expect(sortStatuses([plain, boost], 'newest').map((s) => s.id)).toEqual(['boost', 'plain']);
    expect(sortStatuses([plain, boost], 'favourites').map((s) => s.id)).toEqual(['boost', 'plain']);
  });

  it('is stable — ties keep input order', () => {
    const posts = [status({ id: 'a' }), status({ id: 'b' }), status({ id: 'c' })];
    // All zero favourites; order must be preserved.
    expect(sortStatuses(posts, 'favourites').map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sortAccounts', () => {
  it('relevance returns the input order untouched', () => {
    const items = [account('a'), account('b')];
    expect(sortAccounts(items, 'relevance')).toEqual(items);
  });

  it('sorts by followers / following / posts descending', () => {
    const items = [
      account('a', { followers_count: 1, following_count: 9, statuses_count: 3 }),
      account('b', { followers_count: 5, following_count: 2, statuses_count: 8 }),
    ];
    expect(sortAccounts(items, 'followers').map((i) => i.account.id)).toEqual(['b', 'a']);
    expect(sortAccounts(items, 'following').map((i) => i.account.id)).toEqual(['a', 'b']);
    expect(sortAccounts(items, 'posts').map((i) => i.account.id)).toEqual(['b', 'a']);
  });

  it('sorts by name A–Z, case-insensitively, falling back to acct', () => {
    const items = [
      account('z', { display_name: 'Zebra' }),
      account('a', { display_name: 'apple' }),
      account('m', { display_name: '' }), // falls back to acct 'm'
    ];
    expect(sortAccounts(items, 'name').map((i) => i.account.id)).toEqual(['a', 'm', 'z']);
  });

  it('sorts by number of matching posts descending', () => {
    const few = account('few');
    few.matchingPosts = [status({ id: '1' })];
    const many = account('many');
    many.matchingPosts = [status({ id: '2' }), status({ id: '3' })];
    expect(sortAccounts([few, many], 'matches').map((i) => i.account.id)).toEqual(['many', 'few']);
  });

  it('sorts by last post, newest first', () => {
    const items = [
      account('old', { last_status_at: '2024-01-01' }),
      account('new', { last_status_at: '2026-08-01' }),
      account('mid', { last_status_at: '2025-06-15' }),
    ];
    expect(sortAccounts(items, 'active').map((i) => i.account.id)).toEqual(['new', 'mid', 'old']);
  });

  it('ranks never-posted below dated accounts, and unknown below both', () => {
    // The three tiers of `accountActivity`: a date beats "never posted" (a real
    // answer), which beats undefined (nobody has told us yet). Sorting unknown
    // as the epoch would claim an un-enriched account had been silent for
    // decades — a stronger statement than the data supports.
    const items = [
      account('unknown'),
      account('never', { last_status_at: null }),
      account('dated', { last_status_at: '2020-01-01' }),
    ];
    expect(sortAccounts(items, 'active').map((i) => i.account.id)).toEqual([
      'dated',
      'never',
      'unknown',
    ]);
  });

  it('keeps server order among accounts with the same activity (stable)', () => {
    const items = [
      account('first', { last_status_at: '2026-01-01' }),
      account('second', { last_status_at: '2026-01-01' }),
    ];
    expect(sortAccounts(items, 'active').map((i) => i.account.id)).toEqual(['first', 'second']);
  });
});
