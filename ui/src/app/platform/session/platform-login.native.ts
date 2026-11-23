import { InjectionToken } from '@angular/core';
import type { NativeSocial } from './native-social-types';
import type { NativeFollowStatus, NativeNotificationReport } from './native-follow-status';
import type { NativeProfilesApi } from './native-profile-types';
import type { NativeAnalyticsApi } from './native-analytics-types';
export type { NativeFollowStatus } from './native-follow-status';

export const NATIVE_SOCIAL = new InjectionToken<NativeSocial | null>('native-social', {
  providedIn: 'root',
  factory: () => ({
    blueskyLogin: (identifier) => invoke('bluesky_login', { identifier }),
    misskeyLogin: (server) => invoke('misskey_login', { server }),
    blueskyFetch: async (handle, url, init) => {
      const headers = new Headers(init?.headers);
      if (
        [...headers.keys()].some(
          (key) => !['content-type', 'atproto-accept-labelers'].includes(key),
        )
      ) {
        throw new Error(
          'This Bluesky service is not supported by native transport yet. See Help > Open logs.',
        );
      }
      const result = await invoke<{
        status: number;
        body: string;
        headers: Record<string, string>;
      }>('bluesky_request', {
        handle,
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        labelers: (headers.get('atproto-accept-labelers') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      return new Response(result.status === 204 ? null : result.body, {
        status: result.status,
        headers: result.headers,
      });
    },
  }),
});

function invoke<T>(command: string, args: object): Promise<T> {
  const bridge = (
    window as unknown as {
      __TAURI__: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  return bridge.core.invoke<T>(command, args);
}

/** Returns an opaque OS-store reference, never the provider's bearer token. */
export const NATIVE_MASTODON_LOGIN = new InjectionToken<
  ((server: string, access: 'read' | 'full') => Promise<string>) | null
>('native-mastodon-login', {
  providedIn: 'root',
  factory: () => (server: string, access: 'read' | 'full') =>
    invoke<string>('mastodon_login', { server, access }),
});

/** Starts the native inventory without holding up navigation after sign-in. */
const followRuns = new Map<string, Promise<void>>();
export const NATIVE_FOLLOW_COLLECT = new InjectionToken<((handle: string) => Promise<void>) | null>(
  'native-follow-collect',
  {
    providedIn: 'root',
    factory: () => (handle: string) => {
      let run = followRuns.get(handle);
      if (!run) {
        run = invoke<void>('archive_collect_following', { handle }).finally(() => {
          followRuns.delete(handle);
        });
        followRuns.set(handle, run);
      }
      return run;
    },
  },
);

const notificationRuns = new Map<string, Promise<NativeNotificationReport>>();
export const NATIVE_NOTIFICATION_COLLECT = new InjectionToken<
  ((handle: string) => Promise<NativeNotificationReport>) | null
>('native-notification-collect', {
  providedIn: 'root',
  factory: () => (handle: string) => {
    let run = notificationRuns.get(handle);
    if (!run) {
      run = invoke<NativeNotificationReport>('archive_collect_notifications', { handle }).finally(
        () => notificationRuns.delete(handle),
      );
      notificationRuns.set(handle, run);
    }
    return run;
  },
});

export const NATIVE_FOLLOW_STATUS = new InjectionToken<
  ((handle: string) => Promise<NativeFollowStatus | null>) | null
>('native-follow-status', {
  providedIn: 'root',
  factory: () => (handle: string) => invoke('archive_following_status', { handle }),
});

export const NATIVE_PROFILES = new InjectionToken<NativeProfilesApi | null>('native-profiles', {
  providedIn: 'root',
  factory: () => ({
    collectionStatus: (handle) => invoke('archive_collection_status', { handle }),
    seedRecent: (handle) => invoke('archive_seed_recent', { handle }),
    peoplePosts: (handle, category, bin, offset) =>
      invoke('archive_people_posts', { handle, category, bin, offset }),
    peopleMembers: (handle, category) => invoke('archive_people_members', { handle, category }),
    list: (handle) => invoke('archive_profiles', { handle }),
    posts: (handle, actorId, filter, hideRead, offset) =>
      invoke('archive_profile_posts', { handle, actorId, filter, hideRead, offset }),
    postsAfter: (handle, actorId, filter, hideRead, before) =>
      invoke('archive_profile_posts_after', {
        handle,
        actorId,
        filter,
        hideRead,
        beforeCreatedAt: before?.createdAt ?? null,
        beforeId: before?.localId ?? null,
      }),
    markRead: (handle, postId) => invoke('archive_mark_read', { handle, postId }),
    markReadBatch: (handle, postIds) => invoke('archive_mark_read_batch', { handle, postIds }),
    accountPosts: (handle, remoteId, offset) =>
      invoke('archive_account_posts', { handle, remoteId, offset }),
    fetchAccountPage: (handle, remoteId, older) =>
      invoke('archive_fetch_account_page', { handle, remoteId, older }),
  }),
});

export const NATIVE_ANALYTICS = new InjectionToken<NativeAnalyticsApi | null>('native-analytics', {
  providedIn: 'root',
  factory: () => ({
    catchUp: (handle, remoteId) => invoke('archive_analytics_catch_up', { handle, remoteId }),
    posts: (handle, remoteId, limit) =>
      invoke('archive_analytics_posts', { handle, remoteId, limit }),
    boosters: (handle, postId) => invoke('archive_post_boosters', { handle, postId }),
    history: (handle) => invoke('archive_analytics_history', { handle }),
    postActivity: (handle, postId) => invoke('archive_post_activity', { handle, postId }),
    engagers: (handle, days) => invoke('archive_engagers', { handle, days }),
    reactions: (handle, days) => invoke('archive_reactions', { handle, days }),
  }),
});

export function forgetNativeAccount(handle: string | null): void {
  if (handle?.startsWith('native-bluesky:') || handle?.startsWith('native-misskey:')) {
    void invoke('forget_social_account', { handle }).catch(() => undefined);
    return;
  }
  if (handle?.startsWith('native-mastodon:')) {
    // The backend records failures persistently; keep account switching synchronous.
    void invoke('forget_mastodon_account', { handle }).catch(() => undefined);
  }
}
