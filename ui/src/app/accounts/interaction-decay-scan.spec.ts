import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../platform/api/api';
import { MastodonNotification, Status } from '../platform/api/models';
import { DecayPost } from './interaction-decay';
import {
  DECAY_MAX_PAGES,
  DECAY_PAGE_SIZE,
  InteractionDecayScan,
  coveredPosts,
} from './interaction-decay-scan';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-11-01T00:00:00Z');

let seq = 0;
function like(postId: string, at: number): MastodonNotification {
  seq++;
  return {
    id: String(100_000 - seq),
    type: 'favourite',
    created_at: new Date(at).toISOString(),
    account: { id: 'fan' },
    status: { id: postId } as Status,
  } as MastodonNotification;
}

/** `n` likes on `postId`, the newest at `newest`, one minute apart going back. */
function likes(postId: string, newest: number, n: number): MastodonNotification[] {
  return Array.from({ length: n }, (_, i) => like(postId, newest - i * 60_000));
}

const posts: DecayPost[] = [{ id: 'p1', createdAt: T0, counters: 10 }];

describe('InteractionDecayScan', () => {
  let notifications: ReturnType<typeof vi.fn>;
  let scan: InteractionDecayScan;

  beforeEach(() => {
    notifications = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: { notifications } }],
    });
    scan = TestBed.inject(InteractionDecayScan);
  });

  it('stops once a page reaches back past the oldest post', async () => {
    notifications
      .mockReturnValueOnce(of(likes('p1', T0 + 2 * DAY, DECAY_PAGE_SIZE)))
      .mockReturnValueOnce(of([...likes('p1', T0 + HOUR, 3), like('other', T0 - DAY)]));
    await scan.start('me', posts);
    const s = scan.state()!;
    expect(s.phase).toBe('done');
    expect(s.stop).toBe('reachedOldest');
    expect(notifications).toHaveBeenCalledTimes(2);
    expect(notifications.mock.calls[0][1]).toEqual({
      types: ['favourite', 'reblog', 'mention'],
      limit: DECAY_PAGE_SIZE,
    });
    expect(s.result?.series.likes.events).toBe(DECAY_PAGE_SIZE + 3);
    expect(s.excluded).toBe(0);
  });

  it('a short page is the end of the server; posts older than it are left out', async () => {
    notifications.mockReturnValueOnce(of(likes('p2', T0 + 2 * DAY + 4 * 60_000, 5)));
    const both: DecayPost[] = [{ id: 'p2', createdAt: T0 + 2 * DAY, counters: 5 }, ...posts];
    await scan.start('me', both);
    const s = scan.state()!;
    expect(s.stop).toBe('serverEnd');
    expect(s.excluded).toBe(1);
    expect(s.result?.posts).toBe(1);
  });

  it('with no posts old enough, still reads a window for the engaged audience', async () => {
    notifications.mockReturnValueOnce(of(likes('x', Date.now() - DAY, 4)));
    await scan.start('me', []);
    const s = scan.state()!;
    expect(s.phase).toBe('done');
    expect(s.result?.posts).toBe(0);
    expect(s.engaged?.reactions).toBe(4);
    expect(s.engaged?.people).toBe(1);
  });

  it('respects the page cap', async () => {
    notifications.mockImplementation(() => of(likes('p1', T0 + 30 * DAY, DECAY_PAGE_SIZE)));
    await scan.start('me', posts);
    expect(notifications).toHaveBeenCalledTimes(DECAY_MAX_PAGES);
    expect(scan.state()?.stop).toBe('pageCap');
  });

  it('cancel keeps what was read', async () => {
    notifications.mockImplementation(() => {
      scan.cancel();
      return of(likes('p1', T0 + 30 * DAY, DECAY_PAGE_SIZE));
    });
    await scan.start('me', posts);
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(scan.state()?.phase).toBe('cancelled');
    expect(scan.state()?.pages).toBe(1);
  });

  it('reports a failure', async () => {
    notifications.mockReturnValue(throwError(() => new Error('boom')));
    await scan.start('me', posts);
    expect(scan.state()?.phase).toBe('failed');
  });
});

describe('coveredPosts', () => {
  it('keeps everything once the oldest post was reached, nothing with no notifications', () => {
    expect(coveredPosts(posts, 'reachedOldest', null)).toEqual(posts);
    expect(coveredPosts(posts, 'serverEnd', null)).toEqual([]);
    expect(coveredPosts(posts, 'cancelled', T0)).toEqual(posts);
    expect(coveredPosts(posts, 'cancelled', T0 + 1)).toEqual([]);
  });
});
