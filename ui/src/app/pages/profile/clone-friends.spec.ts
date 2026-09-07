import { describe, expect, it } from 'vitest';
import { Account } from '../../models';
import {
  CLONE_MAX_PAGES,
  CLONE_TARGET,
  describeSelection,
  followsAreHidden,
  homeServerFor,
  selectCloneCandidates,
} from './clone-friends';
import { thresholdSignals } from '../../follow-quality';

const NOW = Date.parse('2026-07-29T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** A follow-worthy account. `over` breaks exactly what a test needs broken. */
function good(id: string, over: Partial<Account> = {}): Account {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}@example.social`,
    display_name: `User ${id}`,
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 100,
    following_count: 100,
    statuses_count: 900,
    last_status_at: new Date(NOW - DAY).toISOString(),
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

/** Dormant: passes nothing, and is the common case in a real follow list. */
function dormant(id: string): Account {
  return good(id, { last_status_at: new Date(NOW - 400 * DAY).toISOString() });
}

function select(over: Partial<Parameters<typeof selectCloneCandidates>[0]> = {}) {
  return selectCloneCandidates({
    candidates: [],
    pagesFetched: 1,
    lastPageFull: false,
    isFollowing: () => false,
    remainingSlots: 50,
    now: NOW,
    ...over,
  });
}

describe('selectCloneCandidates', () => {
  it('adopts healthy accounts up to the target', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => good(`a${i}`));

    const result = select({ candidates });

    expect(result.adopt).toHaveLength(CLONE_TARGET);
    expect(result.skipped).toEqual([]);
  });

  it('filters dormant accounts and keeps the reason for the report', () => {
    const result = select({ candidates: [good('1'), dormant('2'), good('3')] });

    expect(result.adopt.map((a) => a.id)).toEqual(['1', '3']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].account.id).toBe('2');
    expect(result.skipped[0].reason).toContain("hasn't posted");
  });

  it('counts accounts already followed without reporting them as skipped', () => {
    // "Already following" is not a rejection and must not read as one.
    const result = select({
      candidates: [good('1'), good('2'), good('3')],
      isFollowing: (account) => account.id === '2',
    });

    expect(result.adopt.map((a) => a.id)).toEqual(['1', '3']);
    expect(result.alreadyFollowing).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  it('never tries to follow the viewer', () => {
    const result = select({ candidates: [good('me'), good('2')], viewerId: 'me' });

    expect(result.adopt.map((a) => a.id)).toEqual(['2']);
    expect(result.skipped).toEqual([]);
  });

  it('dedupes an account that appeared on two pages', () => {
    // The remote list can shift between requests; the same account arriving twice
    // must not become two follows.
    const result = select({ candidates: [good('1'), good('1'), good('2')] });

    expect(result.adopt.map((a) => a.id)).toEqual(['1', '2']);
  });

  it('ignores a malformed candidate rather than adopting a blank', () => {
    const result = select({ candidates: [good('1'), { id: '' } as Account] });

    expect(result.adopt.map((a) => a.id)).toEqual(['1']);
  });

  describe('the slot cap', () => {
    it('never adopts more than the remaining slots allow', () => {
      const candidates = Array.from({ length: 30 }, (_, i) => good(`a${i}`));

      const result = select({ candidates, remainingSlots: 8 });

      expect(result.adopt).toHaveLength(8);
      expect(result.limitedBySlots).toBe(true);
    });

    it('adopts nothing when there are no slots left, and says why', () => {
      const result = select({ candidates: [good('1')], remainingSlots: 0 });

      expect(result.adopt).toEqual([]);
      expect(result.limitedBySlots).toBe(true);
    });

    it('is not "limited by slots" when the target was the binding constraint', () => {
      const result = select({ candidates: [good('1')], remainingSlots: 50 });

      expect(result.limitedBySlots).toBe(false);
    });

    it('treats a negative slot count as zero rather than inverting the cap', () => {
      const result = select({ candidates: [good('1')], remainingSlots: -3 });

      expect(result.adopt).toEqual([]);
    });
  });

  describe('paging', () => {
    it('wants another page when short of the target and the last page was full', () => {
      // The whole reason this pages: five keepers out of eighty follows.
      const result = select({
        candidates: [...Array.from({ length: 75 }, (_, i) => dormant(`d${i}`)), good('1')],
        pagesFetched: 1,
        lastPageFull: true,
      });

      expect(result.adopt).toHaveLength(1);
      expect(result.wantsAnotherPage).toBe(true);
    });

    it('stops when the last page was short, because there is no more to get', () => {
      const result = select({
        candidates: [good('1')],
        pagesFetched: 1,
        lastPageFull: false,
      });

      expect(result.wantsAnotherPage).toBe(false);
    });

    it('stops at the page ceiling however few survivors it found', () => {
      const result = select({
        candidates: Array.from({ length: 200 }, (_, i) => dormant(`d${i}`)),
        pagesFetched: CLONE_MAX_PAGES,
        lastPageFull: true,
      });

      expect(result.adopt).toEqual([]);
      expect(result.wantsAnotherPage).toBe(false);
    });

    it('stops once the target is met, even with pages left to fetch', () => {
      const result = select({
        candidates: Array.from({ length: 40 }, (_, i) => good(`a${i}`)),
        pagesFetched: 1,
        lastPageFull: true,
      });

      expect(result.wantsAnotherPage).toBe(false);
    });

    it('does not keep paging for slots that do not exist', () => {
      // Short of the *target* but not of the cap: another page would be wasted.
      const result = select({
        candidates: [good('1'), good('2')],
        remainingSlots: 2,
        pagesFetched: 1,
        lastPageFull: true,
      });

      expect(result.adopt).toHaveLength(2);
      expect(result.wantsAnotherPage).toBe(false);
    });
  });
});

describe('describeSelection', () => {
  it('states the count and what was filtered, before anything happens', () => {
    const selection = select({ candidates: [good('1'), good('2'), dormant('3')] });

    const text = describeSelection(selection, '@alice');

    expect(text).toContain('Follow 2 accounts @alice follows');
    expect(text).toContain('1 skipped as dormant or too quiet');
  });

  it('mentions accounts already followed', () => {
    const selection = select({
      candidates: [good('1'), good('2')],
      isFollowing: (account) => account.id === '2',
    });

    expect(describeSelection(selection, '@alice')).toContain('1 already followed');
  });

  it('singularises one adoption', () => {
    const selection = select({ candidates: [good('1')] });

    expect(describeSelection(selection, '@alice')).toBe('Follow 1 account @alice follows?');
  });

  it('explains an empty result caused by filtering, not by an empty list', () => {
    const selection = select({ candidates: [dormant('1'), dormant('2')] });

    expect(describeSelection(selection, '@alice')).toContain('look active enough');
  });

  it('explains an empty result caused by already following everyone', () => {
    const selection = select({ candidates: [good('1')], isFollowing: () => true });

    expect(describeSelection(selection, '@alice')).toContain('already follow everyone');
  });

  it('explains an empty result caused by having no slots', () => {
    const selection = select({ candidates: [good('1')], remainingSlots: 0 });

    expect(describeSelection(selection, '@alice')).toContain('no follow slots left');
  });
});

describe('homeServerFor', () => {
  it('prefers the canonical profile URL, which is where the full list lives', () => {
    // The whole point: reading a relay gives you only what the relay federated.
    expect(
      homeServerFor(good('1', { url: 'https://kolectiva.social/@admin' }), 'https://relay.example'),
    ).toBe('https://kolectiva.social');
  });

  it('falls back to the host in the handle when there is no URL', () => {
    expect(
      homeServerFor(
        good('1', { url: '', acct: 'admin@Kolectiva.Social' }),
        'https://relay.example',
      ),
    ).toBe('https://kolectiva.social');
  });

  it('falls back to the server we already read through for a local account', () => {
    // A bare acct means the account is local to whoever answered.
    expect(homeServerFor(good('1', { url: '', acct: 'admin' }), 'https://relay.example')).toBe(
      'https://relay.example',
    );
  });

  it('survives a malformed URL rather than throwing mid-clone', () => {
    expect(
      homeServerFor(
        good('1', { url: 'not a url', acct: 'admin@home.example' }),
        'https://relay.example',
      ),
    ).toBe('https://home.example');
  });
});

describe('followsAreHidden', () => {
  it('detects hide_collections: the profile claims follows, the API returns none', () => {
    // Reported as "no one new to follow", which was false — the list is private.
    expect(followsAreHidden(good('1', { following_count: 800 }), 0, 1)).toBe(true);
  });

  it('is not hidden when the account genuinely follows nobody', () => {
    expect(followsAreHidden(good('1', { following_count: 0 }), 0, 1)).toBe(false);
  });

  it('is not hidden when candidates came back and were merely filtered', () => {
    expect(followsAreHidden(good('1', { following_count: 800 }), 40, 1)).toBe(false);
  });

  it('claims nothing before a page has actually been fetched', () => {
    expect(followsAreHidden(good('1', { following_count: 800 }), 0, 0)).toBe(false);
  });
});

describe('tunable quality gate', () => {
  const base = {
    pagesFetched: 1,
    lastPageFull: false,
    isFollowing: () => false,
    remainingSlots: 50,
  };

  it('adopts everyone when both thresholds are off', () => {
    // The complaint: "it skips over low value accounts" with no way to say no.
    const candidates = [good('1'), dormant('2'), good('3')];
    const gated = selectCloneCandidates({ ...base, candidates, now: NOW });
    const open = selectCloneCandidates({
      ...base,
      candidates,
      now: NOW,
      signals: thresholdSignals({ dormantAfterDays: 0, minPosts: 0 }),
    });

    expect(gated.adopt).toHaveLength(2);
    expect(gated.skipped).toHaveLength(1);
    expect(open.adopt).toHaveLength(3);
    expect(open.skipped).toEqual([]);
  });

  it('honours a stricter dormancy threshold', () => {
    // Posted 60 days ago: fine by default (120), skipped at 30.
    const recent = good('1', { last_status_at: new Date(NOW - 60 * DAY).toISOString() });
    const strict = selectCloneCandidates({
      ...base,
      candidates: [recent],
      now: NOW,
      signals: thresholdSignals({ dormantAfterDays: 30, minPosts: 0 }),
    });
    expect(strict.adopt).toEqual([]);
    expect(strict.skipped[0].reason).toContain("hasn't posted");
  });

  it('honours a looser post-count threshold', () => {
    const sparse = good('1', { statuses_count: 5 });
    const strict = selectCloneCandidates({ ...base, candidates: [sparse], now: NOW });
    const loose = selectCloneCandidates({
      ...base,
      candidates: [sparse],
      now: NOW,
      signals: thresholdSignals({ dormantAfterDays: 120, minPosts: 3 }),
    });
    expect(strict.adopt).toEqual([]);
    expect(loose.adopt).toHaveLength(1);
  });

  it('respects a raised adopt target', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => good(String(i)));
    expect(selectCloneCandidates({ ...base, candidates, now: NOW }).adopt).toHaveLength(20);
    expect(selectCloneCandidates({ ...base, candidates, now: NOW, target: 30 }).adopt).toHaveLength(
      30,
    );
  });

  it('respects a raised page budget when deciding to keep reading', () => {
    const candidates = [good('1')];
    const atCeiling = selectCloneCandidates({
      ...base,
      candidates,
      pagesFetched: 3,
      lastPageFull: true,
      now: NOW,
    });
    const raised = selectCloneCandidates({
      ...base,
      candidates,
      pagesFetched: 3,
      lastPageFull: true,
      now: NOW,
      maxPages: 6,
    });
    expect(atCeiling.wantsAnotherPage).toBe(false);
    expect(raised.wantsAnotherPage).toBe(true);
  });
});
