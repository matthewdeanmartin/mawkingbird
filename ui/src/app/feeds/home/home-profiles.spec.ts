import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_FOLLOW_COLLECT, NATIVE_PROFILES } from '../../platform/session/platform-login';
import { NativeProfilePost } from '../../platform/session/native-profile-types';
import { HomeProfiles } from './home-profiles';
import { HomeProfilesRailState } from './home-profiles-rail';
import { RailOutlet } from '../../shell/rail-outlet';

describe('Native Home Profiles', () => {
  it('batches posts passed by scrolling and keeps reads scoped to the identity', async () => {
    const handle = signal<string | null>('native-mastodon:a');
    const post = { localId: 7, isRead: false, status: { id: 'remote-7' } } as NativeProfilePost;
    const postsAfter = vi.fn(async () => ({ posts: [post], next: null }));
    const markReadBatch = vi.fn(async () => undefined);
    const peopleMembers = vi.fn(async () => [{ id: 2 }, { id: 99 }]);
    const collectionStatus = vi.fn(async () => ({
      currentJob: 'recent_seed',
      following: null,
      cachedPosts: 2,
      profilesWithPosts: 1,
      seedEligible: 1,
      notificationHistoryComplete: false,
      jobs: [],
    }));
    const list = vi.fn(async () => ({
      following: 2,
      scanComplete: false,
      profiles: [
        {
          id: 1,
          remoteId: '55',
          acct: 'one',
          displayName: 'One',
          lastStatusAt: null,
          avatar: null,
          cachedPosts: 1,
          cachedUnread: 1,
        },
        {
          id: 2,
          remoteId: '56',
          acct: 'two',
          displayName: 'Two',
          lastStatusAt: null,
          avatar: null,
          cachedPosts: 0,
          cachedUnread: 0,
        },
      ],
    }));
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { token: handle, kind: signal('mastodon') } },
        {
          provide: NATIVE_PROFILES,
          useValue: {
            list,
            postsAfter,
            markReadBatch,
            collectionStatus,
            peopleMembers,
            fetchAccountPage: async () => 0,
          },
        },
      ],
    });
    TestBed.overrideComponent(HomeProfiles, { set: { template: '' } });
    const fixture = TestBed.createComponent(HomeProfiles);
    fixture.detectChanges();
    const rail = TestBed.inject(RailOutlet);
    const railState = TestBed.inject(HomeProfilesRailState);
    expect(rail.left()?.labelKey).toBe('pages.homeProfiles.title');
    expect(rail.right()).toBeNull();
    const page = fixture.componentInstance as unknown as {
      selectedId: () => number | null;
      posts: () => NativeProfilePost[];
      hideRead: () => boolean;
      next: () => void;
      chooseCategory: (category: 'mutuals') => Promise<void>;
      toggleHideRead: () => void;
      queueRead: (post: NativeProfilePost) => void;
      openDataActivity: () => void;
      dataStatus: () => { currentJob: string } | null;
    };
    await vi.waitFor(() => expect(page.posts()).toHaveLength(1));
    page.openDataActivity();
    await vi.waitFor(() => expect(page.dataStatus()?.currentJob).toBe('recent_seed'));
    expect(collectionStatus).toHaveBeenCalledWith('native-mastodon:a');
    expect(markReadBatch).not.toHaveBeenCalled();
    page.queueRead(page.posts()[0]);
    await vi.waitFor(() => expect(markReadBatch).toHaveBeenCalledWith('native-mastodon:a', [7]));
    await vi.waitFor(() => expect(page.posts()[0].isRead).toBe(true));
    page.next();
    expect(page.selectedId()).toBe(2);
    railState.select(1);
    expect(page.selectedId()).toBe(1);
    page.toggleHideRead();
    expect(page.hideRead()).toBe(true);
    await page.chooseCategory('mutuals');
    expect(peopleMembers).toHaveBeenCalledWith('native-mastodon:a', 'mutuals');
    expect(railState.visibleProfiles().map((profile) => profile.id)).toEqual([2]);
    expect(page.selectedId()).toBe(2);
    page.next();
    expect(page.selectedId()).toBe(2);
    handle.set('native-mastodon:b');
    fixture.detectChanges();
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith('native-mastodon:b'));
    expect(railState.category()).toBe('all');
    expect(markReadBatch).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(rail.left()).toBeNull();
  });

  describe('what it asks the server for', () => {
    const row = (id: number) => ({
      id,
      remoteId: String(50 + id),
      acct: `p${id}`,
      displayName: `P${id}`,
      lastStatusAt: null,
      avatar: null,
      cachedPosts: 0,
      cachedUnread: 0,
    });
    const saved = (localId: number, isRead = false) =>
      ({ localId, isRead, status: { id: `s${localId}` } }) as NativeProfilePost;

    function open(api: Record<string, unknown>) {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: Auth,
            useValue: {
              token: signal('native-mastodon:a'),
              kind: signal('mastodon'),
            },
          },
          {
            provide: NATIVE_PROFILES,
            useValue: {
              list: async () => ({
                following: 3,
                scanComplete: true,
                profiles: [1, 2, 3].map(row),
              }),
              collectionStatus: async () => ({ seedEligible: 7 }),
              fetchAccountPage: async () => 0,
              postsAfter: async () => ({ posts: [], next: null }),
              ...api,
            },
          },
        ],
      });
      TestBed.overrideComponent(HomeProfiles, { set: { template: '' } });
      const fixture = TestBed.createComponent(HomeProfiles);
      fixture.detectChanges();
      return fixture.componentInstance as unknown as {
        posts: () => NativeProfilePost[];
        due: () => number;
        updating: () => { done: number; total: number } | null;
        updateProblem: () => string;
        freshening: () => boolean;
        next: () => void;
        update: () => Promise<void>;
        stopUpdate: () => void;
        rescan: () => Promise<void>;
        rescanCalls: () => number;
      };
    }

    it('shows saved posts, then merges one live page for the person stopped at', async () => {
      let live = false;
      const fetchAccountPage = vi.fn(async () => {
        live = true;
        return 1;
      });
      const page = open({
        fetchAccountPage,
        postsAfter: async () => ({
          posts: live ? [saved(9), saved(1, false)] : [saved(1, true)],
          next: null,
        }),
      });
      await vi.waitFor(() => expect(page.posts()).toHaveLength(1));
      page.next();
      page.next();
      await vi.waitFor(() => expect(page.posts().map((post) => post.localId)).toEqual([9, 1]));
      expect(fetchAccountPage).toHaveBeenCalledTimes(1);
      expect(fetchAccountPage).toHaveBeenCalledWith('native-mastodon:a', '53', false);
      // Read here meanwhile stays read.
      expect(page.posts()[1].isRead).toBe(true);
      await vi.waitFor(() => expect(page.freshening()).toBe(false));
    });

    it('keeps the saved posts when the live page fails', async () => {
      const page = open({
        fetchAccountPage: async () => Promise.reject({ kind: 'network' }),
        postsAfter: async () => ({ posts: [saved(1)], next: null }),
      });
      await vi.waitFor(() => expect(page.posts()).toHaveLength(1));
      await vi.waitFor(() => expect(page.freshening()).toBe(false), { timeout: 2_000 });
      expect(page.posts()).toHaveLength(1);
    });

    it('updates everyone due only when asked, and stops when the server is limiting', async () => {
      const seedRecent = vi
        .fn()
        .mockResolvedValueOnce({ profiles: 5, posts: 9, remaining: 2, rateLimited: false })
        .mockResolvedValueOnce({ profiles: 1, posts: 1, remaining: 1, rateLimited: true });
      const page = open({ seedRecent });
      await vi.waitFor(() => expect(page.due()).toBe(7));
      expect(seedRecent).not.toHaveBeenCalled();
      await page.update();
      expect(seedRecent).toHaveBeenCalledTimes(2);
      expect(page.updating()).toBeNull();
      expect(page.updateProblem()).toBe('pages.homeProfiles.updatePaused');
    });

    it('rescans who you follow only when asked, and waits its turn', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const collect = vi
          .fn()
          .mockRejectedValueOnce({ kind: 'busy' })
          .mockResolvedValue(undefined);
        TestBed.overrideProvider(NATIVE_FOLLOW_COLLECT, { useValue: collect });
        const list = vi.fn(async () => ({
          following: 100,
          scanComplete: true,
          profiles: [1].map(row),
        }));
        const page = open({ list });
        await vi.waitFor(() => expect(page.rescanCalls()).toBe(5));
        expect(collect).not.toHaveBeenCalled();
        const run = page.rescan();
        await vi.advanceTimersByTimeAsync(3_000);
        await run;
        expect(collect).toHaveBeenCalledTimes(2);
        expect(list).toHaveBeenCalledTimes(2);
        expect(page.updateProblem()).toBe('');
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops when told to', async () => {
      let finish!: (report: unknown) => void;
      const seedRecent = vi.fn(() => new Promise((resolve) => (finish = resolve)));
      const page = open({ seedRecent });
      await vi.waitFor(() => expect(page.due()).toBe(7));
      const run = page.update();
      page.stopUpdate();
      finish({ profiles: 5, posts: 9, remaining: 2, rateLimited: false });
      await run;
      expect(seedRecent).toHaveBeenCalledTimes(1);
      expect(page.updating()).toBeNull();
    });
  });
});
