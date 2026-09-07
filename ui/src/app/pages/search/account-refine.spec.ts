import { describe, expect, it } from 'vitest';
import { Account, Relationship, Status } from '../../models';
import {
  accountMatchesFacet,
  accountMatchesNumeric,
  buildAccountFacets,
  condenseStatusesToAuthors,
  filterAccounts,
  filterByFollowState,
  inRange,
  mergeAuthors,
} from './account-refine';

/** Minimal Account fixture; override just the fields a test cares about. */
function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: Math.random().toString(36).slice(2),
    username: 'alan',
    acct: 'alan',
    display_name: 'Alan',
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

/** Minimal Status fixture carrying only what condensation reads. */
function makeStatus(account: Account, over: Partial<Status> = {}): Status {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-07-20T12:00:00Z',
    edited_at: null,
    content: '<p>hi</p>',
    spoiler_text: '',
    visibility: 'public',
    url: null,
    account,
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
    language: null,
    media_attachments: [],
    ...over,
  };
}

describe('inRange', () => {
  it('passes everything when the range is undefined', () => {
    expect(inRange(500, undefined)).toBe(true);
  });
  it('treats an unset bound as open on that side', () => {
    expect(inRange(5, { min: 10 })).toBe(false);
    expect(inRange(50, { min: 10 })).toBe(true);
    expect(inRange(50, { max: 10 })).toBe(false);
    expect(inRange(5, { max: 10 })).toBe(true);
  });
  it('is inclusive on both bounds', () => {
    expect(inRange(10, { min: 10, max: 20 })).toBe(true);
    expect(inRange(20, { min: 10, max: 20 })).toBe(true);
    expect(inRange(21, { min: 10, max: 20 })).toBe(false);
  });
});

describe('accountMatchesNumeric', () => {
  it('ANDs the three gates', () => {
    const a = makeAccount({ followers_count: 500, following_count: 50, statuses_count: 2000 });
    // A "real person": lots of posts, moderate followers, follows some people.
    expect(
      accountMatchesNumeric(a, {
        followers: { max: 5000 },
        following: { min: 10 },
        statuses: { min: 100 },
      }),
    ).toBe(true);
  });
  it('rejects a celebrity when capping followers', () => {
    const celeb = makeAccount({ followers_count: 2_000_000, following_count: 3 });
    expect(accountMatchesNumeric(celeb, { followers: { max: 10_000 } })).toBe(false);
  });
  it('rejects a dead account when requiring recent-ish activity via post count', () => {
    const dead = makeAccount({ statuses_count: 2 });
    expect(accountMatchesNumeric(dead, { statuses: { min: 50 } })).toBe(false);
  });
  it('passes when no bounds are set', () => {
    expect(accountMatchesNumeric(makeAccount(), {})).toBe(true);
  });
});

describe('filterAccounts', () => {
  const accounts = [
    makeAccount({
      display_name: 'Jane Economist',
      acct: 'jane@econ.social',
      note: '<p>I study inflation</p>',
    }),
    makeAccount({ display_name: 'Bob', acct: 'bob@tech.example', note: '<p>rust and go</p>' }),
  ];
  it('returns everything for an empty filter', () => {
    expect(filterAccounts(accounts, '   ')).toHaveLength(2);
  });
  it('matches display name', () => {
    expect(filterAccounts(accounts, 'jane')).toHaveLength(1);
  });
  it('matches handle', () => {
    expect(filterAccounts(accounts, 'tech.example')).toHaveLength(1);
  });
  it('matches bio text with tags stripped', () => {
    expect(filterAccounts(accounts, 'inflation')[0].display_name).toBe('Jane Economist');
  });
});

