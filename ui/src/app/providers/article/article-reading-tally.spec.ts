import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlusSession } from '../account/plus-session';
import { ProfileClient } from '../account/profile-client';
import { PageDiagnostics } from '../../page-diagnostics';
import { ARTICLE_QUOTA_KEY } from './article-quota';
import { ArticleReadingTally, READING_TALLY_KEY } from './article-reading-tally';

/**
 * The number that answers "is my subscription worth it".
 *
 * The cases worth pinning are the ones that made the old panel insulting: a
 * supporter must be counted at all, and an unreachable account must fall back to
 * this browser's total rather than showing a zero.
 */

class FakePlusSession {
  tier = signal<'free' | 'plus'>('free');
  isSupporter = () => this.tier() === 'plus';
  token = vi.fn().mockResolvedValue(null);
  refresh = vi.fn().mockResolvedValue(undefined);
}

function build(articles = 0, since = '') {
  const plus = new FakePlusSession();
  const client = {
    readingStats: vi.fn().mockResolvedValue({ kind: 'ok', value: { articles, since } }),
    recordArticlesRead: vi.fn(),
  };
  // Each POST answers with the running total the fake server would now hold.
  let remote = articles;
  client.recordArticlesRead.mockImplementation((n: number) => {
    remote += n;
    return Promise.resolve({ kind: 'ok', value: { articles: remote, since: since || 'now' } });
  });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ArticleReadingTally,
      { provide: PlusSession, useValue: plus },
      { provide: ProfileClient, useValue: client },
      { provide: PageDiagnostics, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
    ],
  });
  return { tally: TestBed.inject(ArticleReadingTally), plus, client };
}

describe('ArticleReadingTally', () => {
  beforeEach(() => {
    localStorage.removeItem(READING_TALLY_KEY);
    localStorage.removeItem(ARTICLE_QUOTA_KEY);
  });

  it('counts a free reader locally and asks the account for nothing', () => {
    const { tally, client } = build();

    tally.recordOne();
    tally.recordOne();

    expect(tally.total()).toBe(2);
    expect(tally.localOnly()).toBe(true);
    expect(client.recordArticlesRead).not.toHaveBeenCalled();
  });

  it("shows the account's total for a supporter, not this browser's", async () => {
    // The whole point: a subscriber on a new laptop has read 340 articles, and
    // being told "0" is the insult this feature exists to remove.
    const { tally, plus } = build(340, '2026-02-01T00:00:00.000Z');
    plus.tier.set('plus');

    await tally.load();

    expect(tally.total()).toBe(340);
    expect(tally.localOnly()).toBe(false);
    expect(tally.since()).toBe('2026-02-01T00:00:00.000Z');
  });

  it("adds a supporter's reads to the account exactly once", async () => {
    const { tally, plus, client } = build(10);
    plus.tier.set('plus');
    await tally.load();

    // `recordOne` already starts a flush. A second caller arriving while that
    // one is in flight — which is what happens when the Plus page opens just
    // after an article was read — must join it rather than send the same read
    // again. This double-counted before the in-flight guard.
    tally.recordOne();
    await tally.flush();

    expect(client.recordArticlesRead).toHaveBeenCalledTimes(1);
    expect(tally.total()).toBe(11);
  });

  it('keeps counting when the account cannot be reached', async () => {
    // A network failure must not make the panel report zero. Falling back to
    // this browser's own total is a slightly low number; a zero is a lie that
    // reads as "your subscription did nothing".
    const { tally, plus, client } = build();
    plus.tier.set('plus');
    client.readingStats.mockResolvedValue({ kind: 'failed', message: 'offline' });
    client.recordArticlesRead.mockResolvedValue({ kind: 'failed', message: 'offline' });

    await tally.load();
    tally.recordOne();
    await tally.flush();

    expect(tally.localOnly()).toBe(true);
    expect(tally.total()).toBe(1);
  });

  it('holds unsent reads across a reload and sends them later', async () => {
    const first = build(5);
    first.plus.tier.set('plus');
    first.client.recordArticlesRead.mockResolvedValue({ kind: 'failed', message: 'offline' });
    await first.tally.load();
    first.tally.recordOne();
    await first.tally.flush();

    // A read that never reached the account is remembered, not dropped.
    expect(localStorage.getItem(READING_TALLY_KEY)).toBe('1');

    const next = build(5);
    next.plus.tier.set('plus');
    await next.tally.load();

    expect(next.client.recordArticlesRead).toHaveBeenCalledWith(1);
    expect(next.tally.total()).toBe(6);
  });

  it('never rejects, even when the client throws outright', async () => {
    // Both are called fire-and-forget — `void tally.load()` from the Plus page's
    // ngOnInit, and `void this.flush()` from recordOne — so a rejection escaping
    // either is an *unhandled* one with nowhere downstream to catch it. That
    // failed the whole suite with 10 unhandled errors while every test passed.
    const { tally, plus, client } = build();
    plus.tier.set('plus');
    client.readingStats.mockRejectedValue(new TypeError('session.token is not a function'));
    client.recordArticlesRead.mockRejectedValue(new TypeError('nope'));

    await expect(tally.load()).resolves.toBeUndefined();
    tally.recordOne();
    await expect(tally.flush()).resolves.toBeUndefined();

    // And the figure still falls back to this browser's own count.
    expect(tally.localOnly()).toBe(true);
    expect(tally.total()).toBe(1);
  });

  it('never shows a total that dips while a read is pending', async () => {
    // The displayed figure is the account's total plus anything unsent, so
    // reading an article always makes the number go up immediately even though
    // the request has not landed yet.
    const { tally, plus, client } = build(7);
    plus.tier.set('plus');
    await tally.load();
    // Never resolves: the request is still in flight when we read the total.
    client.recordArticlesRead.mockReturnValue(
      new Promise(() => {
        // Intentionally left pending.
      }),
    );

    tally.recordOne();

    expect(tally.total()).toBe(8);
  });
});
