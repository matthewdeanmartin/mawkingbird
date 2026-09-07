import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlusSession } from '../account/plus-session';
import { PLUS_BENEFITS } from '../../plus-benefits';
import { PageDiagnostics } from '../../page-diagnostics';
import { ARTICLE_QUOTA_KEY, ArticleQuota, FREE_DAILY_ARTICLES } from './article-quota';

/** Enough of PlusSession to answer the one question the quota asks. */
class FakePlusSession {
  tier = signal<'free' | 'plus'>('free');
  isSupporter = () => this.tier() === 'plus';
  token = vi.fn().mockResolvedValue(null);
  refresh = vi.fn(async () => {
    await this.token();
  });
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

function build(plus = new FakePlusSession()) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ArticleQuota,
      { provide: PlusSession, useValue: plus },
      { provide: PageDiagnostics, useValue: log },
    ],
  });
  return { quota: TestBed.inject(ArticleQuota), plus, log };
}

describe('ArticleQuota', () => {
  beforeEach(() => {
    localStorage.removeItem(ARTICLE_QUOTA_KEY);
    TestBed.resetTestingModule();
  });

  it('starts with the full free allowance', () => {
    const { quota } = build();
    expect(quota.remaining()).toBe(FREE_DAILY_ARTICLES);
    expect(quota.allowed()).toBe(true);
  });

  // The pitch used to quote FREE_DAILY_ARTICLES directly and this test held the
  // two together. It no longer does: "a couple of full articles a day" is
  // deliberately soft, because the number told a reader nothing about whether
  // it was enough for them. The exact figure moved to the /plans page, which
  // imports the constant rather than typing it — so drift is now prevented by
  // construction there instead of by assertion here.
  //
  // What still needs guarding is the claim, not the digit: the row must not
  // promise a free tier the quota does not grant, or an unlimited paid tier the
  // quota does not honour.
  it('keeps the subscription pitch aligned with the enforced article benefit', () => {
    const benefit = PLUS_BENEFITS.find((row) => row.id === 'read-here');

    expect(benefit).toBeDefined();
    // A free allowance is advertised, so there must be one.
    expect(FREE_DAILY_ARTICLES).toBeGreaterThan(0);

    const { quota, plus } = build();
    plus.tier.set('plus');
    expect(quota.unlimited()).toBe(true);
    expect(benefit?.plus.toLowerCase()).toContain('as many as you like');
  });

  it('counts down and then refuses', () => {
    const { quota } = build();
    for (let i = 0; i < FREE_DAILY_ARTICLES; i += 1) {
      expect(quota.allowed()).toBe(true);
      quota.consume();
    }
    expect(quota.remaining()).toBe(0);
    expect(quota.allowed()).toBe(false);
  });

  it('resets when the stored day is not today', () => {
    localStorage.setItem(ARTICLE_QUOTA_KEY, JSON.stringify({ day: '2000-01-01', count: 99 }));
    const { quota } = build();
    expect(quota.remaining()).toBe(FREE_DAILY_ARTICLES);
  });

  it('persists the count under today’s date', () => {
    const { quota } = build();
    quota.consume();
    const stored = JSON.parse(localStorage.getItem(ARTICLE_QUOTA_KEY) ?? '{}');
    expect(stored).toEqual({
      day: today(),
      count: 1,
      freeFetches: 0,
      plusFetches: 0,
      lifetime: 1,
    });
  });

  it('records free and Plus fetch actions separately without spending quota', () => {
    const { quota, plus } = build();

    quota.recordFetch();
    quota.recordFetch();
    plus.tier.set('plus');
    quota.recordFetch();

    expect(quota.freeFetches()).toBe(2);
    expect(quota.plusFetches()).toBe(1);
    expect(quota.freeRemaining()).toBe(FREE_DAILY_ARTICLES);
    expect(quota.remaining()).toBe(Infinity);
  });

  it('never limits a supporter, but does still count their reading', () => {
    const { quota, plus } = build();
    plus.tier.set('plus');
    expect(quota.unlimited()).toBe(true);
    expect(quota.remaining()).toBe(Infinity);
    quota.consume();

    // Charged nothing against the free allowance...
    const stored = JSON.parse(localStorage.getItem(ARTICLE_QUOTA_KEY) ?? '{}');
    expect(stored.count).toBe(0);
    expect(quota.allowed()).toBe(true);

    // ...but counted. This used to write nothing at all, which meant the only
    // reader whose total the Plus page wants to show was the one reader never
    // counted — their "what you are getting" panel sat at zero forever.
    expect(stored.lifetime).toBe(1);
    expect(quota.lifetime()).toBe(1);
  });

  it('carries the lifetime total across the day rollover', () => {
    // Every other counter here is a quota number and resets. This one is the
    // answer to "was my subscription worth it", and resetting it nightly would
    // make it useless for that.
    localStorage.setItem(
      ARTICLE_QUOTA_KEY,
      JSON.stringify({ day: '2020-01-01', count: 2, freeFetches: 2, plusFetches: 0, lifetime: 91 }),
    );
    const { quota } = build();

    expect(quota.lifetime()).toBe(91);
    expect(quota.remaining()).toBe(FREE_DAILY_ARTICLES);
  });

  it('unlocks an exhausted subscriber without making them visit Settings', async () => {
    localStorage.setItem(
      ARTICLE_QUOTA_KEY,
      JSON.stringify({ day: today(), count: FREE_DAILY_ARTICLES }),
    );
    const plus = new FakePlusSession();
    let answerEntitlement!: () => void;
    plus.token.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          answerEntitlement = () => {
            plus.tier.set('plus');
            resolve(null);
          };
        }),
    );

    const { quota } = build(plus);

    // The stale local counter must not disable the only control that can cause
    // the account lookup. This was the production deadlock.
    expect(plus.refresh).toHaveBeenCalledOnce();
    expect(plus.token).toHaveBeenCalledOnce();
    expect(quota.checkingEntitlement()).toBe(true);
    expect(quota.allowed()).toBe(true);

    answerEntitlement();
    await expect(quota.authorize()).resolves.toBe(true);

    expect(quota.checkingEntitlement()).toBe(false);
    expect(quota.unlimited()).toBe(true);
    expect(quota.remaining()).toBe(Infinity);
    expect(quota.allowed()).toBe(true);
    expect(plus.refresh).toHaveBeenCalledOnce();
    expect(plus.token).toHaveBeenCalledOnce();
  });

  it('still enforces an exhausted counter after a free entitlement answer', async () => {
    localStorage.setItem(
      ARTICLE_QUOTA_KEY,
      JSON.stringify({ day: today(), count: FREE_DAILY_ARTICLES }),
    );
    const { quota, plus, log } = build();

    await expect(quota.authorize()).resolves.toBe(false);

    expect(plus.refresh).toHaveBeenCalledOnce();
    expect(plus.token).toHaveBeenCalledOnce();
    expect(quota.checkingEntitlement()).toBe(false);
    expect(quota.allowed()).toBe(false);
    expect(log.info).toHaveBeenCalledWith(
      'ArticleEntitlement',
      'check:complete',
      expect.objectContaining({ tier: 'free', failed: false, remaining: 0 }),
    );
    expect(log.info).toHaveBeenCalledWith(
      'ArticleEntitlement',
      'decision',
      expect.objectContaining({ tier: 'free', allowed: false, remaining: 0 }),
    );
  });

  it('treats corrupt stored data as a fresh day', () => {
    localStorage.setItem(ARTICLE_QUOTA_KEY, 'not json');
    const { quota } = build();
    expect(quota.remaining()).toBe(FREE_DAILY_ARTICLES);
  });

  it('re-reads storage on refresh', () => {
    const { quota } = build();
    localStorage.setItem(ARTICLE_QUOTA_KEY, JSON.stringify({ day: today(), count: 2 }));
    quota.refresh();
    expect(quota.remaining()).toBe(0);
  });
});