describe('condenseStatusesToAuthors', () => {
  it('dedupes by account id and preserves first-seen order', () => {
    const a = makeAccount({ id: 'a', display_name: 'Ada' });
    const b = makeAccount({ id: 'b', display_name: 'Bo' });
    const result = condenseStatusesToAuthors([
      makeStatus(a, { id: 's1' }),
      makeStatus(b, { id: 's2' }),
      makeStatus(a, { id: 's3' }),
    ]);
    expect(result.map((r) => r.account.id)).toEqual(['a', 'b']);
  });
  it('attaches every matching post in appearance order', () => {
    const a = makeAccount({ id: 'a' });
    const result = condenseStatusesToAuthors([
      makeStatus(a, { id: 's1' }),
      makeStatus(a, { id: 's3' }),
      makeStatus(a, { id: 's2' }),
    ]);
    expect(result[0].matchingPosts.map((s) => s.id)).toEqual(['s1', 's3', 's2']);
  });
  it('skips statuses without an account id', () => {
    const bad = makeStatus(makeAccount(), { account: { id: '' } as Account });
    expect(condenseStatusesToAuthors([bad])).toHaveLength(0);
  });
});

describe('mergeAuthors', () => {
  it('dedupes across inputs, first-seen wins, posts concatenate', () => {
    const a1 = { account: makeAccount({ id: 'a', display_name: 'From bio' }), matchingPosts: [] };
    const a2 = {
      account: makeAccount({ id: 'a', display_name: 'From posts' }),
      matchingPosts: [makeStatus(makeAccount({ id: 'a' }), { id: 'p1' })],
    };
    const c = { account: makeAccount({ id: 'c' }), matchingPosts: [] };
    const merged = mergeAuthors([a1], [a2, c]);
    expect(merged.map((m) => m.account.id)).toEqual(['a', 'c']);
    expect(merged[0].account.display_name).toBe('From bio'); // first-seen wins
    expect(merged[0].matchingPosts.map((p) => p.id)).toEqual(['p1']); // posts merged in
  });
});

describe('buildAccountFacets', () => {
  it('returns nothing for an empty set', () => {
    expect(buildAccountFacets([])).toEqual([]);
  });

  it('keeps populated facets for homogeneous accounts', () => {
    // Even similar accounts retain filters with accurate loaded counts.
    const same = [makeAccount({ acct: 'a' }), makeAccount({ acct: 'b' })];
    const facets = buildAccountFacets(same);
    expect(facets.map((f) => f.kind)).toEqual([
      'domain',
      'bot',
      'locked',
      'followers',
      'statuses',
      'activity',
    ]);
    for (const facet of facets) {
      expect(facet.values).toHaveLength(1);
      expect(facet.values[0].count).toBe(2);
    }
  });

  it('builds a domain facet from mixed hosts', () => {
    const accounts = [
      makeAccount({ acct: 'a@econ.social' }),
      makeAccount({ acct: 'b@econ.social' }),
      makeAccount({ acct: 'c@tech.example' }),
    ];
    const domain = buildAccountFacets(accounts).find((f) => f.kind === 'domain');
    expect(domain).toBeTruthy();
    expect(domain!.values[0]).toMatchObject({ value: 'econ.social', count: 2 });
  });

  it('buckets follower counts and keeps small→large order', () => {
    const accounts = [
      makeAccount({ followers_count: 50 }),
      makeAccount({ followers_count: 500 }),
      makeAccount({ followers_count: 50_000 }),
    ];
    const followers = buildAccountFacets(accounts).find((f) => f.kind === 'followers');
    expect(followers!.values.map((v) => v.value)).toEqual(['0-99', '100-999', '10000+']);
  });

  it('builds a bot facet when the set is mixed', () => {
    const accounts = [makeAccount({ bot: true }), makeAccount({ bot: false })];
    expect(buildAccountFacets(accounts).some((f) => f.kind === 'bot')).toBe(true);
  });
});

