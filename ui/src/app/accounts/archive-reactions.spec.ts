import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../platform/api/api';
import { Auth } from '../platform/session/auth';
import type { NativeTimedReactions } from '../platform/session/native-analytics-types';
import { NATIVE_ANALYTICS, NATIVE_NOTIFICATION_COLLECT } from '../platform/session/platform-login';
import {
  ARCHIVE_MAX_DAYS,
  ARCHIVE_MIN_DAYS,
  archiveDays,
  archiveNotifications,
} from './archive-reactions';
import { DecayPost } from './interaction-decay';
import { COLLECT_WAIT_MS, InteractionDecayScan } from './interaction-decay-scan';

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ago: number) => new Date(NOW - ago).toISOString();

function rows(coveredDaysAgo: number): NativeTimedReactions {
  return {
    connected: true,
    coveredSince: iso(coveredDaysAgo * DAY),
    events: [
      { id: '3', kind: 'follow', at: iso(DAY), actor: 'a', post: null },
      { id: '2', kind: 'reblog', at: iso(9 * DAY), actor: 'a', post: 'p1' },
      { id: '1', kind: 'favourite', at: iso(10 * DAY), actor: 'gone', post: 'p1' },
    ],
    people: { a: { id: 'a', acct: 'a@x.example', followers_count: 5, note: '' } },
    posts: { p1: { id: 'p1', content: '<p>x</p>', tags: [] } },
  };
}

describe('archiveNotifications', () => {
  it('rebuilds notifications and drops rows whose person is missing', () => {
    const list = archiveNotifications(rows(90));
    expect(list.map((n) => [n.id, n.type, n.status?.id])).toEqual([
      ['3', 'follow', undefined],
      ['2', 'reblog', 'p1'],
    ]);
  });

  it('asks for at least 90 days and at most a year', () => {
    expect(archiveDays(NOW - 5 * DAY, NOW)).toBe(ARCHIVE_MIN_DAYS);
    expect(archiveDays(NOW - 200 * DAY, NOW)).toBe(201);
    expect(archiveDays(NOW - 900 * DAY, NOW)).toBe(ARCHIVE_MAX_DAYS);
  });
});

describe('InteractionDecayScan in the native app', () => {
  const posts: DecayPost[] = [{ id: 'p1', createdAt: NOW - 11 * DAY, counters: 1 }];
  const reactions = vi.fn();
  const collect = vi.fn();
  const notifications = vi.fn();
  const token = signal<string | null>('native-mastodon:a');
  let scan: InteractionDecayScan;

  beforeEach(() => {
    reactions.mockReset();
    collect.mockReset().mockResolvedValue({ imported: 0, complete: true });
    notifications.mockReset().mockReturnValue(of([]));
    token.set('native-mastodon:a');
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { notifications } },
        { provide: Auth, useValue: { token, account: signal({ id: 'me' }) } },
        { provide: NATIVE_ANALYTICS, useValue: { reactions } },
        { provide: NATIVE_NOTIFICATION_COLLECT, useValue: collect },
      ],
    });
    scan = TestBed.inject(InteractionDecayScan);
  });

  it('checks for new notifications, then reads the archive with no requests', async () => {
    reactions.mockResolvedValue(rows(90));
    await scan.start('me', posts);
    const s = scan.state()!;
    expect(collect).toHaveBeenCalledWith('native-mastodon:a');
    expect(notifications).not.toHaveBeenCalled();
    expect(s.source).toBe('archive');
    expect(s.stop).toBe('reachedOldest');
    expect(s.result?.series.boosts.events).toBe(1);
    expect(s.log?.firstFollow.has('a')).toBe(true);
    expect(s.engaged?.people).toBe(1);
  });

  it('says where the archive starts when it does not reach the oldest post', async () => {
    reactions.mockResolvedValue(rows(10.5));
    await scan.start('me', posts);
    expect(scan.state()?.stop).toBe('archiveStart');
    expect(scan.state()?.excluded).toBe(1);
  });

  it('still reads the archive when the check for new ones fails', async () => {
    collect.mockRejectedValue({ kind: 'busy' });
    reactions.mockResolvedValue(rows(90));
    await scan.start('me', posts);
    expect(scan.state()?.source).toBe('archive');
  });

  it('does not wait forever for the check', async () => {
    vi.useFakeTimers();
    try {
      collect.mockReturnValue(new Promise(() => undefined));
      reactions.mockResolvedValue(rows(90));
      const run = scan.start('me', posts);
      await vi.advanceTimersByTimeAsync(COLLECT_WAIT_MS);
      await run;
      expect(scan.state()?.source).toBe('archive');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Stop ends the wait and still shows the archive', async () => {
    collect.mockReturnValue(new Promise(() => undefined));
    reactions.mockResolvedValue(rows(90));
    const run = scan.start('me', posts);
    scan.cancel();
    await run;
    expect(scan.state()?.phase).toBe('done');
    expect(scan.state()?.source).toBe('archive');
  });

  it.each([
    ['not connected yet', () => Promise.resolve({ ...rows(90), connected: false })],
    ['unavailable', () => Promise.reject(new Error('no archive'))],
  ])('reads the server when the archive is %s', async (_, answer) => {
    reactions.mockImplementation(answer);
    await scan.start('me', posts);
    expect(notifications).toHaveBeenCalled();
    expect(scan.state()?.source).toBe('server');
  });

  it('uses the server for another account or a non-archive sign-in', async () => {
    expect(scan.usesArchive('me')).toBe(true);
    expect(scan.usesArchive('someone-else')).toBe(false);
    token.set('native-misskey:a');
    expect(scan.usesArchive('me')).toBe(false);
  });
});
