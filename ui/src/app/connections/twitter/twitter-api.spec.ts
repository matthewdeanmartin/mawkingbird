import { describe, expect, it } from 'vitest';
import {
  CREDITS_PER_TIMELINE_PAGE,
  parseBalance,
  stripAt,
  timelinePagesRemaining,
} from './twitter-api';

describe('stripAt', () => {
  it('accepts a handle however it was typed', () => {
    expect(stripAt('@NASA')).toBe('NASA');
    expect(stripAt('  NASA ')).toBe('NASA');
    expect(stripAt('@@NASA')).toBe('NASA');
  });
});

describe('parseBalance', () => {
  it('reads the measured live shape', () => {
    // Captured 2026-08-01 from /oapi/my/info — a *fifth* envelope from this
    // API, with no `status` wrapper and no `data`.
    expect(parseBalance({ recharge_credits: 0, total_bonus_credits: 4680 })).toEqual({
      recharge: 0,
      bonus: 4680,
      total: 4680,
    });
  });

  it('adds paid and bonus credits, since either one buys requests', () => {
    expect(parseBalance({ recharge_credits: 1000, total_bonus_credits: 250 })?.total).toBe(1250);
  });

  it('tolerates either field being absent', () => {
    // A plan change could plausibly drop one. Half a balance still beats none.
    expect(parseBalance({ total_bonus_credits: 40 })?.total).toBe(40);
    expect(parseBalance({ recharge_credits: 40 })?.total).toBe(40);
  });

  it('returns null rather than inventing a zero balance', () => {
    // Zero is a meaningful number here — it means "you cannot read anything".
    // Reporting it because a response was unrecognisable would be a lie that
    // sends someone to top up an account that is fine.
    expect(parseBalance({})).toBeNull();
    expect(parseBalance(null)).toBeNull();
    expect(parseBalance('<html>maintenance</html>')).toBeNull();
    expect(parseBalance({ credits: 'lots' })).toBeNull();
  });
});

describe('timelinePagesRemaining', () => {
  it('converts credits into the unit a reader can act on', () => {
    // "4,680 credits" means nothing; "780 refreshes" is a decision.
    expect(timelinePagesRemaining(4680)).toBe(780);
    expect(CREDITS_PER_TIMELINE_PAGE).toBe(6);
  });

  it('rounds down, so it never promises a refresh that cannot be afforded', () => {
    expect(timelinePagesRemaining(11)).toBe(1);
    expect(timelinePagesRemaining(5)).toBe(0);
    expect(timelinePagesRemaining(0)).toBe(0);
  });
});
