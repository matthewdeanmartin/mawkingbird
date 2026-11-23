import { describe, expect, it } from 'vitest';
import { MastodonNotification, Status } from '../platform/api/models';
import {
  DECAY_CHECKPOINTS_MIN,
  DecayEvent,
  DecayPost,
  MIN_POST_AGE_MS,
  classifyNotification,
  computeDecay,
  decayTargets,
  durationParts,
  median,
} from './interaction-decay';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-23T12:00:00Z');

function status(id: string, ageMs: number, extra: Partial<Status> = {}): Status {
  return {
    id,
    created_at: new Date(NOW - ageMs).toISOString(),
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    favourites_count: 3,
    reblogs_count: 2,
    replies_count: 1,
    ...extra,
  } as Status;
}

function notification(
  type: string,
  at: number,
  statusPart: Partial<Status> & { id: string },
): MastodonNotification {
  return {
    id: `n${Math.random()}`,
    type,
    created_at: new Date(at).toISOString(),
    account: { id: 'fan' },
    status: statusPart as Status,
  } as MastodonNotification;
}

describe('decayTargets', () => {
  it('keeps own posts and own thread posts at least 7 days old, newest first', () => {
    const posts = [
      status('young', 2 * DAY),
      status('a', 8 * DAY),
      status('boost', 9 * DAY, { reblog: {} as Status }),
      status('replyOther', 10 * DAY, { in_reply_to_id: 'x', in_reply_to_account_id: 'other' }),
      status('thread', 11 * DAY, { in_reply_to_id: 'a', in_reply_to_account_id: 'me' }),
      status('b', 12 * DAY),
    ];
    const targets = decayTargets(posts, 'me', NOW);
    expect(targets.map((t) => t.id)).toEqual(['a', 'thread', 'b']);
    expect(targets[0].counters).toBe(6);
  });

  it('caps at the limit', () => {
    const posts = Array.from({ length: 50 }, (_, i) =>
      status(String(i), MIN_POST_AGE_MS + i * DAY),
    );
    expect(decayTargets(posts, 'me', NOW, 40)).toHaveLength(40);
  });
});

describe('classifyNotification', () => {
  const ids = new Set(['p1']);
  const at = NOW;

  it('maps favourite, reblog and replying mentions on target posts', () => {
    expect(classifyNotification(notification('favourite', at, { id: 'p1' }), ids)?.kind).toBe(
      'likes',
    );
    expect(classifyNotification(notification('reblog', at, { id: 'p1' }), ids)?.kind).toBe(
      'boosts',
    );
    const reply = classifyNotification(
      notification('mention', at, { id: 'r1', in_reply_to_id: 'p1' }),
      ids,
    );
    expect(reply).toEqual({ kind: 'replies', postId: 'p1', at });
  });

  it('ignores other posts, plain mentions and other types', () => {
    expect(classifyNotification(notification('favourite', at, { id: 'p2' }), ids)).toBeNull();
    expect(
      classifyNotification(notification('mention', at, { id: 'm', in_reply_to_id: null }), ids),
    ).toBeNull();
    expect(classifyNotification(notification('quote', at, { id: 'p1' }), ids)).toBeNull();
  });
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('computeDecay', () => {
  const t0 = NOW - 10 * DAY;
  const posts: DecayPost[] = [
    { id: 'p1', createdAt: t0, counters: 4 },
    { id: 'p2', createdAt: t0 - DAY, counters: 2 },
  ];
  const ev = (kind: DecayEvent['kind'], postId: string, after: number): DecayEvent => ({
    kind,
    postId,
    at: (postId === 'p1' ? t0 : t0 - DAY) + after,
  });

  it('builds a median cumulative share per checkpoint', () => {
    const events = [
      ev('likes', 'p1', 10 * MIN),
      ev('likes', 'p1', 3 * HOUR),
      ev('likes', 'p2', 20 * MIN),
      ev('likes', 'p2', 20 * MIN),
      ev('boosts', 'p1', 50 * HOUR),
    ];
    const r = computeDecay(posts, events);
    const at = (minutes: number) => DECAY_CHECKPOINTS_MIN.indexOf(minutes);
    // p1 likes: 50% by 15 min; p2 likes: 0% by 15 min → median 25%.
    expect(r.series.likes.points[at(15)]).toBe(0.25);
    // By 30 min: p1 50%, p2 100% → 75%.
    expect(r.series.likes.points[at(30)]).toBe(0.75);
    expect(r.series.likes.points[at(240)]).toBe(1);
    expect(r.series.likes.posts).toBe(2);
    // Boosts: one post only; nothing until 72 h.
    expect(r.series.boosts.points[at(2880)]).toBe(0);
    expect(r.series.boosts.points[at(4320)]).toBe(1);
    // No replies at all: every point null.
    expect(r.series.replies.points.every((p) => p === null)).toBe(true);
    expect(r.series.replies.t50).toBeNull();
    expect(r.events).toBe(5);
    expect(r.counters).toBe(6);
    expect(r.coverage).toBeCloseTo(5 / 6);
  });

  it('reports median time to half and to 90%', () => {
    const events = [
      ev('likes', 'p1', 10 * MIN),
      ev('likes', 'p1', 2 * HOUR),
      ev('likes', 'p2', 30 * MIN),
    ];
    const r = computeDecay(posts, events);
    // p1: half at 10 min, 90% at 2 h; p2: both at 30 min.
    expect(r.series.likes.t50).toBe(20 * MIN);
    expect(r.series.likes.t90).toBe(75 * MIN);
    expect(r.series.all.t50).toBe(20 * MIN);
  });

  it('treats an interaction stamped before its post as instant, and ignores strangers', () => {
    const r = computeDecay(posts, [ev('likes', 'p1', -5 * MIN), ev('likes', 'zz', MIN)]);
    expect(r.series.likes.points[0]).toBe(1);
    expect(r.events).toBe(1);
  });
});

describe('durationParts', () => {
  it('picks a readable unit', () => {
    expect(durationParts(45 * MIN)).toEqual({ value: 45, unit: 'minutes' });
    expect(durationParts(90 * MIN)).toEqual({ value: 1.5, unit: 'hours' });
    expect(durationParts(30 * HOUR)).toEqual({ value: 30, unit: 'hours' });
    expect(durationParts(7 * DAY)).toEqual({ value: 7, unit: 'days' });
  });
});
