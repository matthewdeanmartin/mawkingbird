import { describe, expect, it } from 'vitest';
import { Account } from './models';
import {
  DORMANT_AFTER_DAYS,
  isWorthFollowing,
  MIN_POSTS,
  QUALITY_SIGNALS,
  rejectionReason,
} from './follow-quality';

const NOW = Date.parse('2026-07-29T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** An account that passes every signal, so each test can break exactly one thing. */
function healthy(over: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice@example.social',
    display_name: 'Alice',
    note: '',
    url: 'https://example.social/@alice',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 300,
    following_count: 200,
    statuses_count: 1_200,
    last_status_at: new Date(NOW - 2 * DAY).toISOString(),
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

describe('rejectionReason', () => {
  it('accepts a normal, active account', () => {
    expect(rejectionReason(healthy(), NOW)).toBeNull();
    expect(isWorthFollowing(healthy(), NOW)).toBe(true);
  });

  describe('dormancy', () => {
    it('rejects an account that went quiet a year ago, however much it once posted', () => {
      // The case that looks like it should pass: 40k posts is a rich history and
      // an empty feed. Volume does not cure dormancy.
      const reason = rejectionReason(
        healthy({
          statuses_count: 40_000,
          last_status_at: new Date(NOW - 400 * DAY).toISOString(),
        }),
        NOW,
      );

      expect(reason).toContain("hasn't posted");
      expect(reason).toContain('over a year');
    });

    it('rejects an account with no last-post date at all', () => {
      expect(rejectionReason(healthy({ last_status_at: null }), NOW)).toBe('has never posted');
      expect(rejectionReason(healthy({ last_status_at: undefined }), NOW)).toBe('has never posted');
    });

    it('rejects an unparseable last-post date rather than treating it as recent', () => {
      expect(rejectionReason(healthy({ last_status_at: 'last Tuesday' }), NOW)).toContain(
        'no readable last-post date',
      );
    });

    it('is lenient right up to the threshold and strict just past it', () => {
      const at = new Date(NOW - DORMANT_AFTER_DAYS * DAY).toISOString();
      const past = new Date(NOW - (DORMANT_AFTER_DAYS + 2) * DAY).toISOString();

      expect(rejectionReason(healthy({ last_status_at: at }), NOW)).toBeNull();
      expect(rejectionReason(healthy({ last_status_at: past }), NOW)).toContain("hasn't posted");
    });

    it('describes the gap in units a human reads', () => {
      const gap = (days: number) =>
        rejectionReason(healthy({ last_status_at: new Date(NOW - days * DAY).toISOString() }), NOW);

      expect(gap(240)).toContain('8 months');
      expect(gap(400)).toContain('over a year');
      expect(gap(900)).toContain('over 2 years');
    });
  });

  describe('volume', () => {
    it('rejects an account that posted today but has almost no history', () => {
      // Active, and still not worth a slot — the two signals are independent.
      expect(rejectionReason(healthy({ statuses_count: 3 }), NOW)).toBe('has only 3 posts');
    });

    it('singularises one post', () => {
      expect(rejectionReason(healthy({ statuses_count: 1 }), NOW)).toBe('has only 1 post');
    });

    it('is strict just below the threshold and lenient at it', () => {
      expect(rejectionReason(healthy({ statuses_count: MIN_POSTS - 1 }), NOW)).toContain('only');
      expect(rejectionReason(healthy({ statuses_count: MIN_POSTS }), NOW)).toBeNull();
    });

    it('treats a missing post count as no evidence rather than as zero', () => {
      const account = healthy();
      delete (account as Partial<Account>).statuses_count;

      expect(rejectionReason(account, NOW)).toBeNull();
    });
  });

  describe('what is deliberately not a signal', () => {
    it('does not reject on follower count — popularity is not quality', () => {
      expect(rejectionReason(healthy({ followers_count: 0 }), NOW)).toBeNull();
    });

    it('does not reject bots, which can be good follows', () => {
      expect(rejectionReason(healthy({ bot: true }), NOW)).toBeNull();
    });

    it('does not reject locked accounts — an anonymous follow sends no request', () => {
      expect(rejectionReason(healthy({ locked: true }), NOW)).toBeNull();
    });
  });

  it('reports the first failing signal, in declared order', () => {
    // Dormant *and* quiet: dormancy is declared first, so that is what is said.
    const reason = rejectionReason(
      healthy({ statuses_count: 2, last_status_at: new Date(NOW - 400 * DAY).toISOString() }),
      NOW,
    );

    expect(reason).toContain("hasn't posted");
  });

  it('takes a custom signal list, so new signals are one entry', () => {
    const noBots = [{ id: 'no-bots', reject: (a: Account) => (a.bot ? 'is a bot' : null) }];

    expect(rejectionReason(healthy({ bot: true }), NOW, noBots)).toBe('is a bot');
    expect(rejectionReason(healthy({ bot: false }), NOW, noBots)).toBeNull();
  });

  it('ships the post-frequency signals, primary first', () => {
    expect(QUALITY_SIGNALS.map((signal) => signal.id)).toEqual(['dormant', 'too-quiet']);
  });
});
