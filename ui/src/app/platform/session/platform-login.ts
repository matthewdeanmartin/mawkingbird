import { InjectionToken } from '@angular/core';
import type { NativeSocial } from './native-social-types';
import type { NativeFollowStatus } from './native-follow-status';
import type { NativeProfilesApi } from './native-profile-types';
export type { NativeFollowStatus } from './native-follow-status';

export const NATIVE_SOCIAL = new InjectionToken<NativeSocial | null>('native-social', {
  providedIn: 'root',
  factory: () => null,
});

/** Browser builds retain their existing OAuth flow and credential lifecycle. */
export const NATIVE_MASTODON_LOGIN = new InjectionToken<
  ((server: string, access: 'read' | 'full') => Promise<string>) | null
>('native-mastodon-login', {
  providedIn: 'root',
  factory: () => null,
});

/** Web builds have no local archive collector. */
export const NATIVE_FOLLOW_COLLECT = new InjectionToken<((handle: string) => Promise<void>) | null>(
  'native-follow-collect',
  { providedIn: 'root', factory: () => null },
);
export const NATIVE_FOLLOW_STATUS = new InjectionToken<
  ((handle: string) => Promise<NativeFollowStatus | null>) | null
>('native-follow-status', { providedIn: 'root', factory: () => null });

export const NATIVE_PROFILES = new InjectionToken<NativeProfilesApi | null>('native-profiles', {
  providedIn: 'root',
  factory: () => null,
});
export function forgetNativeAccount(handle: string | null): void {
  void handle;
}