describe('accountMatchesFacet', () => {
  it('matches domain, treating local as "local"', () => {
    expect(
      accountMatchesFacet(makeAccount({ acct: 'x@econ.social' }), 'domain', 'econ.social'),
    ).toBe(true);
    expect(accountMatchesFacet(makeAccount({ acct: 'local' }), 'domain', 'local')).toBe(true);
  });
  it('matches bot / human buckets', () => {
    expect(accountMatchesFacet(makeAccount({ bot: true }), 'bot', 'bot')).toBe(true);
    expect(accountMatchesFacet(makeAccount({ bot: false }), 'bot', 'human')).toBe(true);
  });
  it('matches the follower bucket the account falls in', () => {
    expect(accountMatchesFacet(makeAccount({ followers_count: 500 }), 'followers', '100-999')).toBe(
      true,
    );
    expect(accountMatchesFacet(makeAccount({ followers_count: 500 }), 'followers', '10000+')).toBe(
      false,
    );
  });
});

describe('filterByFollowState', () => {
  function rel(id: string, over: Partial<Relationship> = {}): Relationship {
    return {
      id,
      following: false,
      followed_by: false,
      requested: false,
      blocking: false,
      muting: false,
      ...over,
    } as Relationship;
  }

  const followed = { account: makeAccount({ id: 'f' }), matchingPosts: [] };
  const stranger = { account: makeAccount({ id: 's' }), matchingPosts: [] };
  const items = [followed, stranger];
  const rels = { f: rel('f', { following: true }), s: rel('s') };

  it("returns everything for 'all'", () => {
    expect(filterByFollowState(items, rels, 'all')).toEqual(items);
  });

  it('keeps only accounts the viewer follows', () => {
    expect(filterByFollowState(items, rels, 'following').map((i) => i.account.id)).toEqual(['f']);
  });

  it('keeps only accounts the viewer does not follow', () => {
    expect(filterByFollowState(items, rels, 'not-following').map((i) => i.account.id)).toEqual([
      's',
    ]);
  });

  it('counts a pending follow request as following', () => {
    // The intent is recorded, so it should stop appearing under "not yet" as
    // something still to do.
    const pending = { r: rel('r', { requested: true }) };
    const item = [{ account: makeAccount({ id: 'r' }), matchingPosts: [] }];
    expect(filterByFollowState(item, pending, 'following')).toHaveLength(1);
    expect(filterByFollowState(item, pending, 'not-following')).toHaveLength(0);
  });

  it('treats an unloaded relationship as not following, matching the card', () => {
    // The card's button reads "Follow" until a relationship proves otherwise;
    // the filtered list must not contradict the buttons inside it.
    const item = [{ account: makeAccount({ id: 'unknown' }), matchingPosts: [] }];
    expect(filterByFollowState(item, {}, 'not-following')).toHaveLength(1);
    expect(filterByFollowState(item, {}, 'following')).toHaveLength(0);
  });
});

