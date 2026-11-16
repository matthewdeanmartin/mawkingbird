import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
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
          useValue: { list, postsAfter, markReadBatch, collectionStatus, peopleMembers },
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
});
