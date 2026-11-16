import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import {
  NativeProfilePost,
  NativeProfileSummary,
} from '../../platform/session/native-profile-types';
import { AlgoPeopleNative } from './algo-people-native';

describe('Native Algo People', () => {
  it('keeps people and post bins scoped to the active identity', async () => {
    const token = signal<string | null>('native-mastodon:first');
    const peoplePosts = vi.fn(async (handle: string, category: string, bin: string) => ({
      posts: [
        {
          localId: handle === 'native-mastodon:first' ? 1 : 2,
          status: { id: '1' },
          isRead: false,
        } as NativeProfilePost,
      ],
      following: category === 'reading' && bin === 'storms' ? 1 : 2,
      relationshipsKnown: 1,
      scanComplete: false,
    }));
    const peopleMembers = vi.fn(async (handle: string) => [
      {
        id: handle === 'native-mastodon:first' ? 1 : 2,
        remoteId: '55',
        acct: 'friend',
        displayName: 'Friend',
        lastStatusAt: null,
        avatar: null,
        cachedPosts: 1,
        cachedUnread: 1,
      } as NativeProfileSummary,
    ]);
    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: { token, kind: signal('mastodon') } },
        {
          provide: NATIVE_PROFILES,
          useValue: { peoplePosts, peopleMembers },
        },
      ],
    });
    TestBed.overrideComponent(AlgoPeopleNative, { set: { template: '' } });
    const fixture = TestBed.createComponent(AlgoPeopleNative);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      posts: () => NativeProfilePost[];
      members: () => NativeProfileSummary[];
      choose: (category: 'all' | 'reading') => void;
      chooseBin: (bin: 'all' | 'storms') => void;
      scanComplete: () => boolean;
    };
    await vi.waitFor(() => expect(page.posts()[0]?.localId).toBe(1));
    expect(page.members()[0]?.id).toBe(1);
    page.choose('reading');
    await vi.waitFor(() =>
      expect(peoplePosts).toHaveBeenCalledWith('native-mastodon:first', 'reading', 'all', 0),
    );
    page.chooseBin('storms');
    await vi.waitFor(() =>
      expect(peoplePosts).toHaveBeenCalledWith('native-mastodon:first', 'reading', 'storms', 0),
    );
    expect(page.scanComplete()).toBe(false);
    token.set('native-mastodon:second');
    fixture.detectChanges();
    await vi.waitFor(() => expect(page.posts()[0]?.localId).toBe(2));
    expect(page.members()[0]?.id).toBe(2);
  });
});
