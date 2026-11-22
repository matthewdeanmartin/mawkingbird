import { describe, expect, it } from 'vitest';
import { Account, MastodonNotification, Status } from '../../platform/api/models';
import { digestNotifications, EngagementDigest, FollowDigest } from './notification-digest';

const person = (id: string) => ({ id, acct: id, username: id, display_name: id }) as Account;
const post = (id: string) => ({ id, content: `<p>${id}</p>` }) as Status;

let n = 0;
function notif(
  type: string,
  who: string,
  on?: string,
  at = `2026-11-22T10:${String(59 - n).padStart(2, '0')}:00Z`,
): MastodonNotification {
  n += 1;
  return {
    id: `n${n}`,
    type,
    created_at: at,
    account: person(who),
    ...(on ? { status: post(on) } : {}),
  };
}

describe('digestNotifications', () => {
  it('turns like A, boost B, like A into one row with a line per post', () => {
    const rows = digestNotifications([
      notif('favourite', 'ana', 'A'),
      notif('reblog', 'budi', 'B'),
      notif('favourite', 'citra', 'A'),
    ]);
    expect(rows).toHaveLength(1);
    const digest = rows[0] as EngagementDigest;
    expect(digest.kind).toBe('engagement');
    expect(digest.likes).toBe(2);
    expect(digest.boosts).toBe(1);
    expect(digest.posts.map((p) => [p.status.id, p.likes, p.boosts])).toEqual([
      ['A', 2, 0],
      ['B', 0, 1],
    ]);
    expect(digest.people.map((a) => a.id)).toEqual(['ana', 'budi', 'citra']);
  });

  it('pools every network’s likes and boosts, and counts one person once per post', () => {
    const rows = digestNotifications([
      notif('like', 'ana', 'A'),
      notif('reaction', 'ana', 'A'),
      notif('repost-via-repost', 'budi', 'A'),
      notif('renote', 'citra', 'B'),
      notif('like-via-repost', 'dewi', 'B'),
    ]);
    const digest = rows[0] as EngagementDigest;
    expect(rows).toHaveLength(1);
    expect(digest.posts.map((p) => [p.status.id, p.likes, p.boosts])).toEqual([
      ['A', 1, 1],
      ['B', 1, 1],
    ]);
  });

  it('counts what arrived since the inbox was last read', () => {
    const since = Date.parse('2026-11-22T10:30:00Z');
    const rows = digestNotifications(
      [
        notif('favourite', 'ana', 'A', '2026-11-22T10:50:00Z'),
        notif('reblog', 'budi', 'A', '2026-11-22T10:40:00Z'),
        notif('favourite', 'citra', 'A', '2026-11-22T10:00:00Z'),
        notif('follow', 'dewi', undefined, '2026-11-22T10:45:00Z'),
        notif('follow', 'eko', undefined, '2026-11-22T09:00:00Z'),
      ],
      (x) => Date.parse(x.created_at) > since,
    );
    const digest = rows.find((r) => r.kind === 'engagement') as EngagementDigest;
    expect(digest.newLikes).toBe(1);
    expect(digest.newBoosts).toBe(1);
    expect(digest.posts[0].newLikes + digest.posts[0].newBoosts).toBe(2);
    const follows = rows.find((r) => r.kind === 'follows') as FollowDigest;
    expect(follows.accounts.map((a) => a.id)).toEqual(['dewi', 'eko']);
    expect(follows.newCount).toBe(1);
  });

  it('keeps replies, quotes, polls and follow requests as their own rows, in order', () => {
    const rows = digestNotifications([
      notif('mention', 'ana', 'R'),
      notif('favourite', 'budi', 'A'),
      notif('quote', 'citra', 'Q'),
      notif('follow', 'dewi'),
      notif('favourite', 'eko', 'B'),
      notif('poll', 'fajar', 'P'),
      notif('follow_request', 'gita'),
      notif('follow', 'hadi'),
    ]);
    expect(rows.map((r) => (r.kind === 'single' ? r.notif.type : r.kind))).toEqual([
      'mention',
      'engagement',
      'quote',
      'follows',
      'poll',
      'follow_request',
    ]);
  });

  it('leaves a like without a post as its own row', () => {
    const rows = digestNotifications([notif('favourite', 'ana')]);
    expect(rows[0].kind).toBe('single');
  });
});
