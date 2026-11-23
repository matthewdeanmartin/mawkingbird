import { describe, expect, it } from 'vitest';
import { Account } from '../platform/api/models';
import {
  ageBand,
  audienceOverlap,
  cadenceBand,
  emptyComposition,
  hostOf,
  mergeComposition,
  serverSplit,
  sizeTier,
  tallyComposition,
} from './audience-composition';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-23T00:00:00Z');

function acct(partial: Partial<Account>): Account {
  return {
    id: '1',
    acct: 'a',
    url: 'https://home.example/@a',
    followers_count: 10,
    statuses_count: 100,
    bot: false,
    created_at: new Date(NOW - 400 * DAY).toISOString(),
    ...partial,
  } as Account;
}

describe('hostOf', () => {
  it('reads the domain from acct, else the profile URL', () => {
    expect(hostOf({ acct: 'x@Mastodon.Social', url: '' })).toBe('mastodon.social');
    expect(hostOf({ acct: 'x', url: 'https://Home.Example/@x' })).toBe('home.example');
    expect(hostOf({ acct: 'x', url: 'not a url' })).toBeNull();
  });
});

describe('bands', () => {
  it('sizes by follower count', () => {
    expect(sizeTier(0)).toBe('small');
    expect(sizeTier(49)).toBe('small');
    expect(sizeTier(50)).toBe('regular');
    expect(sizeTier(500)).toBe('large');
    expect(sizeTier(5000)).toBe('big');
  });

  it('ages by created_at', () => {
    const at = (days: number) => ({ created_at: new Date(NOW - days * DAY).toISOString() });
    expect(ageBand(at(10), NOW)).toBe('new');
    expect(ageBand(at(200), NOW)).toBe('underYear');
    expect(ageBand(at(800), NOW)).toBe('oneToThree');
    expect(ageBand(at(2000), NOW)).toBe('overThree');
    expect(ageBand({}, NOW)).toBe('unknown');
  });

  it('bands lifetime cadence, unknown for young accounts', () => {
    const joined = new Date(NOW - 100 * DAY).toISOString();
    expect(cadenceBand(acct({ statuses_count: 5, created_at: joined }), NOW)).toBe('drizzle');
    expect(cadenceBand(acct({ statuses_count: 50, created_at: joined }), NOW)).toBe('light');
    expect(cadenceBand(acct({ statuses_count: 200, created_at: joined }), NOW)).toBe('regular');
    expect(cadenceBand(acct({ statuses_count: 900, created_at: joined }), NOW)).toBe('heavy');
    const young = new Date(NOW - 3 * DAY).toISOString();
    expect(cadenceBand(acct({ created_at: young }), NOW)).toBe('unknown');
  });
});

describe('tallyComposition', () => {
  it('counts servers, tiers, flags and merges batches', () => {
    const a = tallyComposition(
      [
        acct({ acct: 'a' }),
        acct({ acct: 'b@far.example', followers_count: 600, bot: true }),
        acct({ acct: 'c@far.example', group: true, followers_count: undefined as never }),
      ],
      NOW,
    );
    expect(a.scanned).toBe(3);
    expect(a.servers).toEqual({ 'home.example': 1, 'far.example': 2 });
    expect(a.tiers).toEqual({ small: 1, regular: 0, large: 1, big: 0 });
    expect(a.tierUnknown).toBe(1);
    expect(a.bots).toBe(1);
    expect(a.groups).toBe(1);
    const merged = mergeComposition(a, tallyComposition([acct({ acct: 'd@far.example' })], NOW));
    expect(merged.scanned).toBe(4);
    expect(merged.servers['far.example']).toBe(3);
    expect(mergeComposition(emptyComposition(), a)).toEqual(a);
  });
});

describe('serverSplit', () => {
  it('lists the top servers, groups the rest and reports the home share', () => {
    const t = emptyComposition();
    t.scanned = 10;
    t.servers = { 'home.example': 4, 'b.example': 3, 'c.example': 2, 'd.example': 1 };
    const split = serverSplit(t, 'Home.Example', 2);
    expect(split.top).toEqual([
      { host: 'home.example', count: 4 },
      { host: 'b.example', count: 3 },
    ]);
    expect(split.other).toBe(3);
    expect(split.distinct).toBe(4);
    expect(split.homePct).toBe(40);
  });
});

describe('audienceOverlap', () => {
  it('counts mutuals and one-way follows', () => {
    expect(audienceOverlap(new Set(['1', '2', '3']), new Set(['2', '3', '4', '5']))).toEqual({
      mutuals: 2,
      notFollowedBack: 1,
      notFollowingBack: 2,
    });
  });
});
