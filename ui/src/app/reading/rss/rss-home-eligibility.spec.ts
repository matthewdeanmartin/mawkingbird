import { describe, expect, it } from 'vitest';
import { ParsedFeed, ParsedItem } from './rss-parser';
import { qualifiesForHome } from './rss-home-eligibility';

function item(publishedAt: string | null, html: string): ParsedItem {
  return {
    guid: publishedAt ?? Math.random().toString(),
    title: 't',
    link: null,
    publishedAt,
    html,
    isFullContent: true,
    enclosures: [],
    categories: [],
    author: null,
    commentsFeedUrl: null,
    commentCount: null,
  };
}

function feedOf(items: ParsedItem[]): ParsedFeed {
  return { title: 'f', link: null, items };
}

/** N short items spaced `hoursApart` hours back from `latest`, newest first. */
function chatty(latest: string, count: number, hoursApart: number): ParsedItem[] {
  const start = Date.parse(latest);
  return Array.from({ length: count }, (_, i) =>
    item(new Date(start - i * hoursApart * 60 * 60 * 1000).toISOString(), '<p>short post</p>'),
  );
}

describe('qualifiesForHome', () => {
  it('qualifies a feed posting several short items a day', () => {
    // 10 items, 2 hours apart = 12/day.
    expect(qualifiesForHome(feedOf(chatty('2026-07-14T00:00:00.000Z', 10, 2)))).toBe(true);
  });

  it('excludes a feed that posts daily or slower, however short', () => {
    // 5 items, 24 hours apart = 1/day.
    expect(qualifiesForHome(feedOf(chatty('2026-07-14T00:00:00.000Z', 5, 24)))).toBe(false);
  });

  it('excludes a frequent feed whose items are long — a busy blog, not a timeline', () => {
    const longBody = '<p>' + 'word '.repeat(200) + '</p>'; // ~1000 plain-text chars
    const items = Array.from({ length: 6 }, (_, i) =>
      item(
        new Date(Date.parse('2026-07-14T00:00:00.000Z') - i * 2 * 60 * 60 * 1000).toISOString(),
        longBody,
      ),
    );
    expect(qualifiesForHome(feedOf(items))).toBe(false);
  });

  it('excludes a feed with fewer than two dated items — nothing to estimate a cadence from', () => {
    expect(qualifiesForHome(feedOf([item('2026-07-14T00:00:00.000Z', '<p>x</p>')]))).toBe(false);
    expect(qualifiesForHome(feedOf([]))).toBe(false);
  });

  it('ignores items with no parseable date when estimating', () => {
    const items = [...chatty('2026-07-14T00:00:00.000Z', 10, 2), item(null, '<p>undated</p>')];
    expect(qualifiesForHome(feedOf(items))).toBe(true);
  });

  it('only looks at the newest sample, not an entire archive', () => {
    // 10 recent hourly items (qualifies) plus a long tail of ancient, sparse ones.
    const recent = chatty('2026-07-14T00:00:00.000Z', 10, 1);
    const ancientSparse = Array.from({ length: 50 }, (_, i) =>
      item(
        new Date(
          Date.parse('2020-01-01T00:00:00.000Z') - i * 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        '<p>x</p>',
      ),
    );
    expect(qualifiesForHome(feedOf([...recent, ...ancientSparse]))).toBe(true);
  });
});
