import { describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import {
  CATCH_UP_HISTORY,
  FIRST_SESSION_HOURS,
  MAX_SESSION_HOURS,
  groupByAuthor,
  matchesKind,
  normalizeHistory,
  overlapping,
  rangeStart,
  recordSession,
} from './catch-up-model';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-20T12:00:00Z');

function post(id: string, author: string, at: string, extra: Partial<Status> = {}): Status {
  return {
    id,
    created_at: at,
    content: '<p>hi</p>',
    account: { id: author, username: author, acct: author, display_name: author },
    reblog: null,
    in_reply_to_id: null,
    media_attachments: [],
    ...extra,
  } as unknown as Status;
}

describe('catch-up model', () => {
  it('the first "since last time" covers 12 hours', () => {
    expect(rangeStart('last', NOW, null)).toBe(NOW - FIRST_SESSION_HOURS * HOUR);
  });

  it('"since last time" starts where the last session ended, but never past 72 hours', () => {
    const recent = { from: 0, to: NOW - 2 * HOUR, posts: 1, people: 1 };
    expect(rangeStart('last', NOW, recent)).toBe(NOW - 2 * HOUR);
    const ancient = { from: 0, to: NOW - 500 * HOUR, posts: 1, people: 1 };
    expect(rangeStart('last', NOW, ancient)).toBe(NOW - MAX_SESSION_HOURS * HOUR);
  });

  it('an explicit range is hours before now, and reports overlap with the last session', () => {
    const start = rangeStart(6, NOW, null);
    expect(start).toBe(NOW - 6 * HOUR);
    const last = { from: NOW - 10 * HOUR, to: NOW - 2 * HOUR, posts: 3, people: 2 };
    expect(overlapping(start, [last])).toBe(last);
    expect(overlapping(NOW - HOUR, [last])).toBeNull();
  });

  it('groups by who put the post in your feed, oldest first, busiest person first', () => {
    const groups = groupByAuthor(
      [
        post('3', 'ann', '2026-11-20T11:00:00Z'),
        post('2', 'bob', '2026-11-20T11:30:00Z'),
        post('1', 'ann', '2026-11-20T10:00:00Z'),
        post('1', 'ann', '2026-11-20T10:00:00Z'),
      ],
      'people',
    );
    expect(groups.map((g) => g.account.id)).toEqual(['ann', 'bob']);
    expect(groups[0].posts.map((p) => p.id)).toEqual(['1', '3']);
  });

  it('recent order puts the latest poster first', () => {
    const groups = groupByAuthor(
      [
        post('1', 'ann', '2026-11-20T10:00:00Z'),
        post('2', 'ann', '2026-11-20T10:05:00Z'),
        post('3', 'bob', '2026-11-20T11:30:00Z'),
      ],
      'recent',
    );
    expect(groups.map((g) => g.account.id)).toEqual(['bob', 'ann']);
  });

  it('classifies kinds', () => {
    const original = post('1', 'a', '2026-11-20T10:00:00Z');
    const reply = post('2', 'a', '2026-11-20T10:00:00Z', { in_reply_to_id: 'x' });
    const boost = post('3', 'a', '2026-11-20T10:00:00Z', { reblog: original });
    const linked = post('4', 'a', '2026-11-20T10:00:00Z', {
      content: '<p><a href="https://example.com/story">story</a></p>',
    });
    const tagOnly = post('5', 'a', '2026-11-20T10:00:00Z', {
      content: '<p><a href="https://m.example/tags/cats">#cats</a></p>',
    });
    expect(matchesKind(original, 'originals')).toBe(true);
    expect(matchesKind(reply, 'replies')).toBe(true);
    expect(matchesKind(reply, 'originals')).toBe(false);
    expect(matchesKind(boost, 'boosts')).toBe(true);
    expect(matchesKind(linked, 'links')).toBe(true);
    expect(matchesKind(tagOnly, 'links')).toBe(false);
  });

  it('keeps a bounded, newest-first history and drops junk', () => {
    let history = normalizeHistory('nope');
    for (let i = 0; i < CATCH_UP_HISTORY + 3; i++) {
      history = recordSession(history, { from: i, to: i + 1, posts: i, people: 1 });
    }
    expect(history).toHaveLength(CATCH_UP_HISTORY);
    expect(history[0].posts).toBe(CATCH_UP_HISTORY + 2);
    expect(normalizeHistory([{ from: 1 }, { from: 1, to: 2, posts: 3, people: 4 }])).toEqual([
      { from: 1, to: 2, posts: 3, people: 4 },
    ]);
  });
});
