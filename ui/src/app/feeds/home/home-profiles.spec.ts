import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { NativeProfilePost } from '../../platform/session/native-profile-types';
import { HomeProfiles } from './home-profiles';

describe('Native Home Profiles', () => {
  it('keeps reading explicit and scoped to the selected identity', async () => {
    const handle = signal<string | null>('native-mastodon:a');
    const post = { localId: 7, isRead: false, status: { id: 'remote-7' } } as NativeProfilePost;
    const posts = vi.fn(async () => [post]);
    const markRead = vi.fn(async () => undefined);
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
        { provide: NATIVE_PROFILES, useValue: { list, posts, markRead } },
      ],
    });
    TestBed.overrideComponent(HomeProfiles, { set: { template: '' } });
    const fixture = TestBed.createComponent(HomeProfiles);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      selectedId: () => number | null;
      posts: () => NativeProfilePost[];
      hideRead: () => boolean;
      next: () => void;
      toggleHideRead: () => void;
      markRead: (post: NativeProfilePost) => Promise<void>;
    };
    await vi.waitFor(() => expect(page.posts()).toHaveLength(1));
    expect(markRead).not.toHaveBeenCalled();
    await page.markRead(page.posts()[0]);
    expect(markRead).toHaveBeenCalledWith('native-mastodon:a', 7);
    page.next();
    expect(page.selectedId()).toBe(2);
    page.toggleHideRead();
    expect(page.hideRead()).toBe(true);
    handle.set('native-mastodon:b');
    fixture.detectChanges();
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith('native-mastodon:b'));
    expect(markRead).toHaveBeenCalledTimes(1);
  });
});