describe('last-activity facet', () => {
  const NOW = Date.parse('2026-08-09T12:00:00Z');
  const DAY = 86_400_000;

  /** An account whose last post was `days` ago. */
  const activeDaysAgo = (days: number, over: Partial<Account> = {}) =>
    makeAccount({ last_status_at: new Date(NOW - days * DAY).toISOString(), ...over });

  /** Just the activity facet, or undefined when it wasn't built. */
  const activityFacet = (accounts: Account[]) =>
    buildAccountFacets(accounts, NOW).find((f) => f.kind === 'activity');

  it('bins accounts onto the ladder, recent first', () => {
    const facet = activityFacet([
      activeDaysAgo(0),
      activeDaysAgo(3),
      activeDaysAgo(20),
      activeDaysAgo(400),
    ]);
    expect(facet?.values.map((v) => v.labelKey)).toEqual([
      'pages.search.activity.today',
      'pages.search.activity.thisWeek',
      'pages.search.activity.thisMonth',
      'pages.search.activity.oneToTwoYears',
    ]);
    expect(facet?.values.every((v) => v.count === 1)).toBe(true);
  });

  /**
   * The "it's all in the same year" case: a fixed ladder would show eight rows
   * of which five read zero. Dropping empties is what keeps it readable without
   * a binning algorithm to tune.
   */
  it('drops empty bins so a narrow corpus stays short', () => {
    const facet = activityFacet([activeDaysAgo(0), activeDaysAgo(1), activeDaysAgo(2)]);
    expect(facet?.values.map((v) => v.labelKey)).toEqual([
      'pages.search.activity.today',
      'pages.search.activity.thisWeek',
    ]);
  });

  it('keeps ladder order rather than sorting by count', () => {
    // One account today, five last year: count order would invert the timeline.
    const facet = activityFacet([
      activeDaysAgo(0),
      ...Array.from({ length: 5 }, () => activeDaysAgo(300)),
    ]);
    expect(facet?.values.map((v) => v.labelKey)).toEqual([
      'pages.search.activity.today',
      'pages.search.activity.lastYear',
    ]);
    expect(facet?.values.map((v) => v.count)).toEqual([1, 5]);
  });

  it('never exceeds the nine-bin ceiling', () => {
    const facet = activityFacet([0, 3, 20, 60, 120, 300, 500, 2000].map((d) => activeDaysAgo(d)));
    expect(facet!.values.length).toBeLessThanOrEqual(9);
    expect(facet?.values.at(-1)?.labelKey).toBe('pages.search.activity.overTwoYears');
  });

  it('bins accounts with no known last post separately, last', () => {
    const facet = activityFacet([
      activeDaysAgo(1),
      makeAccount({ last_status_at: null }),
      makeAccount({ last_status_at: undefined }),
    ]);
    expect(facet?.values.at(-1)).toMatchObject({
      value: 'unknown',
      labelKey: 'pages.search.activity.notKnown',
      count: 2,
    });
  });

  it('treats an unreadable date as unknown rather than ancient', () => {
    const facet = activityFacet([activeDaysAgo(1), makeAccount({ last_status_at: 'someday' })]);
    expect(facet?.values.at(-1)).toMatchObject({ value: 'unknown', count: 1 });
  });

  /** A server clock running ahead must not push someone out of "Today". */
  it('clamps a future last-post date into Today', () => {
    const facet = activityFacet([activeDaysAgo(-2), activeDaysAgo(300)]);
    expect(facet?.values[0]).toMatchObject({ value: 'd1', count: 1 });
  });

  it('retains the activity count when every account falls in one bin', () => {
    // Keep the activity ladder available for narrow searches too.
    expect(activityFacet([activeDaysAgo(1), activeDaysAgo(2)])?.values).toEqual([
      expect.objectContaining({ count: 2 }),
    ]);
  });

  it('asks the UI to show every row', () => {
    const facet = activityFacet([activeDaysAgo(0), activeDaysAgo(400)]);
    expect(facet?.showAll).toBe(true);
  });

  it('selection agrees with the bin the counts used', () => {
    const fresh = activeDaysAgo(0);
    const stale = activeDaysAgo(400);
    expect(accountMatchesFacet(fresh, 'activity', 'd1', NOW)).toBe(true);
    expect(accountMatchesFacet(fresh, 'activity', 'd730', NOW)).toBe(false);
    expect(accountMatchesFacet(stale, 'activity', 'd730', NOW)).toBe(true);
    expect(
      accountMatchesFacet(makeAccount({ last_status_at: null }), 'activity', 'unknown', NOW),
    ).toBe(true);
  });

  it('puts each boundary on the inclusive side of the finer bin', () => {
    // Exactly 7 days is "this week"'s upper edge: < 7 is the week, 7 is a month.
    expect(accountMatchesFacet(activeDaysAgo(6.9), 'activity', 'd7', NOW)).toBe(true);
    expect(accountMatchesFacet(activeDaysAgo(7.1), 'activity', 'd30', NOW)).toBe(true);
  });
});
